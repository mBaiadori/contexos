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
  ".skills",
  ".agents",
  ".tools",
  ".mcp.json",
  ".hidden_files.json",
  ".translations",
];

export function isPathHidden(filePath: string, customHiddenList?: string[]): boolean {
  if (!filePath) return false;
  const list = customHiddenList && customHiddenList.length > 0 ? customHiddenList : DEFAULT_HIDDEN_FILES;
  const cleanPath = filePath.trim().replace(/^\/+/, "").replace(/\\/g, "/");
  if (!cleanPath) return false;

  const segments = cleanPath.split("/").filter(Boolean);

  for (const item of list) {
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

  for (const item of DEFAULT_HIDDEN_FILES) {
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

  for (const seg of segments) {
    if (seg.startsWith(".") && seg !== "." && seg !== "..") {
      return true;
    }
  }

  return false;
}

export const KNOWN_SYSTEM_FILES = [
  ".templates.json",
  ".templates.metadata.json",
  ".dictionary.json",
  ".docs.metadata.json",
  ".project.config.json",
  ".hidden_files.json",
  ".mcp.json",
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
    if (
      seg === ".git" ||
      seg === ".DS_Store" ||
      seg === "node_modules" ||
      seg.endsWith(".log") ||
      seg === ".env"
    ) {
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
  if (cleanPath === ".templates.json") return "Templates e Modelos de Documento";
  if (cleanPath === ".templates.metadata.json") return "Metadados de Templates";
  if (cleanPath === ".dictionary.json") return "Dicionário de Termos e Vocabulário";
  if (cleanPath === ".docs.metadata.json") return "Metadados e Governança de Documentos";
  if (cleanPath === ".project.config.json") return "Configurações Gerais do Projeto";
  if (cleanPath === ".hidden_files.json") return "Regras de Arquivos do Sistema";
  if (cleanPath === ".mcp.json") return "Configuração de Servidores MCP";
  if (cleanPath === ".gitignore") return "Configuração Gitignore";
  if (cleanPath.startsWith(".translations")) {
    const parts = cleanPath.split("/");
    return `Arquivo de Tradução (${parts[parts.length - 1]})`;
  }
  if (cleanPath.startsWith(".skills")) {
    const parts = cleanPath.split("/");
    return `Habilidade do Projeto (${parts[parts.length - 1]})`;
  }
  if (cleanPath.startsWith(".agents")) {
    const parts = cleanPath.split("/");
    return `Agente do Projeto (${parts[parts.length - 1]})`;
  }
  return cleanPath;
}

