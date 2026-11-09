import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_PATH,
  PROJECTS_CONFIG_PATH,
  PROJECTS_DIR,
  BASE_DIR,
  PROJECT_ROOT,
  TEMPLATES_DIR,
  FRAMEWORK_DEFAULT_DIR,
  resolveRepoDir,
  loadCanonicalTemplates,
  DEFAULT_GLOBAL_SYSTEM_PROMPT,
  DEFAULT_TEMPLATE_CREATOR_PROMPT,
  DEFAULT_PROJECT_ABOUT_PROMPT,
  DEFAULT_AI_SETTINGS,
} from "./constants.js";
import { validateJsonSchema } from "../utils/schema.validator.js";
import { isPathHidden, loadHiddenFiles, DEFAULT_HIDDEN_FILES } from "../utils/hidden-files.js";
import { vaultService, VAULT_KEYS } from "../modules/vault/vault.service.js";
import { writeJsonAtomic, writeTextAtomic } from "../utils/atomic-write.js";

export interface WorkspaceChange {
  path: string;
  type: "ADDED" | "MODIFIED" | "DELETED";
  old_content: string;
  new_content: string;
  timestamp: string;
}

export interface SavedAccount {
  id: string; // e.g. "github:mBaiadori"
  user: any;
  token: string;
  git_provider: 'github' | 'local';
  git_provider_url?: string;
  orgs?: any[];
  last_active?: string;
}

export interface AppConfig {
  authenticated: boolean;
  token: string;
  mode?: 'local' | 'remote';
  user: any;
  orgs: any[];
  repos?: any[];
  active_repo: any;
  active_org?: any;
  accounts?: SavedAccount[];
  ai_settings: {
    provider: string;
    model: string;
    api_key: string;
    custom_endpoint: string;
    default_provider?: string;
  };
  settings: {
    auto_pr_on_save: boolean;
    template_creator_prompt: string;
    global_system_prompt: string;
    antigravity_cli_path?: string;
    claude_cli_path?: string;
    agent_effort?: 'low' | 'medium' | 'high' | string;
    agent_model?: string;
    default_provider?: string;
  };
  workspace_changes: Record<string, WorkspaceChange[]>;
  templates?: any[];
  workflows?: any[];
  git_provider?: 'github' | 'local';
  git_provider_url?: string;
  governance?: {
    min_approvals: number;
    reviewers: string[];
  };
}

export function loadProjectsMasterConfig(): Record<string, any> {
  if (fs.existsSync(PROJECTS_CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(PROJECTS_CONFIG_PATH, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      console.error(`Erro ao carregar ${PROJECTS_CONFIG_PATH}:`, e);
    }
  }

  // Fallback
  return {
    mandatory_structure: {
      directories: [
        "project",
        "domains",
        "engenharia",
        "templates",
        ".spec-memory/_rules",
        ".spec-memory/concepts",
        ".spec-memory/decisions",
        ".spec-memory/gotchas",
        ".spec-memory/handoffs",
        ".spec-memory/sessions",
      ],
      essential_files: [
        {
          path: ".spec-memory/_meta.yaml",
          content: "version: 1.0\ninitialized: true\n",
        },
      ],
    },
    project_defaults: {
      version: "1.0.0",
      categories: [],
      tags: [],
      statuses: [],
      badges: [],
      governance_rules: { min_approvals_default: 1 },
      default_reviewers: [],
    },
    suggested_domains: [],
    workflows: [],
    default_project_about_prompt: DEFAULT_PROJECT_ABOUT_PROMPT,
  };
}

export function saveProjectsMasterConfig(cfg: any): void {
  writeJsonAtomic(PROJECTS_CONFIG_PATH, cfg);
}

let configCache: { cfg: AppConfig; timestamp: number; mtime: number } | null = null;

export function invalidateConfigCache(): void {
  configCache = null;
}

export function loadConfig(force = false): AppConfig {
  let currentMtime = 0;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      currentMtime = fs.statSync(CONFIG_PATH).mtimeMs;
    } catch {}
  }

  const now = Date.now();
  if (!force && configCache && (now - configCache.timestamp < 4000) && configCache.mtime === currentMtime) {
    return JSON.parse(JSON.stringify(configCache.cfg));
  }

  const canonical = loadCanonicalTemplates();
  let cfg: any = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      if (data && data.trim()) {
        cfg = JSON.parse(data);
      }
    } catch (e) {
      console.error(`Erro ao carregar ${CONFIG_PATH}:`, e);
    }
  }

  if (!cfg || Object.keys(cfg).length === 0) {
    cfg = {
      authenticated: false,
      token: "",
      ai_settings: { ...DEFAULT_AI_SETTINGS },
      settings: {
        auto_pr_on_save: false,
        template_creator_prompt: DEFAULT_TEMPLATE_CREATOR_PROMPT,
        global_system_prompt: DEFAULT_GLOBAL_SYSTEM_PROMPT,
      },
      workspace_changes: {},
      user: null,
      orgs: [],
      active_repo: null,
      prs: [],
    };
  }

  // Purge any hidden files from stored workspace changes
  if (cfg.workspace_changes && typeof cfg.workspace_changes === "object") {
    for (const [rName, list] of Object.entries(cfg.workspace_changes)) {
      if (Array.isArray(list)) {
        cfg.workspace_changes[rName] = list.filter(
          (c: any) => c?.path && !isPathHidden(c.path)
        );
      }
    }
  }

  cfg.templates = canonical;
  const master = loadProjectsMasterConfig();
  if (!cfg.workflows || cfg.workflows.length === 0) {
    cfg.workflows = master.workflows || [];
  }

  const isExplicitLocal = cfg.token === 'local_mode' || cfg.mode === 'local';

  // Carrega credenciais confidenciais a partir do cofre nativo do SO
  if (!isExplicitLocal) {
    const vaultGitHubToken = vaultService.getSecret(VAULT_KEYS.GITHUB_TOKEN);
    if (vaultGitHubToken) {
      cfg.token = vaultGitHubToken;
      cfg.authenticated = true;
    }
  }

  if (Array.isArray(cfg.accounts)) {
    for (const acc of cfg.accounts) {
      if (acc.id) {
        let accToken = vaultService.getSecret(`account_token_${acc.id}`);
        if (!accToken && cfg.user?.login && acc.user?.login?.toLowerCase() === cfg.user.login.toLowerCase()) {
          accToken = vaultService.getSecret(VAULT_KEYS.GITHUB_TOKEN);
        }
        if (accToken) {
          acc.token = accToken;
          vaultService.setSecret(`account_token_${acc.id}`, accToken);
        } else if (acc.token && acc.token.trim()) {
          // Migração suave: persiste no cofre nativo do SO
          vaultService.setSecret(`account_token_${acc.id}`, acc.token.trim());
        }
      }
    }
  } else {
    cfg.accounts = [];
  }

  // Fallback: se cfg.token não estiver preenchido, recupera da conta ativa ou primeira conta disponível
  if (!isExplicitLocal && !cfg.token && Array.isArray(cfg.accounts) && cfg.accounts.length > 0) {
    const activeAcc = cfg.user?.login
      ? cfg.accounts.find((a: any) => a.user?.login?.toLowerCase() === cfg.user?.login?.toLowerCase() && a.token)
      : cfg.accounts.find((a: any) => a.token);
    const candidateToken = activeAcc?.token || cfg.accounts[0]?.token;
    if (candidateToken) {
      cfg.token = candidateToken;
      cfg.authenticated = true;
    }
  }

  // Auto-seed active user into accounts if missing
  if (cfg.user?.login) {
    const currentId = `github:${cfg.user.login}`;

    if (!cfg.accounts.some((a: any) => a.id === currentId || a.user?.login === cfg.user.login)) {
      cfg.accounts.push({
        id: currentId,
        user: cfg.user,
        token: cfg.token || '',
        git_provider: cfg.git_provider || 'github',
        git_provider_url: cfg.git_provider_url,
        orgs: cfg.orgs || [],
        last_active: new Date().toISOString(),
      });
    }
  }

  if (!cfg.ai_settings) {
    cfg.ai_settings = {} as any;
  }
  const vaultAiKey = vaultService.getSecret(VAULT_KEYS.AI_API_KEY);
  if (vaultAiKey) {
    cfg.ai_settings.api_key = vaultAiKey;
  }

  if (!cfg.workspace_changes) {
    cfg.workspace_changes = {};
  }
  if (cfg.active_repo?.name) {
    cfg.workspace_changes[cfg.active_repo.name] = loadRepoWorkspaceChanges(cfg.active_repo.name);
  }

  // Migração C8: substitui o sentinela 'local_mode' por campo explícito mode: 'local' | 'remote'
  if (cfg.token === 'local_mode') {
    cfg.token = '';
    cfg.mode = 'local';
  } else if (!cfg.mode) {
    cfg.mode = (cfg.token && cfg.token.trim()) ? 'remote' : 'local';
  }

  configCache = {
    cfg: cfg as AppConfig,
    timestamp: now,
    mtime: currentMtime,
  };

  return cfg as AppConfig;
}

export function saveConfig(cfg: AppConfig): void {
  invalidateConfigCache();
  try {
    // 1. Sincroniza segredos diretamente no cofre nativo do SO (Keychain / DPAPI)
    if (cfg.token !== undefined) {
      if (cfg.token && cfg.token.trim().length > 0) {
        vaultService.setSecret(VAULT_KEYS.GITHUB_TOKEN, cfg.token.trim());
      } else {
        vaultService.deleteSecret(VAULT_KEYS.GITHUB_TOKEN);
      }
    }

    if (Array.isArray(cfg.accounts)) {
      for (const acc of cfg.accounts) {
        if (acc.id && acc.token) {
          vaultService.setSecret(`account_token_${acc.id}`, acc.token);
        }
      }
    }

    if (cfg.ai_settings?.api_key !== undefined) {
      if (cfg.ai_settings.api_key && cfg.ai_settings.api_key.trim().length > 0) {
        vaultService.setSecret(VAULT_KEYS.AI_API_KEY, cfg.ai_settings.api_key.trim());
      } else {
        vaultService.deleteSecret(VAULT_KEYS.AI_API_KEY);
      }
    }

    // 2. Cria cópia para persistência em disco
    const sanitizedToDisk: any = {
      authenticated: Boolean(cfg.authenticated && cfg.token),
      token: "",
      user: cfg.user || null,
      orgs: cfg.orgs || [],
      active_repo: cfg.active_repo || null,
      accounts: Array.isArray(cfg.accounts)
        ? cfg.accounts.map((a) => ({
            id: a.id,
            user: a.user,
            token: "",
            git_provider: a.git_provider,
            git_provider_url: a.git_provider_url,
            orgs: a.orgs || [],
            last_active: a.last_active,
          }))
        : [],
      ai_settings: cfg.ai_settings
        ? {
            provider: cfg.ai_settings.provider || "gemini",
            model: cfg.ai_settings.model || "gemini-2.5-flash",
            api_key: "",
            custom_endpoint: cfg.ai_settings.custom_endpoint || "http://localhost:11434/v1",
            default_provider: cfg.ai_settings.default_provider || "gemini",
          }
        : undefined,
      settings: cfg.settings || {},
      git_provider: cfg.git_provider || "github",
      git_provider_url: cfg.git_provider_url || undefined,
      governance: cfg.governance,
      workflows: cfg.workflows || [],
    };

    writeJsonAtomic(CONFIG_PATH, sanitizedToDisk);
  } catch (e) {
    console.error(`Erro ao salvar ${CONFIG_PATH}:`, e);
  }
}

export function getRepoWorkspaceChangesPath(repoName: string, ownerOrOrg?: string): string {
  const repoDir = resolveRepoDir(repoName, ownerOrOrg);
  return path.join(repoDir, ".spec-memory", "workspace_changes.json");
}

export function loadRepoWorkspaceChanges(repoName: string, ownerOrOrg?: string): WorkspaceChange[] {
  const filePath = getRepoWorkspaceChangesPath(repoName, ownerOrOrg);
  if (fs.existsSync(filePath)) {
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        const repoDir = resolveRepoDir(repoName, ownerOrOrg);
        return list.filter((c: any) => c?.path && !isPathHidden(c.path, loadHiddenFiles(repoDir)));
      }
    } catch (e) {
      console.error(`Erro ao carregar workspace_changes para ${repoName}:`, e);
    }
  }
  return [];
}

export function saveRepoWorkspaceChanges(repoName: string, changes: WorkspaceChange[], ownerOrOrg?: string): void {
  const filePath = getRepoWorkspaceChangesPath(repoName, ownerOrOrg);
  try {
    writeJsonAtomic(filePath, changes);
  } catch (e) {
    console.error(`Erro ao salvar workspace_changes para ${repoName}:`, e);
  }
}

const BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".svgz",
  ".zip",
  ".tar",
  ".gz",
  ".7z",
  ".rar",
  ".mp4",
  ".mp3",
  ".wav",
  ".ogg",
  ".mov",
  ".avi",
  ".exe",
  ".dll",
  ".dylib",
  ".so",
  ".wasm",
  ".bin",
]);

function sanitizeContentForStorage(filePath: string, content: string): string {
  if (!content) return "";
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return `[Arquivo binário: ${ext}]`;
  }
  if (content.length > 200000) {
    return (
      content.slice(0, 10000) +
      `\n\n... [Conteúdo truncado para armazenamento (${content.length} bytes)]`
    );
  }
  return content;
}

export function recordChange(
  repoName: string,
  relPath: string,
  changeType: "ADDED" | "MODIFIED" | "DELETED",
  oldContent: string = "",
  newContent: string = "",
  ownerOrOrg?: string,
): void {
  const cleanPath = relPath.trim().replace(/^\/+/, "");
  if (!cleanPath) return;

  const repoDir = resolveRepoDir(repoName, ownerOrOrg);
  if (isPathHidden(cleanPath, loadHiddenFiles(repoDir))) {
    return;
  }

  const safeOldContent = sanitizeContentForStorage(cleanPath, oldContent);
  const safeNewContent = sanitizeContentForStorage(cleanPath, newContent);

  const changes = loadRepoWorkspaceChanges(repoName, ownerOrOrg);
  const existingIdx = changes.findIndex((c) => c.path === cleanPath);
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    const existing = changes[existingIdx];

    // Se o arquivo era uma nova adição local (ADDED) e agora foi excluído (DELETED):
    // Como ele nunca existiu no repositório base / HEAD, o saldo líquido é nulo.
    // Ele é simplesmente descartado da lista de alterações.
    if (existing.type === "ADDED" && changeType === "DELETED") {
      changes.splice(existingIdx, 1);
      saveRepoWorkspaceChanges(repoName, changes, ownerOrOrg);
      return;
    }

    const preservedOldContent =
      existing.old_content !== undefined
        ? existing.old_content
        : safeOldContent;

    if (preservedOldContent === safeNewContent && changeType !== "DELETED") {
      changes.splice(existingIdx, 1);
      saveRepoWorkspaceChanges(repoName, changes, ownerOrOrg);
      return;
    }

    if (existing.new_content === safeNewContent && existing.old_content === preservedOldContent) {
      return;
    }

    changes[existingIdx] = {
      path: cleanPath,
      type:
        existing.type === "ADDED" && changeType !== "DELETED"
          ? "ADDED"
          : changeType,
      old_content: preservedOldContent,
      new_content: safeNewContent,
      timestamp: now,
    };
  } else {
    if (safeOldContent === safeNewContent && changeType !== "DELETED") {
      return;
    }

    changes.push({
      path: cleanPath,
      type: changeType,
      old_content: safeOldContent,
      new_content: safeNewContent,
      timestamp: now,
    });
  }

  saveRepoWorkspaceChanges(repoName, changes, ownerOrOrg);
}

export function removeWorkspaceChange(repoName: string, relPath: string, ownerOrOrg?: string): void {
  const cleanPath = relPath.trim().replace(/^\/+/, "");
  if (!cleanPath) return;
  const changes = loadRepoWorkspaceChanges(repoName, ownerOrOrg);
  const filtered = changes.filter((c) => c.path !== cleanPath);
  if (filtered.length !== changes.length) {
    saveRepoWorkspaceChanges(repoName, filtered, ownerOrOrg);
  }
  try {
    const cfg = loadConfig();
    if (cfg?.workspace_changes?.[repoName]) {
      cfg.workspace_changes[repoName] = (cfg.workspace_changes[repoName] as WorkspaceChange[]).filter(
        (c) => c.path !== cleanPath,
      );
      saveConfig(cfg);
    }
  } catch {}
}

export function clearWorkspaceChanges(repoName: string, ownerOrOrg?: string): void {
  saveRepoWorkspaceChanges(repoName, [], ownerOrOrg);
}

export function getSSOTDefaultDir(): string {
  const templatesDefault = path.join(TEMPLATES_DIR, "default");
  const rootDefault = path.join(PROJECT_ROOT, "default");
  const baseDefault = path.join(BASE_DIR, "default");
  const projectsDefault = path.join(PROJECTS_DIR, "default");

  if (fs.existsSync(templatesDefault)) return templatesDefault;
  if (fs.existsSync(rootDefault)) return rootDefault;
  if (fs.existsSync(baseDefault)) return baseDefault;
  if (fs.existsSync(projectsDefault)) return projectsDefault;
  return templatesDefault;
}

export function syncBlueprint(
  sourceDir: string,
  targetDir: string,
  repoName: string = "",
): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    const srcPath = path.join(sourceDir, entry.name);
    const dstPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      syncBlueprint(srcPath, dstPath, repoName);
    } else if (entry.isFile()) {
      if (!fs.existsSync(dstPath)) {
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        fs.copyFileSync(srcPath, dstPath);
        console.log(
          `[SSOT Onboarding] Criado arquivo essencial '${entry.name}' no repositório '${repoName || path.basename(targetDir)}'.`,
        );

        // Validate JSON if applicable
        validateAndReportSchema(dstPath, entry.name);
      } else {
        // File already exists -> Verify structure integrity, alert and auto-repair if corrupted/partial
        verifyAndRepairStructure(
          srcPath,
          dstPath,
          entry.name,
          repoName || path.basename(targetDir),
        );
      }
    }
  }
}

function validateAndReportSchema(filePath: string, fileName: string): void {
  try {
    if (
      fileName === ".project.config.json" ||
      fileName === "project.config.json"
    ) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const res = validateJsonSchema("project.config", data);
      if (!res.valid) {
        console.warn(
          `[Schema Warning] project.config em ${filePath} inválido:`,
          res.errors,
        );
      }
    } else if (
      fileName === ".dictionary.json" ||
      fileName === "dictionary.json"
    ) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const res = validateJsonSchema("dictionary", data);
      if (!res.valid) {
        console.warn(
          `[Schema Warning] dictionary em ${filePath} inválido:`,
          res.errors,
        );
      }
    } else if (
      fileName === ".docs.metadata.json" ||
      fileName === "docs.metadata.json"
    ) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const res = validateJsonSchema("docs.metadata", data);
      if (!res.valid) {
        console.warn(
          `[Schema Warning] docs.metadata em ${filePath} inválido:`,
          res.errors,
        );
      }
    } else if (
      fileName === ".templates.json" ||
      fileName === "templates.json"
    ) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const res = validateJsonSchema("templates", data);
      if (!res.valid) {
        console.warn(
          `[Schema Warning] templates em ${filePath} inválido:`,
          res.errors,
        );
      }
    }
  } catch (err) {
    console.warn(
      `[Schema Warning] Erro ao validar ${fileName} em ${filePath}:`,
      err,
    );
  }
}

function verifyAndRepairStructure(
  srcPath: string,
  dstPath: string,
  fileName: string,
  repoName: string,
): void {
  if (!fileName.endsWith(".json")) return;

  let targetContent = "";
  try {
    targetContent = fs.readFileSync(dstPath, "utf-8");
  } catch {
    return;
  }

  let targetJson: any;

  try {
    targetJson = JSON.parse(targetContent);
  } catch (parseError) {
    console.warn(
      `[SSOT Auto-Repair] ⚠️ JSON corrompido detectado em '${fileName}' (${repoName}). Restaurando a partir do default.`,
    );
    try {
      fs.copyFileSync(srcPath, dstPath);
      return;
    } catch (copyErr) {
      console.error(
        `[SSOT Auto-Repair] Falha ao restaurar '${fileName}':`,
        copyErr,
      );
      return;
    }
  }

  let srcJson: any = {};
  try {
    srcJson = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  } catch {}

  let modified = false;

  if (
    fileName === ".project.config.json" ||
    fileName === "project.config.json"
  ) {
    if (
      typeof targetJson !== "object" ||
      targetJson === null ||
      Array.isArray(targetJson)
    ) {
      targetJson = { ...srcJson };
      modified = true;
    } else {
      if (!targetJson.project || typeof targetJson.project !== "object") {
        targetJson.project = {
          ...(srcJson.project || {
            name: repoName,
            description: "",
            version: "1.0.0",
          }),
        };
        modified = true;
      }
      if (!targetJson.project.name) {
        targetJson.project.name = repoName;
        modified = true;
      }
      if (!Array.isArray(targetJson.categories)) {
        targetJson.categories = Array.isArray(srcJson.categories) ? srcJson.categories : [];
        modified = true;
      }
      if (!Array.isArray(targetJson.tags)) {
        targetJson.tags = Array.isArray(srcJson.tags) ? srcJson.tags : [];
        modified = true;
      }
      if (!Array.isArray(targetJson.statuses)) {
        targetJson.statuses = Array.isArray(srcJson.statuses) ? srcJson.statuses : [];
        modified = true;
      }
      if (!Array.isArray(targetJson.badges)) {
        targetJson.badges = Array.isArray(srcJson.badges) ? srcJson.badges : [];
        modified = true;
      }
      if (!targetJson.governance_rules) {
        targetJson.governance_rules = srcJson.governance_rules || {
          min_approvals_default: 1,
        };
        modified = true;
      }
      if (!Array.isArray(targetJson.reviewers)) {
        targetJson.reviewers = srcJson.reviewers || [];
        modified = true;
      }
    }

    const validation = validateJsonSchema("project.config", targetJson);
    if (!validation.valid) {
      console.warn(
        `[SSOT Schema Alert] '${fileName}' em '${repoName}' possui inconsistências de schema:`,
        validation.errors,
      );
    }
  } else if (fileName === ".hidden_files.json") {
    if (!Array.isArray(targetJson)) {
      targetJson = Array.isArray(srcJson) ? srcJson : [];
      modified = true;
    } else {
      const defaultEntries = Array.isArray(srcJson) ? srcJson : [];
      for (const item of defaultEntries) {
        if (!targetJson.includes(item)) {
          targetJson.push(item);
          modified = true;
        }
      }
    }
  } else if (fileName === ".docs.metadata.json") {
    if (!Array.isArray(targetJson)) {
      console.warn(
        `[SSOT Auto-Repair] '${fileName}' em '${repoName}' não era um array válido. Corrigindo.`,
      );
      targetJson = [];
      modified = true;
    }
  } else if (fileName === ".templates.json") {
    if (!Array.isArray(targetJson)) {
      targetJson = Array.isArray(srcJson) ? srcJson : [];
      modified = true;
    } else if (
      targetJson.length === 0 &&
      Array.isArray(srcJson) &&
      srcJson.length > 0
    ) {
      targetJson = [...srcJson];
      modified = true;
    }
  } else if (fileName === ".dictionary.json") {
    if (
      typeof targetJson !== "object" ||
      targetJson === null ||
      Array.isArray(targetJson)
    ) {
      targetJson = { version: "1.0.0", terms: [], domains: [] };
      modified = true;
    } else {
      if (!Array.isArray(targetJson.terms)) {
        targetJson.terms = [];
        modified = true;
      }
      if (!Array.isArray(targetJson.domains)) {
        targetJson.domains = [];
        modified = true;
      }
    }
  }

  if (modified) {
    try {
      fs.writeFileSync(dstPath, JSON.stringify(targetJson, null, 2), "utf-8");
      console.log(
        `[SSOT Auto-Repair] Estrutura de '${fileName}' em '${repoName}' corrigida e atualizada com sucesso.`,
      );
    } catch (saveErr) {
      console.error(
        `[SSOT Auto-Repair] Erro ao salvar correção em '${fileName}':`,
        saveErr,
      );
    }
  }
}

export async function ensureDefaultRepoFiles(
  repoName: string,
  _allowAutoCloneOrInit: boolean = false,
  ownerOrOrg?: string,
): Promise<void> {
  if (!repoName) return;

  const defaultDir = getSSOTDefaultDir();
  const cfg = loadConfig();
  const effectiveOwner =
    ownerOrOrg ||
    (cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined);
  const targetDir = resolveRepoDir(repoName, effectiveOwner);

  // Se o repositório não existe no disco, não cria nada nem força clone
  if (!fs.existsSync(targetDir)) {
    return;
  }

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
    ".spec-memory",
    ".skills",
    ".agents",
    ".tools",
    ".mcp.json",
    ".hidden_files.json",
  ];

  // 2. Now that repository files exist on disk, check and repair SSOT files
  // .hidden_files.json: verify schema if exists, create if missing
  const hiddenPath = path.join(targetDir, ".hidden_files.json");
  const defaultHiddenPath = path.join(defaultDir, ".hidden_files.json");
  if (!fs.existsSync(hiddenPath)) {
    fs.writeFileSync(
      hiddenPath,
      JSON.stringify(defaultHiddenFiles, null, 2),
      "utf-8",
    );
  } else {
    verifyAndRepairStructure(
      defaultHiddenPath,
      hiddenPath,
      ".hidden_files.json",
      repoName,
    );
  }

  // .project.config.json: verify schema if exists, create if missing
  const projectConfigPath = path.join(targetDir, ".project.config.json");
  const defaultProjectConfigPath = path.join(
    defaultDir,
    ".project.config.json",
  );
  if (!fs.existsSync(projectConfigPath)) {
    const defaultCfg = {
      project: {
        name: repoName,
        description: "Repositório de documentação e especificações.",
        version: "1.0.0",
        architecture_pattern: "Documentação Viva & Git",
        repository_url: cfg.active_repo?.html_url || "",
        lead: cfg.user?.login ? `@${cfg.user.login}` : "@equipe",
      },
      categories: [],
      tags: [],
      statuses: [],
      badges: [],
      governance_rules: { min_approvals_default: 1 },
      reviewers: [],
      ai_assistant_prompt:
        "Você é o assistente inteligente de documentação e engenharia.",
    };
    fs.writeFileSync(
      projectConfigPath,
      JSON.stringify(defaultCfg, null, 2),
      "utf-8",
    );
  } else {
    verifyAndRepairStructure(
      defaultProjectConfigPath,
      projectConfigPath,
      ".project.config.json",
      repoName,
    );
  }

  // .docs.metadata.json: verify schema if exists, create if missing
  const docsMetaPath = path.join(targetDir, ".docs.metadata.json");
  const defaultDocsMetaPath = path.join(defaultDir, ".docs.metadata.json");
  if (!fs.existsSync(docsMetaPath)) {
    fs.writeFileSync(docsMetaPath, JSON.stringify([], null, 2), "utf-8");
  } else {
    verifyAndRepairStructure(
      defaultDocsMetaPath,
      docsMetaPath,
      ".docs.metadata.json",
      repoName,
    );
  }

  // .dictionary.json: verify schema if exists, create if missing
  const dictPath = path.join(targetDir, ".dictionary.json");
  const defaultDictPath = path.join(defaultDir, ".dictionary.json");
  if (!fs.existsSync(dictPath)) {
    fs.writeFileSync(dictPath, JSON.stringify([], null, 2), "utf-8");
  } else {
    verifyAndRepairStructure(
      defaultDictPath,
      dictPath,
      ".dictionary.json",
      repoName,
    );
  }

  // .templates.json: verify schema if exists, create if missing
  const templatesPath = path.join(targetDir, ".templates.json");
  const defaultTemplatesPath = path.join(defaultDir, ".templates.json");
  if (!fs.existsSync(templatesPath)) {
    fs.writeFileSync(templatesPath, JSON.stringify([], null, 2), "utf-8");
  } else {
    verifyAndRepairStructure(
      defaultTemplatesPath,
      templatesPath,
      ".templates.json",
      repoName,
    );
  }

  // .github/CODEOWNERS: gera o arquivo de propriedade dos arquivos do repositório
  const githubDir = path.join(targetDir, ".github");
  const codeownersPath = path.join(githubDir, "CODEOWNERS");
  if (!fs.existsSync(codeownersPath)) {
    try {
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
      }
      const ownerLogin = (cfg.active_repo?.full_name?.split("/")[0]) || cfg.user?.login || "admin";
      const codeownersContent = `# Context OS - Governança & Root of Trust
# Arquivos críticos de controle de acesso exigem aprovação do proprietário
.project.config.json @${ownerLogin}
.gitignore @${ownerLogin}
.github/ @${ownerLogin}
`;
      fs.writeFileSync(codeownersPath, codeownersContent, "utf-8");
    } catch (err: any) {
      console.warn(`[Storage] Aviso ao criar .github/CODEOWNERS em ${repoName}:`, err.message);
    }
  }
}
