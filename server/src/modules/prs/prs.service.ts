import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig, clearWorkspaceChanges } from "../../config/storage.js";
import {
  callGitHubAPI,
  ensureGitRepo,
  commitChanges,
  createAndCheckoutBranch,
  executeGit,
  getActiveBearerToken,
  getGitDiff,
  getGitLog,
  getGitStatus,
  rollbackToCommit,
} from "../../utils/git.js";
import {
  assertBranchName,
  assertCommitish,
  assertGitPath,
} from "../../utils/git-validate.js";
import { computeDiff } from "../../utils/diff.js";
import {
  isPathHidden,
  loadHiddenFiles,
  isSystemPath,
} from "../../utils/hidden-files.js";
import { writeJsonAtomic } from "../../utils/atomic-write.js";
import { aiService } from "../ai/ai.service.js";
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
import { recordAuditEvent } from "../audit/audit-chain.service.js";
import { notificationService } from "../notifications/notification.service.js";

export interface PRApprovalAudit {
  user: string;
  role?: string;
  timestamp: string;
  commit_hash?: string;
  status: "APPROVED" | "INVALIDATED" | "CHANGES_REQUESTED";
  comment?: string;
  invalidated_at?: string;
  invalidated_by_commit?: string;
}

export class PRsService {
  private lastGitHubSyncTime: Record<string, number> = {};
  private commitFilesCache = new Map<string, any[]>();

  private getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const matchedRepo = cfg.repos?.find((r: any) => r.name === activeRepoName);
    const effectiveOwner =
      cfg.active_repo?.name === activeRepoName
        ? cfg.active_repo?.owner
        : matchedRepo?.owner;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  private getGovernanceRules(repoName: string): {
    min_approvals: number;
    is_solo: boolean;
    anti_self_approval: boolean;
  } {
    const repoDir = this.getRepoDir(repoName);
    const projectConfigPath = path.join(repoDir, ".project.config.json");
    let minApprovals = 1;
    let isSolo = true;
    let antiSelfApproval = false;

    if (fs.existsSync(projectConfigPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(projectConfigPath, "utf-8"));
        const collabs = parsed.governance_collaborators || {};
        const memberCount = Object.keys(collabs).length;
        isSolo = memberCount <= 1;

        if (parsed.governance_rules?.min_approvals_default !== undefined) {
          const num = Number(parsed.governance_rules.min_approvals_default);
          if (!isNaN(num) && num >= 1) {
            minApprovals = num;
          }
        }
        antiSelfApproval =
          parsed.governance_rules?.anti_self_approval !== undefined
            ? parsed.governance_rules.anti_self_approval
            : !isSolo;
      } catch {}
    } else {
      const cfg = loadConfig();
      minApprovals = cfg.governance?.min_approvals || 1;
    }

    return {
      min_approvals: minApprovals,
      is_solo: isSolo,
      anti_self_approval: antiSelfApproval,
    };
  }

  getAllLocalRepos(): Array<{ name: string; owner?: string; dir: string }> {
    const results: Array<{ name: string; owner?: string; dir: string }> = [];
    const seen = new Set<string>();
    const cfg = loadConfig();

    if (cfg.active_repo?.name) {
      const name = cfg.active_repo.name;
      const owner = cfg.active_repo.owner;
      const dir = resolveRepoDir(name, owner);
      if (fs.existsSync(dir)) {
        seen.add(name.toLowerCase());
        results.push({ name, owner, dir });
      }
    }

    if (Array.isArray(cfg.repos)) {
      for (const r of cfg.repos) {
        if (r.name && !seen.has(r.name.toLowerCase())) {
          const dir = resolveRepoDir(r.name, r.owner);
          if (fs.existsSync(dir)) {
            seen.add(r.name.toLowerCase());
            results.push({ name: r.name, owner: r.owner, dir });
          }
        }
      }
    }

    if (fs.existsSync(PROJECTS_DIR)) {
      try {
        const topEntries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
        for (const entry of topEntries) {
          if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
          const ownerDir = path.join(PROJECTS_DIR, entry.name);
          const subEntries = fs.readdirSync(ownerDir, { withFileTypes: true });
          for (const sub of subEntries) {
            if (!sub.isDirectory() || sub.name.startsWith(".")) continue;
            const repoDir = path.join(ownerDir, sub.name);
            const isRepo =
              fs.existsSync(path.join(repoDir, ".git")) ||
              fs.existsSync(path.join(repoDir, ".spec-memory")) ||
              fs.existsSync(path.join(repoDir, ".project.config.json"));
            if (isRepo) {
              const repoName = sub.name;
              if (!seen.has(repoName.toLowerCase())) {
                seen.add(repoName.toLowerCase());
                results.push({ name: repoName, owner: entry.name, dir: repoDir });
              }
            }
          }
          const isOwnerRepo =
            fs.existsSync(path.join(ownerDir, ".git")) ||
            fs.existsSync(path.join(ownerDir, ".spec-memory")) ||
            fs.existsSync(path.join(ownerDir, ".project.config.json"));
          if (isOwnerRepo) {
            const repoName = entry.name;
            if (!seen.has(repoName.toLowerCase())) {
              seen.add(repoName.toLowerCase());
              results.push({ name: repoName, owner: "local", dir: ownerDir });
            }
          }
        }
      } catch {}
    }

    return results;
  }

  findPRAcrossRepos(
    prId: number | string,
    preferredRepo?: string,
  ): { pr: any; repoName: string; prs: any[] } | null {
    if (preferredRepo && preferredRepo !== "all") {
      const prs = this.loadRepoPRs(preferredRepo);
      const pr = prs.find((p: Record<string, unknown>) => String(p.id) === String(prId));
      if (pr) return { pr, repoName: preferredRepo, prs };
    }
    const cfg = loadConfig();
    const activeName = cfg.active_repo?.name;
    if (activeName && activeName !== preferredRepo) {
      const prs = this.loadRepoPRs(activeName);
      const pr = prs.find((p: Record<string, unknown>) => String(p.id) === String(prId));
      if (pr) return { pr, repoName: activeName, prs };
    }
    const allRepos = this.getAllLocalRepos();
    for (const r of allRepos) {
      if (r.name === preferredRepo || r.name === activeName) continue;
      const candidatePRs = this.loadRepoPRs(r.name);
      const found = candidatePRs.find((p: Record<string, unknown>) => String(p.id) === String(prId));
      if (found) return { pr: found, repoName: r.name, prs: candidatePRs };
    }
    return null;
  }

  private resolveTargetRepoObj(
    repoName: string,
    cfg: any,
  ): { full_name?: string; is_local?: boolean; owner?: string; name: string } | null {
    if (!repoName || repoName === "all" || repoName === "local") return null;
    const cleanName = repoName.toLowerCase();
    if (cfg.active_repo?.name?.toLowerCase() === cleanName) {
      return cfg.active_repo;
    }
    const matched = cfg.repos?.find(
      (r: any) => r.name?.toLowerCase() === cleanName,
    );
    if (matched) return matched;

    // Detect from local directory git config or .project.config.json
    const repoDir = this.getRepoDir(repoName);
    const gitConfigPath = path.join(repoDir, ".git", "config");
    if (fs.existsSync(gitConfigPath)) {
      try {
        const gitCfg = fs.readFileSync(gitConfigPath, "utf-8");
        const match = gitCfg.match(
          /url\s*=\s*.*github\.com[/:]([^/]+)\/([^/\s.]+)/i,
        );
        if (match && match[1] && match[2]) {
          const owner = match[1];
          const repo = match[2].replace(/\.git$/, "");
          if (repo.toLowerCase() === cleanName) {
            return {
              name: repoName,
              owner,
              full_name: `${owner}/${repo}`,
              is_local: false,
            };
          }
        }
      } catch {}
    }

    const parentDir = path.basename(path.dirname(repoDir));
    if (parentDir && parentDir !== "projects" && parentDir !== "local") {
      return {
        name: repoName,
        owner: parentDir,
        full_name: `${parentDir}/${repoName}`,
        is_local: false,
      };
    }

    return null;
  }

  getRepoPRsPath(repoName: string): string {
    const repoDir = this.getRepoDir(repoName);
    return path.join(repoDir, ".spec-memory", "prs.json");
  }

  loadRepoPRs(repoName: string): any[] {
    const filePath = this.getRepoPRsPath(repoName);
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, "utf-8");
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          let modified = false;
          const cleanRepoName = repoName.toLowerCase();

          // Purga de contaminação cruzada: descarta PRs pertencentes a outro repo
          const sanitizedList = list.filter((pr: any) => {
            if (cleanRepoName !== "local") {
              if (pr.html_url) {
                const urlMatch = pr.html_url.match(/github\.com\/[^/]+\/([^/]+)\/pull\//i);
                if (urlMatch && urlMatch[1] && urlMatch[1].toLowerCase() !== cleanRepoName) {
                  modified = true;
                  return false;
                }
              }
              if (pr.repo_name && pr.repo_name.toLowerCase() !== cleanRepoName) {
                modified = true;
                return false;
              }
            }
            return true;
          });

          // Security scrub: strip any legacy plaintext from prs.json
          for (const pr of sanitizedList) {
            if (pr.repo_name !== repoName && cleanRepoName !== "local") {
              pr.repo_name = repoName;
              modified = true;
            }
            if (Array.isArray(pr.files)) {
              for (const f of pr.files) {
                if (
                  f.old_content !== undefined ||
                  f.new_content !== undefined ||
                  f.diff_text !== undefined
                ) {
                  delete f.old_content;
                  delete f.new_content;
                  delete f.diff_text;
                  modified = true;
                }
              }
            }
          }
          if (modified) {
            this.saveRepoPRs(repoName, sanitizedList);
          }
          return sanitizedList;
        }
      } catch (e) {
        console.error(`Erro ao carregar prs para ${repoName}:`, e);
      }
    }
    return [];
  }

  saveRepoPRs(repoName: string, prs: any[]): void {
    const filePath = this.getRepoPRsPath(repoName);
    try {
      writeJsonAtomic(filePath, prs, 2);
    } catch (e) {
      console.error(`Erro ao salvar prs para ${repoName}:`, e);
    }
  }

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

    const allRepos = this.getAllLocalRepos();
    const repoOpenCounts: Record<string, number> = {};

    // Coleta contagens de abertos para todos os repositórios locais
    for (const r of allRepos) {
      const rPRs = this.loadRepoPRs(r.name);
      const openCount = rPRs.filter((p: any) => {
        const s = (p.status || "").toLowerCase();
        return s === "open" || s === "in_review";
      }).length;
      repoOpenCounts[r.name] = openCount;
    }

    if (isAll) {
      // 1. Visão Central Unificada ("Todos os Repositórios")
      const combinedAll: any[] = [];
      for (const r of allRepos) {
        const rPRs = this.loadRepoPRs(r.name).map((p: any) => ({
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

      combinedAll.sort((a: any, b: any) => {
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tB - tA;
      });

      const countAll = combinedAll.length;
      const countOpen = combinedAll.filter((p: any) => {
        const s = (p.status || "").toLowerCase();
        return s === "open" || s === "in_review";
      }).length;
      const countMerged = combinedAll.filter(
        (p: any) => (p.status || "").toLowerCase() === "merged",
      ).length;
      const countClosed = combinedAll.filter(
        (p: any) => (p.status || "").toLowerCase() === "closed",
      ).length;

      const activeStatus = (paginationOptions?.status || "all").toLowerCase();
      const searchQuery = (paginationOptions?.search || "").toLowerCase().trim();

      const filteredList = combinedAll.filter((pr: any) => {
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
          const govRules = this.getGovernanceRules(itemRepo);
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

    let allPRs = this.loadRepoPRs(repoName);
    const targetRepoObj = this.resolveTargetRepoObj(repoName, cfg);

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
            this.saveRepoPRs(repoName, allPRs);
          }
        }
      } catch (ghErr) {
        console.warn("[PRsService] Aviso ao sincronizar PRs do GitHub:", ghErr);
      }
    }

    // 1. STRICT ISOLATION: Filter PRs belonging to this specific repository
    const repoPRs = allPRs.filter(
      (p: any) =>
        p.repo_name === repoName || (!p.repo_name && repoName === "local"),
    );
    const repoDir = this.getRepoDir(repoName);

    // 2. INVARIANCE CHECK: Verify if branch HEAD changed externally and invalidate approvals accordingly (in parallel)
    const openPRsWithBranch = repoPRs.filter(
      (pr: any) => pr.status === "OPEN" && pr.branch,
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
                this.afterPRHeadChanged(repoName, pr, {
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
    console.log("[DEBUG getPRs] 10. gitCommits count:", gitCommits.length);
    const existingHashes = new Set(
      repoPRs.map((p: any) => String(p.commit_hash || p.github_number || p.id)),
    );
    const existingTitles = new Set(
      repoPRs.map((p: any) => (p.title || "").trim().toLowerCase()),
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
    combinedAll.sort((a: any, b: any) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tB - tA;
    });

    // 5. Global counts for filters (before search/status pagination)
    const countAll = combinedAll.length;
    const countOpen = combinedAll.filter((p: any) => {
      const s = (p.status || "").toLowerCase();
      return s === "open" || s === "in_review";
    }).length;
    const countMerged = combinedAll.filter(
      (p: any) => (p.status || "").toLowerCase() === "merged",
    ).length;
    const countClosed = combinedAll.filter(
      (p: any) => (p.status || "").toLowerCase() === "closed",
    ).length;

    // 6. Filter by Status & Search Query
    const activeStatus = (paginationOptions?.status || "all").toLowerCase();
    const searchQuery = (paginationOptions?.search || "").toLowerCase().trim();

    const filteredList = combinedAll.filter((pr: any) => {
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

    // 7. Pagination slice
    // 7. Pagination slice (Sempre paginado para máxima performance e proteção contra travamentos)
    const page = Math.max(1, paginationOptions?.page || 1);
    const limit = Math.max(1, paginationOptions?.limit || 15);
    const total = filteredList.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const startIndex = (page - 1) * limit;
    const pageItems = filteredList.slice(startIndex, startIndex + limit);

    // 8. Carrega arquivos de commit e sanitiza permissões APENAS para os itens da página atual
    const govRules = this.getGovernanceRules(repoName);
    console.log("[DEBUG getPRs] 11. Sanitizing items count:", pageItems.length);
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
    console.log(
      "[DEBUG getPRs] 12. Complete! Sanitized:",
      sanitizedPageItems.length,
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
      const foundData = this.findPRAcrossRepos(prId, repoName);
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
    const foundData = this.findPRAcrossRepos(prId, repoName);

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

  private parseDiffInsights(diffText: string): Map<
    string,
    {
      additions: number;
      deletions: number;
      sectionsAdded: string[];
      frontmatterChanges: string[];
      hasMermaid: boolean;
      hasTables: boolean;
    }
  > {
    const result = new Map<
      string,
      {
        additions: number;
        deletions: number;
        sectionsAdded: string[];
        frontmatterChanges: string[];
        hasMermaid: boolean;
        hasTables: boolean;
      }
    >();

    if (!diffText) return result;

    const chunks = diffText.split(
      /(?=^diff --git |^--- \/dev\/null\n\+\+\+ b\/)/m,
    );

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      let filePath = "";
      const headerMatch = chunk.match(
        /^(?:diff --git a\/[^\s\n\r]+\s+b\/([^\s\n\r]+)|\+\+\+ b\/([^\s\n\r]+))/m,
      );
      if (headerMatch) {
        filePath = headerMatch[1] || headerMatch[2];
      }

      if (!filePath) continue;

      let additions = 0;
      let deletions = 0;
      const sectionsAdded: string[] = [];
      const frontmatterChanges: string[] = [];
      let hasMermaid = false;
      let hasTables = false;

      const lines = chunk.split(/\r?\n/);
      let inFrontmatter = false;

      for (const line of lines) {
        if (line.startsWith("+++") || line.startsWith("---")) continue;

        if (line.startsWith("+---") || line.startsWith("----")) {
          inFrontmatter = !inFrontmatter;
        }

        if (line.startsWith("+")) {
          additions++;
          const content = line.substring(1).trim();
          const headerMatch = content.match(/^(#{1,4})\s+([^#\n\r]+)/);
          if (headerMatch) {
            const title = headerMatch[2].trim();
            if (title && !sectionsAdded.includes(title)) {
              sectionsAdded.push(title);
            }
          }
          if (
            inFrontmatter ||
            /^(?:title|status|category|version|type):\s*/i.test(content)
          ) {
            const fmMatch = content.match(/^([a-zA-Z0-9_-]+):\s*(.+)/);
            if (fmMatch && !["title"].includes(fmMatch[1].toLowerCase())) {
              frontmatterChanges.push(`+ ${fmMatch[1]}: ${fmMatch[2].trim()}`);
            }
          }
          if (content.includes("```mermaid")) {
            hasMermaid = true;
          }
          if (content.includes("|") && content.split("|").length >= 3) {
            hasTables = true;
          }
        } else if (line.startsWith("-")) {
          deletions++;
          const content = line.substring(1).trim();
          if (inFrontmatter || /^(?:status|version|type):\s*/i.test(content)) {
            const fmMatch = content.match(/^([a-zA-Z0-9_-]+):\s*(.+)/);
            if (fmMatch) {
              frontmatterChanges.push(`- ${fmMatch[1]}: ${fmMatch[2].trim()}`);
            }
          }
        }
      }

      result.set(filePath, {
        additions,
        deletions,
        sectionsAdded: sectionsAdded.slice(0, 6),
        frontmatterChanges: frontmatterChanges.slice(0, 4),
        hasMermaid,
        hasTables,
      });
    }

    return result;
  }

  async generatePRSummary(repoNameQuery?: string) {
    const cfg = loadConfig();
    const repoName = repoNameQuery || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const hiddenList = loadHiddenFiles(repoDir);

    const wsChanges = (cfg.workspace_changes?.[repoName] || []).filter(
      (c) => !isPathHidden(c.path, hiddenList) || isSystemPath(c.path),
    );

    const gitStatus = await getGitStatus(repoDir);
    const gitFiles = [
      ...(gitStatus.files || []).filter(
        (f) => !isPathHidden(f.path, hiddenList),
      ),
      ...(gitStatus.systemFiles || []),
    ];

    const allPathsSet = new Set<string>([
      ...wsChanges.map((c) => c.path),
      ...gitFiles.map((f) => f.path),
    ]);

    const changedPaths = Array.from(allPathsSet);

    if (changedPaths.length === 0) {
      return {
        success: true,
        title: "docs: atualização de especificações",
        description: "Nenhuma alteração pendente detectada no repositório.",
        body: "Nenhuma alteração pendente detectada no repositório.",
        type: "docs",
        layer: "Geral",
        is_ai_generated: false,
      };
    }

    const fileDetails: Array<{
      path: string;
      name: string;
      title: string;
      action: string;
      module: string;
    }> = [];

    for (const p of changedPaths) {
      const fullPath = path.join(repoDir, p);
      let docTitle = path.basename(p, path.extname(p));
      let action = "Modificado";

      const gitItem = gitFiles.find((f) => f.path === p);
      const wsItem = wsChanges.find((c) => c.path === p);

      if (gitItem?.status === "??" || wsItem?.type === "ADDED") {
        action = "Novo Documento";
      } else if (gitItem?.status === "D" || wsItem?.type === "DELETED") {
        action = "Removido";
      }

      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const frontmatterMatch = content.match(
            /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/,
          );
          if (frontmatterMatch) {
            const titleMatch = frontmatterMatch[1].match(
              /^title:\s*["']?([^"'\r\n]+)["']?/m,
            );
            if (titleMatch && titleMatch[1].trim()) {
              docTitle = titleMatch[1].trim();
            }
          }
          if (docTitle === path.basename(p, path.extname(p))) {
            const h1Match = content.match(/^#\s+([^\r\n]+)/m);
            if (h1Match && h1Match[1].trim()) {
              docTitle = h1Match[1].replace(/^[📄🏛️📌✨🔧📋\s]+/, "").trim();
            }
          }
        } catch {}
      }

      const parts = p.split("/");
      const moduleName = parts.length > 1 ? parts[0] : "raiz";

      fileDetails.push({
        path: p,
        name: path.basename(p),
        title: docTitle,
        action,
        module: moduleName,
      });
    }

    // Extrair diff do Git e analisar alterações estruturais
    let diffText = "";
    try {
      const gitDiffRes = await getGitDiff(repoDir);
      diffText = gitDiffRes?.diff || "";
    } catch (diffErr) {
      console.warn("[PRsService] Erro ao extrair git diff:", diffErr);
    }
    const diffInsights = this.parseDiffInsights(diffText);

    // Verificar se existe modelo de IA configurado
    const aiSettings = cfg.ai_settings || {
      provider: "gemini",
      model: "gemini-2.5-flash",
      api_key: "",
      custom_endpoint: "",
    };

    const hasApiKey = Boolean(
      (aiSettings.api_key && aiSettings.api_key.trim().length > 0) ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY,
    );
    const isLocalProvider =
      aiSettings.provider === "local" || aiSettings.provider === "ollama";
    const isAIConfigured = hasApiKey || isLocalProvider;

    // Se houver IA configurada, tentar gerar resumo semântico profundo
    if (isAIConfigured) {
      try {
        const fileSummaries = fileDetails
          .map((f) => {
            const insight = diffInsights.get(f.path);
            const addStr = insight ? `+${insight.additions}` : "";
            const delStr = insight ? `-${insight.deletions}` : "";
            return `- ${f.path} (${f.action}, módulo: ${f.module}${addStr ? `, ${addStr} ${delStr}` : ""}): "${f.title}"`;
          })
          .join("\n");

        // Truncar diff com segurança para não estourar a janela de contexto de tokens (limite de 14.000 caracteres)
        const safeDiff =
          diffText.length > 14000
            ? `${diffText.substring(0, 14000)}\n\n... [diff truncado para respeitar limites de tokens] ...`
            : diffText;

        const systemPrompt = `Você é um Arquiteto de Software e Especialista em Governança de Código e Documentação.
Sua missão é analisar as alterações e o diff do Git fornecidos e gerar um resumo conciso, profissional e de alto valor técnico para o Pull Request / Proposta de Versão.

DIRETRIZES OBRIGATÓRIAS:
1. TÍTULO: Deve seguir rigorosamente a convenção Conventional Commits em português:
   - Formato: <tipo>(<escopo>): <descrição objetiva em minúsculas>
   - Tipos válidos: feat, fix, docs, refactor, chore, test, style.
   - Exemplo: "feat(auth): adiciona fluxo de autenticação mfa e termos de uso" ou "docs(arquitetura): atualiza diagramas e endpoints da api"
   - Seja conciso e direto no título (máximo 75 caracteres).
2. DESCRIÇÃO: Deve ser formatada em Markdown profissional estruturada da seguinte forma:
   ## 📋 Visão Geral
   2 a 3 frases explicando com clareza o objetivo principal das alterações e o benefício funcional para o repositório.

   ### 🔍 Principais Mudanças
   Tópicos objetivos explicando o que realmente mudou em cada documento/módulo com contexto semântico e técnico (não liste apenas os arquivos, explique as alterações funcionais).

   ### 🏛️ Impacto e Governança
   Itens que demandam atenção dos revisores (seções novas, status de governança alterados, novas regras ou quebras de compatibilidade).

3. FORMATO DE SAÍDA: Retorne ESTRITAMENTE um JSON válido com os campos "title" e "description", sem blocos de código envolventes. Exemplo:
{"title": "docs(modulo): resumo objetivo", "description": "## 📋 Visão Geral\\n\\n..."}`;

        const userPrompt =
          `Analise os seguintes arquivos alterados e o diff do repositório "${repoName}":\n\n` +
          `### Arquivos Alterados:\n${fileSummaries}\n\n` +
          `### Git Diff:\n\`\`\`diff\n${safeDiff || "Diff indisponível, considere os arquivos alterados."}\n\`\`\``;

        const aiRes = await aiService.callLLM(
          aiSettings,
          userPrompt,
          "",
          "pr-summary.md",
          [],
          systemPrompt,
          repoName,
        );

        let parsedTitle = "";
        let parsedDescription = "";

        if (aiRes && aiRes.reply) {
          const raw = aiRes.reply.trim();
          const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [
            null,
            raw,
          ];
          try {
            const data = JSON.parse(jsonMatch[1] || raw);
            if (data.title) parsedTitle = String(data.title).trim();
            if (data.description)
              parsedDescription = String(data.description).trim();
          } catch {
            const lines = raw.split("\n");
            const titleLine = lines.find((l) =>
              /^(?:título|title):\s*/i.test(l),
            );
            if (titleLine) {
              parsedTitle = titleLine
                .replace(/^(?:título|title):\s*/i, "")
                .replace(/[*"`]/g, "")
                .trim();
            }
            parsedDescription = raw;
          }
        }

        if (parsedTitle && parsedDescription) {
          return {
            success: true,
            title: parsedTitle,
            description: parsedDescription,
            body: parsedDescription,
            type: "docs",
            layer: "Especificações",
            is_ai_generated: true,
          };
        }
      } catch (err: any) {
        console.warn(
          `[PRsService] Falha na geração com IA (${err.message}), utilizando fallback estruturado de diff.`,
        );
      }
    }

    // Fallback Estruturado por Diff (Abordagem B: Determinística e sem dependência de chaves de IA)
    const allNew = fileDetails.every((f) => f.action === "Novo Documento");
    const allDeleted = fileDetails.every((f) => f.action === "Removido");
    const commitPrefix = allNew ? "feat" : allDeleted ? "refactor" : "docs";

    const uniqueModules = Array.from(
      new Set(fileDetails.map((f) => f.module).filter((m) => m !== "raiz")),
    );
    const moduleScope =
      uniqueModules.length === 1
        ? `(${uniqueModules[0]})`
        : uniqueModules.length > 1
          ? `(${uniqueModules.slice(0, 2).join("-")})`
          : "";

    const titleAction = allNew
      ? "adicionar"
      : allDeleted
        ? "remover"
        : "atualizar";
    const namesList = fileDetails
      .slice(0, 3)
      .map((f) => f.name.replace(/\.md$/i, ""))
      .join(", ");
    const autoTitle = `${commitPrefix}${moduleScope}: ${titleAction} especificações de ${namesList}${fileDetails.length > 3 ? ` e mais ${fileDetails.length - 3} arquivo(s)` : ""}`;

    let totalAdditions = 0;
    let totalDeletions = 0;
    diffInsights.forEach((ins) => {
      totalAdditions += ins.additions;
      totalDeletions += ins.deletions;
    });

    const structuralHighlights: string[] = [];
    for (const f of fileDetails) {
      const ins = diffInsights.get(f.path);
      const points: string[] = [];
      if (ins) {
        if (ins.sectionsAdded.length > 0) {
          points.push(
            `seções: ${ins.sectionsAdded.map((s) => `\`${s}\``).join(", ")}`,
          );
        }
        if (ins.frontmatterChanges.length > 0) {
          points.push(
            `metadados alterados (${ins.frontmatterChanges.join(", ")})`,
          );
        }
        if (ins.hasMermaid) {
          points.push(`diagrama visual Mermaid`);
        }
        if (ins.hasTables) {
          points.push(`tabelas de dados`);
        }
      }
      const detailsStr = points.length > 0 ? ` — *${points.join("; ")}*` : "";
      const linesStr =
        ins && (ins.additions > 0 || ins.deletions > 0)
          ? ` (\`+${ins.additions}\` / \`-${ins.deletions}\` linhas)`
          : "";
      structuralHighlights.push(
        `- **\`${f.path}\`** (${f.action})${linesStr}${detailsStr}`,
      );
    }

    const autoDescription =
      `> 💡 **Nota:** Resumo gerado via análise estruturada de alterações (Git Diff). Configure uma chave de IA (Gemini, OpenAI, Claude ou Ollama) nas Configurações para obter resumos semânticos contextuais avançados.\n\n` +
      `## 📋 Visão Geral da Proposta\n\n` +
      `Esta proposta de evolução reúne alterações em **${fileDetails.length} documento(s)** no repositório \`${repoName}\`${totalAdditions > 0 || totalDeletions > 0 ? ` com total de \`+${totalAdditions}\` adições e \`-${totalDeletions}\` deleções` : ""}.\n\n` +
      `### 🔍 Alterações Estruturais Identificadas:\n\n` +
      (structuralHighlights.length > 0
        ? structuralHighlights.join("\n")
        : "- Nenhuma alteração estrutural específica detectada.") +
      `\n\n### 📂 Documentos Impactados:\n\n` +
      `| Documento | Módulo / Domínio | Ação | Título Canônico |\n` +
      `| :--- | :--- | :--- | :--- |\n` +
      fileDetails
        .map(
          (f) =>
            `| \`${f.path}\` | \`${f.module}\` | **${f.action}** | ${f.title} |`,
        )
        .join("\n") +
      `\n\n### 🎯 Objetivos de Governança:\n` +
      `- Manter a documentação viva e canônica sincronizada com a arquitetura.\n` +
      `- Rastrear as evoluções através do fluxo formal de revisão e Pull Request.\n\n` +
      `*Gerado automaticamente pelo motor de governança do Context OS.*`;

    return {
      success: true,
      title: autoTitle,
      description: autoDescription,
      body: autoDescription,
      type: "docs",
      layer: "Especificações",
      is_ai_generated: false,
    };
  }

  async checkConflictingProposals(
    repoNameParam?: string,
    filesToCheck?: string[],
  ) {
    const cfg = loadConfig();
    const repoName = repoNameParam || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const prs = this.loadRepoPRs(repoName);
    const openPRs = prs.filter((p: any) => p.status === "OPEN" || !p.status);

    if (openPRs.length === 0) {
      return { hasConflicts: false, conflicts: [] };
    }

    let targetFiles = filesToCheck || [];
    if (targetFiles.length === 0) {
      const gitStatus = await getGitStatus(repoDir);
      targetFiles = (gitStatus.files || []).map((f) => f.path);
    }

    const conflicts: Array<{
      id: number | string;
      title: string;
      branch: string;
      author?: string;
      matchingFiles: string[];
    }> = [];

    for (const pr of openPRs) {
      let prFiles: string[] = [];
      try {
        const diffRes = await executeGit(
          [
            "diff",
            "--name-only",
            `${pr.base_sha || "main"}...${pr.head_sha || pr.branch}`,
          ],
          repoDir,
        );
        if (diffRes.success && diffRes.stdout) {
          prFiles = diffRes.stdout.trim().split("\n").filter(Boolean);
        }
      } catch {}

      const matching = targetFiles.filter((tf) => prFiles.includes(tf));
      if (matching.length > 0) {
        conflicts.push({
          id: pr.id,
          title: pr.title,
          branch: pr.branch,
          author: pr.author?.login || pr.author?.name || "Autor",
          matchingFiles: matching,
        });
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflicts,
    };
  }

  async createPR(payload: {
    title: string;
    description: string;
    branch?: string;
    type?: string;
    layer?: string;
    domain?: string;
    repo?: string;
    targetProposalId?: number | string;
  }) {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const repoName = payload.repo || activeRepo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const hiddenList = loadHiddenFiles(repoDir);
    const gitStatus = await getGitStatus(repoDir);
    const gitFiles = [
      ...(gitStatus.files || []).filter(
        (f) => !isPathHidden(f.path, hiddenList),
      ),
      ...(gitStatus.systemFiles || []),
    ];
    const rawChanges = (cfg.workspace_changes?.[repoName] || []).filter(
      (c) => !isPathHidden(c.path, hiddenList) || isSystemPath(c.path),
    );

    const allChangedPaths = Array.from(
      new Set([
        ...rawChanges.map((c) => c.path),
        ...gitFiles.map((f) => f.path),
      ]),
    ).filter((p) => !p.includes(".spec-memory") && !p.includes(".git"));

    if (allChangedPaths.length === 0) {
      throw new Error("Não há alterações pendentes para criar um PR.");
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

    const defaultBranch = activeRepo?.default_branch || "main";
    const baseHashRes = await executeGit(
      ["rev-parse", assertBranchName(defaultBranch)],
      repoDir,
    );
    const baseSha = baseHashRes.success
      ? (baseHashRes.stdout || "").trim()
      : "";

    const repoPRs = this.loadRepoPRs(repoName);
    const now = new Date().toISOString();

    // Se o usuário optar por anexar à proposta aberta existente
    if (payload.targetProposalId) {
      const existingPR = repoPRs.find(
        (p: any) => String(p.id) === String(payload.targetProposalId),
      );
      if (!existingPR) {
        throw new Error(
          `Proposta #${payload.targetProposalId} não foi encontrada.`,
        );
      }
      if (existingPR.status === "MERGED" || existingPR.status === "CLOSED") {
        throw new Error(
          `A Proposta #${payload.targetProposalId} já está finalizada ou encerrada.`,
        );
      }

      const activeToken = getActiveBearerToken(cfg.token);
      await healRepositoryState(repoDir, { token: activeToken });
      await createAndCheckoutBranch(repoDir, existingPR.branch);

      const commitMsg =
        payload.title || `Atualizações na Proposta #${existingPR.id}`;
      await commitChanges(repoDir, commitMsg, allChangedPaths);

      const headHashRes = await executeGit(["rev-parse", "HEAD"], repoDir);
      const headSha = headHashRes.success
        ? (headHashRes.stdout || "").trim()
        : "";

      if (
        cfg.authenticated &&
        activeToken &&
        activeRepo?.full_name &&
        !activeRepo?.is_local
      ) {
        try {
          await executeGit(
            ["push", "origin", assertBranchName(existingPR.branch)],
            repoDir,
          );
        } catch (pushErr: any) {
          console.warn(
            "[PRsService] Falha ao sincronizar branch da proposta remota:",
            pushErr,
          );
        }
      }

      existingPR.updated_at = now;
      existingPR.head_sha = headSha;
      this.saveRepoPRs(repoName, repoPRs);
      workspaceService.invalidateTreeCache(repoName);
      try {
        clearWorkspaceChanges(repoName);
      } catch {}

      return {
        ...existingPR,
        message: `Alterações anexadas com sucesso à Proposta #${existingPR.id}!`,
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

    const branchName =
      payload.branch || `prop-${newId}-${cleanSlug}`;

    // 1. Create and checkout new Git branch
    let headSha = "";
    let githubPRData: any = null;
    let prHtmlUrl = activeRepo?.html_url
      ? `${activeRepo.html_url}/pull/${newId}`
      : "";

    try {
      const activeToken = getActiveBearerToken(cfg.token);
      await healRepositoryState(repoDir, { token: activeToken });
      await createAndCheckoutBranch(repoDir, branchName);

      // 2. Commit changes to Git branch - estritamente os arquivos alterados pelo usuário
      const commitMsg = payload.title || `Atualização de Governança #${newId}`;
      await commitChanges(repoDir, commitMsg, allChangedPaths);

      const headHashRes = await executeGit(["rev-parse", "HEAD"], repoDir);
      headSha = headHashRes.success ? (headHashRes.stdout || "").trim() : "";

      // 3. GitHub Remote PR (if authenticated and remote repo)
      if (
        cfg.authenticated &&
        activeToken &&
        activeRepo?.full_name &&
        !activeRepo?.is_local
      ) {
        try {
          const pushRes = await executeGit(
            ["push", "-u", "origin", assertBranchName(branchName)],
            repoDir,
            activeToken,
          );
          if (pushRes.success) {
            const ghRes = await callGitHubAPI(
              `/repos/${activeRepo.full_name}/pulls`,
              activeToken,
              "POST",
              {
                title: payload.title,
                body:
                  payload.description || `Atualização de governança Context OS`,
                head: branchName,
                base: defaultBranch,
              },
            );

            if (ghRes.statusCode === 201 && ghRes.data) {
              githubPRData = ghRes.data;
              prHtmlUrl = ghRes.data.html_url || prHtmlUrl;
            } else {
              console.warn(
                "[PRsService] GitHub PR retornou status:",
                ghRes.statusCode,
                ghRes.data,
              );
            }
          } else {
            console.warn(
              "[PRsService] git push remoto não teve sucesso:",
              pushRes.stderr,
            );
          }
        } catch (err) {
          console.warn("[PRsService] Aviso ao abrir PR no Git remoto:", err);
        }
      }
    } finally {
      // Switch back to default branch so local environment is clean even if an error occurs
      await executeGit(
        ["checkout", assertBranchName(defaultBranch)],
        repoDir,
      ).catch(() => {});
    }

    // Detailed changes: ONLY store metadata in JSON, NEVER plain content
    const detailedChanges = allChangedPaths.map((p) => {
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

    const newPR: any = {
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
      files: detailedChanges,
      html_url: prHtmlUrl,
    };

    repoPRs.unshift(newPR);
    this.saveRepoPRs(repoName, repoPRs);
    clearWorkspaceChanges(repoName);

    // Disparo assíncrono de notificação para solicitação de quorum
    setImmediate(() => {
      notificationService.dispatch({
        event: "quorum_requested",
        repo: repoName,
        title: `Novo Pull Request aberto: ${newPR.title}`,
        message: `O PR #${newPR.id} foi aberto por ${newPR.author} e requer revisão e assinaturas para atingir o quorum de governança.`,
        prNumber: newPR.id,
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
      message: `Pull Request #${newPR.id} criado com sucesso na branch '${branchName}'!`,
    };
  }

  afterPRHeadChanged(
    repoName: string,
    pr: any,
    ctx: { actor: string; file?: string; newHead?: string },
  ): void {
    const newHead = ctx.newHead || pr.head_sha || "";
    const prevApprovals = Array.isArray(pr.approvals) ? pr.approvals : [];

    // Invalidate prior approvals
    pr.approvals = prevApprovals.map((app: any) => {
      if (typeof app === "string") {
        return {
          user: app,
          status: "INVALIDATED",
          timestamp: new Date().toISOString(),
          invalidated_at: new Date().toISOString(),
          invalidated_by_commit: newHead,
          comment: `Aprovação invalidada devido a novas edições no PR por ${ctx.actor}.`,
        };
      }
      if (app.status === "APPROVED" || !app.status) {
        return {
          ...app,
          status: "INVALIDATED",
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

    const prs = this.loadRepoPRs(repoName);
    const idx = prs.findIndex((p: any) => String(p.id) === String(pr.id));
    if (idx >= 0) {
      prs[idx] = { ...prs[idx], ...pr };
      this.saveRepoPRs(repoName, prs);
    }

    governanceService.logAudit(repoName, {
      action: "PR_EDITED",
      actor: ctx.actor,
      target: `PR #${pr.id} (${pr.branch})`,
      details: `Alterações em '${ctx.file || "branch"}' geraram o commit ${newHead.slice(0, 7)}. Aprovações anteriores invalidadas para reavaliação.`,
    });
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
      typeof payloadOrApprover === "object" &&
      (payloadOrApprover as any).repo;
    const foundData = this.findPRAcrossRepos(prId, passedRepo);
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

    const repoDir = this.getRepoDir(repoName);
    const govRules = this.getGovernanceRules(repoName);
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

    const existingIdx = target.approvals.findIndex((app: any) => {
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
      : validCount >= minApprovals;

    target.status = "OPEN";

    // Synchronize review officially with GitHub API if authenticated
    const activeRepo = cfg.active_repo;
    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      target.github_number
    ) {
      try {
        await callGitHubAPI(
          `/repos/${activeRepo.full_name}/pulls/${target.github_number}/reviews`,
          cfg.token,
          "POST",
          {
            event: "APPROVE",
            body:
              approverComment ||
              `✓ Aprovado via Context OS Governance Platform por ${approver} (${approverRole || "Revisor"})`,
          },
        );
      } catch (ghReviewErr) {
        console.warn(
          "[PRsService] Aviso ao sincronizar review no GitHub:",
          ghReviewErr,
        );
      }
    }

    this.saveRepoPRs(repoName, prs);

    try {
      await recordAuditEvent(repoName, {
        eventType: "PR_APPROVED",
        user: approver,
        payload: {
          prId: target.id,
          title: target.title,
          headSha: target.head_sha,
          quorumReached,
        },
      });
    } catch (auditErr) {
      console.warn("[PRsService] Falha ao registrar evento de auditoria de aprovação:", auditErr);
    }

    if (quorumReached) {
      setImmediate(() => {
        notificationService.dispatch({
          event: "quorum_approved",
          repo: repoName,
          title: `Quorum de Governança Atingido: ${target.title}`,
          message: `O PR #${target.id} atingiu o quorum mínimo de aprovações (${validCount}/${govRules.is_solo ? 1 : minApprovals}) com o voto de @${approver}. O merge foi liberado!`,
          prNumber: target.id,
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
      commitMessage?: string;
      author?: string;
      repo?: string;
    },
    userLogin?: string,
  ) {
    const cfg = loadConfig();
    const repoName = payload.repo || cfg.active_repo?.name || "local";
    const login = userLogin || payload.author || cfg.user?.login || "local_user";
    const prs = this.loadRepoPRs(repoName);
    const target = prs.find((p: any) => String(p.id) === String(payload.id));

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
    const repoDir = this.getRepoDir(repoName);
    const headRes = await executeGit(
      ["-C", wtDir, "rev-parse", "HEAD"],
      repoDir,
    );
    const currentHeadSha = (headRes.stdout || "").trim();

    // 3. Optimistic concurrency & 3-way merge check
    let finalPlainContent = payload.content;
    if (payload.base_sha && payload.base_sha !== currentHeadSha) {
      const baseText = await prSecurityService
        .readPlainAtRef(repoName, payload.base_sha, payload.filePath, login)
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
          base: baseText,
          ours: payload.content,
          theirs: theirsText,
          merged: mergeResult.mergedContent,
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
        .map((v: any) => `${v.file}: ${v.message}`)
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
        (f: any) => f.path === payload.filePath,
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
    const prevApprovalsCount = (target.approvals || []).filter((a: any) =>
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
    const foundData = this.findPRAcrossRepos(prId, repoNameParam);
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

    const govRules = this.getGovernanceRules(repoName);
    const minApprovals = target.min_approvals || govRules.min_approvals || 1;

    // Strict Quorum validation: ONLY count APPROVED votes matching current HEAD commit
    const authorHandle = (target.author || "").trim();
    const cleanAuthor = authorHandle.replace(/^@/, "").toLowerCase();

    const approvalsList = Array.isArray(target.approvals)
      ? target.approvals
      : [];
    const validApprovers = new Set<string>();
    for (const app of approvalsList) {
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

    if (!govRules.is_solo && validApprovers.size < minApprovals) {
      throw new Error(
        `Quórum de aprovação não atingido na versão atual do PR (${validApprovers.size}/${minApprovals}). Revalide as aprovações após as edições recentes.`,
      );
    }

    // Mergeability check: abort if conflicts exist with target branch
    const mergeCheck = await prConflictsService.getMergeability(
      repoName,
      target,
    );
    if (!mergeCheck.mergeable) {
      throw new Error(
        `Existem conflitos impeditivos entre a branch '${target.branch}' e '${target.target_branch || "main"}'. Conflitos em: ${mergeCheck.conflicts.map((c) => c.path).join(", ")}.`,
      );
    }

    await this.executeMerge(target, repoName);
    await prWorktreeService.removePRWorktree(repoName, target.id);

    target.status = "MERGED";
    target.merged_at = new Date().toISOString();
    this.saveRepoPRs(repoName, prs);

    try {
      await recordAuditEvent(repoName, {
        eventType: "PR_MERGED",
        user: cfg.user?.login || "maintainer",
        payload: {
          prId: target.id,
          title: target.title,
          targetBranch: target.target_branch || "main",
          headSha: target.head_sha,
        },
      });
    } catch (auditErr) {
      console.warn("[PRsService] Falha ao registrar evento de auditoria de merge:", auditErr);
    }

    return {
      success: true,
      pr: target,
      message: `PR #${prId} aprovado com quórum (${validApprovers.size}/${minApprovals}) e integrado com sucesso na versão oficial!`,
    };
  }

  async rejectPR(
    prId: number | string,
    reason?: string,
    repoNameParam?: string,
  ) {
    const cfg = loadConfig();
    const foundData = this.findPRAcrossRepos(prId, repoNameParam);
    if (!foundData) {
      throw new Error(`PR #${prId} não encontrado.`);
    }
    const { pr: target, repoName } = foundData;
    let prs = foundData.prs;

    target.status = "CLOSED";
    target.closed_at = new Date().toISOString();
    target.rejection_reason = reason || "Proposta rejeitada pelo revisor.";

    await prWorktreeService.removePRWorktree(repoName, target.id);

    if (
      cfg.authenticated &&
      cfg.token &&
      cfg.active_repo?.full_name &&
      target.github_number
    ) {
      try {
        await callGitHubAPI(
          `/repos/${cfg.active_repo.full_name}/pulls/${target.github_number}`,
          cfg.token,
          "PATCH",
          { state: "closed" },
        );
      } catch (err) {
        console.warn(`[PRsService] Aviso ao fechar PR no GitHub:`, err);
      }
    }

    this.saveRepoPRs(repoName, prs);

    try {
      await recordAuditEvent(repoName, {
        eventType: "PR_CLOSED",
        user: cfg.user?.login || "reviewer",
        payload: {
          prId: target.id,
          title: target.title,
          reason: target.rejection_reason,
        },
      });
    } catch (auditErr) {
      console.warn("[PRsService] Falha ao registrar evento de auditoria de fechamento:", auditErr);
    }

    return {
      success: true,
      pr: target,
      message: `PR #${prId} foi rejeitado e arquivado.`,
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
      const foundData = this.findPRAcrossRepos(payload.id, payload.repo);
      if (foundData) {
        repoName = foundData.repoName;
        targetHash = foundData.pr.commit_hash || String(foundData.pr.id);
        targetTitle = foundData.pr.title || "";
      } else if (!targetHash) {
        targetHash = String(payload.id);
      }
    }

    const repoDir = this.getRepoDir(repoName);

    if (!targetHash) {
      throw new Error(
        "Identificador da versão ou código da revisão não informado.",
      );
    }

    const result = await rollbackToCommit(repoDir, targetHash, targetTitle);
    if (!result.success) {
      throw new Error(result.message);
    }

    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      !activeRepo?.is_local &&
      activeRepo?.name === repoName
    ) {
      try {
        await executeGit(["push", "origin", "main"], repoDir);
      } catch (pushErr) {
        console.warn(
          "[PRsService] Aviso ao sincronizar rollback com o GitHub remoto:",
          pushErr,
        );
      }
    }

    try {
      await recordAuditEvent(repoName, {
        eventType: "ROLLBACK_APPLIED",
        user: cfg.user?.login || "operator",
        payload: {
          targetHash,
          targetTitle,
        },
      });
    } catch (auditErr) {
      console.warn("[PRsService] Falha ao registrar evento de auditoria de rollback:", auditErr);
    }

    clearWorkspaceChanges(repoName);

    return {
      success: true,
      message: result.message,
      new_commit_hash: result.newCommitHash,
    };
  }

  private async executeMerge(targetPR: any, repoNameParam?: string) {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const repoName =
      repoNameParam || targetPR.repo_name || activeRepo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const targetBranch = assertBranchName(targetPR.target_branch || "main");

    const approvalsList = Array.isArray(targetPR.approvals)
      ? targetPR.approvals
      : [];
    const auditLines = approvalsList
      .filter((app: any) =>
        typeof app === "object" ? app.status === "APPROVED" : true,
      )
      .map((app: any) => {
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
        ? `\n\n${auditLines.join("\n")}\nReviewed-in: Context OS Governance Platform`
        : "";
    const commitMsg = `Merge PR #${targetPR.id}: ${targetPR.title}${trailers}`;

    // 1. Limpa arquivo transitório de mudanças e executa auto-cura do repositório
    clearWorkspaceChanges(repoName);
    const activeToken = getActiveBearerToken(cfg.token);
    await healRepositoryState(repoDir, {
      token: activeToken,
      unshallowIfNeeded: true,
    });

    // 2. Se houver arquivos modificados ou untracked na working tree (ex: .docs.metadata.json ou .gitignore), guarda em stash temporário
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
      // 3. Local Git Checkout
      const checkoutRes = await executeGit(["checkout", targetBranch], repoDir);
      if (!checkoutRes.success) {
        throw new Error(
          `Falha ao alternar para branch ${targetBranch}: ${checkoutRes.stderr || checkoutRes.stdout}`,
        );
      }

      // 4. Local Git Merge
      if (targetPR.branch) {
        const prBranch = assertBranchName(targetPR.branch);
        // Se o repo for shallow, busca histórico completo para encontrar base comum de merge
        try {
          const isShallowRes = await executeGit(
            ["rev-parse", "--is-shallow-repository"],
            repoDir,
          );
          if (isShallowRes.success && isShallowRes.stdout.trim() === "true") {
            const activeToken = getActiveBearerToken(cfg.token);
            await executeGit(
              ["fetch", "--unshallow", "origin"],
              repoDir,
              activeToken || undefined,
            ).catch(() => {});
          }
        } catch {}

        let mergeRes = await executeGit(
          ["merge", prBranch, "--no-ff", "-m", commitMsg],
          repoDir,
        );

        // Se o merge falhou, checa se os conflitos são exclusivamente em arquivos internos de metadados
        if (!mergeRes.success) {
          const unmergedRes = await executeGit(
            ["diff", "--name-only", "--diff-filter=U"],
            repoDir,
          );
          if (unmergedRes.success && unmergedRes.stdout.trim().length > 0) {
            const conflictingFiles = unmergedRes.stdout
              .trim()
              .split("\n")
              .map((f) => f.trim())
              .filter(Boolean);
            const onlyInternalConflicts = conflictingFiles.every(
              (f) =>
                f.startsWith(".spec-memory/") ||
                f === ".docs.metadata.json" ||
                f === ".gitignore",
            );

            if (onlyInternalConflicts) {
              // Remove arquivos transitórios que não devem ser versionados
              await executeGit(
                [
                  "rm",
                  "-f",
                  "--ignore-unmatch",
                  ".spec-memory/workspace_changes.json",
                ],
                repoDir,
              ).catch(() => {});
              // Para arquivos de metadados internos, adota a versão do branch de destino (ours)
              for (const f of conflictingFiles) {
                if (f !== ".spec-memory/workspace_changes.json") {
                  const safeF = assertGitPath(f);
                  await executeGit(
                    ["checkout", "--ours", "--", safeF],
                    repoDir,
                  ).catch(() => {});
                  await executeGit(["add", "--", safeF], repoDir).catch(
                    () => {},
                  );
                }
              }
              // Conclui o commit de merge
              mergeRes = await executeGit(["commit", "-m", commitMsg], repoDir);
            }
          }
        }

        if (!mergeRes.success) {
          await executeGit(["merge", "--abort"], repoDir);
          throw new Error(
            `Falha no merge do Git: ${mergeRes.stderr || mergeRes.stdout}`,
          );
        }
      }

      // 5. Remote GitHub Merge (if GitHub PR)
      if (
        cfg.authenticated &&
        cfg.token &&
        activeRepo?.full_name &&
        targetPR.github_number
      ) {
        try {
          await callGitHubAPI(
            `/repos/${activeRepo.full_name}/pulls/${targetPR.github_number}/merge`,
            cfg.token,
            "PUT",
            {
              commit_title: `Merge PR #${targetPR.id}: ${targetPR.title}`,
              commit_message: auditLines.join("\n"),
              merge_method: "merge",
            },
          );
          await executeGit(["push", "origin", targetBranch], repoDir);
        } catch (ghMergeErr) {
          console.warn(
            `[PRsService] Aviso ao executar merge no GitHub remoto:`,
            ghMergeErr,
          );
        }
      }

      workspaceService.invalidateTreeCache(repoName);
      clearWorkspaceChanges(repoName);
    } finally {
      if (didStash) {
        try {
          await executeGit(["stash", "pop"], repoDir);
        } catch {}
      }
    }
  }
}

export const prsService = new PRsService();
