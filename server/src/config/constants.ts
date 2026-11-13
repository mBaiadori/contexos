import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { writeJsonAtomic } from "../utils/atomic-write.js";
import {
  loadDotTemplates,
  writeDotTemplate,
} from "../utils/template-markdown.js";

// Root path of the project (2 levels up from server/src/config or desktop app resources)
export const USER_DATA_DIR = process.env.CONTEXT_OS_USER_DATA || '';
export const RESOURCES_DIR = process.env.CONTEXT_OS_RESOURCES || (process as any).resourcesPath || '';

export interface AISettings {
  provider: string;
  model: string;
  api_key: string;
  custom_endpoint: string;
  allowed_tools?: string[];
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  api_key: process.env.GEMINI_API_KEY || '',
  custom_endpoint: 'http://localhost:11434/v1',
  allowed_tools: [
    'fs_read_file',
    'fs_list_dir',
    'fs_write_file',
    'git_status',
    'git_diff',
    'git_log',
    'git_commit',
    'dictionary_list',
    'dictionary_lookup',
    'templates_list',
    'prs_list',
    'governance_audit',
  ],
};

// Localiza a raiz do projeto de forma dinâmica e resiliente
function findProjectRoot(): string {
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, 'frontend')) || fs.existsSync(path.join(curr, 'server'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(process.cwd());
}

export const PROJECT_ROOT = findProjectRoot();

export function getAppVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  try {
    const candidates = [
      path.join(PROJECT_ROOT, 'package.json'),
      path.join(process.cwd(), 'package.json'),
      path.join(__dirname, '../package.json'),
      path.join(__dirname, '../../package.json'),
      path.join(__dirname, '../../../package.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data.version) return data.version;
      }
    }
  } catch {}
  return '1.0.17';
}
export const APP_VERSION = getAppVersion();

export const BASE_DIR = USER_DATA_DIR && fs.existsSync(USER_DATA_DIR)
  ? USER_DATA_DIR
  : PROJECT_ROOT;

export const PROJECTS_DIR = path.join(BASE_DIR, "projects");
export const CONFIG_PATH = path.join(BASE_DIR, "config.json");
export const PROJECTS_CONFIG_PATH = path.join(
  PROJECTS_DIR,
  "project.config.json",
);

// Resolução inteligente do Frontend estático (Prioriza resourcesPath do Electron se empacotado)
export function resolveUiDistDir(): string {
  if (RESOURCES_DIR) {
    const packagedUi = path.join(RESOURCES_DIR, "ui");
    if (fs.existsSync(packagedUi)) return packagedUi;
  }
  const distInRoot = path.join(PROJECT_ROOT, "frontend", "dist");
  if (fs.existsSync(distInRoot)) return distInRoot;
  const rawFrontend = path.join(PROJECT_ROOT, "frontend");
  if (fs.existsSync(rawFrontend)) return rawFrontend;
  return path.join(PROJECT_ROOT, "ui");
}

export const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");
export const UI_DIST_DIR = resolveUiDistDir();
export const UI_DIR = UI_DIST_DIR;
export const TEMPLATES_DIR = path.join(PROJECT_ROOT, "templates");
export const FRAMEWORK_DEFAULT_DIR = path.join(TEMPLATES_DIR, "default");
export const DOCS_DIR = path.join(PROJECT_ROOT, "docs");

/**
 * Resolve o diretório local de um repositório, com escopo por organização / owner:
 * SEMPRE projects/<owner>/<repo>.
 * Determinístico, seguro e livre de heurísticas destrutivas.
 */
export function resolveRepoDir(repoName: string, ownerOrOrg?: string | { login?: string } | any): string {
  const cleanRepo = (repoName || "").trim();
  const rawOwner =
    typeof ownerOrOrg === "string"
      ? ownerOrOrg
      : typeof (ownerOrOrg as any)?.login === "string"
        ? (ownerOrOrg as any).login
        : undefined;

  // Importacao dinamica segura ou construcao direta do path canonico
  if (cleanRepo.includes("/")) {
    const parts = cleanRepo.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return path.resolve(PROJECTS_DIR, parts[0].trim(), parts.slice(1).join("-").trim());
    }
  }

  const effectiveOwner = rawOwner && rawOwner !== "all" && rawOwner !== "personal"
    ? rawOwner.trim()
    : undefined;

  if (effectiveOwner) {
    const candidate = path.resolve(PROJECTS_DIR, effectiveOwner, cleanRepo);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (fs.existsSync(PROJECTS_DIR)) {
    // 1. Tenta diretório local direto
    const localPath = path.resolve(PROJECTS_DIR, "local", cleanRepo);
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    // 2. Procura nas subpastas de PROJECTS_DIR (ex: mBaiadori, orgs) se o repo já estiver clonado
    try {
      const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== "local" && !entry.name.startsWith(".")) {
          const checkPath = path.resolve(PROJECTS_DIR, entry.name, cleanRepo);
          if (fs.existsSync(checkPath)) {
            return checkPath;
          }
        }
      }
    } catch {}
  }

  return path.resolve(PROJECTS_DIR, effectiveOwner || "local", cleanRepo || "local");
}

export const DEFAULT_TEMPLATE_CREATOR_PROMPT = `Você é o Especialista em Criação e Curadoria de Templates Técnicos e de Produto pars.`;
export const DEFAULT_GLOBAL_SYSTEM_PROMPT = `Você é um Assistente Especialista em Documentação Técnica, Engenharia de Software e Colaboração de Equipes.
Sua missão é ajudar os membros d a redigir, estruturar, revisar e refinar documentos técnicos, especificações, RFCs, atas e guias com clareza, concisão e alto padrão técnico.`;

export const DEFAULT_PROJECT_ABOUT_PROMPT = `Você é o Assistente de Definição e Setup de Projeto d.
Sua missão é ajudar os líderes técnicos e gerentes de produto a estruturar a identidade, escopo, visão estratégica e diretrizes do projeto.

DIRETRIZES:
1. Auxilie na redação do Nome do Projeto, 'Por que fazemos?' (dores e justificativa de negócio), 'O que é o produto?' (escopo e valor), 'Onde se aplica?' e 'Como construímos?' (arquitetura e boas práticas).
2. Sugira melhorias de clareza, objetividade e alinhamento entre produto e engenharia.
3. Forneça textos diretos e prontos para uso nos campos do projeto.`;

export interface ProjectTemplate {
  id: string;
  templateName: string;
  title: string;
  ext: string; // 'md'
  category: string;
  tags: string[];
  updated_at: string;
  content: string;
  prompt: string;
  source: "community" | "local" | string;
  description?: string;
  badge?: string;
  skills?: string[]; // Attached ECC skills (e.g. ['living-docs-governance', 'architecture-adr-guardian'])
  // Compatibility fields
  systemPrompt?: string;
  assistant_prompt?: string;
}

export type CanonicalTemplate = ProjectTemplate;

export interface TemplatesMetadataItem {
  id: string;
  templateName?: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  badge?: string;
  path?: string;
  source: "local" | "community" | string;
  created_at?: string;
  updated_at: string;
}

export function getProjectTemplatesPath(repoName: string, ownerOrOrg?: string): string {
  const repoDir = resolveRepoDir(repoName, ownerOrOrg);
  const primaryPath = path.join(repoDir, ".templates.json");
  const legacyMetaPath = path.join(repoDir, ".templates.metadata.json");
  if (!fs.existsSync(primaryPath) && fs.existsSync(legacyMetaPath)) {
    return legacyMetaPath;
  }
  return primaryPath;
}

export function getCommunityTemplatesPath(): string {
  const insideTemplatesDir = path.join(TEMPLATES_DIR, ".templates.json");
  const insideBaseDir = path.join(BASE_DIR, ".templates.json");
  if (fs.existsSync(insideTemplatesDir)) return insideTemplatesDir;
  if (fs.existsSync(insideBaseDir)) return insideBaseDir;
  return insideTemplatesDir;
}

function sanitizeTemplateItem(
  item: any,
  defaultSource: "local" | "community" = "local",
): ProjectTemplate {
  const id =
    item.id ||
    (item.templateName
      ? String(item.templateName).toLowerCase().replace(/\s+/g, "-")
      : `tpl-${Date.now()}`);
  const templateName = item.templateName || item.name || id;
  const title = item.title || templateName;
  const ext = item.ext || "md";
  const category = item.category || item.categories || "";
  const tags = Array.isArray(item.tags)
    ? item.tags
    : item.tags
      ? [item.tags]
      : [];
  const updated_at =
    item.updated_at || item.created_at || new Date().toISOString();
  const content = item.content || "";
  const prompt =
    item.prompt || item.systemPrompt || item.assistant_prompt || "";
  const source = item.source || defaultSource;
  const description = item.description || "";
  const badge = item.badge || (source === "community" ? "Comunidade" : "Local");
  const skills = Array.isArray(item.skills) ? item.skills : [];

  return {
    id,
    templateName,
    title,
    ext,
    category,
    tags,
    skills,
    updated_at,
    content,
    prompt,
    source,
    description,
    badge,
    systemPrompt: prompt,
    assistant_prompt: prompt,
  };
}

export function loadProjectTemplates(repoName: string, ownerOrOrg?: string): ProjectTemplate[] {
  const repoDir = resolveRepoDir(repoName, ownerOrOrg);

  // 1. Carrega templates modulares de .templates/<slug>/
  const dotTemplates = loadDotTemplates(repoDir);

  // 2. Carrega templates legados de .templates.json
  const filePath = getProjectTemplatesPath(repoName, ownerOrOrg);
  let jsonTemplates: ProjectTemplate[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          jsonTemplates = parsed.map((t) => sanitizeTemplateItem(t, "local"));
        }
      }
    } catch (err) {
      console.error(
        `[loadProjectTemplates] Erro ao carregar templates de ${filePath}:`,
        err,
      );
    }
  }

  // Mescla priorizando os templates modulares de .templates/
  const uniqueMap = new Map<string, ProjectTemplate>();
  for (const t of jsonTemplates) {
    if (t.id) uniqueMap.set(t.id, t);
  }
  for (const t of dotTemplates) {
    if (t.id) uniqueMap.set(t.id, sanitizeTemplateItem(t, "local"));
  }

  return Array.from(uniqueMap.values());
}

export function saveProjectTemplates(
  repoName: string,
  items: ProjectTemplate[],
  ownerOrOrg?: string,
): void {
  const repoDir = resolveRepoDir(repoName, ownerOrOrg);
  const filePath = path.join(repoDir, ".templates.json");
  const sanitized = items.map((t) =>
    sanitizeTemplateItem(t, (t.source as any) || "local"),
  );

  // 1. Grava no .templates.json (compatibilidade e fallback legado)
  writeJsonAtomic(filePath, sanitized);

  // 2. Grava cada template no formato modular em .templates/<slug>/
  try {
    for (const tpl of sanitized) {
      writeDotTemplate(repoDir, tpl);
    }
  } catch (err) {
    console.error(
      `[saveProjectTemplates] Erro ao gravar templates modulares em ${repoDir}/.templates:`,
      err,
    );
  }
}

export function loadCommunityTemplates(): ProjectTemplate[] {
  const filePath = getCommunityTemplatesPath();
  if (!fs.existsSync(filePath)) {
    // Check fallback old_templates if available to auto-populate community templates
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t) => sanitizeTemplateItem(t, "community"));
  } catch (err) {
    console.error(
      `[loadCommunityTemplates] Erro ao carregar templates da comunidade:`,
      err,
    );
    return [];
  }
}

export function saveCommunityTemplates(items: ProjectTemplate[]): void {
  const filePath = getCommunityTemplatesPath();
  const sanitized = items.map((t) => sanitizeTemplateItem(t, "community"));
  writeJsonAtomic(filePath, sanitized);
}

export function loadProjectTemplatesMetadata(
  repoName: string,
): TemplatesMetadataItem[] {
  return loadProjectTemplates(repoName);
}

export function saveProjectTemplatesMetadata(
  repoName: string,
  items: TemplatesMetadataItem[],
): void {
  saveProjectTemplates(repoName, items as any);
}

export function loadCanonicalTemplates(): ProjectTemplate[] {
  return loadCommunityTemplates();
}

export interface CanonicalTutorial {
  id: string;
  title: string;
  category: string;
  badge: string;
  read_time: string;
  content: string;
}

export function loadCanonicalTutorials(): CanonicalTutorial[] {
  const tutorials: CanonicalTutorial[] = [];
  const docFiles = [
    {
      id: "spec-driven-governance",
      file: "spec-driven-governance-vision.md",
      title: "Governança Orientada a Especificação (Spec-Driven SDLC)",
      category: "Fundamentos SDLC",
      badge: "Arquitetura",
      read_time: "5 min",
    },
    {
      id: "architectural-patterns",
      file: "architectural-patterns.md",
      title: "Padrões Arquiteturais & Domain-Driven Design (DDD)",
      category: "Domain-Driven Design",
      badge: "DDD",
      read_time: "4 min",
    },
    {
      id: "memory-ai",
      file: "memory-ai.md",
      title: "Memória Viva, Continuidade de Contexto & IA",
      category: "Inteligência Artificial",
      badge: "AI Memory",
      read_time: "5 min",
    },
    {
      id: "agents-instruction",
      file: "agents-instruction.md",
      title: "Protocolos de Operação e Instruções para Agentes",
      category: "Agentes & Automação",
      badge: "Agentes",
      read_time: "3 min",
    },
  ];

  for (const item of docFiles) {
    const fpath = path.join(BASE_DIR, item.file);
    if (fs.existsSync(fpath)) {
      try {
        const content = fs.readFileSync(fpath, "utf-8");
        tutorials.push({
          id: item.id,
          title: item.title,
          category: item.category,
          badge: item.badge,
          read_time: item.read_time,
          content,
        });
      } catch (err) {
        console.error(`Erro ao carregar tutorial ${item.file}:`, err);
      }
    }
  }
  return tutorials;
}
