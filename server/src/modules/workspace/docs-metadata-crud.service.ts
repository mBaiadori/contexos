import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, writeTextAtomic } from "../../utils/atomic-write.js";
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
    } else {
      this.metaCache.clear();
      docsMetadataConfigService.clearProjectConfigCache();
      this.fileStatsCache.clear();
    }
  }

  sanitizeMetaItem(
    item: Record<string, unknown>,
    repoName?: string,
    cachedDepartments?: DepartmentConfig[],
  ): DocumentMetadataItem {
    const cleanItem = { ...item };
    delete cleanItem.layer;
    delete cleanItem.badge;

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
    };
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
          const config = docsMetadataConfigService.getProjectConfig(cleanRepo);
          if (Array.isArray(config.departments) && config.departments.length > 0) {
            cachedDepartments = config.departments as DepartmentConfig[];
          }
        } catch {}

        if (Array.isArray(parsed)) {
          metaList = parsed.map((item) => this.sanitizeMetaItem(item, cleanRepo, cachedDepartments));
        } else if (parsed && typeof parsed === "object" && parsed.documents) {
          // Migração de formato legado
          for (const [relPath, meta] of Object.entries(parsed.documents)) {
            const m = (meta as Record<string, unknown>) || {};
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
    const metaPath = docsMetadataConfigService.getDocsMetadataPath(cleanRepo);
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
