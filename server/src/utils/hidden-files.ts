import fs from "node:fs";
import path from "node:path";

export const DEFAULT_HIDDEN_FILES = [
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
  ".translations",
];

const DEFAULT_HIDDEN_SET = new Set(
  DEFAULT_HIDDEN_FILES.map((item) => item.trim().replace(/^\.?\//, "").replace(/\/+$/, ""))
);

const hiddenCache = new Map<string, { list: string[]; set: Set<string>; timestamp: number }>();

export function loadHiddenFiles(repoDir: string): string[] {
  const cached = hiddenCache.get(repoDir);
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.list;
  }

  const hiddenPath = path.join(repoDir, ".hidden_files.json");
  if (fs.existsSync(hiddenPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(hiddenPath, "utf-8"));
      if (Array.isArray(data)) {
        const cleanList = data.map((item: string) => String(item).trim().replace(/^\.?\//, "").replace(/\/+$/, "")).filter(Boolean);
        hiddenCache.set(repoDir, {
          list: data,
          set: new Set([...cleanList, ...DEFAULT_HIDDEN_SET]),
          timestamp: Date.now(),
        });
        return data;
      }
    } catch (e) {
      console.warn(
        `[HiddenFiles] Erro ao ler .hidden_files.json em ${repoDir}:`,
        e
      );
    }
  }

  hiddenCache.set(repoDir, {
    list: DEFAULT_HIDDEN_FILES,
    set: DEFAULT_HIDDEN_SET,
    timestamp: Date.now(),
  });
  return DEFAULT_HIDDEN_FILES;
}

export function isPathHidden(filePath: string, hiddenList?: string[]): boolean {
  if (!filePath) return false;
  const cleanPath = filePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleanPath) return false;

  const segments = cleanPath.split("/").filter(Boolean);

  // 1. Fast check: Any dot segment (e.g. .git, .spec-memory, .DS_Store)
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.charCodeAt(0) === 46 /* '.' */ && seg !== "." && seg !== "..") {
      return true;
    }
  }

  // 2. Direct Set matching if using default list
  if (!hiddenList || hiddenList === DEFAULT_HIDDEN_FILES) {
    if (DEFAULT_HIDDEN_SET.has(cleanPath)) return true;
    for (let i = 0; i < segments.length; i++) {
      if (DEFAULT_HIDDEN_SET.has(segments[i])) return true;
    }
    return false;
  }

  // 3. Custom list matching
  for (let i = 0; i < hiddenList.length; i++) {
    const item = hiddenList[i];
    const cleanItem = item.trim().replace(/^\.?\//, "").replace(/\/+$/, "");
    if (!cleanItem) continue;

    if (
      cleanPath === cleanItem ||
      cleanPath.startsWith(cleanItem + "/") ||
      segments.includes(cleanItem)
    ) {
      return true;
    }
  }

  return false;
}

export const KNOWN_SYSTEM_FILES = [
  ".templates",
  ".templates.json",
  ".templates.metadata.json",
  ".dictionary.json",
  ".docs.metadata.json",
  ".project.config.json",
  ".hidden_files.json",
  ".mcp.json",
  ".spec-memory",
  ".skills",
  ".agents",
  ".tools",
  ".gitignore",
  ".translations",
];

export function isSystemPath(filePath: string): boolean {
  if (!filePath) return false;
  const cleanPath = filePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleanPath) return false;

  const segments = cleanPath.split("/").filter(Boolean);

  // Pure OS or runtime garbage (never system files)
  for (const seg of segments) {
    if (seg === ".git" || seg === ".DS_Store" || seg === "node_modules" || seg.endsWith(".log") || seg === ".env") {
      return false;
    }
  }

  for (const item of KNOWN_SYSTEM_FILES) {
    if (cleanPath === item || cleanPath.startsWith(item + "/") || segments.includes(item)) {
      return true;
    }
  }

  if (cleanPath.startsWith(".") || segments.some((s) => s.startsWith("."))) {
    return true;
  }

  return false;
}

export function getSystemFileFriendlyName(filePath: string): string {
  const cleanPath = (filePath || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleanPath.startsWith(".templates")) return `Template (${path.basename(path.dirname(cleanPath)) || path.basename(cleanPath)})`;
  if (cleanPath === ".templates.json") return "Templates e Modelos de Documento";
  if (cleanPath === ".templates.metadata.json") return "Metadados de Templates";
  if (cleanPath === ".dictionary.json") return "Dicionário de Termos e Vocabulário";
  if (cleanPath === ".docs.metadata.json") return "Metadados e Governança de Documentos";
  if (cleanPath === ".project.config.json") return "Configurações Gerais do Projeto";
  if (cleanPath === ".hidden_files.json") return "Regras de Arquivos do Sistema";
  if (cleanPath === ".mcp.json") return "Configuração de Servidores MCP";
  if (cleanPath === ".gitignore") return "Configuração Gitignore";
  if (cleanPath.startsWith(".translations")) return `Arquivo de Tradução (${path.basename(cleanPath)})`;
  if (cleanPath.startsWith(".skills")) return `Habilidade do Projeto (${path.basename(cleanPath)})`;
  if (cleanPath.startsWith(".agents")) return `Agente do Projeto (${path.basename(cleanPath)})`;
  if (cleanPath.startsWith(".spec-memory")) return "Memória de Contexto & IA";
  return cleanPath;
}

