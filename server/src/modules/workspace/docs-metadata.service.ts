import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import { validateJsonSchema } from "../../utils/schema.validator.js";
import {
  DEFAULT_DEPARTMENTS,
  DepartmentConfig,
} from "../governance/governance.types.js";
import { loadConfig } from "../../config/storage.js";
import { writeJsonAtomic, writeTextAtomic } from "../../utils/atomic-write.js";

export interface DocumentMetadataItem {
  id: string;
  name: string;
  title?: string;
  ext: string;
  path: string;
  status: string;
  categories: string;
  tags: string[];
  updated_at: string;
  approvers: string[];
  links: string[];
  templateId: string;
  prompt: string;
  department?: string; // id do departamento (e.g. "engineering", "finance", "legal")
  [key: string]: any;
}

export interface ProjectMetadataOptions {
  categories: Array<string | { name: string; color?: string }>;
  statuses: Array<{
    key?: string;
    name?: string;
    label: string;
    badge?: string;
    color?: string;
  }>;
  tags: Array<string | { name: string; color?: string }>;
  badges?: Array<
    string | { name: string; color?: string; description?: string }
  >;
  departments?: DepartmentConfig[];
}

export function generateDocId(filePath: string): string {
  return filePath
    .replace(/\.md$/, "")
    .replace(/[\/\\]/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function areArraysEqual(
  a: any[] | undefined,
  b: any[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function areMetadataItemsEqual(
  a: DocumentMetadataItem,
  b: DocumentMetadataItem,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.title === b.title &&
    a.name === b.name &&
    a.status === b.status &&
    a.categories === b.categories &&
    a.department === b.department &&
    a.templateId === b.templateId &&
    areArraysEqual(a.tags, b.tags) &&
    areArraysEqual(a.approvers, b.approvers) &&
    areArraysEqual(a.links, b.links)
  );
}

export function areMetadataListsEqual(
  a: DocumentMetadataItem[] | undefined,
  b: DocumentMetadataItem[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const mapA = new Map(a.map((item) => [item.path, item]));
  for (const itemB of b) {
    const itemA = mapA.get(itemB.path);
    if (!itemA || !areMetadataItemsEqual(itemA, itemB)) {
      return false;
    }
  }
  return true;
}

export function sanitizeMetadataForFrontmatter(
  meta: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!meta || typeof meta !== "object") return {};
  const cleaned: Record<string, any> = {};

  const internalKeys = new Set([
    "ext",
    "name",
    "path",
    "links",
    "updated_at",
    "prompt",
    "feedback_loops",
    "lifecycle",
    "stage",
    "layer",
    "parent",
    "version",
    "isDraft",
    "id",
  ]);

  for (const [key, rawVal] of Object.entries(meta)) {
    if (internalKeys.has(key)) continue;
    if (
      rawVal === undefined ||
      rawVal === null ||
      rawVal === "{}" ||
      (rawVal === "" && key !== "title")
    ) {
      continue;
    }

    if (key === "templateId") {
      if (typeof rawVal === "string" && rawVal.trim().length > 0) {
        cleaned.templateId = rawVal.trim();
      }
      continue;
    }

    if (key === "tags" || key === "approvers") {
      let arr: string[] = [];
      if (Array.isArray(rawVal)) {
        arr = rawVal;
      } else if (typeof rawVal === "string") {
        const trimmed = rawVal.trim();
        if (trimmed === "[]" || trimmed === "{}" || trimmed === "") {
          cleaned[key] = [];
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) arr = parsed;
          else arr = trimmed.split(",");
        } catch {
          arr = trimmed.split(",");
        }
      }
      const validItems = arr
        .map((s) => (typeof s === "string" ? s.trim() : String(s)))
        .filter((s) => s && s !== "[]" && s !== "{}" && s !== '""' && s !== "''");
      cleaned[key] = validItems;
      continue;
    }

    if (key === "category" && !cleaned.categories) {
      const trimmed = String(rawVal).trim();
      if (trimmed && trimmed !== "[]" && trimmed !== "{}") {
        cleaned.categories = trimmed;
      }
      continue;
    }

    if (typeof rawVal === "string") {
      const trimmed = rawVal.trim();
      if (trimmed && trimmed !== "[]" && trimmed !== "{}") {
        cleaned[key] = trimmed;
      }
    } else if (typeof rawVal === "number" || typeof rawVal === "boolean") {
      cleaned[key] = rawVal;
    }
  }

  // Ordem canônica determinística
  const preferredOrder = [
    "title",
    "type",
    "badge",
    "status",
    "categories",
    "tags",
    "department",
    "templateId",
    "approvers",
  ];
  const sorted: Record<string, any> = {};
  const keys = Object.keys(cleaned).sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const k of keys) {
    sorted[k] = cleaned[k];
  }

  return sorted;
}

export function extractFrontmatterMeta(content: string): {
  title?: string;
  status?: string;
  categories?: string;
  tags?: string[];
  department?: string;
  templateId?: string;
  approvers?: string[];
  [key: string]: any;
} {
  if (!content) return {};
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};

  const rawFm = match[1];
  const rawParsed: Record<string, any> = {};
  const lines = rawFm.split("\n");
  let currentListKey: string | null = null;
  let currentList: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Item de lista yaml multiline (ex: "  - tag1" ou "- tag1")
    if (currentListKey && trimmed.startsWith("-")) {
      let itemVal = trimmed.replace(/^-\s*/, "").trim();
      if (
        (itemVal.startsWith('"') && itemVal.endsWith('"')) ||
        (itemVal.startsWith("'") && itemVal.endsWith("'"))
      ) {
        itemVal = itemVal.slice(1, -1);
      }
      if (itemVal && itemVal !== "[]" && itemVal !== "{}") {
        currentList.push(itemVal);
      }
      continue;
    } else if (currentListKey) {
      if (currentList.length > 0) {
        rawParsed[currentListKey] = currentList;
      }
      currentListKey = null;
      currentList = [];
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    // Início de lista multiline (ex: "tags:" sem valor na mesma linha)
    if (!val) {
      currentListKey = key;
      currentList = [];
      continue;
    }

    // Remove aspas externas se existirem antes de checar formato
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).trim();
    }

    // Se o valor for "[]" (array vazio legítimo)
    if (val === "[]") {
      if (key === "tags" || key === "approvers") {
        rawParsed[key] = [];
      }
      continue;
    }

    if (!val || val === "{}") {
      continue;
    }

    // Array inline (ex: ["rfc", "core"] ou [rfc, core])
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      if (inner) {
        const items = inner
          .split(",")
          .map((s) => {
            let item = s.trim();
            if (
              (item.startsWith('"') && item.endsWith('"')) ||
              (item.startsWith("'") && item.endsWith("'"))
            ) {
              item = item.slice(1, -1);
            }
            return item;
          })
          .filter((item) => item && item !== "[]" && item !== "{}");
        rawParsed[key] = items;
      } else if (key === "tags" || key === "approvers") {
        rawParsed[key] = [];
      }
      continue;
    }

    if (val === "true") rawParsed[key] = true;
    else if (val === "false") rawParsed[key] = false;
    else rawParsed[key] = val;
  }

  if (currentListKey && currentList.length > 0) {
    rawParsed[currentListKey] = currentList;
  }

  return sanitizeMetadataForFrontmatter(rawParsed);
}

export function updateFrontmatterInMarkdown(
  content: string,
  meta: Record<string, any>,
): string {
  if (!content) content = "";
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let existingMeta: Record<string, any> = {};
  let body = content;

  if (match) {
    existingMeta = extractFrontmatterMeta(content);
    body = content.slice(match[0].length);
  }

  const merged = { ...existingMeta, ...meta };
  const sanitized = sanitizeMetadataForFrontmatter(merged);

  if (Object.keys(sanitized).length === 0) {
    return body.replace(/^\r?\n/, "");
  }

  const lines = ["---"];
  for (const [k, v] of Object.entries(sanitized)) {
    if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((item) => `"${item}"`).join(", ")}]`);
    } else {
      lines.push(`${k}: "${v}"`);
    }
  }
  lines.push("---");
  const cleanBody = body.replace(/^\r?\n+/, "");
  return lines.join("\n") + (cleanBody ? `\n\n${cleanBody}` : "\n");
}

export function extractDocLinksFromMarkdown(content: string): string[] {
  if (!content) return [];
  const links: string[] = [];
  const regex = /\[.*?\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    if (
      !rawTarget.startsWith("http://") &&
      !rawTarget.startsWith("https://") &&
      !rawTarget.startsWith("mailto:")
    ) {
      const cleanTarget = rawTarget.split("#")[0].replace(/^\.?\//, "");
      if (
        cleanTarget.endsWith(".md") ||
        cleanTarget.endsWith(".markdown") ||
        cleanTarget.length > 0 ||
        rawTarget.startsWith("#") ||
        rawTarget.startsWith(":~:text=")
      ) {
        if (!links.includes(rawTarget)) {
          links.push(rawTarget);
        }
      }
    }
  }
  return links;
}

export function extractDocTitleFromMarkdown(content: string): string | null {
  if (!content) return null;
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim().replace(/^[\uD800-\uDBFF\uDC00-\uDFFF\s]+/g, ""); // remove initial emojis if any
  }
  return null;
}

export class DocsMetadataService {
  private getRepoDir(repoName: string): string {
    const cfg = loadConfig();
    const effectiveOwner = cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(repoName || "local", effectiveOwner);
  }

  getDocsMetadataPath(repoName: string): string {
    const hiddenPath = path.join(
      this.getRepoDir(repoName),
      ".docs.metadata.json",
    );
    const legacyPath = path.join(
      this.getRepoDir(repoName),
      "project",
      "docs.metadata.json",
    );
    if (!fs.existsSync(hiddenPath) && fs.existsSync(legacyPath)) {
      return legacyPath;
    }
    return hiddenPath;
  }

  getProjectConfigPath(repoName: string): string {
    const hiddenPath = path.join(
      this.getRepoDir(repoName),
      ".project.config.json",
    );
    const legacyPath = path.join(
      this.getRepoDir(repoName),
      "project.config.json",
    );
    if (!fs.existsSync(hiddenPath) && fs.existsSync(legacyPath)) {
      return legacyPath;
    }
    return hiddenPath;
  }

  private projectConfigCache = new Map<
    string,
    { config: Record<string, any>; mtimeMs: number }
  >();

  getProjectConfig(repoName: string): Record<string, any> {
    const cleanRepo = repoName || "local";
    const cfgPath = this.getProjectConfigPath(cleanRepo);
    let currentMtime = 0;
    const exists = fs.existsSync(cfgPath);
    if (exists) {
      try {
        currentMtime = fs.statSync(cfgPath).mtimeMs;
      } catch {}
    } else {
      this.projectConfigCache.delete(cleanRepo);
      return {};
    }

    const cached = this.projectConfigCache.get(cleanRepo);
    if (cached && cached.mtimeMs === currentMtime) {
      return cached.config;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      this.projectConfigCache.set(cleanRepo, {
        config: parsed,
        mtimeMs: currentMtime,
      });
      return parsed;
    } catch (err) {
      console.error(
        `[DocsMetadataService] Erro ao ler project.config.json:`,
        err,
      );
    }
    return {};
  }

  saveProjectConfig(
    repoName: string,
    configData: any,
  ): { success: boolean; config: any } {
    const cleanRepo = repoName || "local";
    const existing = this.getProjectConfig(cleanRepo);
    const merged = { ...existing, ...configData };
    const cfgPath = this.getProjectConfigPath(cleanRepo);
    const valRes = validateJsonSchema("project.config", merged);
    if (!valRes.valid) {
      console.warn(
        `[DocsMetadataService] Aviso de validação project.config.json:`,
        valRes.errors,
      );
    }
    writeJsonAtomic(cfgPath, merged, 2);
    let currentMtime = Date.now();
    try {
      currentMtime = fs.statSync(cfgPath).mtimeMs;
    } catch {}
    this.projectConfigCache.set(cleanRepo, {
      config: merged,
      mtimeMs: currentMtime,
    });
    return { success: true, config: merged };
  }

  getProjectMetadataOptions(repoName: string): ProjectMetadataOptions {
    const config = this.getProjectConfig(repoName);

    const statuses = Array.isArray(config.statuses) ? config.statuses : [];
    const categories = Array.isArray(config.categories)
      ? config.categories
      : [];
    const tags = Array.isArray(config.tags) ? config.tags : [];
    const badges = Array.isArray(config.badges) ? config.badges : [];

    const departments: DepartmentConfig[] =
      Array.isArray(config.departments) && config.departments.length > 0
        ? config.departments
        : DEFAULT_DEPARTMENTS;

    return { statuses, categories, tags, badges, departments };
  }

  inferDepartmentFromPath(
    filePath: string,
    repoName?: string,
    cachedDepartments?: DepartmentConfig[],
  ): { department?: string } {
    if (!filePath) return {};
    const clean = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    const parts = clean.split("/");
    const targetFolder = (
      parts[0] === "docs" && parts.length > 1 ? parts[1] : parts[0]
    ).toLowerCase();

    let departments: DepartmentConfig[] = cachedDepartments || DEFAULT_DEPARTMENTS;
    if (!cachedDepartments) {
      try {
        const config = this.getProjectConfig(repoName || "local");
        if (Array.isArray(config.departments) && config.departments.length > 0) {
          departments = config.departments;
        }
      } catch {}
    }

    const matched = departments.find(
      (d) =>
        d.folder.toLowerCase() === targetFolder ||
        d.id.toLowerCase() === targetFolder,
    );

    if (matched) {
      return {
        department: matched.id,
      };
    }
    return {};
  }

  private metaCache = new Map<
    string,
    {
      data: DocumentMetadataItem[];
      map: Map<string, DocumentMetadataItem>;
      mtimeMs: number;
      timestamp: number;
    }
  >();
  private fileStatsCache = new Map<
    string,
    Map<string, { mtimeMs: number; size: number }>
  >();
  private reconciliationInProgress = new Set<string>();
  private reconciliationQueued = new Set<string>();

  setFileStat(
    repoName: string,
    relPath: string,
    mtimeMs: number,
    size: number,
  ): void {
    const cleanRepo = repoName || "local";
    let repoStats = this.fileStatsCache.get(cleanRepo);
    if (!repoStats) {
      repoStats = new Map();
      this.fileStatsCache.set(cleanRepo, repoStats);
    }
    repoStats.set(relPath, { mtimeMs, size });
  }

  clearCache(repoName?: string): void {
    if (repoName) {
      this.metaCache.delete(repoName);
      this.projectConfigCache.delete(repoName);
      this.fileStatsCache.delete(repoName);
    } else {
      this.metaCache.clear();
      this.projectConfigCache.clear();
      this.fileStatsCache.clear();
    }
  }

  loadDocsMetadata(
    repoName: string,
    forceDiskScan = false,
  ): DocumentMetadataItem[] {
    const cleanRepo = repoName || "local";
    const metaPath = this.getDocsMetadataPath(cleanRepo);
    const repoDir = this.getRepoDir(cleanRepo);
    const cached = this.metaCache.get(cleanRepo);

    let currentMtime = 0;
    const exists = fs.existsSync(metaPath);
    if (exists) {
      try {
        currentMtime = fs.statSync(metaPath).mtimeMs;
      } catch {}
    }

    // Se o arquivo não mudou no disco e não foi forçado, retorna cache em O(1) imediatamente (0ms)
    if (cached && !forceDiskScan && exists && cached.mtimeMs === currentMtime) {
      return cached.data.map((d) => ({
        ...d,
        tags: Array.isArray(d.tags) ? [...d.tags] : [],
        approvers: Array.isArray(d.approvers) ? [...d.approvers] : [],
        links: Array.isArray(d.links) ? [...d.links] : [],
      }));
    }

    let metaList: DocumentMetadataItem[] = [];

    if (exists) {
      try {
        const raw = fs.readFileSync(metaPath, "utf-8");
        const parsed = JSON.parse(raw);

        let cachedDepartments: DepartmentConfig[] = DEFAULT_DEPARTMENTS;
        try {
          const config = this.getProjectConfig(cleanRepo);
          if (Array.isArray(config.departments) && config.departments.length > 0) {
            cachedDepartments = config.departments;
          }
        } catch {}

        if (Array.isArray(parsed)) {
          metaList = parsed.map((item) => this.sanitizeMetaItem(item, cleanRepo, cachedDepartments));
        } else if (parsed && typeof parsed === "object" && parsed.documents) {
          // Migração de formato legado
          for (const [relPath, meta] of Object.entries(parsed.documents)) {
            const m = (meta as any) || {};
            const ext = path.extname(relPath).replace(/^\./, "") || "md";
            const name = path.basename(relPath, path.extname(relPath));
            const id = generateDocId(relPath);
            metaList.push(
              this.sanitizeMetaItem({
                id,
                name,
                title: m.title || name,
                ext,
                path: relPath,
                status: m.status || "",
                categories: m.categories || m.category || "",
                tags: Array.isArray(m.tags) ? m.tags : [],
                updated_at: m.updated_at || new Date().toISOString(),
                approvers: Array.isArray(m.approvers) ? m.approvers : [],
                links: Array.isArray(m.links) ? m.links : [],
                templateId: m.templateId || "",
              }, cleanRepo, cachedDepartments),
            );
          }
        }
      } catch (err) {
        console.error(
          `[DocsMetadataService] Erro ao ler docs.metadata.json em ${metaPath}:`,
          err,
        );
      }
    } else if (fs.existsSync(repoDir)) {
      // Se não existe .docs.metadata.json no disco, dispara geração incremental inteligente em segundo plano
      this.scheduleBackgroundReconciliation(cleanRepo);
    }

    const map = new Map(metaList.map((item) => [item.path, item]));
    this.metaCache.set(cleanRepo, {
      data: metaList,
      map,
      mtimeMs: currentMtime,
      timestamp: Date.now(),
    });

    if (forceDiskScan && fs.existsSync(repoDir)) {
      this.scheduleBackgroundReconciliation(cleanRepo);
    }

    return metaList;
  }

  /**
   * Executa reconciliação de metadados em segundo plano de forma 100% assíncrona e incremental.
   * Utiliza cache de mtime/size para pular arquivos inalterados (~99% economia de I/O),
   * liberando o Event Loop em lotes para zero impacto na UI.
   */
  scheduleBackgroundReconciliation(repoName: string): void {
    const cleanRepo = repoName || "local";
    if (this.reconciliationInProgress.has(cleanRepo)) {
      this.reconciliationQueued.add(cleanRepo);
      return;
    }

    this.reconciliationInProgress.add(cleanRepo);
    setImmediate(async () => {
      try {
        const repoDir = this.getRepoDir(cleanRepo);
        if (!fs.existsSync(repoDir)) return;

        const diskFiles: string[] = [];
        const scanDir = (dir: string) => {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (
                entry.name.startsWith(".") ||
                entry.name === "node_modules" ||
                entry.name === "dist" ||
                entry.name === "build" ||
                entry.name === "coverage" ||
                entry.name === ".spec-memory" ||
                entry.name === "templates"
              )
                continue;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                scanDir(full);
              } else if (
                entry.isFile() &&
                (entry.name.endsWith(".md") || entry.name.endsWith(".markdown"))
              ) {
                diskFiles.push(
                  path.relative(repoDir, full).replace(/\\/g, "/"),
                );
              }
            }
          } catch {}
        };
        scanDir(repoDir);

        const currentCached = this.metaCache.get(cleanRepo)?.data || [];
        const metaMap = new Map(currentCached.map((d) => [d.path, { ...d }]));
        let repoStats = this.fileStatsCache.get(cleanRepo);
        if (!repoStats) {
          repoStats = new Map();
          this.fileStatsCache.set(cleanRepo, repoStats);
        }

        // 1. Filtragem inteligente por mtime e size: descobre apenas os arquivos modificados ou novos
        const filesToProcess: { relPath: string; stat: { mtimeMs: number; size: number } }[] = [];
        for (const relPath of diskFiles) {
          const full = path.join(repoDir, relPath);
          try {
            const stat = await fs.promises.stat(full);
            const cachedStat = repoStats.get(relPath);
            const cachedItem = metaMap.get(relPath);

            if (
              cachedItem &&
              cachedStat &&
              cachedStat.mtimeMs === stat.mtimeMs &&
              cachedStat.size === stat.size
            ) {
              // Arquivo idêntico ao já processado. Pula leitura de disco!
              continue;
            }
            filesToProcess.push({
              relPath,
              stat: { mtimeMs: stat.mtimeMs, size: stat.size },
            });
          } catch {
            // Se falhar o stat, continua
          }
        }

        let changed = false;

        // 2. Processa apenas os arquivos modificados em lotes de 25 arquivos com liberação do Event Loop
        const BATCH_SIZE = 25;
        for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
          const batch = filesToProcess.slice(i, i + BATCH_SIZE);
          await Promise.all(
            batch.map(async ({ relPath, stat }) => {
              const item = metaMap.get(relPath);
              const full = path.join(repoDir, relPath);
              let content = "";
              try {
                content = await fs.promises.readFile(full, "utf-8");
              } catch {
                return;
              }

              const extractedLinks = extractDocLinksFromMarkdown(content);
              const extractedTitle = extractDocTitleFromMarkdown(content);
              const frontmatterMeta = extractFrontmatterMeta(content);

              if (item) {
                let itemModified = false;
                const currentLinksJson = JSON.stringify(
                  Array.isArray(item.links) ? item.links : [],
                );
                const extractedLinksJson = JSON.stringify(extractedLinks);
                if (currentLinksJson !== extractedLinksJson) {
                  item.links = extractedLinks;
                  itemModified = true;
                }

                const newTitle =
                  frontmatterMeta.title || extractedTitle || item.title;
                if (newTitle && item.title !== newTitle) {
                  item.title = newTitle;
                  itemModified = true;
                }

                if (
                  frontmatterMeta.status !== undefined &&
                  item.status !== frontmatterMeta.status
                ) {
                  item.status = frontmatterMeta.status;
                  itemModified = true;
                }

                const newCat =
                  frontmatterMeta.categories || frontmatterMeta.category;
                if (newCat !== undefined && item.categories !== newCat) {
                  item.categories = newCat;
                  itemModified = true;
                }

                if (
                  Array.isArray(frontmatterMeta.tags) &&
                  !areArraysEqual(item.tags, frontmatterMeta.tags)
                ) {
                  item.tags = frontmatterMeta.tags;
                  itemModified = true;
                }

                if (
                  frontmatterMeta.department !== undefined &&
                  item.department !== frontmatterMeta.department
                ) {
                  item.department = frontmatterMeta.department;
                  itemModified = true;
                }

                if (
                  frontmatterMeta.templateId !== undefined &&
                  item.templateId !== frontmatterMeta.templateId
                ) {
                  item.templateId = frontmatterMeta.templateId;
                  itemModified = true;
                }

                if (
                  Array.isArray(frontmatterMeta.approvers) &&
                  !areArraysEqual(item.approvers, frontmatterMeta.approvers)
                ) {
                  item.approvers = frontmatterMeta.approvers;
                  itemModified = true;
                }

                if (itemModified) {
                  metaMap.set(relPath, this.sanitizeMetaItem(item, cleanRepo));
                  changed = true;
                }
              } else {
                const name = path.basename(relPath, path.extname(relPath));
                const ext = path.extname(relPath).replace(/^\./, "") || "md";
                metaMap.set(
                  relPath,
                  this.sanitizeMetaItem({
                    id: generateDocId(relPath),
                    name,
                    title: frontmatterMeta.title || extractedTitle || name,
                    ext,
                    path: relPath,
                    status: frontmatterMeta.status || "",
                    categories:
                      frontmatterMeta.categories ||
                      frontmatterMeta.category ||
                      "",
                    tags: frontmatterMeta.tags || [],
                    department: frontmatterMeta.department,
                    templateId: frontmatterMeta.templateId || "",
                    approvers: frontmatterMeta.approvers || [],
                    updated_at: new Date().toISOString(),
                    links: extractedLinks,
                  }, cleanRepo),
                );
                changed = true;
              }

              repoStats.set(relPath, stat);
            }),
          );

          // Libera o Event Loop
          await new Promise((resolve) => setImmediate(resolve));
        }

        // 3. Remove arquivos que foram deletados do disco
        const diskSet = new Set(diskFiles);
        for (const key of metaMap.keys()) {
          if (!diskSet.has(key)) {
            metaMap.delete(key);
            repoStats.delete(key);
            changed = true;
          }
        }

        this.fileStatsCache.set(cleanRepo, repoStats);

        if (changed) {
          const metaList = Array.from(metaMap.values());
          this.saveDocsMetadata(cleanRepo, metaList);
        }
      } catch (err) {
        console.warn(
          `[DocsMetadataService] Erro na reconciliação de segundo plano em ${cleanRepo}:`,
          err,
        );
      } finally {
        this.reconciliationInProgress.delete(cleanRepo);
        if (this.reconciliationQueued.has(cleanRepo)) {
          this.reconciliationQueued.delete(cleanRepo);
          this.scheduleBackgroundReconciliation(cleanRepo);
        }
      }
    });
  }

  saveDocsMetadata(repoName: string, metaList: DocumentMetadataItem[]): void {
    const cleanRepo = repoName || "local";
    const metaPath = this.getDocsMetadataPath(cleanRepo);
    const sanitizedList = metaList.map((item) =>
      this.sanitizeMetaItem(item, cleanRepo),
    );

    // Comparação profunda de objetos: se nada de fato mudou, pula escrita no disco!
    const cached = this.metaCache.get(cleanRepo);
    if (
      cached &&
      areMetadataListsEqual(cached.data, sanitizedList) &&
      fs.existsSync(metaPath)
    ) {
      return;
    }

    const map = new Map(sanitizedList.map((item) => [item.path, item]));
    writeJsonAtomic(metaPath, sanitizedList, 2);

    let currentMtime = Date.now();
    try {
      currentMtime = fs.statSync(metaPath).mtimeMs;
    } catch {}

    this.metaCache.set(cleanRepo, {
      data: sanitizedList.map((d) => ({
        ...d,
        tags: Array.isArray(d.tags) ? [...d.tags] : [],
        approvers: Array.isArray(d.approvers) ? [...d.approvers] : [],
        links: Array.isArray(d.links) ? [...d.links] : [],
      })),
      map,
      mtimeMs: currentMtime,
      timestamp: Date.now(),
    });
  }

  /**
   * Sincroniza metadados existentes de .docs.metadata.json para o cabeçalho
   * YAML Frontmatter dos arquivos .md físicos de forma transparente e em segundo plano.
   */
  async syncMetadataToFrontmatters(
    repoName: string,
  ): Promise<{ synced: number; total: number }> {
    const cleanRepo = repoName || "local";
    const repoDir = this.getRepoDir(cleanRepo);
    if (!fs.existsSync(repoDir)) return { synced: 0, total: 0 };

    const metaList = this.loadDocsMetadata(cleanRepo);
    let synced = 0;
    const BATCH_SIZE = 15;

    for (let i = 0; i < metaList.length; i += BATCH_SIZE) {
      const batch = metaList.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (doc) => {
          if (
            !doc.path ||
            !(doc.path.endsWith(".md") || doc.path.endsWith(".markdown"))
          ) {
            return;
          }
          const fullPath = path.join(repoDir, doc.path);
          if (!fs.existsSync(fullPath)) return;

          try {
            const content = await fs.promises.readFile(fullPath, "utf-8");
            const existingFrontmatter = extractFrontmatterMeta(content);

            const needsSync =
              (!existingFrontmatter.title && Boolean(doc.title)) ||
              (Boolean(doc.status) && existingFrontmatter.status !== doc.status) ||
              (Boolean(doc.categories) &&
                existingFrontmatter.categories !== doc.categories) ||
              (Boolean(doc.department) &&
                existingFrontmatter.department !== doc.department) ||
              (Boolean(doc.templateId) &&
                existingFrontmatter.templateId !== doc.templateId) ||
              (Array.isArray(doc.tags) &&
                doc.tags.length > 0 &&
                !areArraysEqual(existingFrontmatter.tags, doc.tags));

            if (needsSync) {
              const syncPayload: Record<string, any> = {};
              if (doc.title) syncPayload.title = doc.title;
              if (doc.status) syncPayload.status = doc.status;
              if (doc.categories) syncPayload.categories = doc.categories;
              if (doc.department) syncPayload.department = doc.department;
              if (doc.templateId) syncPayload.templateId = doc.templateId;
              if (doc.tags && doc.tags.length > 0) syncPayload.tags = doc.tags;
              if (doc.approvers && doc.approvers.length > 0)
                syncPayload.approvers = doc.approvers;

              const updatedMarkdown = updateFrontmatterInMarkdown(
                content,
                syncPayload,
              );
              if (updatedMarkdown !== content) {
                await fs.promises.writeFile(fullPath, updatedMarkdown, "utf-8");
                const newStat = await fs.promises.stat(fullPath);
                this.setFileStat(
                  cleanRepo,
                  doc.path,
                  newStat.mtimeMs,
                  newStat.size,
                );
                synced++;
              }
            }
          } catch (err) {
            console.warn(
              `[DocsMetadataService] Erro ao sincronizar frontmatter para ${doc.path}:`,
              err,
            );
          }
        }),
      );
      await new Promise((resolve) => setImmediate(resolve));
    }

    return { synced, total: metaList.length };
  }

  getDocMetadata(repoName: string, filePath: string): DocumentMetadataItem {
    const cleanRepo = repoName || "local";
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    this.loadDocsMetadata(cleanRepo);
    const cached = this.metaCache.get(cleanRepo);
    const existing = cached?.map.get(cleanPath);
    if (existing) return existing;

    const ext = path.extname(cleanPath).replace(/^\./, "") || "md";
    const name = path.basename(cleanPath, path.extname(cleanPath));

    let title = name;
    let frontmatterMeta: any = {};
    const fullPath = path.join(this.getRepoDir(cleanRepo), cleanPath);
    if (fs.existsSync(fullPath) && (ext === "md" || ext === "markdown")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        frontmatterMeta = extractFrontmatterMeta(content);
        title = frontmatterMeta.title || extractDocTitleFromMarkdown(content) || name;
      } catch {}
    }

    const item = this.sanitizeMetaItem({
      id: generateDocId(cleanPath),
      name,
      title,
      ext,
      path: cleanPath,
      status: frontmatterMeta.status || "",
      categories: frontmatterMeta.categories || frontmatterMeta.category || "",
      tags: Array.isArray(frontmatterMeta.tags) ? frontmatterMeta.tags : [],
      updated_at: new Date().toISOString(),
      approvers: [],
      links: [],
      templateId: "",
    }, cleanRepo);

    if (cached) {
      cached.map.set(cleanPath, item);
      cached.data.push(item);
    }

    return item;
  }

  updateDocMetadataItem(
    repoName: string,
    filePath: string,
    partialMeta: Partial<DocumentMetadataItem>,
  ): { success: boolean; meta: DocumentMetadataItem } {
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const metaList = this.loadDocsMetadata(repoName);
    const existingIdx = metaList.findIndex((d) => d.path === cleanPath);

    let updatedItem: DocumentMetadataItem;
    if (existingIdx >= 0) {
      updatedItem = this.sanitizeMetaItem({
        ...metaList[existingIdx],
        ...partialMeta,
        path: cleanPath,
        updated_at: new Date().toISOString(),
      });
      metaList[existingIdx] = updatedItem;
    } else {
      const ext = path.extname(cleanPath).replace(/^\./, "") || "md";
      const name = path.basename(cleanPath, path.extname(cleanPath));
      updatedItem = this.sanitizeMetaItem({
        id: generateDocId(cleanPath),
        name,
        title: partialMeta.title || name,
        ext,
        path: cleanPath,
        status: partialMeta.status || "",
        categories: partialMeta.categories || "",
        tags: Array.isArray(partialMeta.tags) ? partialMeta.tags : [],
        updated_at: new Date().toISOString(),
        approvers: Array.isArray(partialMeta.approvers)
          ? partialMeta.approvers
          : [],
        links: Array.isArray(partialMeta.links) ? partialMeta.links : [],
        templateId: partialMeta.templateId || "",
        ...partialMeta,
      });
      metaList.push(updatedItem);
    }

    this.saveDocsMetadata(repoName, metaList);

    // Se o arquivo físico existir e for markdown, sincroniza o Frontmatter no arquivo .md
    try {
      const fullPath = path.join(this.getRepoDir(repoName), cleanPath);
      if (
        fs.existsSync(fullPath) &&
        (cleanPath.endsWith(".md") || cleanPath.endsWith(".markdown"))
      ) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        const frontmatterSyncPayload: Record<string, any> = {};
        if (partialMeta.title !== undefined) frontmatterSyncPayload.title = partialMeta.title;
        if (partialMeta.type !== undefined) frontmatterSyncPayload.type = partialMeta.type;
        if (partialMeta.badge !== undefined) frontmatterSyncPayload.badge = partialMeta.badge;
        if (partialMeta.status !== undefined) frontmatterSyncPayload.status = partialMeta.status;
        if (partialMeta.categories !== undefined) frontmatterSyncPayload.categories = partialMeta.categories;
        if (partialMeta.category !== undefined) frontmatterSyncPayload.categories = partialMeta.category;
        if (partialMeta.tags !== undefined) frontmatterSyncPayload.tags = partialMeta.tags;
        if (partialMeta.department !== undefined) frontmatterSyncPayload.department = partialMeta.department;
        if (partialMeta.templateId !== undefined) frontmatterSyncPayload.templateId = partialMeta.templateId;
        if (partialMeta.approvers !== undefined) frontmatterSyncPayload.approvers = partialMeta.approvers;

        const updatedMarkdown = updateFrontmatterInMarkdown(fileContent, frontmatterSyncPayload);
        if (updatedMarkdown !== fileContent) {
          writeTextAtomic(fullPath, updatedMarkdown);
          try {
            const stat = fs.statSync(fullPath);
            this.setFileStat(repoName, cleanPath, stat.mtimeMs, stat.size);
          } catch {}
        }
      }
    } catch (e) {
      console.warn("[DocsMetadataService] Erro ao sincronizar frontmatter no disco:", e);
    }

    return { success: true, meta: updatedItem };
  }

  deleteDocMetadata(repoName: string, filePath: string): void {
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const metaList = this.loadDocsMetadata(repoName);
    const filtered = metaList.filter((d) => d.path !== cleanPath);
    if (filtered.length !== metaList.length) {
      this.saveDocsMetadata(repoName, filtered);
    }
  }

  renameDocMetadata(repoName: string, oldPath: string, newPath: string): void {
    const cleanOld = (oldPath || "").trim().replace(/^\/+/, "");
    const cleanNew = (newPath || "").trim().replace(/^\/+/, "");
    const metaList = this.loadDocsMetadata(repoName);
    const existingIdx = metaList.findIndex((d) => d.path === cleanOld);

    if (existingIdx >= 0) {
      const ext = path.extname(cleanNew).replace(/^\./, "") || "md";
      const name = path.basename(cleanNew, path.extname(cleanNew));
      metaList[existingIdx] = this.sanitizeMetaItem({
        ...metaList[existingIdx],
        id: generateDocId(cleanNew),
        name,
        path: cleanNew,
        ext,
        updated_at: new Date().toISOString(),
      });
      this.saveDocsMetadata(repoName, metaList);
    }
  }

  migrateDocMetadata(
    sourceRepo: string,
    targetRepo: string,
    oldPath: string,
    newPath: string,
  ): void {
    const cleanOld = (oldPath || "").trim().replace(/^\/+/, "");
    const cleanNew = (newPath || "").trim().replace(/^\/+/, "");
    const sourceList = this.loadDocsMetadata(sourceRepo);
    const targetList = this.loadDocsMetadata(targetRepo);

    const itemsToMigrate = sourceList.filter(
      (d) => d.path === cleanOld || d.path.startsWith(`${cleanOld}/`),
    );

    if (itemsToMigrate.length === 0) return;

    // Remove from source
    const updatedSource = sourceList.filter(
      (d) => !(d.path === cleanOld || d.path.startsWith(`${cleanOld}/`)),
    );
    this.saveDocsMetadata(sourceRepo, updatedSource);

    // Add/update in target
    for (const item of itemsToMigrate) {
      let migratedPath = cleanNew;
      if (item.path.startsWith(`${cleanOld}/`)) {
        migratedPath = `${cleanNew}${item.path.slice(cleanOld.length)}`;
      }
      const ext = path.extname(migratedPath).replace(/^\./, "") || "md";
      const name = path.basename(migratedPath, path.extname(migratedPath));

      const existingTargetIdx = targetList.findIndex(
        (d) => d.path === migratedPath,
      );
      const migratedItem = this.sanitizeMetaItem({
        ...item,
        id: generateDocId(migratedPath),
        name,
        path: migratedPath,
        ext,
        updated_at: new Date().toISOString(),
      });

      if (existingTargetIdx >= 0) {
        targetList[existingTargetIdx] = migratedItem;
      } else {
        targetList.push(migratedItem);
      }
    }

    this.saveDocsMetadata(targetRepo, targetList);
  }

  detachTemplateFromDocs(repoName: string, templateId: string): number {
    const cleanRepo = repoName || "local";
    const targetSlug = (templateId || "")
      .toLowerCase()
      .trim()
      .replace(/\.md$/, "");
    if (!targetSlug) return 0;

    const metaList = this.loadDocsMetadata(cleanRepo);
    let count = 0;
    for (const doc of metaList) {
      const docTplSlug = (doc.templateId || "")
        .toLowerCase()
        .trim()
        .replace(/\.md$/, "");
      if (docTplSlug && docTplSlug === targetSlug) {
        doc.templateId = "";
        doc.updated_at = new Date().toISOString();
        count++;
      }
    }

    if (count > 0) {
      this.saveDocsMetadata(cleanRepo, metaList);
    }
    return count;
  }

  /**
   * Resolução de Vizinhança de Grafo (1º e 2º graus)
   */
  getDocumentNeighborhood(repoName: string, filePath: string, depth = 1) {
    const cleanRepo = repoName || "local";
    const cleanPath = (filePath || "").replace(/^\/+/, "");
    const metaList = this.loadDocsMetadata(cleanRepo);
    const targetDoc = metaList.find(
      (d) => d.path === cleanPath || d.id === generateDocId(cleanPath),
    );

    if (!targetDoc)
      return { target: null, outgoing: [], incoming: [], second_degree: [] };

    // 1º Grau: Outgoing (Links que este documento aponta)
    const outgoingDocs = (targetDoc.links || [])
      .map((targetLink) => {
        const cleanTarget = targetLink.split("#")[0].replace(/^\.?\//, "");
        return metaList.find(
          (d) =>
            d.path === cleanTarget ||
            d.id === cleanTarget ||
            d.path.endsWith(cleanTarget),
        );
      })
      .filter((d): d is DocumentMetadataItem => Boolean(d));

    // 1º Grau: Incoming (Documentos que apontam para este)
    const incomingDocs = metaList.filter(
      (d) =>
        d.path !== targetDoc.path &&
        Array.isArray(d.links) &&
        d.links.some(
          (l) =>
            l.includes(cleanPath) ||
            l.includes(targetDoc.id) ||
            (targetDoc.name && l.includes(targetDoc.name)),
        ),
    );

    // 2º Grau (se solicitado)
    const secondDegreeDocs: DocumentMetadataItem[] = [];
    if (depth >= 2) {
      const firstDegreePaths = new Set([
        targetDoc.path,
        ...outgoingDocs.map((d) => d.path),
        ...incomingDocs.map((d) => d.path),
      ]);
      for (const firstDoc of [...outgoingDocs, ...incomingDocs]) {
        for (const link of firstDoc.links || []) {
          const cleanL = link.split("#")[0].replace(/^\.?\//, "");
          const match = metaList.find(
            (d) => d.path === cleanL || d.id === cleanL,
          );
          if (
            match &&
            !firstDegreePaths.has(match.path) &&
            !secondDegreeDocs.some((d) => d.path === match.path)
          ) {
            secondDegreeDocs.push(match);
          }
        }
      }
    }

    return {
      target: targetDoc,
      outgoing: outgoingDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
        categories: d.categories,
      })),
      incoming: incomingDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
        categories: d.categories,
      })),
      second_degree: secondDegreeDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
      })),
    };
  }

  /**
   * Monta o Context Bundle completo para o Agente e Editor
   */
  buildDocumentContextBundle(
    repoName: string,
    filePath: string,
  ): {
    filePath: string;
    neighborhood: any;
    relevantApprovedSpecs: any[];
    contextPromptSnippet: string;
  } {
    const cleanRepo = repoName || "local";
    const cleanPath = (filePath || "").replace(/^\/+/, "");
    const neighborhood = this.getDocumentNeighborhood(cleanRepo, cleanPath, 2);
    const metaList = this.loadDocsMetadata(cleanRepo);

    // Specs aprovadas relevantes
    const approvedSpecs = metaList
      .filter(
        (d) => d.status?.toLowerCase() === "approved" && d.path !== cleanPath,
      )
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        categories: d.categories,
      }));

    let snippet = `\n### Contexto do Grafo de Documentação Viva (${cleanPath}):\n`;
    if (neighborhood.target) {
      snippet += `- **Status do Doc:** ${neighborhood.target.status || "-"} | **Categoria:** ${neighborhood.target.categories || "geral"}\n`;
    }
    if (neighborhood.outgoing.length > 0) {
      snippet += `- **Dependências (Links de Saída):** ${neighborhood.outgoing.map((d: any) => `[${d.title}](${d.path}) [${d.status}]`).join(", ")}\n`;
    }
    if (neighborhood.incoming.length > 0) {
      snippet += `- **Documentos que dependem deste:** ${neighborhood.incoming.map((d: any) => `[${d.title}](${d.path}) [${d.status}]`).join(", ")}\n`;
    }
    if (approvedSpecs.length > 0) {
      snippet += `- **Specs Canônicas Aprovadas:** ${approvedSpecs.map((s) => `[${s.title}](${s.path})`).join(", ")}\n`;
    }

    return {
      filePath: cleanPath,
      neighborhood,
      relevantApprovedSpecs: approvedSpecs,
      contextPromptSnippet: snippet,
    };
  }

  private sanitizeMetaItem(item: any, repoName?: string, cachedDepartments?: DepartmentConfig[]): DocumentMetadataItem {
    const cleanItem = { ...item };
    // Remove layer e badge se existirem
    delete cleanItem.layer;
    delete cleanItem.badge;

    // Normaliza category para categories
    if (cleanItem.category && !cleanItem.categories) {
      cleanItem.categories = cleanItem.category;
      delete cleanItem.category;
    }

    let resolvedDept = cleanItem.department;
    if (!resolvedDept && cleanItem.path) {
      const inferred = this.inferDepartmentFromPath(cleanItem.path, repoName, cachedDepartments);
      resolvedDept = inferred.department;
    }

    return {
      id: cleanItem.id || generateDocId(cleanItem.path || "doc"),
      name:
        cleanItem.name ||
        path.basename(
          cleanItem.path || "doc",
          path.extname(cleanItem.path || ""),
        ),
      title: cleanItem.title || cleanItem.name || "",
      ext: cleanItem.ext || "md",
      path: cleanItem.path || "",
      status: cleanItem.status || "",
      categories: cleanItem.categories || "",
      tags: Array.isArray(cleanItem.tags) ? cleanItem.tags : [],
      updated_at: cleanItem.updated_at || new Date().toISOString(),
      approvers: Array.isArray(cleanItem.approvers) ? cleanItem.approvers : [],
      links: Array.isArray(cleanItem.links) ? cleanItem.links : [],
      templateId: cleanItem.templateId || "",
      prompt: cleanItem.prompt || "",
      department: resolvedDept,
    };
  }
}

export const docsMetadataService = new DocsMetadataService();
