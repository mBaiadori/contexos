import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { writeJsonAtomic } from "../../utils/atomic-write.js";
import { GovernanceAuditLogEntry } from "./governance.types.js";

interface EphemeralAIToken {
  token: string;
  user: string;
  folder?: string;
  expiresAt: number;
}

const ephemeralTokens = new Map<string, EphemeralAIToken>();

export class GovernanceConfigService {
  getRepoDir(repoName?: string): string {
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const effectiveOwner = cfg.active_repo?.name === activeRepoName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  getProjectConfigPath(repoName?: string): string {
    const dir = this.getRepoDir(repoName);
    return path.join(dir, ".project.config.json");
  }

  readProjectConfig(repoName?: string): Record<string, any> {
    const p = this.getProjectConfigPath(repoName);
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch {}
    }
    return {};
  }

  writeProjectConfig(repoName: string | undefined, data: unknown): void {
    const p = this.getProjectConfigPath(repoName);
    try {
      writeJsonAtomic(p, data, 2);
    } catch (err) {
      console.warn(
        `[GovernanceService] Falha ao salvar .project.config.json:`,
        err,
      );
    }
  }

  logAudit(
    repoName: string | undefined,
    entry: Omit<GovernanceAuditLogEntry, "id" | "timestamp">,
  ): void {
    const pConfig = this.readProjectConfig(repoName);
    if (!Array.isArray(pConfig.governance_audit_logs)) {
      pConfig.governance_audit_logs = [];
    }
    const logItem: GovernanceAuditLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    pConfig.governance_audit_logs.unshift(logItem);
    // Keep last 100 entries
    if (pConfig.governance_audit_logs.length > 100) {
      pConfig.governance_audit_logs = pConfig.governance_audit_logs.slice(
        0,
        100,
      );
    }
    this.writeProjectConfig(repoName, pConfig);
  }

  async getAuditLogs(repoName?: string): Promise<GovernanceAuditLogEntry[]> {
    const targetRepoName = repoName || "local";
    const pConfig = this.readProjectConfig(targetRepoName);
    return pConfig.governance_audit_logs || [];
  }

  createSecureAIToken(payload: {
    user: string;
    folder?: string;
    repo?: string;
    ttlMinutes?: number;
  }): { token: string; expiresAt: string } {
    const token = `ctx_sec_${crypto.randomBytes(24).toString("hex")}`;
    const ttlMs = (payload.ttlMinutes || 60) * 60 * 1000;
    const expiresAt = Date.now() + ttlMs;

    ephemeralTokens.set(token, {
      token,
      user: payload.user,
      folder: payload.folder,
      expiresAt,
    });

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async getSecureContextForAI(payload: {
    filePath: string;
    token: string;
    repo?: string;
  }): Promise<{
    success: boolean;
    filePath: string;
    content?: string;
    error?: string;
  }> {
    const ephemeral = ephemeralTokens.get(payload.token);
    if (!ephemeral || ephemeral.expiresAt < Date.now()) {
      if (ephemeral) ephemeralTokens.delete(payload.token);
      return {
        success: false,
        filePath: payload.filePath,
        error:
          "Token de sessão efêmero expirado ou inválido para acesso ao AI Context Pipe.",
      };
    }

    const targetRepoName = payload.repo || "local";
    const repoDir = this.getRepoDir(targetRepoName);
    const fullPath = path.join(repoDir, payload.filePath);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        filePath: payload.filePath,
        error: `Arquivo não encontrado no repositório: ${payload.filePath}`,
      };
    }

    const rawContent = fs.readFileSync(fullPath, "utf-8");
    return {
      success: true,
      filePath: payload.filePath,
      content: rawContent,
    };
  }

  resolveRepoFullName(repoName?: string, orgLogin?: string): string {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = repoName || activeRepo?.name || "local";

    // 1. Se o nome já contiver '/', ex: 'MinhaOrg/MeuRepo', retorna diretamente
    if (targetRepoName.includes("/") && !targetRepoName.startsWith("local/")) {
      return targetRepoName;
    }

    // 2. Repositórios locais ou padrão do sistema
    if (
      targetRepoName === "local" ||
      targetRepoName === "default" ||
      targetRepoName === "_default"
    ) {
      if (
        activeRepo?.name === targetRepoName &&
        activeRepo.full_name &&
        !activeRepo.full_name.startsWith("local/") &&
        !activeRepo.is_local
      ) {
        return activeRepo.full_name;
      }
      return `local/${targetRepoName}`;
    }

    // 3. Inspeciona o .git/config específico da pasta deste repositório no disco
    const repoDir = this.getRepoDir(targetRepoName);
    const gitConfigPath = path.join(repoDir, ".git", "config");
    if (fs.existsSync(gitConfigPath)) {
      try {
        const configText = fs.readFileSync(gitConfigPath, "utf-8");
        const match = configText.match(
          /url\s*=\s*(?:https?:\/\/[^\/]+(?::\d+)?\/|git@[^:]+:)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(\.git|\s|$)/,
        );
        if (match && match[1]) {
          const fullName = match[1].replace(/\.git$/, "");
          if (!fullName.startsWith("local/")) {
            return fullName;
          }
        }
      } catch {}
    }

    // 4. Se orgLogin foi explicitamente passado e não for "local"
    if (orgLogin && orgLogin !== "local") {
      return `${orgLogin}/${targetRepoName}`;
    }

    // 5. Se o repositório ativo selecionado for o mesmo e tiver full_name válido
    if (activeRepo?.name?.toLowerCase() === targetRepoName.toLowerCase()) {
      if (activeRepo.is_local || activeRepo.full_name?.startsWith("local/")) {
        return `local/${targetRepoName}`;
      }
      if (activeRepo.full_name && !activeRepo.full_name.startsWith("local/")) {
        return activeRepo.full_name;
      }
    }

    // 6. Se há organização ativa configurada no storage
    const fallbackOrg = (cfg as { active_org?: { login?: string } }).active_org?.login;
    if (fallbackOrg && fallbackOrg !== "local") {
      return `${fallbackOrg}/${targetRepoName}`;
    }

    // 7. Se há organizações nas credenciais do usuário
    if (Array.isArray(cfg.orgs) && cfg.orgs.length > 0) {
      const firstOrg =
        typeof cfg.orgs[0] === "string" ? cfg.orgs[0] : (cfg.orgs[0] as { login?: string })?.login;
      if (firstOrg && firstOrg !== "local") {
        return `${firstOrg}/${targetRepoName}`;
      }
    }

    // 8. Se há login de usuário
    if (cfg.user?.login && cfg.user.login !== "local") {
      return `${cfg.user.login}/${targetRepoName}`;
    }

    return `local/${targetRepoName}`;
  }
}

export const governanceConfigService = new GovernanceConfigService();
