import { loadConfig } from "../../config/storage.js";
import {
  callGitHubAPI,
  executeGit,
  getGitLog,
} from "../../utils/git.js";
import {
  assertBranchName,
  assertCommitish,
} from "../../utils/git-validate.js";
import { computeDiff } from "../../utils/diff.js";
import { prSecurityService } from "./pr-security.service.js";
import { prsStorageService } from "./prs-storage.service.js";
import { prsLifecycleService } from "./prs-lifecycle.service.js";

export class PRsQueryService {
  private lastGitHubSyncTime: Record<string, number> = {};
  private commitFilesCache = new Map<string, any[]>();

  async getPRs(
    targetRepoQuery?: string,
    userLogin?: string,
    paginationOptions?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    },
  ) {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const isAll = (targetRepoQuery || "").toLowerCase() === "all";
    const repoName = isAll ? "all" : (targetRepoQuery || activeRepo?.name || "local");
    const login = userLogin || cfg.user?.login || "local_user";

    const allRepos = prsStorageService.getAllLocalRepos();
    const repoOpenCounts: Record<string, number> = {};

    // Coleta contagens de abertos para todos os repositórios locais
    for (const r of allRepos) {
      const rPRs = prsStorageService.loadRepoPRs(r.name);
      const openCount = rPRs.filter((p: { status?: string }) => {
        const s = (p.status || "").toLowerCase();
        return s === "open" || s === "in_review";
      }).length;
      repoOpenCounts[r.name] = openCount;
    }

    if (isAll) {
      // 1. Visão Central Unificada ("Todos os Repositórios")
      const combinedAll: any[] = [];
      for (const r of allRepos) {
        const rPRs = prsStorageService.loadRepoPRs(r.name).map((p: any) => ({
          ...p,
          repo_name: p.repo_name || r.name,
        }));
        combinedAll.push(...rPRs);

        // Fetch direct commit revisions for this repo (limit 15)
        try {
          const gitCommits = await getGitLog(r.dir, 15);
          const existingHashes = new Set(
            rPRs.map((p: any) => String(p.commit_hash || p.github_number || p.id)),
          );
          const existingTitles = new Set(
            rPRs.map((p: any) => (p.title || "").trim().toLowerCase()),
          );
          for (const c of gitCommits) {
            if (
              existingHashes.has(c.hash) ||
              existingHashes.has(c.shortHash) ||
              existingTitles.has((c.message || "").trim().toLowerCase())
            ) {
              continue;
            }
            combinedAll.push({
              id: `${r.name}-${c.shortHash}`,
              short_id: c.shortHash,
              commit_hash: c.hash,
              head_sha: c.hash,
              repo_name: r.name,
              title: c.message,
              description: `Revisão oficial comitada diretamente na branch main de ${r.name} em ${c.date}`,
              branch: "main",
              target_branch: "main",
              status: "MERGED",
              created_at: c.date,
              merged_at: c.date,
              author: c.author
                ? c.author.startsWith("@")
                  ? c.author
                  : `@${c.author}`
                : "Git Committer",
              approvals: [
                {
                  user: "Oficial (main)",
                  role: "Sistema Git",
                  timestamp: c.date,
                  commit_hash: c.hash,
                  status: "APPROVED",
                },
              ],
              type: c.message.startsWith("feat")
                ? "feat"
                : c.message.startsWith("fix")
                  ? "fix"
                  : "docs",
              layer: `Versão Oficial (${r.name})`,
              domain: "",
              is_direct_commit: true,
              files: [],
            });
          }
        } catch {}
      }

      combinedAll.sort((a: { created_at?: string }, b: { created_at?: string }) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      });

      const countAll = combinedAll.length;
      const countOpen = combinedAll.filter((p: { status?: string }) => {
        const s = (p.status || "").toLowerCase();
        return s === "open" || s === "in_review";
      }).length;
      const countMerged = combinedAll.filter(
        (p: { status?: string }) => (p.status || "").toLowerCase() === "merged",
      ).length;
      const countClosed = combinedAll.filter(
        (p: { status?: string }) => (p.status || "").toLowerCase() === "closed",
      ).length;

      const activeStatus = (paginationOptions?.status || "all").toLowerCase();
      const searchQuery = (paginationOptions?.search || "").toLowerCase().trim();

      const filteredList = combinedAll.filter((pr: { status?: string; title?: string; author?: string; description?: string; repo_name?: string; id?: string | number }) => {
        const statusLower = (pr.status || "").toLowerCase();
        const matchesStatus =
          activeStatus === "all" ||
          (activeStatus === "open" &&
            (statusLower === "open" || statusLower === "in_review")) ||
          (activeStatus === "merged" && statusLower === "merged") ||
          (activeStatus === "closed" && statusLower === "closed");

        const matchesSearch =
          !searchQuery ||
          (pr.title && pr.title.toLowerCase().includes(searchQuery)) ||
          (pr.author && pr.author.toLowerCase().includes(searchQuery)) ||
          (pr.description &&
            pr.description.toLowerCase().includes(searchQuery)) ||
          (pr.repo_name && pr.repo_name.toLowerCase().includes(searchQuery)) ||
          String(pr.id).includes(searchQuery);

        return matchesStatus && matchesSearch;
      });

      const page = Math.max(1, paginationOptions?.page || 1);
      const limit = Math.max(1, paginationOptions?.limit || 15);
      const total = filteredList.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const startIndex = (page - 1) * limit;
      const pageItems = filteredList.slice(startIndex, startIndex + limit);

      const sanitizedPageItems = await Promise.all(
        pageItems.map(async (p: any) => {
          const itemRepo = p.repo_name || "local";
          const govRules = prsStorageService.getGovernanceRules(itemRepo);
          const rawFiles = Array.isArray(p.files) ? p.files : [];
          return {
            ...p,
            files: rawFiles,
            total_files_count: rawFiles.length,
            has_more_files: rawFiles.length > 50,
            min_approvals: p.min_approvals || govRules.min_approvals,
            is_solo_mode: govRules.is_solo,
          };
        }),
      );

      return {
        repo: activeRepo,
        repo_name: "all",
        prs: sanitizedPageItems,
        count: sanitizedPageItems.length,
        total,
        page,
        limit,
        total_pages: totalPages,
        counts: {
          all: countAll,
          open: countOpen,
          merged: countMerged,
          closed: countClosed,
        },
        repoOpenCounts,
        governance: {
          min_approvals: 1,
          is_solo_mode: false,
          anti_self_approval: false,
          reviewers: cfg.governance?.reviewers || [],
        },
      };
    }

    let allPRs = prsStorageService.loadRepoPRs(repoName);
    const targetRepoObj = prsStorageService.resolveTargetRepoObj(repoName, cfg);

    // Auto-sync remote GitHub Pull Requests if authenticated and target matches active or matched remote repo
    const now = Date.now();
    const lastSync = this.lastGitHubSyncTime[repoName] || 0;
    const shouldSyncGitHub = now - lastSync > 30_000;

    if (
      shouldSyncGitHub &&
      cfg.authenticated &&
      cfg.token &&
      targetRepoObj?.full_name &&
      !targetRepoObj?.is_local &&
      targetRepoObj.name.toLowerCase() === repoName.toLowerCase()
    ) {
      this.lastGitHubSyncTime[repoName] = now;
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${targetRepoObj.full_name}/pulls?state=all&per_page=50`,
          cfg.token,
        );
        if (ghRes.statusCode === 200 && Array.isArray(ghRes.data)) {
          let modified = false;
          for (const ghPR of ghRes.data) {
            // Garante que o PR do GitHub realmente pertence a este repositório
            if (
              ghPR.base?.repo?.name &&
              ghPR.base.repo.name.toLowerCase() !== repoName.toLowerCase()
            ) {
              continue;
            }
            if (
              ghPR.html_url &&
              !ghPR.html_url.toLowerCase().includes(`/${repoName.toLowerCase()}/`)
            ) {
              continue;
            }

            const existingIdx = allPRs.findIndex(
              (p: any) =>
                (p.github_number && p.github_number === ghPR.number) ||
                (p.github_id && p.github_id === ghPR.id) ||
                (p.repo_name === repoName &&
                  String(p.id) === String(ghPR.number)),
            );
            const status = ghPR.merged_at
              ? "MERGED"
              : ghPR.state === "closed"
                ? "CLOSED"
                : "OPEN";
            if (existingIdx >= 0) {
              const existing = allPRs[existingIdx];
              if (existing.status !== status || !existing.html_url) {
                existing.status = status;
                existing.html_url = ghPR.html_url;
                if (ghPR.merged_at) existing.merged_at = ghPR.merged_at;
                if (ghPR.closed_at) existing.closed_at = ghPR.closed_at;
                modified = true;
              }
            } else {
              allPRs.unshift({
                id: ghPR.number,
                github_id: ghPR.id,
                github_number: ghPR.number,
                repo_name: repoName,
                title: ghPR.title || `PR #${ghPR.number}`,
                description: ghPR.body || "",
                branch: ghPR.head?.ref || "",
                target_branch: ghPR.base?.ref || "main",
                status,
                created_at: ghPR.created_at,
                merged_at: ghPR.merged_at,
                closed_at: ghPR.closed_at,
                author: ghPR.user?.login
                  ? `@${ghPR.user.login}`
                  : "GitHub User",
                approvals: [],
                type: "docs",
                layer: "Geral",
                domain: "",
                files: [],
                html_url: ghPR.html_url,
              });
              modified = true;
            }
          }
          if (modified) {
            prsStorageService.saveRepoPRs(repoName, allPRs);
          }
        }
      } catch (ghErr) {
        console.warn("[PRsService] Aviso ao sincronizar PRs do GitHub:", ghErr);
      }
    }

    // 1. STRICT ISOLATION: Filter PRs belonging to this specific repository
    const repoPRs = allPRs.filter(
      (p: { repo_name?: string }) =>
        p.repo_name === repoName || (!p.repo_name && repoName === "local"),
    );
    const repoDir = prsStorageService.getRepoDir(repoName);

    // 2. INVARIANCE CHECK: Verify if branch HEAD changed externally and invalidate approvals accordingly (in parallel)
    const openPRsWithBranch = repoPRs.filter(
      (pr: { status?: string; branch?: string }) => pr.status === "OPEN" && pr.branch,
    );
    if (openPRsWithBranch.length > 0) {
      await Promise.all(
        openPRsWithBranch.map(async (pr: any) => {
          try {
            const revRes = await executeGit(
              ["rev-parse", assertBranchName(pr.branch)],
              repoDir,
            );
            if (revRes.success && revRes.stdout) {
              const currentHead = revRes.stdout.trim();
              if (!pr.head_sha) {
                pr.head_sha = currentHead;
              } else if (pr.head_sha !== currentHead) {
                prsLifecycleService.afterPRHeadChanged(repoName, pr, {
                  actor: "Git (Sync / Push Externo)",
                  newHead: currentHead,
                });
              }
            }
          } catch {}
        }),
      );
    }

    // 3. Fetch Git Commits on main as Official Revisions
    const gitCommits = await getGitLog(repoDir, 50);
    const existingHashes = new Set(
      repoPRs.map((p: { commit_hash?: string; github_number?: number; id?: string | number }) => String(p.commit_hash || p.github_number || p.id)),
    );
    const existingTitles = new Set(
      repoPRs.map((p: { title?: string }) => (p.title || "").trim().toLowerCase()),
    );

    const commitRevisions: any[] = [];
    for (const c of gitCommits) {
      if (
        existingHashes.has(c.hash) ||
        existingHashes.has(c.shortHash) ||
        existingTitles.has((c.message || "").trim().toLowerCase())
      ) {
        continue;
      }

      commitRevisions.push({
        id: c.shortHash,
        short_id: c.shortHash,
        commit_hash: c.hash,
        head_sha: c.hash,
        repo_name: repoName,
        title: c.message,
        description: `Revisão oficial comitada diretamente na branch main em ${c.date}`,
        branch: "main",
        target_branch: "main",
        status: "MERGED",
        created_at: c.date,
        merged_at: c.date,
        author: c.author
          ? c.author.startsWith("@")
            ? c.author
            : `@${c.author}`
          : "Git Committer",
        approvals: [
          {
            user: "Oficial (main)",
            role: "Sistema Git",
            timestamp: c.date,
            commit_hash: c.hash,
            status: "APPROVED",
          },
        ],
        type: c.message.startsWith("feat")
          ? "feat"
          : c.message.startsWith("fix")
            ? "fix"
            : "docs",
        layer: "Versão Oficial (main)",
        domain: "",
        is_direct_commit: true,
        files: [], // Preenchido sob demanda apenas para os itens da página atual
        html_url: activeRepo?.html_url
          ? `${activeRepo.html_url}/commit/${c.hash}`
          : "",
      });
    }

    // 4. Combine all PRs and Commit Revisions, sorted descending by date
    const combinedAll = [...repoPRs, ...commitRevisions];
    combinedAll.sort((a: { created_at?: string }, b: { created_at?: string }) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });

    // 5. Global counts for filters (before search/status pagination)
    const countAll = combinedAll.length;
    const countOpen = combinedAll.filter((p: { status?: string }) => {
      const s = (p.status || "").toLowerCase();
      return s === "open" || s === "in_review";
    }).length;
    const countMerged = combinedAll.filter(
      (p: { status?: string }) => (p.status || "").toLowerCase() === "merged",
    ).length;
    const countClosed = combinedAll.filter(
      (p: { status?: string }) => (p.status || "").toLowerCase() === "closed",
    ).length;

    // 6. Filter by Status & Search Query
    const activeStatus = (paginationOptions?.status || "all").toLowerCase();
    const searchQuery = (paginationOptions?.search || "").toLowerCase().trim();

    const filteredList = combinedAll.filter((pr: { status?: string; title?: string; author?: string; description?: string; id?: string | number }) => {
      const statusLower = (pr.status || "").toLowerCase();
      const matchesStatus =
        activeStatus === "all" ||
        (activeStatus === "open" &&
          (statusLower === "open" || statusLower === "in_review")) ||
        (activeStatus === "merged" && statusLower === "merged") ||
        (activeStatus === "closed" && statusLower === "closed");

      const matchesSearch =
        !searchQuery ||
        (pr.title && pr.title.toLowerCase().includes(searchQuery)) ||
        (pr.author && pr.author.toLowerCase().includes(searchQuery)) ||
        (pr.description &&
          pr.description.toLowerCase().includes(searchQuery)) ||
        String(pr.id).includes(searchQuery);

      return matchesStatus && matchesSearch;
    });

    // 7. Pagination slice (Sempre paginado para máxima performance e proteção contra travamentos)
    const page = Math.max(1, paginationOptions?.page || 1);
    const limit = Math.max(1, paginationOptions?.limit || 15);
    const total = filteredList.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const pageItems = filteredList.slice(startIndex, startIndex + limit);

    // 8. Carrega arquivos de commit e sanitiza permissões APENAS para os itens da página atual
    const govRules = prsStorageService.getGovernanceRules(repoName);
    const sanitizedPageItems = await Promise.all(
      pageItems.map(async (p: any) => {
        let rawFiles = Array.isArray(p.files) ? p.files : [];

        // Para commits oficiais diretos na main da página atual, obtém os arquivos sob demanda com cache
        if (p.is_direct_commit && rawFiles.length === 0 && p.commit_hash) {
          if (this.commitFilesCache.has(p.commit_hash)) {
            rawFiles = this.commitFilesCache.get(p.commit_hash)!;
          } else {
            try {
              const numStatRes = await executeGit(
                [
                  "show",
                  "--numstat",
                  "--pretty=",
                  assertCommitish(p.commit_hash),
                ],
                repoDir,
              );
              if (numStatRes.success && numStatRes.stdout) {
                rawFiles = numStatRes.stdout
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    const parts = line.split("\t");
                    if (parts.length >= 3) {
                      const additions = parseInt(parts[0], 10) || 0;
                      const deletions = parseInt(parts[1], 10) || 0;
                      const filePath = parts[2];
                      return {
                        path: filePath,
                        type:
                          additions > 0 && deletions === 0
                            ? "ADDED"
                            : deletions > 0 && additions === 0
                              ? "DELETED"
                              : "MODIFIED",
                        additions,
                        deletions,
                        is_encrypted: false,
                      };
                    }
                    return null;
                  })
                  .filter(Boolean);
                this.commitFilesCache.set(p.commit_hash, rawFiles);
              }
            } catch {}
          }
        }

        const totalFilesCount = rawFiles.length;
        // Limita a 50 arquivos na listagem resumida para evitar travar a CPU e a rede com commits gigantes (ex: commit inicial de 3.500 arquivos)
        const filesToProcess = rawFiles.slice(0, 50);

        const sanitizedFiles = await Promise.all(
          filesToProcess.map(async (f: any) => {
            const rawPath = f.path || "";
            const branchOrCommit =
              p.head_sha || p.commit_hash || p.branch || "HEAD";
            const clearance = await prSecurityService.resolveDocClearance(
              repoName,
              login,
              rawPath,
              branchOrCommit,
            );

            if (!clearance.allowed) {
              return {
                path: prSecurityService.maskPath(rawPath),
                original_path_masked: true,
                type: f.type || "MODIFIED",
                additions: 0,
                deletions: 0,
                restricted: true,
                is_encrypted: false,
              };
            }

            return {
              path: rawPath,
              type: f.type || "MODIFIED",
              additions: f.additions || 0,
              deletions: f.deletions || 0,
              restricted: false,
              is_encrypted: false,
            };
          }),
        );

        return {
          ...p,
          files: sanitizedFiles,
          total_files_count: totalFilesCount,
          has_more_files: totalFilesCount > 50,
          min_approvals: p.min_approvals || govRules.min_approvals,
          is_solo_mode: govRules.is_solo,
        };
      }),
    );

    return {
      repo: activeRepo,
      repo_name: repoName,
      prs: sanitizedPageItems,
      count: sanitizedPageItems.length,
      total,
      page,
      limit,
      total_pages: totalPages,
      counts: {
        all: countAll,
        open: countOpen,
        merged: countMerged,
        closed: countClosed,
      },
      repoOpenCounts,
      governance: {
        min_approvals: govRules.min_approvals,
        is_solo_mode: govRules.is_solo,
        anti_self_approval: govRules.anti_self_approval,
        reviewers: cfg.governance?.reviewers || [],
      },
    };
  }

  async getPRFileDiff(
    repoName: string,
    filePath: string,
    commitHash?: string,
    prId?: string | number,
    userLogin?: string,
  ) {
    const cfg = loadConfig();
    const login = userLogin || cfg.user?.login || "local_user";

    let pr: any = null;
    let effectiveRepo = repoName || cfg.active_repo?.name || "local";
    if (prId) {
      const foundData = prsStorageService.findPRAcrossRepos(prId, repoName);
      if (foundData) {
        pr = foundData.pr;
        effectiveRepo = foundData.repoName;
      }
    }

    const branchOrHead = commitHash || pr?.head_sha || pr?.branch || "HEAD";
    const clearance = await prSecurityService.resolveDocClearance(
      effectiveRepo,
      login,
      filePath,
      branchOrHead,
    );

    if (!clearance.allowed) {
      return {
        restricted: true,
        diff: "",
        old_content: "",
        new_content: "",
        error: "DOCUMENTO_RESTRITO",
        message:
          "Você não possui permissão de segurança para visualizar as alterações deste documento.",
      };
    }

    let oldContent = "";
    let newContent = "";

    if (pr) {
      const baseRef = pr.base_sha || pr.target_branch || "main";
      const headRef = pr.head_sha || pr.branch || branchOrHead;
      oldContent = await prSecurityService
        .readPlainAtRef(effectiveRepo, baseRef, filePath, login)
        .catch(() => "");
      newContent = await prSecurityService
        .readPlainAtRef(effectiveRepo, headRef, filePath, login)
        .catch(() => "");
    } else if (commitHash) {
      newContent = await prSecurityService
        .readPlainAtRef(effectiveRepo, commitHash, filePath, login)
        .catch(() => "");
      oldContent = await prSecurityService
        .readPlainAtRef(effectiveRepo, `${commitHash}~1`, filePath, login)
        .catch(() => "");
    }

    const diffData = computeDiff(oldContent, newContent, filePath);

    return {
      restricted: false,
      diff: diffData.diff_text || "",
      old_content: oldContent,
      new_content: newContent,
      additions: diffData.additions,
      deletions: diffData.deletions,
    };
  }

  async getPRFileContent(
    repoName: string,
    prId: number | string,
    filePath: string,
    userLogin?: string,
  ) {
    const cfg = loadConfig();
    const login = userLogin || cfg.user?.login || "local_user";
    const foundData = prsStorageService.findPRAcrossRepos(prId, repoName);

    if (!foundData) {
      throw new Error(`PR #${prId} não encontrado.`);
    }

    const { pr, repoName: effectiveRepo } = foundData;

    const clearance = await prSecurityService.resolveDocClearance(
      effectiveRepo,
      login,
      filePath,
      pr.branch,
    );
    if (!clearance.allowed) {
      throw new Error(
        `Acesso negado: Você não possui autorização para abrir o documento confidencial '${filePath}'.`,
      );
    }

    const content = await prSecurityService.readPlainAtRef(
      effectiveRepo,
      pr.branch,
      filePath,
      login,
    );

    return {
      pr_id: pr.id,
      branch: pr.branch,
      head_sha: pr.head_sha || "",
      filePath,
      content,
    };
  }
}

export const prsQueryService = new PRsQueryService();
