import fs from "node:fs";
import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { loadConfig, saveConfig } from "../../config/storage.js";
import {
  callGitProviderAPI,
  applyBranchProtection,
  ensureGitRepo,
  cloneGitRepo,
  executeGit,
  isGitRepo,
} from "../../utils/git.js";
import { parseRepoRef, resolveRepoDirPath } from "../../utils/repo-ref.js";
import { assertBranchName } from "../../utils/git-validate.js";
import { workspaceService } from "../workspace/workspace.service.js";
import { eventsService } from "../events/events.service.js";
import { governanceService } from "../governance/governance.service.js";
import { reposDiagnosisService } from "./repos-diagnosis.service.js";
import { clearReposCache } from "./repos-query.service.js";
import type { RepoInitializePayload } from "./repos-types.js";

export class ReposLifecycleService {
  async selectRepo(repo: any) {
    if (!repo || !repo.name) {
      throw new Error("Repositório inválido.");
    }

    const cfg = loadConfig();

    // 1. Determina owner efetivo da organização ou usuário
    let effectiveOwner =
      repo.owner ||
      (repo.full_name?.includes("/") ? repo.full_name.split("/")[0] : undefined);
    if (!effectiveOwner || effectiveOwner === "all" || effectiveOwner === "personal") {
      effectiveOwner = cfg.user?.login || "local";
    }

    // 2. Determina o full_name canônico (ex: enursy/teste ou mBaiadori/meu-repo)
    let fullName = repo.full_name;
    if (!fullName && repo.html_url) {
      fullName = repo.html_url
        .replace(/^https?:\/\/[^\/]+\//, "")
        .replace(/\.git$/, "");
    }
    if (!fullName) {
      fullName = effectiveOwner && effectiveOwner !== "local" ? `${effectiveOwner}/${repo.name}` : repo.name;
    }

    // 3. Determina a URL remota de clone/pull de forma determinística
    let htmlUrl = repo.html_url || "";
    if (!htmlUrl && (fullName.includes("/") || (effectiveOwner && effectiveOwner !== "local")) && cfg.token) {
      const canonicalFull = fullName.includes("/") ? fullName : `${effectiveOwner}/${repo.name}`;
      htmlUrl = `https://github.com/${canonicalFull}.git`;
    }

    const isLocal = repo.is_local !== undefined ? Boolean(repo.is_local) : (!htmlUrl && !cfg.token);

    const repoDir = resolveRepoDir(repo.name, effectiveOwner);
    let isClonedLocally = fs.existsSync(repoDir) && (await isGitRepo(repoDir));

    // Se o repositório ainda não está no disco, mas o usuário tem permissão de leitura/pull, clona automaticamente
    const hasPullPermission =
      !repo.permissions ||
      repo.permissions.pull === undefined ||
      Boolean(repo.permissions.pull || repo.permissions.admin || (repo as { is_owner?: boolean }).is_owner);

    if (!isClonedLocally && hasPullPermission && !isLocal && (htmlUrl || fullName.includes("/") || cfg.token)) {
      // Se o repositório possuir convite pendente, auto-aceita no GitHub antes de clonar
      if (repo.is_pending_invitation && repo.invitation_id && cfg.token && cfg.token !== "local_mode") {
        try {
          await callGitProviderAPI(
            `/user/repository_invitations/${encodeURIComponent(String(repo.invitation_id))}`,
            cfg.token,
            "PATCH"
          );
        } catch (autoAcceptErr) {
          console.warn(`[selectRepo] Falha ao auto-aceitar convite para ${fullName}:`, autoAcceptErr);
        }
      }

      const cloneTargetUrl = htmlUrl || `https://github.com/${fullName}.git`;
      try {
        eventsService.broadcast("repo_progress", {
          repo: repo.name,
          owner: effectiveOwner,
          stage: "Sincronizando repositório...",
          percent: 30,
        });

        const cloneResult = await cloneGitRepo(
          repoDir,
          cloneTargetUrl,
          cfg.token,
          cfg.user,
          (p) => {
            eventsService.broadcast("repo_progress", {
              repo: repo.name,
              owner: effectiveOwner,
              ...p,
            });
          },
        );

        if (cloneResult.success) {
          isClonedLocally = true;
          clearReposCache();
          eventsService.broadcast("repo_progress", {
            repo: repo.name,
            owner: effectiveOwner,
            stage: "Concluído",
            percent: 100,
          });
        }
      } catch (cloneErr) {
        console.warn(`[selectRepo] Não foi possível clonar ${fullName}:`, cloneErr);
        eventsService.broadcast("repo_progress", {
          repo: repo.name,
          owner: effectiveOwner,
          stage: "Falha na sincronização",
          percent: 0,
        });
      }
    }

    cfg.active_repo = {
      name: repo.name,
      full_name: fullName,
      html_url: htmlUrl,
      description: repo.description || "",
      is_private: Boolean(repo.is_private),
      default_branch: repo.default_branch || "main",
      is_local: isLocal,
      is_cloned_locally: isClonedLocally,
      owner: effectiveOwner,
      permissions: repo.permissions || { admin: true, push: true, pull: true },
    };

    saveConfig(cfg);

    if (!isClonedLocally) {
      return {
        success: true,
        is_ready: false,
        active_repo: cfg.active_repo,
        message: "Repositório não clonado localmente.",
      };
    }

    // Realiza o diagnóstico de compatibilidade do repositório clonado no disco
    const diagnosis = await reposDiagnosisService.diagnoseRepo(repo.name, effectiveOwner);

    return {
      success: true,
      is_ready: diagnosis.is_ready,
      active_repo: cfg.active_repo,
      diagnosis,
    };
  }

  async cloneLocalRepo(payload: { name: string; owner?: string }) {
    const cfg = loadConfig();
    const ref = parseRepoRef(payload.name, payload.owner || cfg.active_repo?.owner || cfg.user?.login);
    if (!ref) {
      throw new Error("Identificador de repositório inválido para clone.");
    }
    const repoDir = resolveRepoDirPath(ref);
    const remoteUrl = `https://github.com/${ref.owner}/${ref.repo}.git`;
    const res = await cloneGitRepo(
      repoDir,
      remoteUrl,
      cfg.token,
      cfg.user,
      (p) => {
        eventsService.broadcast("repo_progress", {
          repo: ref.repo,
          owner: ref.owner,
          ...p,
        });
      },
    );
    if (!res.success) {
      throw new Error(res.message);
    }
    workspaceService.invalidateTreeCache(ref.repo);
    clearReposCache();
    eventsService.broadcast("repo_progress", {
      repo: ref.repo,
      owner: ref.owner,
      stage: "Concluído",
      percent: 100,
    });

    if (cfg.active_repo && cfg.active_repo.name.toLowerCase() === ref.repo.toLowerCase()) {
      cfg.active_repo.is_cloned_locally = true;
      saveConfig(cfg);
    }

    return {
      success: true,
      message: `Repositório ${ref.owner}/${ref.repo} clonado com sucesso para ${repoDir}`,
      repo_dir: repoDir,
      owner: ref.owner,
      name: ref.repo,
      full_name: `${ref.owner}/${ref.repo}`,
      is_cloned_locally: true,
    };
  }

  async createRepo(payload: {
    name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
    enable_protection?: boolean;
    required_approvals?: number;
    auto_initialize?: boolean;
    initialTeams?: Array<{ slug: string; permission?: string }>;
    initialCollaborators?: Array<{ username: string; permission?: string }>;
  }) {
    const repoName = payload.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!repoName) {
      throw new Error("Nome do repositório é obrigatório");
    }

    const cfg = loadConfig();
    const owner = payload.owner?.trim() || cfg.user?.login;
    const userLogin = (cfg.user?.login || "").toLowerCase();
    const isPersonal =
      !owner ||
      owner.toLowerCase() === userLogin ||
      owner.toLowerCase() === "personal" ||
      owner.toLowerCase() === "all" ||
      owner.toLowerCase() === "local";
    const targetOwner = isPersonal ? (cfg.user?.login || owner || "local") : owner;
    const repoDir = resolveRepoDir(repoName, targetOwner);

    if (!cfg.authenticated || !cfg.token) {
      // Criação Local
      if (!fs.existsSync(repoDir)) {
        fs.mkdirSync(repoDir, { recursive: true });
      }
      await ensureGitRepo(repoDir, cfg.user);
      cfg.active_repo = {
        name: repoName,
        full_name: `${targetOwner}/${repoName}`,
        description: payload.description || "Repositório Local",
        is_private: false,
        default_branch: "main",
        is_local: true,
        is_cloned_locally: true,
        is_owner: true,
        permissions: { admin: true, push: true, pull: true },
      };
      saveConfig(cfg);

      if (payload.auto_initialize) {
        return await this.initializeRepo({
          name: repoName,
          preset: "recommended",
          project_config: {
            name: repoName,
            description:
              payload.description ||
              "Repositório de especificações e governança",
          },
        });
      }

      const diagnosis = await reposDiagnosisService.diagnoseRepo(repoName, targetOwner);
      return {
        success: true,
        message: `Repositório local '${repoName}' criado!`,
        repo: cfg.active_repo,
        is_ready: diagnosis.is_ready,
        diagnosis,
      };
    }

    const endpoint = isPersonal ? "/user/repos" : `/orgs/${targetOwner}/repos`;

    const { statusCode, data: respData } = await callGitProviderAPI(
      endpoint,
      cfg.token,
      "POST",
      {
        name: repoName,
        description: payload.description || "Repositório de Governança",
        private: payload.is_private ?? true,
        visibility: (payload.is_private ?? true) ? "private" : "public",
        auto_init: false, // Repositório mantido em branco
      },
    );

    if (statusCode !== 200 && statusCode !== 201) {
      let errDetail = respData?.message || "Falha na requisição";
      if (Array.isArray(respData?.errors) && respData.errors.length > 0) {
        const extra = respData.errors
          .map((e: { message?: string; code?: string }) => e.message || e.code || JSON.stringify(e))
          .join(", ");
        errDetail += ` (${extra})`;
      }
      throw new Error(`Erro ao criar repositório no GitHub: ${errDetail}`);
    }

    const ownerLogin = respData.owner?.login || targetOwner;
    const repoFullName = respData.full_name || `${ownerLogin}/${repoName}`;
    const defaultBranch = respData.default_branch || "main";
    const remoteUrl = respData.html_url || `https://github.com/${repoFullName}`;

    // Registra a organização na lista de orgs se não existir
    if (ownerLogin && ownerLogin.toLowerCase() !== userLogin) {
      if (!cfg.orgs) cfg.orgs = [];
      if (!cfg.orgs.some((o: { login?: string }) => o.login?.toLowerCase() === ownerLogin.toLowerCase())) {
        cfg.orgs.push({
          login: ownerLogin,
          name: respData.owner?.name || ownerLogin,
          avatar_url: respData.owner?.avatar_url,
          description: respData.owner?.description,
        });
      }
    }

    // Clona ou inicializa o repositório em branco para a máquina
    await ensureGitRepo(repoDir, cfg.user, remoteUrl, cfg.token, repoName);

    cfg.active_repo = {
      name: repoName,
      full_name: repoFullName,
      html_url: remoteUrl,
      description: payload.description || "",
      is_private: payload.is_private ?? true,
      default_branch: defaultBranch,
      is_owner:
        ownerLogin.toLowerCase() === userLogin,
      permissions: { admin: true, push: true, pull: true },
    };
    saveConfig(cfg);

    // Se foram fornecidos times iniciais, associa na Organização do GitHub
    if (Array.isArray(payload.initialTeams) && payload.initialTeams.length > 0 && !isPersonal) {
      for (const t of payload.initialTeams) {
        if (t.slug) {
          try {
            await governanceService.addTeamToRepo({
              org: targetOwner,
              teamSlug: t.slug,
              owner: targetOwner,
              repo: repoName,
              permission: t.permission || "push",
            });
          } catch (tErr) {
            console.warn(`[ReposService] Falha ao associar time inicial ${t.slug} ao repo ${repoName}:`, tErr);
          }
        }
      }
    }

    // Se foram fornecidos colaboradores iniciais, convida no GitHub
    if (Array.isArray(payload.initialCollaborators) && payload.initialCollaborators.length > 0) {
      for (const c of payload.initialCollaborators) {
        if (c.username) {
          try {
            await governanceService.inviteCollaborator({
              username: c.username,
              permission: (c.permission as "pull" | "triage" | "push" | "maintain" | "admin" | undefined) || "push",
              repo: repoName,
            });
          } catch (cErr) {
            console.warn(`[ReposService] Falha ao convidar colaborador inicial ${c.username} para o repo ${repoName}:`, cErr);
          }
        }
      }
    }

    if (payload.auto_initialize) {
      return await this.initializeRepo({
        name: repoName,
        preset: "recommended",
        project_config: {
          name: repoName,
          description:
            payload.description || "Repositório de especificações e governança",
        },
        security: {
          enable_branch_protection: payload.enable_protection ?? true,
          required_approvals: payload.required_approvals ?? 1,
          create_codeowners: true,
        },
      });
    }

    clearReposCache();
    const diagnosis = await reposDiagnosisService.diagnoseRepo(repoName, targetOwner);
    return {
      success: true,
      message: `Repositório ${repoFullName} criado com sucesso!`,
      repo: cfg.active_repo,
      is_ready: diagnosis.is_ready,
      diagnosis,
    };
  }

  async initializeRepo(payload: RepoInitializePayload) {
    const {
      name,
      preset = "recommended",
      project_config,
      security,
      folders,
    } = payload;
    if (!name) {
      throw new Error("Nome do repositório é obrigatório para inicialização");
    }

    const cfg = loadConfig();
    const repoDir = resolveRepoDir(name, cfg.active_repo?.owner);

    if (!fs.existsSync(repoDir)) {
      fs.mkdirSync(repoDir, { recursive: true });
    }

    // 1. .hidden_files.json
    const defaultHiddenFiles = [
      ".git",
      ".gitignore",
      ".DS_Store",
      "node_modules",
      ".project.config.json",
      ".docs.metadata.json",
      ".dictionary.json",
      ".templates.json",
      ".templates.metadata.json",
      ".skills",
      ".agents",
      ".tools",
      ".mcp.json",
      ".hidden_files.json",
    ];
    fs.writeFileSync(
      path.join(repoDir, ".hidden_files.json"),
      JSON.stringify(defaultHiddenFiles, null, 2),
      "utf-8",
    );

    // 2. .project.config.json (com taxonomias e cores dinâmicas)
    const defaultCategories = [
      {
        id: "visao-geral",
        label: "Visão Geral",
        color: "#1a73e8",
        description: "Arquitetura e visão geral",
      },
      {
        id: "especificacoes",
        label: "Especificações",
        color: "#10b981",
        description: "Regras de negócio e PRDs",
      },
      {
        id: "engenharia",
        label: "Engenharia",
        color: "#8b5cf6",
        description: "Guias técnicos e padrões de código",
      },
    ];

    const defaultTags = [
      { id: "core", label: "Core", color: "#1a73e8" },
      { id: "api", label: "API", color: "#06b6d4" },
      { id: "security", label: "Segurança", color: "#ef4444" },
      { id: "frontend", label: "Frontend", color: "#f59e0b" },
      { id: "database", label: "Banco de Dados", color: "#10b981" },
    ];

    const defaultStatuses = [
      { id: "draft", label: "Rascunho", color: "#94a3b8" },
      { id: "in_review", label: "Em Revisão", color: "#f59e0b" },
      { id: "approved", label: "Aprovado", color: "#10b981" },
      { id: "deprecated", label: "Depreciado", color: "#ef4444" },
    ];

    const defaultBadges = [
      { id: "ssot", label: "SSOT", color: "#1a73e8" },
      { id: "rfc", label: "RFC", color: "#8b5cf6" },
      { id: "sdd", label: "SDD", color: "#10b981" },
      { id: "prd", label: "PRD", color: "#06b6d4" },
    ];

    const targetProjectConfig = {
      project: {
        name: project_config?.name || name,
        description:
          project_config?.description ||
          "Repositório de documentação e especificações.",
        version: "1.0.0",
        architecture_pattern: "Documentação Viva & Git SSOT",
        repository_url: cfg.active_repo?.html_url || "",
        lead: cfg.user?.login ? `@${cfg.user.login}` : "@equipe",
      },
      categories: project_config?.categories || defaultCategories,
      tags: project_config?.tags || defaultTags,
      statuses: project_config?.statuses || defaultStatuses,
      badges: project_config?.badges || defaultBadges,
      governance_rules: project_config?.governance_rules || {
        min_approvals_default: 1,
      },
      reviewers: cfg.user?.login ? [`@${cfg.user.login}`] : [],
      ai_assistant_prompt:
        "Você é o assistente inteligente de documentação e engenharia do Contexos.",
    };

    fs.writeFileSync(
      path.join(repoDir, ".project.config.json"),
      JSON.stringify(targetProjectConfig, null, 2),
      "utf-8",
    );

    // 3. Índice de metadados é mantido no cache externo da aplicação (fora do repo Git)

    // 4. .dictionary.json & .templates.json
    const dictPath = path.join(repoDir, ".dictionary.json");
    if (!fs.existsSync(dictPath)) {
      fs.writeFileSync(
        dictPath,
        JSON.stringify({ version: "1.0.0", terms: [], domains: [] }, null, 2),
        "utf-8",
      );
    }

    const templatesPath = path.join(repoDir, ".templates.json");
    if (!fs.existsSync(templatesPath)) {
      fs.writeFileSync(templatesPath, JSON.stringify([], null, 2), "utf-8");
    }

    // 5. CODEOWNERS
    const shouldCreateCodeowners = security?.create_codeowners ?? true;
    if (shouldCreateCodeowners) {
      const githubDir = path.join(repoDir, ".github");
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
      }
      const ownerLogin =
        cfg.active_repo?.full_name?.split("/")[0] || cfg.user?.login || "admin";
      const codeownersContent = `# Contexos - Governança & Root of Trust
# Arquivos críticos de controle de acesso exigem aprovação do proprietário
.project.config.json @${ownerLogin}
.gitignore @${ownerLogin}
.github/ @${ownerLogin}
`;
      fs.writeFileSync(
        path.join(githubDir, "CODEOWNERS"),
        codeownersContent,
        "utf-8",
      );
    }

    // 6. Pastas de Trabalho Opcionais (apenas se especificadas)
    const targetFolders = folders || [];
    for (const folder of targetFolders) {
      const folderPath = path.join(repoDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        const keepPath = path.join(folderPath, ".gitkeep");
        if (!fs.existsSync(keepPath)) {
          fs.writeFileSync(keepPath, "", "utf-8");
        }
      }
    }

    // 7. Git Add, Commit e Push inicial (cria e publica a branch padrão no GitHub)
    const isGit = await isGitRepo(repoDir);
    const defaultBranch = assertBranchName(cfg.active_repo?.default_branch || "main");
    if (isGit) {
      try {
        await executeGit(["branch", "-M", defaultBranch], repoDir).catch(() => {});
        await executeGit(["add", "-A"], repoDir);
        await executeGit(
          ["commit", "-m", "chore(context-os): inicializar governanca do framework"],
          repoDir,
        );

        if (cfg.token && cfg.active_repo?.html_url) {
          await executeGit(["push", "-u", "origin", defaultBranch], repoDir);
        }
      } catch (gitErr: unknown) {
        const errMsg = gitErr instanceof Error ? gitErr.message : String(gitErr);
        console.warn(
          `[ReposService] Aviso no commit inicial em ${name}:`,
          errMsg,
        );
      }
    }

    // 9. Branch Protection no GitHub (apenas após a branch já existir remotamente)
    let protectionMessage = "Não aplicável";
    const shouldEnableProtection =
      security?.enable_branch_protection ?? preset === "recommended";
    if (
      shouldEnableProtection &&
      cfg.authenticated &&
      cfg.token &&
      cfg.active_repo?.full_name?.includes("/")
    ) {
      const pRes = await applyBranchProtection(
        cfg.active_repo.full_name,
        defaultBranch,
        cfg.token,
        security?.required_approvals || 1,
      );
      protectionMessage =
        pRes.statusCode === 200 || pRes.statusCode === 201
          ? "Ativada com sucesso"
          : `Pendente (${(pRes.data as { message?: string } | undefined)?.message || "Aviso"})`;
    }

    // 10. Atualiza active_repo e invalida árvore
    if (!cfg.active_repo || cfg.active_repo.name !== name) {
      cfg.active_repo = {
        name,
        full_name: cfg.active_repo?.full_name || name,
        description: targetProjectConfig.project.description,
        is_private: cfg.active_repo?.is_private ?? false,
        default_branch: cfg.active_repo?.default_branch || "main",
        is_local: !cfg.token,
        permissions: { admin: true, push: true, pull: true },
      };
    }
    saveConfig(cfg);
    workspaceService.invalidateTreeCache(name);

    const diagnosis = await reposDiagnosisService.diagnoseRepo(name, cfg.active_repo?.owner);

    return {
      success: true,
      message: `Repositório '${name}' inicializado com sucesso!`,
      active_repo: cfg.active_repo,
      protection: protectionMessage,
      diagnosis,
    };
  }

  async deleteRepo(payload: {
    name: string;
    owner?: string;
    delete_remote?: boolean;
    delete_local?: boolean;
  }) {
    const { name, owner, delete_remote, delete_local = true } = payload;
    if (!name) {
      throw new Error("Nome do repositório é obrigatório para exclusão");
    }

    const cfg = loadConfig();
    let remoteDeleted = false;

    // Delete remote if requested and authenticated (never for default/local repos)
    if (
      delete_remote &&
      cfg.authenticated &&
      cfg.token &&
      name !== "default" &&
      name !== "_default" &&
      name !== "local"
    ) {
      const repoOwner = owner || cfg.user?.login;
      if (!repoOwner) {
        throw new Error(
          "Proprietário do repositório não encontrado para exclusão remota",
        );
      }
      const endpoint = `/repos/${repoOwner}/${name}`;
      const { statusCode, data } = await callGitProviderAPI(
        endpoint,
        cfg.token,
        "DELETE",
      );
      if (statusCode === 204 || statusCode === 200) {
        remoteDeleted = true;
      } else {
        throw new Error(
          (data as { message?: string } | undefined)?.message ||
            `Falha ao excluir no provedor remoto (Status ${statusCode})`,
        );
      }
    }

    // Delete local directory if requested
    if (delete_local) {
      const localDir = resolveRepoDir(name, owner || cfg.active_repo?.owner);
      if (fs.existsSync(localDir)) {
        try {
          fs.rmSync(localDir, { recursive: true, force: true });
        } catch (err: unknown) {
          console.error(
            `[ReposService] Erro ao remover pasta local ${localDir}:`,
            err,
          );
        }
      }
      workspaceService.invalidateTreeCache(name);
    }

    // Reset active_repo if deleted
    if (cfg.active_repo?.name && cfg.active_repo.name.toLowerCase() === name.toLowerCase()) {
      cfg.active_repo = null;
      saveConfig(cfg);
    }

    clearReposCache();
    return {
      success: true,
      remoteDeleted,
      message: `Repositório '${name}' excluído com sucesso.`,
    };
  }

  async updateRepo(payload: {
    current_name: string;
    new_name?: string;
    description?: string;
    is_private?: boolean;
    owner?: string;
  }) {
    const { current_name, new_name, description, is_private, owner } = payload;
    if (!current_name) {
      throw new Error("Nome atual do repositório é obrigatório.");
    }

    const cfg = loadConfig();
    const repoOwner =
      owner || cfg.active_repo?.owner || cfg.user?.login || "local";
    const isLocal =
      !cfg.authenticated || !cfg.token || cfg.active_repo?.is_local;
    const targetName = (new_name || current_name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

    if (!targetName) {
      throw new Error("O novo nome do repositório não pode ser vazio.");
    }

    let remoteUpdated = false;
    let updatedRemoteUrl = cfg.active_repo?.html_url || "";
    let updatedFullName =
      cfg.active_repo?.full_name || `${repoOwner}/${targetName}`;

    // 1. Atualizar no Provedor Remoto se aplicável
    if (
      !isLocal &&
      cfg.token &&
      current_name !== "default" &&
      current_name !== "_default" &&
      current_name !== "local"
    ) {
      const endpoint = `/repos/${repoOwner}/${current_name}`;
      const updatePayload: Record<string, unknown> = {};
      if (new_name && new_name !== current_name) {
        updatePayload.name = targetName;
      }
      if (description !== undefined) {
        updatePayload.description = description;
      }
      if (is_private !== undefined) {
        updatePayload.private = is_private;
      }

      const { statusCode, data } = await callGitProviderAPI(
        endpoint,
        cfg.token,
        "PATCH",
        updatePayload,
      );
      if (statusCode === 200) {
        remoteUpdated = true;
        const respData = data as { html_url?: string; full_name?: string } | undefined;
        updatedRemoteUrl = respData?.html_url || updatedRemoteUrl;
        updatedFullName = respData?.full_name || `${repoOwner}/${targetName}`;
      } else {
        throw new Error(
          (data as { message?: string } | undefined)?.message ||
            `Falha ao atualizar repositório no provedor remoto (Status ${statusCode})`,
        );
      }
    }

    // 2. Renomear pasta local se o nome mudou
    const oldDir = resolveRepoDir(current_name, repoOwner);
    const newDir = resolveRepoDir(targetName, repoOwner);

    if (targetName !== current_name && fs.existsSync(oldDir)) {
      try {
        fs.renameSync(oldDir, newDir);
        workspaceService.invalidateTreeCache(current_name);
        workspaceService.invalidateTreeCache(targetName);
      } catch (err: unknown) {
        console.error(
          `[ReposService] Erro ao renomear pasta local de ${oldDir} para ${newDir}:`,
          err,
        );
      }
    }

    // 3. Atualizar .project.config.json se existir
    const activeDir = fs.existsSync(newDir)
      ? newDir
      : fs.existsSync(oldDir)
        ? oldDir
        : null;
    if (activeDir) {
      const pConfigPath = path.join(activeDir, ".project.config.json");
      if (fs.existsSync(pConfigPath)) {
        try {
          const pConfig = JSON.parse(fs.readFileSync(pConfigPath, "utf-8"));
          if (pConfig && typeof pConfig === "object") {
            if (!pConfig.project) pConfig.project = {};
            if (targetName) pConfig.project.name = targetName;
            if (description !== undefined)
              pConfig.project.description = description;
            fs.writeFileSync(
              pConfigPath,
              JSON.stringify(pConfig, null, 2),
              "utf-8",
            );
          }
        } catch {}
      }
    }

    // 4. Atualizar config.json do Contexos se era o active_repo
    if (cfg.active_repo?.name === current_name) {
      cfg.active_repo = {
        ...cfg.active_repo,
        name: targetName,
        full_name: updatedFullName,
        html_url: updatedRemoteUrl,
        description:
          description !== undefined ? description : cfg.active_repo.description,
        is_private:
          is_private !== undefined ? is_private : cfg.active_repo.is_private,
      };
      saveConfig(cfg);
    }

    return {
      success: true,
      remoteUpdated,
      message: `Repositório '${targetName}' atualizado com sucesso.`,
      repo: {
        name: targetName,
        full_name: updatedFullName,
        html_url: updatedRemoteUrl,
        description: description,
        is_private: is_private,
      },
    };
  }

  async cloneRepo(payload: {
    source_name: string;
    new_name: string;
    owner?: string;
    description?: string;
    is_private?: boolean;
  }) {
    const { source_name, new_name, owner, description, is_private } = payload;
    if (!source_name) {
      throw new Error("Nome do repositório de origem é obrigatório.");
    }
    const targetName = new_name?.trim().toLowerCase().replace(/\s+/g, "-");
    if (!targetName) {
      throw new Error("Novo nome do repositório clonado é obrigatório.");
    }

    const cfg = loadConfig();
    const targetOwner = owner || cfg.active_repo?.owner || cfg.user?.login || "local";
    const sourceDir = resolveRepoDir(source_name, owner || cfg.active_repo?.owner);

    // 1. Criar o novo repositório (local ou remoto)
    const createResult = await this.createRepo({
      name: targetName,
      owner: targetOwner,
      description: description || `Cópia clonada de ${source_name}`,
      is_private: is_private ?? true,
      auto_initialize: false,
    });

    const targetDir = resolveRepoDir(targetName, targetOwner);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 2. Copiar todos os arquivos de source_name para target_name (exceto .git)
    if (fs.existsSync(sourceDir)) {
      const copyRecursive = (src: string, dest: string) => {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === ".git") continue; // nunca copia a pasta .git
          const srcPath = path.join(src, entry.name);
          const destPath = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            if (!fs.existsSync(destPath))
              fs.mkdirSync(destPath, { recursive: true });
            copyRecursive(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      };
      copyRecursive(sourceDir, targetDir);
    }

    // 3. Atualizar o nome no .project.config.json do clone
    const pConfigPath = path.join(targetDir, ".project.config.json");
    if (fs.existsSync(pConfigPath)) {
      try {
        const pConfig = JSON.parse(fs.readFileSync(pConfigPath, "utf-8"));
        if (pConfig && typeof pConfig === "object") {
          if (!pConfig.project) pConfig.project = {};
          pConfig.project.name = targetName;
          if (description) pConfig.project.description = description;
          fs.writeFileSync(
            pConfigPath,
            JSON.stringify(pConfig, null, 2),
            "utf-8",
          );
        }
      } catch {}
    }

    // 4. Se houver git no repositório destino, commitar e fazer push
    const clonedRepo =
      (createResult as { repo?: unknown; active_repo?: unknown }).repo ||
      (createResult as { repo?: unknown; active_repo?: unknown }).active_repo;
    if (fs.existsSync(path.join(targetDir, ".git"))) {
      await executeGit(["add", "-A"], targetDir);
      await executeGit(
        ["commit", "-m", `feat: initial cloned structure from ${source_name}`],
        targetDir,
      ).catch(() => {});
      if (cfg.authenticated && cfg.token && !(clonedRepo as { is_local?: boolean })?.is_local) {
        await executeGit(["push", "-u", "origin", "main"], targetDir).catch(() => {});
      }
    }

    workspaceService.invalidateTreeCache(targetName);

    return {
      success: true,
      message: `Repositório '${targetName}' clonado a partir de '${source_name}' com sucesso!`,
      repo: clonedRepo,
    };
  }
}

export const reposLifecycleService = new ReposLifecycleService();
