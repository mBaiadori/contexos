import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "../../utils/atomic-write.js";
import { executeGit } from "../../utils/git-core.js";
import {
  DEFAULT_DEPARTMENTS,
  DepartmentConfig,
} from "../governance/governance.types.js";
import {
  generateDocId,
  areArraysEqual,
  areMetadataListsEqual,
  extractDocLinksFromMarkdown,
  extractDocTitleFromMarkdown,
  extractFrontmatterMeta,
  updateFrontmatterInMarkdown,
  type DocumentMetadataItem,
} from "./docs-metadata-parser.js";
import { docsMetadataConfigService } from "./docs-metadata-config.service.js";

interface MetadataCacheEnvelope {
  version: 2;
  headHash?: string;
  fileStats?: Record<string, { mtimeMs: number; size: number }>;
  items: DocumentMetadataItem[];
}

const IGNORED_SCAN_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  "templates",
]);

function isMarkdownDocPath(relPath: string): boolean {
  if (!relPath) return false;
  const normalized = relPath.replace(/\\/g, "/");
  if (!(normalized.endsWith(".md") || normalized.endsWith(".markdown"))) {
    return false;
  }
  const segments = normalized.split("/");
  return !segments.some((seg) => seg.startsWith(".") || IGNORED_SCAN_DIRS.has(seg));
}

export class DocsMetadataCrudService {
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
  private headHashCache = new Map<string, string>();
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
      docsMetadataConfigService.clearProjectConfigCache(repoName);
      this.fileStatsCache.delete(repoName);
      this.headHashCache.delete(repoName);
    } else {
      this.metaCache.clear();
      docsMetadataConfigService.clearProjectConfigCache();
      this.fileStatsCache.clear();
      this.headHashCache.clear();
    }
  }

  sanitizeMetaItem(
    item: Record<string, unknown>,
    repoName?: string,
    cachedDepartments?: DepartmentConfig[],
  ): DocumentMetadataItem {
    const cleanItem = { ...item };
    delete cleanItem.layer;

    if (cleanItem.category && !cleanItem.categories) {
      cleanItem.categories = cleanItem.category;
      delete cleanItem.category;
    }

    let resolvedDept = cleanItem.department as string | undefined;
    if (!resolvedDept && cleanItem.path) {
      const inferred = docsMetadataConfigService.inferDepartmentFromPath(
        cleanItem.path as string,
        repoName,
        cachedDepartments,
      );
      resolvedDept = inferred.department;
    }

    const badge =
      typeof cleanItem.badge === "string" && cleanItem.badge.trim()
        ? cleanItem.badge.trim()
        : undefined;
    const classification =
      typeof cleanItem.classification === "string" &&
      cleanItem.classification.trim()
        ? cleanItem.classification.trim()
        : undefined;

    return {
      id: (cleanItem.id as string) || generateDocId((cleanItem.path as string) || "doc"),
      name:
        (cleanItem.name as string) ||
        path.basename(
          (cleanItem.path as string) || "doc",
          path.extname((cleanItem.path as string) || ""),
        ),
      title: (cleanItem.title as string) || (cleanItem.name as string) || "",
      ext: (cleanItem.ext as string) || "md",
      path: (cleanItem.path as string) || "",
      status: (cleanItem.status as string) || "",
      categories: (cleanItem.categories as string) || "",
      tags: Array.isArray(cleanItem.tags) ? (cleanItem.tags as string[]) : [],
      updated_at: (cleanItem.updated_at as string) || new Date().toISOString(),
      approvers: Array.isArray(cleanItem.approvers) ? (cleanItem.approvers as string[]) : [],
      links: Array.isArray(cleanItem.links) ? (cleanItem.links as string[]) : [],
      templateId: (cleanItem.templateId as string) || "",
      prompt: (cleanItem.prompt as string) || "",
      department: resolvedDept,
      ...(badge ? { badge } : {}),
      ...(classification ? { classification } : {}),
    };
  }

  private async getGitDelta(
    repoDir: string,
    cachedHeadHash?: string,
  ): Promise<
    | {
        supported: false;
      }
    | {
        supported: true;
        headHash: string;
        upToDate: boolean;
        changedPaths?: string[];
      }
  > {
    if (!fs.existsSync(path.join(repoDir, ".git"))) {
      return { supported: false };
    }

    const headRes = await executeGit(["rev-parse", "HEAD"], repoDir);
    if (!headRes.success || !headRes.stdout?.trim()) {
      return { supported: false };
    }
    const headHash = headRes.stdout.trim();

    if (!cachedHeadHash) {
      return { supported: true, headHash, upToDate: false };
    }

    const statusRes = await executeGit(
      ["status", "--porcelain=v1", "-b", "-uall"],
      repoDir,
    );
    if (!statusRes.success) {
      return { supported: false };
    }

    const dirtyPaths = new Set<string>();
    const rawLines = (statusRes.stdout || "").split("\n");
    for (const rawLine of rawLines) {
      if (!rawLine || rawLine.startsWith("## ") || rawLine.length < 4) continue;
      let pathPart = rawLine.slice(3).trim();
      if (pathPart.includes(" -> ")) {
        const parts = pathPart.split(" -> ");
        if (isMarkdownDocPath(parts[0])) dirtyPaths.add(parts[0].replace(/\\/g, "/"));
        pathPart = parts[1];
      }
      const unquoted =
        pathPart.startsWith('"') && pathPart.endsWith('"')
          ? pathPart.slice(1, -1)
          : pathPart;
      if (isMarkdownDocPath(unquoted)) {
        dirtyPaths.add(unquoted.replace(/\\/g, "/"));
      }
    }

    if (cachedHeadHash === headHash) {
      if (dirtyPaths.size === 0) {
        return { supported: true, headHash, upToDate: true };
      }
      return {
        supported: true,
        headHash,
        upToDate: false,
        changedPaths: Array.from(dirtyPaths),
      };
    }

    const diffRes = await executeGit(
      ["diff", "--name-only", cachedHeadHash, headHash],
      repoDir,
    );
    if (!diffRes.success) {
      return { supported: true, headHash, upToDate: false };
    }

    for (const line of (diffRes.stdout || "").split("\n")) {
      const clean = line.trim().replace(/\\/g, "/");
      if (isMarkdownDocPath(clean)) {
        dirtyPaths.add(clean);
      }
    }

    return {
      supported: true,
      headHash,
      upToDate: dirtyPaths.size === 0,
      changedPaths: Array.from(dirtyPaths),
    };
  }

  private parseCachePayload(
    parsed: unknown,
    cleanRepo: string,
  ): {
    metaList: DocumentMetadataItem[];
    headHash?: string;
    fileStats?: Record<string, { mtimeMs: number; size: number }>;
  } {
    let cachedDepartments: DepartmentConfig[] = DEFAULT_DEPARTMENTS;
    try {
      const config = docsMetadataConfigService.getProjectConfig(cleanRepo);
      if (Array.isArray(config.departments) && config.departments.length > 0) {
        cachedDepartments = config.departments as DepartmentConfig[];
      }
    } catch {}

    if (Array.isArray(parsed)) {
      return {
        metaList: parsed.map((item) =>
          this.sanitizeMetaItem(item, cleanRepo, cachedDepartments),
        ),
      };
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        return {
          metaList: obj.items.map((item) =>
            this.sanitizeMetaItem(
              (item as Record<string, unknown>) || {},
              cleanRepo,
              cachedDepartments,
            ),
          ),
          headHash: typeof obj.headHash === "string" ? obj.headHash : undefined,
          fileStats:
            obj.fileStats && typeof obj.fileStats === "object"
              ? (obj.fileStats as Record<string, { mtimeMs: number; size: number }>)
              : undefined,
        };
      }

      if (obj.documents && typeof obj.documents === "object") {
        const metaList: DocumentMetadataItem[] = [];
        for (const [relPath, meta] of Object.entries(obj.documents)) {
          const m = (meta as Record<string, unknown>) || {};
          const ext = path.extname(relPath).replace(/^\./, "") || "md";
          const name = path.basename(relPath, path.extname(relPath));
          const id = generateDocId(relPath);
          metaList.push(
            this.sanitizeMetaItem(
              {
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
              },
              cleanRepo,
              cachedDepartments,
            ),
          );
        }
        return { metaList };
      }
    }

    return { metaList: [] };
  }

  loadDocsMetadata(
    repoName: string,
    forceDiskScan = false,
  ): DocumentMetadataItem[] {
    const cleanRepo = repoName || "local";
    const metaPath = docsMetadataConfigService.getDocsMetadataPath(cleanRepo);
    const repoDir = docsMetadataConfigService.getRepoDir(cleanRepo);
    const cached = this.metaCache.get(cleanRepo);

    let currentMtime = 0;
    const exists = fs.existsSync(metaPath);
    if (exists) {
      try {
        currentMtime = fs.statSync(metaPath).mtimeMs;
      } catch {}
    }

    // Se o cache externo não mudou no disco e não foi forçado, retorna cache em O(1) imediatamente (0ms)
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
        const envelope = this.parseCachePayload(parsed, cleanRepo);
        metaList = envelope.metaList;

        if (envelope.headHash) {
          this.headHashCache.set(cleanRepo, envelope.headHash);
        }
        if (envelope.fileStats) {
          const statsMap = new Map<string, { mtimeMs: number; size: number }>();
          for (const [relPath, st] of Object.entries(envelope.fileStats)) {
            if (st && typeof st.mtimeMs === "number" && typeof st.size === "number") {
              statsMap.set(relPath, { mtimeMs: st.mtimeMs, size: st.size });
            }
          }
          this.fileStatsCache.set(cleanRepo, statsMap);
        }
      } catch (err) {
        console.error(
          `[DocsMetadataService] Erro ao ler cache de metadados em ${metaPath}:`,
          err,
        );
      }
    } else if (fs.existsSync(repoDir)) {
      // Semente única de legado (somente leitura) caso exista .docs.metadata.json antigo no repositório
      const legacyPath = docsMetadataConfigService.getLegacyRepoMetadataPath(cleanRepo);
      if (legacyPath) {
        try {
          const rawLegacy = fs.readFileSync(legacyPath, "utf-8");
          const envelope = this.parseCachePayload(JSON.parse(rawLegacy), cleanRepo);
          metaList = envelope.metaList;
        } catch {}
      }
      // Dispara reconciliação incremental em segundo plano a partir dos arquivos .md
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

  scheduleBackgroundReconciliation(repoName: string): void {
    const cleanRepo = repoName || "local";
    if (this.reconciliationInProgress.has(cleanRepo)) {
      this.reconciliationQueued.add(cleanRepo);
      return;
    }

    this.reconciliationInProgress.add(cleanRepo);
    setImmediate(async () => {
      try {
        const repoDir = docsMetadataConfigService.getRepoDir(cleanRepo);
        if (!fs.existsSync(repoDir)) return;

        // Garante hidratação prévia do cache externo em cold start antes de reconciliar
        if (!this.metaCache.has(cleanRepo)) {
          const metaPath = docsMetadataConfigService.getDocsMetadataPath(cleanRepo);
          if (fs.existsSync(metaPath)) {
            this.loadDocsMetadata(cleanRepo, false);
          }
        }

        const currentCached = this.metaCache.get(cleanRepo)?.data || [];
        const metaMap = new Map(currentCached.map((d) => [d.path, { ...d }]));
        let repoStats = this.fileStatsCache.get(cleanRepo);
        if (!repoStats) {
          repoStats = new Map();
          this.fileStatsCache.set(cleanRepo, repoStats);
        }

        const cachedHeadHash = this.headHashCache.get(cleanRepo);
        const gitDelta =
          metaMap.size > 0
            ? await this.getGitDelta(repoDir, cachedHeadHash)
            : await this.getGitDelta(repoDir, undefined);

        let nextHeadHash = gitDelta.supported ? gitDelta.headHash : undefined;

        if (gitDelta.supported && gitDelta.upToDate && metaMap.size > 0) {
          if (nextHeadHash && nextHeadHash !== cachedHeadHash) {
            this.headHashCache.set(cleanRepo, nextHeadHash);
            this.saveDocsMetadata(cleanRepo, Array.from(metaMap.values()), true);
          }
          return;
        }

        let targetFiles: string[] = [];
        let isPartialDelta = false;

        if (gitDelta.supported && gitDelta.changedPaths && metaMap.size > 0) {
          targetFiles = gitDelta.changedPaths;
          isPartialDelta = true;
        } else {
          const scanDir = (dir: string) => {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.name.startsWith(".") || IGNORED_SCAN_DIRS.has(entry.name)) {
                  continue;
                }
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  scanDir(full);
                } else if (
                  entry.isFile() &&
                  (entry.name.endsWith(".md") || entry.name.endsWith(".markdown"))
                ) {
                  targetFiles.push(
                    path.relative(repoDir, full).replace(/\\/g, "/"),
                  );
                }
              }
            } catch {}
          };
          scanDir(repoDir);
        }

        let changed = false;
        const filesToProcess: { relPath: string; stat: { mtimeMs: number; size: number } }[] = [];

        for (const relPath of targetFiles) {
          const full = path.join(repoDir, relPath);
          if (!fs.existsSync(full)) {
            if (metaMap.has(relPath)) {
              metaMap.delete(relPath);
              repoStats.delete(relPath);
              changed = true;
            }
            continue;
          }

          try {
            const stat = await fs.promises.stat(full);
            if (!stat.isFile()) continue;
            const cachedStat = repoStats.get(relPath);
            const cachedItem = metaMap.get(relPath);

            if (
              cachedItem &&
              cachedStat &&
              cachedStat.mtimeMs === stat.mtimeMs &&
              cachedStat.size === stat.size
            ) {
              continue;
            }
            filesToProcess.push({
              relPath,
              stat: { mtimeMs: stat.mtimeMs, size: stat.size },
            });
          } catch {}
        }

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
                  item.categories = newCat as string;
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
                  frontmatterMeta.badge !== undefined &&
                  item.badge !== frontmatterMeta.badge
                ) {
                  item.badge = frontmatterMeta.badge;
                  itemModified = true;
                }

                if (
                  frontmatterMeta.classification !== undefined &&
                  item.classification !== frontmatterMeta.classification
                ) {
                  item.classification = frontmatterMeta.classification;
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
                    badge: frontmatterMeta.badge,
                    classification: frontmatterMeta.classification,
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

          await new Promise((resolve) => setImmediate(resolve));
        }

        // 3. No scan completo, remove arquivos que foram deletados do disco
        if (!isPartialDelta) {
          const diskSet = new Set(targetFiles);
          for (const key of metaMap.keys()) {
            if (!diskSet.has(key)) {
              metaMap.delete(key);
              repoStats.delete(key);
              changed = true;
            }
          }
        }

        this.fileStatsCache.set(cleanRepo, repoStats);
        if (nextHeadHash) {
          this.headHashCache.set(cleanRepo, nextHeadHash);
        }

        const metaPath = docsMetadataConfigService.getDocsMetadataPath(cleanRepo);
        if (
          changed ||
          !fs.existsSync(metaPath) ||
          (nextHeadHash && nextHeadHash !== cachedHeadHash)
        ) {
          const metaList = Array.from(metaMap.values());
          this.saveDocsMetadata(cleanRepo, metaList, true);
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

  saveDocsMetadata(
    repoName: string,
    metaList: DocumentMetadataItem[],
    forceEnvelopeWrite = false,
  ): void {
    const cleanRepo = repoName || "local";
    const metaPath = docsMetadataConfigService.getDocsMetadataPath(cleanRepo);
    const sanitizedList = metaList.map((item) =>
      this.sanitizeMetaItem(item, cleanRepo),
    );

    // Comparação profunda de objetos: se nada de fato mudou, pula escrita no disco!
    const cached = this.metaCache.get(cleanRepo);
    if (
      !forceEnvelopeWrite &&
      cached &&
      areMetadataListsEqual(cached.data, sanitizedList) &&
      fs.existsSync(metaPath)
    ) {
      return;
    }

    const map = new Map(sanitizedList.map((item) => [item.path, item]));
    const statsMap = this.fileStatsCache.get(cleanRepo);
    const envelope: MetadataCacheEnvelope = {
      version: 2,
      ...(this.headHashCache.has(cleanRepo)
        ? { headHash: this.headHashCache.get(cleanRepo) }
        : {}),
      ...(statsMap && statsMap.size > 0
        ? { fileStats: Object.fromEntries(statsMap.entries()) }
        : {}),
      items: sanitizedList,
    };

    writeJsonAtomic(metaPath, envelope, 2);

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

  async syncMetadataToFrontmatters(
    repoName: string,
  ): Promise<{ synced: number; total: number }> {
    const cleanRepo = repoName || "local";
    const repoDir = docsMetadataConfigService.getRepoDir(cleanRepo);
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
              (Boolean(doc.badge) && existingFrontmatter.badge !== doc.badge) ||
              (Boolean(doc.classification) &&
                existingFrontmatter.classification !== doc.classification) ||
              (Boolean(doc.templateId) &&
                existingFrontmatter.templateId !== doc.templateId) ||
              (Array.isArray(doc.tags) &&
                doc.tags.length > 0 &&
                !areArraysEqual(existingFrontmatter.tags, doc.tags));

            if (needsSync) {
              const syncPayload: Record<string, unknown> = {};
              if (doc.title) syncPayload.title = doc.title;
              if (doc.status) syncPayload.status = doc.status;
              if (doc.categories) syncPayload.categories = doc.categories;
              if (doc.department) syncPayload.department = doc.department;
              if (doc.badge) syncPayload.badge = doc.badge;
              if (doc.classification)
                syncPayload.classification = doc.classification;
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
    let frontmatterMeta: Record<string, unknown> = {};
    const fullPath = path.join(docsMetadataConfigService.getRepoDir(cleanRepo), cleanPath);
    if (fs.existsSync(fullPath) && (ext === "md" || ext === "markdown")) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        frontmatterMeta = extractFrontmatterMeta(content);
        title = (frontmatterMeta.title as string) || extractDocTitleFromMarkdown(content) || name;
      } catch {}
    }

    const item = this.sanitizeMetaItem({
      id: generateDocId(cleanPath),
      name,
      title,
      ext,
      path: cleanPath,
      status: (frontmatterMeta.status as string) || "",
      categories: ((frontmatterMeta.categories || frontmatterMeta.category) as string) || "",
      tags: Array.isArray(frontmatterMeta.tags) ? frontmatterMeta.tags : [],
      department: frontmatterMeta.department as string | undefined,
      badge: frontmatterMeta.badge as string | undefined,
      classification: frontmatterMeta.classification as string | undefined,
      updated_at: new Date().toISOString(),
      approvers: Array.isArray(frontmatterMeta.approvers) ? frontmatterMeta.approvers : [],
      links: [],
      templateId: (frontmatterMeta.templateId as string) || "",
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
      }, repoName);
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
      }, repoName);
      metaList.push(updatedItem);
    }

    this.saveDocsMetadata(repoName, metaList);

    // Se o arquivo físico existir e for markdown, sincroniza o Frontmatter no arquivo .md
    try {
      const fullPath = path.join(docsMetadataConfigService.getRepoDir(repoName), cleanPath);
      if (
        fs.existsSync(fullPath) &&
        (cleanPath.endsWith(".md") || cleanPath.endsWith(".markdown"))
      ) {
        const fileContent = fs.readFileSync(fullPath, "utf-8");
        const frontmatterSyncPayload: Record<string, unknown> = {};
        if (partialMeta.title !== undefined) frontmatterSyncPayload.title = partialMeta.title;
        if (partialMeta.type !== undefined) frontmatterSyncPayload.type = partialMeta.type;
        if (partialMeta.badge !== undefined) frontmatterSyncPayload.badge = partialMeta.badge;
        if (partialMeta.classification !== undefined) frontmatterSyncPayload.classification = partialMeta.classification;
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
}

export const docsMetadataCrudService = new DocsMetadataCrudService();
