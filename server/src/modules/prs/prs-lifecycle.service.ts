import fs from "node:fs";
import path from "node:path";
import { loadConfig, clearWorkspaceChanges } from "../../config/storage.js";
import {
  callGitHubAPI,
  commitChanges,
  compareGitBranches,
  createAndCheckoutBranch,
  executeGit,
  getActiveBearerToken,
  getDefaultBranch,
  getGitStatus,
  isTransientGitPath,
  rollbackToCommit,
} from "../../utils/git.js";
import {
  assertBranchName,
  assertGitPath,
} from "../../utils/git-validate.js";
import { computeDiff } from "../../utils/diff.js";
import {
  isPathHidden,
  loadHiddenFiles,
} from "../../utils/hidden-files.js";
import {
  scanContentForSecrets,
  mergePlaintext3Way,
} from "../../utils/crypto.js";
import { governanceService } from "../governance/governance.service.js";
import { prSecurityService } from "./pr-security.service.js";
import { prWorktreeService } from "./pr-worktree.service.js";
import { prConflictsService } from "./pr-conflicts.service.js";
import { workspaceService } from "../workspace/workspace.service.js";
import { healRepositoryState } from "../../utils/git-health.js";
import { notificationService } from "../notifications/notification.service.js";
import { prsStorageService } from "./prs-storage.service.js";
import type { PRApprovalAudit, PRRecord } from "./prs-types.js";

export class PRsLifecycleService {
  private resolveRemoteTarget(
    cfg: ReturnType<typeof loadConfig>,
    repoName: string,
  ) {
    const repoObj =
      cfg.repos?.find((r) => r?.name === repoName) ||
      (cfg.active_repo?.name === repoName ? cfg.active_repo : undefined);
    const activeToken = getActiveBearerToken(cfg.token);
    const isRemoteGitHub = Boolean(
      cfg.authenticated &&
        activeToken &&
        repoObj?.full_name &&
        !repoObj?.is_local,
    );
    return { repoObj, activeToken, isRemoteGitHub };
  }

  private async ensureRemotePullRequest(
    repoDir: string,
    repoFullName: string,
    activeToken: string,
    params: {
      title: string;
      description?: string;
      branch: string;
      baseBranch: string;
    },
  ): Promise<{ id?: number; number?: number; html_url?: string }> {
    const safeBranch = assertBranchName(params.branch);
    const pushRes = await executeGit(
      ["push", "-u", "origin", safeBranch],
      repoDir,
      activeToken,
    );
    if (!pushRes.success) {
      throw new Error(
        `Não foi possível enviar a versão '${params.branch}' para a nuvem: ${pushRes.stderr || pushRes.stdout}`,
      );
    }

    const ghRes = await callGitHubAPI(
      `/repos/${repoFullName}/pulls`,
      activeToken,
      "POST",
      {
        title: params.title,
        body: params.description || "Pedido de publicação criado no Contexos",
        head: params.branch,
        base: params.baseBranch,
      },
    );

    if (ghRes.statusCode === 201 && ghRes.data) {
      return ghRes.data;
    }

    const ghMsg =
      ghRes.data?.errors?.[0]?.message ||
      ghRes.data?.message ||
      `Status ${ghRes.statusCode}`;
    if (
      ghRes.statusCode === 422 &&
      ghMsg.toLowerCase().includes("already exists")
    ) {
      const ownerPrefix = repoFullName.split("/")[0];
      const listRes = await callGitHubAPI(
        `/repos/${repoFullName}/pulls?state=open&head=${encodeURIComponent(`${ownerPrefix}:${params.branch}`)}`,
        activeToken,
        "GET",
      );
      if (
        listRes.statusCode === 200 &&
        Array.isArray(listRes.data) &&
        listRes.data.length > 0
      ) {
        return listRes.data[0];
      }
      throw new Error(
        "Já existe uma publicação aberta para esta versão. Atualize-a em vez de criar uma nova.",
      );
    }

    throw new Error(
      `Não foi possível criar o Pedido de Publicação no GitHub: ${ghMsg}`,
    );
  }

  afterPRHeadChanged(
    repoName: string,
    pr: PRRecord,
    ctx: { actor: string; file?: string; newHead?: string },
  ): void {
    const newHead = ctx.newHead || pr.head_sha || "";
    const prevApprovals = Array.isArray(pr.approvals) ? pr.approvals : [];

    // Invalidate prior approvals
    pr.approvals = prevApprovals.map((app) => {
      if (typeof app === "string") {
        return {
          user: app,
          status: "INVALIDATED" as const,
          timestamp: new Date().toISOString(),
          invalidated_at: new Date().toISOString(),
          invalidated_by_commit: newHead,
          comment: `Aprovação invalidada devido a novas edições no PR por ${ctx.actor}.`,
        };
      }
      if (app.status === "APPROVED" || !app.status) {
        return {
          ...app,
          status: "INVALIDATED" as const,
          invalidated_at: new Date().toISOString(),
          invalidated_by_commit: newHead,
          comment:
            app.comment ||
            `Aprovação invalidada devido a novas edições no PR por ${ctx.actor}.`,
        };
      }
      return app;
    });

    pr.head_sha = newHead;

    if (!Array.isArray(pr.history)) {
      pr.history = [];
    }
    pr.history.unshift({
      type: "HEAD_CHANGED",
      actor: ctx.actor,
      file: ctx.file,
      commit: newHead,
      timestamp: new Date().toISOString(),
    });

    const prs = prsStorageService.loadRepoPRs(repoName);
    const idx = prs.findIndex((p) => String(p.id) === String(pr.id));
    if (idx >= 0) {
      prs[idx] = { ...prs[idx], ...pr };
      prsStorageService.saveRepoPRs(repoName, prs);
    }

    governanceService.logAudit(repoName, {
      action: "PR_EDITED",
      actor: ctx.actor,
      target: `PR #${pr.id} (${pr.branch})`,
      details: `Alterações em '${ctx.file || "branch"}' geraram o commit ${newHead.slice(0, 7)}. Aprovações anteriores invalidadas para reavaliação.`,
    });
  }

  async createPR(payload: {
    title: string;
    description: string;
    branch?: string;
    sourceBranch?: string;
    squash?: boolean;
    type?: string;
    layer?: string;
    domain?: string;
    repo?: string;
    targetProposalId?: number | string;
  }) {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const repoName = payload.repo || activeRepo?.name || "local";
    const repoDir = prsStorageService.getRepoDir(repoName);
    const hiddenList = loadHiddenFiles(repoDir);
    const gitStatus = await getGitStatus(repoDir);
    const repoObj =
      cfg.repos?.find((r) => r?.name === repoName) ||
      (activeRepo?.name === repoName ? activeRepo : undefined);
    const defaultBranch =
      repoObj?.default_branch || (await getDefaultBranch(repoDir));
    const currentCheckedOutBranch =
      gitStatus.branch && gitStatus.branch !== "HEAD" ? gitStatus.branch : defaultBranch;
    const activeBranch =
      payload.sourceBranch ||
      payload.branch ||
      currentCheckedOutBranch;
    const isWorkingOnFeatureBranch =
      Boolean(activeBranch) && activeBranch !== defaultBranch && activeBranch !== "HEAD";

    const gitFiles = [
      ...(gitStatus.files || []).filter(
        (f) => !isPathHidden(f.path, hiddenList),
      ),
      ...(gitStatus.systemFiles || []),
    ];
    const gitDirtySet = new Set((gitStatus.files || []).map((f) => f.path.trim().replace(/^\/+/, "")));
    const rawChanges = (cfg.workspace_changes?.[repoName] || []).filter((c) => {
      const cp = (c?.path || "").trim().replace(/^\/+/, "");
      if (!cp || isPathHidden(cp, hiddenList)) return false;
      return !gitStatus.isRepo || gitDirtySet.has(cp);
    });

    const allChangedPaths = Array.from(
      new Set([
        ...rawChanges.map((c) => c.path.trim().replace(/^\/+/, "")),
        ...gitFiles.map((f) => f.path.trim().replace(/^\/+/, "")),
      ]),
    ).filter((p) => {
      const clean = p.replace(/\\/g, "/");
      return (
        Boolean(clean) &&
        !isTransientGitPath(clean) &&
        clean !== ".git" &&
        !clean.startsWith(".git/") &&
        !clean.includes("/.git/")
      );
    });

    let commitsAheadCount = 0;
    if (isWorkingOnFeatureBranch) {
      const aheadRes = await executeGit(
        ["rev-list", "--count", `${assertBranchName(defaultBranch)}..${assertBranchName(activeBranch)}`],
        repoDir,
      );
      if (aheadRes.success) {
        commitsAheadCount = parseInt(aheadRes.stdout.trim(), 10) || 0;
      }
    }

    if (allChangedPaths.length === 0 && commitsAheadCount === 0) {
      throw new Error(
        "Não há alterações ou checkpoints pendentes nesta versão para enviar para publicação.",
      );
    }

    if (
      isWorkingOnFeatureBranch &&
      allChangedPaths.length > 0 &&
      currentCheckedOutBranch !== activeBranch
    ) {
      throw new Error(
        `Existem alterações locais pendentes em "${currentCheckedOutBranch}". Salve ou isole-as em um rascunho antes de enviar a versão "${activeBranch}" para publicação.`,
      );
    }

    // Pre-PR Secret Scanner Guard
    const violations: Array<{ file: string; rule: string; message: string }> =
      [];
    for (const p of allChangedPaths) {
      const fullPath = path.join(repoDir, p);
      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        try {
          const fileContent = fs.readFileSync(fullPath, "utf-8");
          const scan = scanContentForSecrets(fileContent, p);
          if (scan.hasSecrets) {
            violations.push(...scan.violations);
          }
        } catch {}
      }
    }

    if (violations.length > 0) {
      const actor = cfg.user?.login ? `@${cfg.user.login}` : "Dev Local";
      const violationSummary = violations
        .map((v) => `${v.file}: ${v.message}`)
        .join("; ");
      governanceService.logAudit(repoName, {
        action: "SECRET_BLOCKED",
        actor,
        target: `PR branch '${payload.branch || "new-pr"}'`,
        details: `Criação de PR bloqueada por violações de segredos: ${violationSummary}`,
      });
      // Disparo de notificação de segurança/compliance
      setImmediate(() => {
        notificationService.dispatch({
          event: "compliance_violation",
          repo: repoName,
          title: "Alerta de Segurança: Segredos detectados no PR",
          message: `Tentativa de criação de PR bloqueada por conter credenciais ou segredos expostos: ${violationSummary}`,
          author: actor.replace(/^@/, ""),
          severity: "critical",
          statusColor: "#EF4444",
          details: { violations },
        }, repoName).catch((err) => {
          console.warn("[PRsService] Falha ao despachar notificação de violação de compliance:", err);
        });
      });
      throw new Error(
        `[Secret Guard] Criação de PR bloqueada! Foram detectados segredos (chaves de API ou credenciais): ${violationSummary}`,
      );
    }

    const baseHashRes = await executeGit(
      ["rev-parse", assertBranchName(defaultBranch)],
      repoDir,
    );
    const baseSha = baseHashRes.success
      ? (baseHashRes.stdout || "").trim()
      : "";

    const repoPRs = prsStorageService.loadRepoPRs(repoName);
    const now = new Date().toISOString();

    // Se não informou targetProposalId explicitamente, mas já existe uma publicação aberta para esta branch, atualiza ela
    const autoExistingPR =
      !payload.targetProposalId && isWorkingOnFeatureBranch
        ? repoPRs.find(
            (p: { branch?: string; status?: string }) =>
              p.branch === activeBranch && p.status === "OPEN",
          )
        : undefined;
    const effectiveTargetProposalId = payload.targetProposalId || autoExistingPR?.id;

    // Se o usuário optar por anexar/atualizar a proposta aberta existente
    if (effectiveTargetProposalId) {
      const existingPR = repoPRs.find(
        (p: { id?: number | string }) => String(p.id) === String(effectiveTargetProposalId),
      );
      if (!existingPR) {
        throw new Error(
          `Publicação #${effectiveTargetProposalId} não foi encontrada.`,
        );
      }
      if (existingPR.status === "MERGED" || existingPR.status === "CLOSED") {
        throw new Error(
          `A Publicação #${effectiveTargetProposalId} já está finalizada ou encerrada.`,
        );
      }

      const { activeToken, isRemoteGitHub } = this.resolveRemoteTarget(cfg, repoName);
      await healRepositoryState(repoDir, { token: activeToken });
      if (gitStatus.branch !== existingPR.branch) {
        const coRes = await executeGit(["checkout", assertBranchName(existingPR.branch)], repoDir);
        if (!coRes.success) {
          await createAndCheckoutBranch(repoDir, existingPR.branch);
        }
      }

      if (allChangedPaths.length > 0) {
        const commitMsg =
          payload.title || `Atualização na Publicação #${existingPR.id}`;
        const commitRes = await commitChanges(repoDir, commitMsg, allChangedPaths);
        if (!commitRes.success) {
          throw new Error(`Falha ao salvar alterações antes de atualizar a publicação: ${commitRes.message}`);
        }
      }

      const headHashRes = await executeGit(["rev-parse", "HEAD"], repoDir);
      const headSha = headHashRes.success
        ? (headHashRes.stdout || "").trim()
        : "";

      if (isRemoteGitHub && activeToken) {
        const pushRes = await executeGit(
          ["push", "-u", "origin", assertBranchName(existingPR.branch)],
          repoDir,
          activeToken,
        );
        if (!pushRes.success) {
          throw new Error(
            `Não foi possível enviar as atualizações para a nuvem: ${pushRes.stderr || pushRes.stdout}`,
          );
        }
      }

      const comparison = await compareGitBranches(
        repoDir,
        existingPR.target_branch || defaultBranch,
        existingPR.branch,
      );
      if (comparison.files.length > 0) {
        existingPR.files = comparison.files.map((f) => ({
          path: f.path,
          type: f.status,
          additions: f.additions,
          deletions: f.deletions,
          restricted: false,
        }));
      }

      existingPR.updated_at = now;
      existingPR.head_sha = headSha;
      prsStorageService.saveRepoPRs(repoName, repoPRs);
      workspaceService.invalidateTreeCache(repoName);
      try {
        clearWorkspaceChanges(repoName);
      } catch {}

      return {
        ...existingPR,
        updated: true,
        message: `Publicação #${existingPR.id} atualizada com suas novas alterações!`,
      };
    }

    const newId = repoPRs.length + 1;
    const cleanSlug = (payload.title || "atualizacao")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 35) || "atualizacao";

    const branchName = isWorkingOnFeatureBranch
      ? activeBranch
      : payload.branch || `rascunho-${newId}-${cleanSlug}`;

    // 1. Posiciona na branch de trabalho (ou cria a partir da oficial se estiver na main)
    const { repoObj: remoteRepoObj, activeToken, isRemoteGitHub } =
      this.resolveRemoteTarget(cfg, repoName);
    let headSha = "";
    let githubPRData: { id?: number; number?: number; html_url?: string } | null = null;
    let prHtmlUrl = remoteRepoObj?.html_url
      ? `${remoteRepoObj.html_url}/pull/${newId}`
      : "";

    try {
      await healRepositoryState(repoDir, { token: activeToken });

      if (isWorkingOnFeatureBranch) {
        if (gitStatus.branch !== branchName) {
          const coRes = await executeGit(["checkout", assertBranchName(branchName)], repoDir);
          if (!coRes.success) {
            throw new Error(
              `Não foi possível acessar a versão de trabalho '${branchName}': ${coRes.stderr || coRes.stdout}`,
            );
          }
        }
        if (allChangedPaths.length > 0) {
          const commitMsg = payload.title || `Checkpoint antes da publicação #${newId}`;
          const commitRes = await commitChanges(repoDir, commitMsg, allChangedPaths);
          if (!commitRes.success) {
            throw new Error(`Falha ao salvar alterações antes da publicação: ${commitRes.message}`);
          }
        }
      } else {
        const pendingBuffers = new Map<string, Buffer | null>();
        for (const relPath of allChangedPaths) {
          const absPath = path.join(repoDir, relPath);
          if (fs.existsSync(absPath) && !fs.statSync(absPath).isDirectory()) {
            pendingBuffers.set(relPath, fs.readFileSync(absPath));
          } else {
            pendingBuffers.set(relPath, null);
          }
        }

        const branchRes = await createAndCheckoutBranch(
          repoDir,
          branchName,
          defaultBranch,
          payload.title?.trim(),
        );
        if (!branchRes.success) {
          await executeGit(
            ["checkout", "-f", "-B", assertBranchName(branchName), assertBranchName(defaultBranch)],
            repoDir,
          );
          await executeGit(
            ["config", `branch.${branchName}.parent`, defaultBranch],
            repoDir,
          ).catch(() => {});
        }

        for (const [relPath, buf] of pendingBuffers.entries()) {
          const absPath = path.join(repoDir, relPath);
          if (buf !== null) {
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, buf);
          } else if (fs.existsSync(absPath)) {
            try {
              fs.unlinkSync(absPath);
            } catch {}
          }
        }

        if (payload.title?.trim()) {
          await executeGit(
            ["config", `branch.${branchName}.title`, payload.title.trim()],
            repoDir,
          ).catch(() => {});
        }

        const commitMsg = payload.title || `Publicação #${newId}`;
        const commitRes = await commitChanges(repoDir, commitMsg, allChangedPaths);
        if (!commitRes.success) {
          throw new Error(`Falha ao salvar alterações para publicação: ${commitRes.message}`);
        }
      }

      const headHashRes = await executeGit(["rev-parse", "HEAD"], repoDir);
      headSha = headHashRes.success ? (headHashRes.stdout || "").trim() : "";

      // 3. GitHub Remote PR (if authenticated and remote repo) - erro explícito se falhar
      if (isRemoteGitHub && activeToken && remoteRepoObj?.full_name) {
        githubPRData = await this.ensureRemotePullRequest(
          repoDir,
          remoteRepoObj.full_name,
          activeToken,
          {
            title: payload.title,
            description: payload.description,
            branch: branchName,
            baseBranch: defaultBranch,
          },
        );
        prHtmlUrl = githubPRData.html_url || prHtmlUrl;
      }
    } finally {
      // Volta para a Versão Oficial apenas se o usuário estava na Versão Oficial antes;
      // se já estava trabalhando na branch dele, mantém ou volta de forma previsível
      if (!isWorkingOnFeatureBranch) {
        await executeGit(
          ["checkout", assertBranchName(defaultBranch)],
          repoDir,
        ).catch(() => {});
      }
    }

    // Detailed changes: compara base..head para incluir todos os arquivos (checkpoints anteriores + alterações recém-commitadas)
    let detailedChanges: Array<{
      path: string;
      type: string;
      additions: number;
      deletions: number;
      restricted: boolean;
    }> = [];

    const comparison = await compareGitBranches(repoDir, defaultBranch, branchName);
    if (comparison.files.length > 0) {
      detailedChanges = comparison.files.map((f) => ({
        path: f.path,
        type: f.status,
        additions: f.additions,
        deletions: f.deletions,
        restricted: false,
      }));
    } else if (allChangedPaths.length > 0) {
      detailedChanges = allChangedPaths.map((p) => {
        const wsChange = rawChanges.find((c) => c.path === p);
        let additions = 1;
        let deletions = 0;
        if (wsChange && (wsChange.old_content || wsChange.new_content)) {
          const diffData = computeDiff(
            wsChange.old_content || "",
            wsChange.new_content || "",
            p,
          );
          additions = diffData.additions;
          deletions = diffData.deletions;
        }
        const gitItem = gitFiles.find((f) => f.path === p);
        const isNew =
          gitItem?.status === "??" ||
          gitItem?.status === "A" ||
          wsChange?.type === "ADDED";
        const isDeleted = gitItem?.status === "D" || wsChange?.type === "DELETED";
        return {
          path: p,
          type: isNew ? "ADDED" : isDeleted ? "DELETED" : "MODIFIED",
          additions,
          deletions,
          restricted: false,
        };
      });
    }

    const newPR: PRRecord = {
      id: githubPRData?.number || newId,
      github_id: githubPRData?.id,
      github_number: githubPRData?.number,
      repo_name: repoName,
      title: payload.title || `Atualização de Governança #${newId}`,
      description: payload.description || "",
      branch: branchName,
      target_branch: defaultBranch,
      base_sha: baseSha,
      head_sha: headSha,
      status: "OPEN",
      created_at: now,
      author: cfg.user?.login ? `@${cfg.user.login}` : "Dev Local",
      approvals: [],
      history: [
        {
          type: "CREATED",
          actor: cfg.user?.login ? `@${cfg.user.login}` : "Dev Local",
          commit: headSha,
          timestamp: now,
        },
      ],
      type: payload.type || "docs",
      layer: payload.layer || "Geral",
      domain: payload.domain || "",
      squash: true,
      files: detailedChanges,
      html_url: prHtmlUrl,
    };

    repoPRs.unshift(newPR);
    prsStorageService.saveRepoPRs(repoName, repoPRs);
    clearWorkspaceChanges(repoName);

    // Disparo assíncrono de notificação para solicitação de quorum
    setImmediate(() => {
      notificationService.dispatch({
        event: "quorum_requested",
        repo: repoName,
        title: `Novo Pull Request aberto: ${newPR.title}`,
        message: `O PR #${newPR.id} foi aberto por ${newPR.author} e requer revisão e assinaturas para atingir o quorum de governança.`,
        prNumber: Number(newPR.id) || undefined,
        author: String(newPR.author || '').replace(/^@/, ""),
        actionUrl: prHtmlUrl || undefined,
        severity: "warning",
        statusColor: "#F59E0B",
      }, repoName).catch((err) => {
        console.warn("[PRsService] Falha ao despachar notificação de novo PR:", err);
      });
    });

    return {
      success: true,
      pr: newPR,
      message: `Proposta de versão "${newPR.title}" enviada para revisão com sucesso!`,
    };
  }

  async approvePR(
    prId: number | string,
    payloadOrApprover?:
      | string
      | { approver?: string; role?: string; comment?: string; repo?: string },
  ) {
    const cfg = loadConfig();
    const passedRepo =
      payloadOrApprover &&
      typeof payloadOrApprover === "object"
        ? payloadOrApprover.repo
        : undefined;
    const foundData = prsStorageService.findPRAcrossRepos(prId, passedRepo);
    if (!foundData) {
      throw new Error(`PR #${prId} não encontrado.`);
    }
    const { pr: target, repoName } = foundData;
    let prs = foundData.prs;

    if (target.status === "MERGED") {
      throw new Error(`PR #${prId} já está aprovado e mesclado.`);
    }

    if (target.status === "CLOSED") {
      throw new Error(`PR #${prId} está fechado e não pode ser aprovado.`);
    }

    const repoDir = prsStorageService.getRepoDir(repoName);
    const govRules = prsStorageService.getGovernanceRules(repoName);
    const minApprovals = target.min_approvals || govRules.min_approvals || 1;

    let approverName: string | undefined;
    let approverRole: string | undefined;
    let approverComment: string | undefined;

    if (typeof payloadOrApprover === "string") {
      approverName = payloadOrApprover;
    } else if (payloadOrApprover && typeof payloadOrApprover === "object") {
      approverName = payloadOrApprover.approver;
      approverRole = payloadOrApprover.role;
      approverComment = payloadOrApprover.comment;
    }

    const userLogin = cfg.user?.login;
    let approver = approverName || (userLogin ? `@${userLogin}` : "@tech-lead");
    if (!approver.startsWith("@")) {
      approver = `@${approver}`;
    }

    // Anti-Self-Approval check (Enforced in Team Mode)
    const authorHandle = (target.author || "").trim();
    const cleanAuthor = authorHandle.replace(/^@/, "").toLowerCase();
    const cleanApprover = approver.replace(/^@/, "").toLowerCase();

    if (
      !govRules.is_solo &&
      govRules.anti_self_approval &&
      cleanAuthor &&
      cleanAuthor === cleanApprover
    ) {
      throw new Error(
        `O autor da proposta (${target.author}) não pode aprovar o seu próprio Pull Request no Modo Equipe. É necessária a revisão de um colaborador independente.`,
      );
    }

    // Get current HEAD commit hash of the PR branch for immutable audit trail
    let currentCommitHash = target.head_sha || "";
    if (target.branch) {
      try {
        const revRes = await executeGit(
          ["rev-parse", assertBranchName(target.branch)],
          repoDir,
        );
        if (revRes.success && revRes.stdout) {
          currentCommitHash = revRes.stdout.trim();
          target.head_sha = currentCommitHash;
        }
      } catch {}
    }

    if (!Array.isArray(target.approvals)) {
      target.approvals = [];
    }

    // Create structured audit record linked to current HEAD commit
    const auditRecord: PRApprovalAudit = {
      user: approver,
      role:
        approverRole ||
        (govRules.is_solo
          ? "Autor / Desenvolvedor Solo"
          : "Tech Lead / Revisor"),
      timestamp: new Date().toISOString(),
      commit_hash: currentCommitHash,
      status: "APPROVED",
      comment: approverComment || "",
    };

    const existingIdx = target.approvals.findIndex((app) => {
      const u = typeof app === "string" ? app : app.user;
      return u?.toLowerCase() === approver.toLowerCase();
    });

    if (existingIdx >= 0) {
      target.approvals[existingIdx] = auditRecord;
    } else {
      target.approvals.push(auditRecord);
    }

    // Calculate unique valid approvals linked to current HEAD
    const validApprovers = new Set<string>();
    for (const app of target.approvals) {
      const u = typeof app === "string" ? app : app.user;
      const status = typeof app === "object" ? app.status : "APPROVED";
      const hash = typeof app === "object" ? app.commit_hash : "";
      const cleanU = (u || "").replace(/^@/, "").toLowerCase();

      if (
        status === "APPROVED" &&
        (!target.head_sha || !hash || hash === target.head_sha)
      ) {
        if (govRules.is_solo || cleanU !== cleanAuthor) {
          if (cleanU) validApprovers.add(cleanU);
        }
      }
    }
    const validCount = validApprovers.size;
    const quorumReached = govRules.is_solo
      ? validCount >= 1
      : validCount >= Number(minApprovals);

    target.status = "OPEN";

    // Synchronize review officially with GitHub API if authenticated
    const { repoObj: approveRepoObj, activeToken: approveToken, isRemoteGitHub: approveRemote } =
      this.resolveRemoteTarget(cfg, repoName);
    if (
      approveRemote &&
      approveToken &&
      approveRepoObj?.full_name &&
      target.github_number
    ) {
      try {
        await callGitHubAPI(
          `/repos/${approveRepoObj.full_name}/pulls/${target.github_number}/reviews`,
          approveToken,
          "POST",
          {
            event: "APPROVE",
            body:
              approverComment ||
              `✓ Aprovado via Contexos Governance Platform por ${approver} (${approverRole || "Revisor"})`,
          },
        );
      } catch (ghReviewErr) {
        console.warn(
          "[PRsService] Aviso ao sincronizar review no GitHub:",
          ghReviewErr,
        );
      }
    }

    prsStorageService.saveRepoPRs(repoName, prs);

    if (quorumReached) {
      setImmediate(() => {
        notificationService.dispatch({
          event: "quorum_approved",
          repo: repoName,
          title: `Quorum de Governança Atingido: ${target.title}`,
          message: `O PR #${target.id} atingiu o quorum mínimo de aprovações (${validCount}/${govRules.is_solo ? 1 : minApprovals}) com o voto de @${approver}. O merge foi liberado!`,
          prNumber: Number(target.id) || undefined,
          author: String(target.author || '').replace(/^@/, ""),
          actionUrl: target.html_url || undefined,
          severity: "info",
          statusColor: "#10B981",
        }, repoName).catch((err) => {
          console.warn("[PRsService] Falha ao despachar notificação de quorum aprovado:", err);
        });
      });
    }

    return {
      success: true,
      quorum_reached: quorumReached,
      approvals_count: validCount,
      min_approvals: govRules.is_solo ? 1 : minApprovals,
      is_solo_mode: govRules.is_solo,
      pr: target,
      message: quorumReached
        ? govRules.is_solo
          ? `✓ Aprovação registrada por ${approver} (Modo Solo: merge liberado).`
          : `🎉 Quórum de aprovação atingido (${validCount}/${minApprovals}) com o voto de ${approver}! O merge está liberado para publicação.`
        : `✓ Aprovação registrada por ${approver} (${validCount}/${minApprovals}). Aguardando quórum para liberação do merge.`,
    };
  }

  async editPRFile(
    payload: {
      id: number | string;
      filePath: string;
      content: string;
      base_sha?: string;
      expectedBaseSha?: string;
      commitMessage?: string;
      author?: string;
      repo?: string;
    },
    userLogin?: string,
  ) {
    const cfg = loadConfig();
    const repoName = payload.repo || cfg.active_repo?.name || "local";
    const login = userLogin || payload.author || cfg.user?.login || "local_user";
    const prs = prsStorageService.loadRepoPRs(repoName);
    const target = prs.find((p) => String(p.id) === String(payload.id));

    if (!target) {
      throw new Error(`PR #${payload.id} não encontrado.`);
    }

    if (target.status === "MERGED" || target.status === "CLOSED") {
      throw new Error(
        `Não é possível editar arquivos de um PR finalizado ou arquivado.`,
      );
    }

    if (!target.branch) {
      throw new Error(
        `Branch associada ao PR #${payload.id} não foi encontrada.`,
      );
    }

    // 1. Check clearance
    const clearance = await prSecurityService.resolveDocClearance(
      repoName,
      login,
      payload.filePath,
      target.branch,
    );
    if (!clearance.allowed) {
      throw new Error(
        `Acesso negado: Você não possui autorização (clearance) para editar o documento '${payload.filePath}'.`,
      );
    }

    // 2. Ensure isolated PR worktree without touching user active workspace
    const wtDir = await prWorktreeService.ensurePRWorktree(repoName, target);
    const repoDir = prsStorageService.getRepoDir(repoName);
    const headRes = await executeGit(
      ["-C", wtDir, "rev-parse", "HEAD"],
      repoDir,
    );
    const currentHeadSha = (headRes.stdout || "").trim();

    // 3. Optimistic concurrency & 3-way merge check
    const expectedBaseSha = payload.base_sha || payload.expectedBaseSha;
    let finalPlainContent = payload.content;
    if (expectedBaseSha && expectedBaseSha !== currentHeadSha) {
      const baseText = await prSecurityService
        .readPlainAtRef(repoName, expectedBaseSha, payload.filePath, login)
        .catch(() => "");
      const theirsText = await prSecurityService
        .readPlainAtRef(repoName, currentHeadSha, payload.filePath, login)
        .catch(() => "");

      const mergeResult = await mergePlaintext3Way(
        baseText,
        payload.content,
        theirsText,
        {
          ours: "Sua Edição",
          theirs: `HEAD Atual (${currentHeadSha.slice(0, 7)})`,
        },
      );

      if (mergeResult.hasConflicts) {
        return {
          conflict: true,
          head_sha: currentHeadSha,
          base: baseText,
          ours: payload.content,
          theirs: theirsText,
          merged: mergeResult.mergedContent,
          mergedContent: mergeResult.mergedContent,
          conflictCount: mergeResult.conflictCount,
          message:
            "Detectamos alterações concorrentes nesta versão. Resolva os conflitos antes de salvar.",
        };
      }
      finalPlainContent = mergeResult.mergedContent;
    }

    // 4. Secret scan guard
    const scan = scanContentForSecrets(finalPlainContent, payload.filePath);
    if (scan.hasSecrets) {
      const violationSummary = scan.violations
        .map((v) => `${v.file}: ${v.message}`)
        .join("; ");
      throw new Error(
        `[Secret Guard] Edição bloqueada: foram detectados segredos não criptografados: ${violationSummary}`,
      );
    }

    // 5. Write to isolated worktree
    await prWorktreeService.writePlainAtWorktree(
      wtDir,
      payload.filePath,
      finalPlainContent,
    );

    // 6. Commit and push from worktree
    const editor = login.startsWith("@") ? login : `@${login}`;
    const commitMsg =
      payload.commitMessage ||
      `docs: edição colaborativa em ${payload.filePath} por ${editor}`;
    const { commitHash } = await prWorktreeService.commitAndPushWorktree(
      wtDir,
      target.branch,
      commitMsg,
      login,
      repoName,
    );

    // 7. Update file metadata in PR
    if (Array.isArray(target.files)) {
      const fileIdx = target.files.findIndex(
        (f) => f.path === payload.filePath,
      );
      const fileObj = {
        path: payload.filePath,
        type: fileIdx >= 0 ? "MODIFIED" : "ADDED",
        additions: 1,
        deletions: 0,
        restricted: false,
      };
      if (fileIdx >= 0) {
        target.files[fileIdx] = { ...target.files[fileIdx], ...fileObj };
      } else {
        target.files.push(fileObj);
      }
    }

    // 8. Invalidate previous approvals and update HEAD commit
    const prevApprovalsCount = (target.approvals || []).filter((a) =>
      typeof a === "object" ? a.status === "APPROVED" : true,
    ).length;
    this.afterPRHeadChanged(repoName, target, {
      actor: editor,
      file: payload.filePath,
      newHead: commitHash,
    });

    return {
      success: true,
      conflict: false,
      reset_approvals: prevApprovalsCount > 0,
      new_commit_hash: commitHash,
      head_sha: commitHash,
      pr: target,
      message: `Documento "${payload.filePath}" atualizado com sucesso na branch '${target.branch}'! ${
        prevApprovalsCount > 0
          ? "As aprovações anteriores foram invalidadas para reavaliação dos revisores."
          : ""
      }`,
    };
  }

  async mergePR(prId: number | string, repoNameParam?: string) {
    const cfg = loadConfig();
    const foundData = prsStorageService.findPRAcrossRepos(prId, repoNameParam);
    if (!foundData) {
      throw new Error(`PR #${prId} não encontrado.`);
    }
    const { pr: target, repoName } = foundData;
    let prs = foundData.prs;

    if (target.status === "MERGED") {
      throw new Error(`PR #${prId} já foi mesclado anteriormente.`);
    }

    if (target.status === "CLOSED") {
      throw new Error(
        `PR #${prId} está arquivado/fechado e não pode ser mesclado.`,
      );
    }

    // Mergeability check: abort if conflicts exist with target branch
    const mergeCheck = await prConflictsService.getMergeability(
      repoName,
      target,
    );
    if (!mergeCheck.mergeable) {
      throw new Error(
        `Existem edições concorrentes entre '${target.branch}' e '${target.target_branch || "main"}'. Resolva os conflitos em: ${mergeCheck.conflicts.map((c) => c.path).join(", ")}.`,
      );
    }

    const mergeCommitSha = await this.executeMerge(target, repoName);
    await prWorktreeService.removePRWorktree(repoName, target.id);

    target.status = "MERGED";
    target.merged_at = new Date().toISOString();
    if (mergeCommitSha) {
      target.merge_commit_sha = mergeCommitSha;
    }
    prsStorageService.saveRepoPRs(repoName, prs);

    return {
      success: true,
      pr: target,
      message: `Publicação #${prId} integrada com sucesso na Versão Oficial!`,
    };
  }

  async rejectPR(
    prId: number | string,
    reason?: string,
    repoNameParam?: string,
  ) {
    const cfg = loadConfig();
    const foundData = prsStorageService.findPRAcrossRepos(prId, repoNameParam);
    if (!foundData) {
      throw new Error(`PR #${prId} não encontrado.`);
    }
    const { pr: target, repoName } = foundData;
    let prs = foundData.prs;

    target.status = "CLOSED";
    target.closed_at = new Date().toISOString();
    target.rejection_reason = reason || "Proposta rejeitada pelo revisor.";

    await prWorktreeService.removePRWorktree(repoName, target.id);

    const { repoObj: rejectRepoObj, activeToken: rejectToken, isRemoteGitHub: rejectRemote } =
      this.resolveRemoteTarget(cfg, repoName);
    if (
      rejectRemote &&
      rejectToken &&
      rejectRepoObj?.full_name &&
      target.github_number
    ) {
      try {
        await callGitHubAPI(
          `/repos/${rejectRepoObj.full_name}/pulls/${target.github_number}`,
          rejectToken,
          "PATCH",
          { state: "closed" },
        );
      } catch (err) {
        console.warn(`[PRsService] Aviso ao fechar PR no GitHub:`, err);
      }
    }

    prsStorageService.saveRepoPRs(repoName, prs);

    return {
      success: true,
      pr: target,
      message: `PR #${prId} arquivado e rejeitado.`,
    };
  }

  async rollbackRevision(payload: {
    id?: string | number;
    commit_hash?: string;
    repo?: string;
  }) {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    let repoName = payload.repo || activeRepo?.name || "local";

    let targetHash = payload.commit_hash;
    let targetTitle = "";

    if (payload.id) {
      const foundData = prsStorageService.findPRAcrossRepos(payload.id, payload.repo);
      if (foundData) {
        repoName = foundData.repoName;
        targetHash = foundData.pr.commit_hash || String(foundData.pr.id);
        targetTitle = foundData.pr.title || "";
      } else if (!targetHash) {
        targetHash = String(payload.id);
      }
    }

    const repoDir = prsStorageService.getRepoDir(repoName);

    if (!targetHash) {
      throw new Error(
        "Identificador da versão ou código da revisão não informado.",
      );
    }

    const result = await rollbackToCommit(repoDir, targetHash, targetTitle);
    if (!result.success) {
      throw new Error(result.message);
    }

    const { repoObj: rollbackRepoObj, activeToken: rollbackToken, isRemoteGitHub: rollbackRemote } =
      this.resolveRemoteTarget(cfg, repoName);
    if (rollbackRemote && rollbackToken) {
      const targetBranch = rollbackRepoObj?.default_branch || (await getDefaultBranch(repoDir));
      const pushRes = await executeGit(
        ["push", "origin", assertBranchName(targetBranch)],
        repoDir,
        rollbackToken,
      );
      if (!pushRes.success) {
        throw new Error(
          `Reversão aplicada localmente (${result.newCommitHash || ""}), mas falhou ao enviar para o GitHub: ${pushRes.stderr || pushRes.stdout}`,
        );
      }
    }

    clearWorkspaceChanges(repoName);

    return {
      success: true,
      message: result.message,
      new_commit_hash: result.newCommitHash,
    };
  }

  private async executeMerge(targetPR: PRRecord, repoNameParam?: string): Promise<string> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const repoName =
      repoNameParam || targetPR.repo_name || activeRepo?.name || "local";
    const repoDir = prsStorageService.getRepoDir(repoName);
    const targetBranch = assertBranchName(targetPR.target_branch || "main");
    const useSquash = true;

    const approvalsList = Array.isArray(targetPR.approvals)
      ? targetPR.approvals
      : [];
    const auditLines = approvalsList
      .filter((app) =>
        typeof app === "object" ? app.status === "APPROVED" : true,
      )
      .map((app) => {
        if (typeof app === "string") {
          return `Approved-by: ${app}`;
        }
        const user = app.user || "Unknown";
        const role = app.role ? ` [${app.role}]` : "";
        const hash = app.commit_hash
          ? ` (commit: ${app.commit_hash.slice(0, 7)})`
          : "";
        const date = app.timestamp ? ` on ${app.timestamp.split("T")[0]}` : "";
        return `Approved-by: ${user}${role}${hash}${date}`;
      });

    const trailers =
      auditLines.length > 0
        ? `\n\n${auditLines.join("\n")}\nReviewed-in: Contexos`
        : "";
    const commitMsg = `Publicação da versão: ${targetPR.title}${trailers}`;

    // 1. Limpa arquivo transitório de mudanças e executa auto-cura do repositório
    clearWorkspaceChanges(repoName);
    const { repoObj: mergeRepoObj, activeToken, isRemoteGitHub } =
      this.resolveRemoteTarget(cfg, repoName);
    await healRepositoryState(repoDir, {
      token: activeToken,
      unshallowIfNeeded: true,
    });

    // 2. Se houver arquivos modificados ou untracked na working tree, guarda em stash temporário
    let didStash = false;
    try {
      const statusRes = await executeGit(["status", "--porcelain"], repoDir);
      if (statusRes.success && statusRes.stdout.trim().length > 0) {
        const stashRes = await executeGit(
          [
            "stash",
            "push",
            "--include-untracked",
            "-m",
            "context-os-pre-merge-stash",
          ],
          repoDir,
        );
        if (
          stashRes.success &&
          !stashRes.stdout.includes("No local changes to save")
        ) {
          didStash = true;
        }
      }
    } catch {}

    try {
      // 3. Local Git Checkout para Versão Oficial
      const checkoutRes = await executeGit(["checkout", targetBranch], repoDir);
      if (!checkoutRes.success) {
        throw new Error(
          `Falha ao alternar para '${targetBranch}': ${checkoutRes.stderr || checkoutRes.stdout}`,
        );
      }

      // 4. Se conectado ao GitHub, garante que exista PR remoto e publica via API do GitHub (squash)
      if (isRemoteGitHub && activeToken && mergeRepoObj?.full_name) {
        if (!targetPR.github_number && targetPR.branch) {
          const createdPR = await this.ensureRemotePullRequest(
            repoDir,
            mergeRepoObj.full_name,
            activeToken,
            {
              title: targetPR.title,
              description: targetPR.description,
              branch: targetPR.branch,
              baseBranch: targetBranch,
            },
          );
          if (createdPR.number) {
            targetPR.github_number = createdPR.number;
            targetPR.github_id = createdPR.id;
            if (createdPR.html_url) targetPR.html_url = createdPR.html_url;
          }
        }

        if (!targetPR.github_number) {
          throw new Error(
            "Não foi possível publicar: Pull Request não encontrado no GitHub.",
          );
        }

        const ghMergeRes = await callGitHubAPI(
          `/repos/${mergeRepoObj.full_name}/pulls/${targetPR.github_number}/merge`,
          activeToken,
          "PUT",
          {
            commit_title: `${targetPR.title} (#${targetPR.github_number})`,
            commit_message: auditLines.join("\n") || targetPR.description || "",
            merge_method: useSquash ? "squash" : "merge",
          },
        );
        if (ghMergeRes.statusCode >= 200 && ghMergeRes.statusCode < 300) {
          const fetchRes = await executeGit(
            ["fetch", "origin", targetBranch],
            repoDir,
            activeToken,
          );
          if (fetchRes.success) {
            await executeGit(
              ["reset", "--hard", `origin/${targetBranch}`],
              repoDir,
            ).catch(() => {});
          }
          workspaceService.invalidateTreeCache(repoName);
          clearWorkspaceChanges(repoName);
          const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
          return (
            ghMergeRes.data?.sha ||
            (headRes.success ? headRes.stdout.trim() : "")
          );
        } else {
          const ghMsg =
            ghMergeRes.data?.message || `Status ${ghMergeRes.statusCode}`;
          throw new Error(`Falha ao publicar no GitHub: ${ghMsg}`);
        }
      }

      // 5. Local Git Merge (para repositórios locais ou sem PR remoto)
      if (targetPR.branch) {
        const prBranch = assertBranchName(targetPR.branch);
        try {
          const isShallowRes = await executeGit(
            ["rev-parse", "--is-shallow-repository"],
            repoDir,
          );
          if (isShallowRes.success && isShallowRes.stdout.trim() === "true") {
            await executeGit(
              ["fetch", "--unshallow", "origin"],
              repoDir,
              activeToken || undefined,
            ).catch(() => {});
          }
        } catch {}

        let mergeRes = useSquash
          ? await executeGit(["merge", "--squash", prBranch], repoDir)
          : await executeGit(
              ["merge", prBranch, "--no-ff", "-m", commitMsg],
              repoDir,
            );

        if (mergeRes.success && useSquash) {
          mergeRes = await executeGit(["commit", "-m", commitMsg], repoDir);
        }

        if (!mergeRes.success) {
          await executeGit(["merge", "--abort"], repoDir).catch(() => {});
          await executeGit(["reset", "--hard", "HEAD"], repoDir).catch(() => {});
          throw new Error(
            `Falha ao integrar alterações: ${mergeRes.stderr || mergeRes.stdout}`,
          );
        }
      }

      if (isRemoteGitHub && activeToken) {
        await executeGit(
          ["push", "origin", targetBranch],
          repoDir,
          activeToken,
        ).catch(() => {});
      }

      workspaceService.invalidateTreeCache(repoName);
      clearWorkspaceChanges(repoName);
      const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
      return headRes.success ? headRes.stdout.trim() : "";
    } finally {
      if (didStash) {
        try {
          const popRes = await executeGit(["stash", "pop"], repoDir);
          if (!popRes.success) {
            // Se o stash pop conflitar com o que acabou de ser mesclado, limpa o working tree
            // preservando o stash intacto no git stash list (sem perda de dados e sem deixar marcadores quebrados).
            await executeGit(["reset", "--hard", "HEAD"], repoDir).catch(() => {});
            console.warn(
              "[PRsService] Conflito ao restaurar stash pós-merge; alterações locais preservadas no git stash.",
            );
          }
        } catch {}
      }
    }
  }
}

export const prsLifecycleService = new PRsLifecycleService();
