import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { executeGit } from "../../utils/git.js";
import { assertCommitish, assertGitPath } from "../../utils/git-validate.js";
import { canAccessDocument } from "../../utils/crypto.js";

export interface DocClearanceResult {
  allowed: boolean;
  restricted: boolean;
  department?: string;
}

export class PRSecurityService {
  private userProfileCache = new Map<string, any>();

  private getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const effectiveOwner =
      cfg.active_repo?.name === activeRepoName
        ? cfg.active_repo?.owner
        : undefined;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  maskPath(filePath: string): string {
    if (!filePath) return "documento-restrito";
    const ext = path.extname(filePath);
    const hash = crypto
      .createHash("sha256")
      .update(filePath)
      .digest("hex")
      .slice(0, 8);
    const parts = filePath.split("/");
    const dir = parts.length > 1 ? `${parts[0]}/` : "";
    return `${dir}restrito-${hash}${ext || ".md"}`;
  }

  async resolveDocClearance(
    repoName: string,
    userLogin: string | undefined,
    relPlainPath: string,
    _branchOrCommitRef?: string,
  ): Promise<DocClearanceResult> {
    const cfg = loadConfig();
    const login = userLogin || cfg.user?.login || 'local_user';
    const cleanPath = relPlainPath.replace(/\\/g, "/").replace(/^\/+/, "");

    // Public root files are always allowed
    if (
      cleanPath === "README.md" ||
      cleanPath === "CHANGELOG.md" ||
      cleanPath.startsWith("docs/public/")
    ) {
      return { allowed: true, restricted: false };
    }

    // Read user clearance from project configuration with cache
    const cacheKey = `${repoName}:${login.toLowerCase()}`;
    let userProfile = this.userProfileCache.get(cacheKey);

    if (!userProfile) {
      const repoDir = this.getRepoDir(repoName);
      const cfgPath = path.join(repoDir, ".project.config.json");
      let profile: {
        login?: string;
        departments?: string[];
        status?: string;
        role?: string;
      } = {
        login,
        departments: ["*"],
        status: "active",
      };

      if (fs.existsSync(cfgPath)) {
        try {
          const pConfig = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
          const collabs = pConfig.governance_collaborators || {};
          const matched = Object.entries(collabs).find(
            ([k]) => k.toLowerCase() === login.toLowerCase(),
          );
          if (matched && matched[1] && typeof matched[1] === "object") {
            profile = matched[1] as typeof profile;
          }
        } catch {}
      }
      userProfile = profile;
      this.userProfileCache.set(cacheKey, userProfile);
    }

    const folderParts = cleanPath.split("/");
    const department = folderParts.length > 1 ? folderParts[0] : "default";

    const allowed = canAccessDocument(userProfile, {
      department,
      path: cleanPath,
    });

    return {
      allowed,
      restricted: !allowed,
      department,
    };
  }

  async readPlainAtRef(
    repoName: string,
    ref: string,
    relPlainPath: string,
    userLogin?: string,
  ): Promise<string> {
    if (!ref) return "";
    const repoDir = this.getRepoDir(repoName);
    const cleanPath = relPlainPath.replace(/\\/g, "/").replace(/^\/+/, "");

    // Verify clearance
    const clearance = await this.resolveDocClearance(
      repoName,
      userLogin,
      cleanPath,
      ref,
    );
    if (!clearance.allowed) {
      throw new Error(
        `Acesso negado: Você não possui autorização para abrir o documento confidencial '${cleanPath}'.`,
      );
    }

    // Read plaintext at git ref
    const safeRef = assertCommitish(ref);
    const safePath = assertGitPath(cleanPath);
    const plainRes = await executeGit(
      ["show", `${safeRef}:${safePath}`],
      repoDir,
    );
    if (plainRes.success && plainRes.stdout !== undefined) {
      return plainRes.stdout;
    }

    return "";
  }
}

export const prSecurityService = new PRSecurityService();
