import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { writeJsonAtomic } from "../../utils/atomic-write.js";

export class PRsStorageService {
  getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const matchedRepo = cfg.repos?.find((r: { name?: string; owner?: string }) => r.name === activeRepoName);
    const effectiveOwner =
      cfg.active_repo?.name === activeRepoName
        ? cfg.active_repo?.owner
        : matchedRepo?.owner;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  getGovernanceRules(repoName: string): {
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

  resolveTargetRepoObj(
    repoName: string,
    cfg: any,
  ): { full_name?: string; is_local?: boolean; owner?: string; name: string } | null {
    if (!repoName || repoName === "all" || repoName === "local") return null;
    const cleanName = repoName.toLowerCase();
    if (cfg.active_repo?.name?.toLowerCase() === cleanName) {
      return cfg.active_repo;
    }
    const matched = cfg.repos?.find(
      (r: { name?: string }) => r.name?.toLowerCase() === cleanName,
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
}

export const prsStorageService = new PRsStorageService();
