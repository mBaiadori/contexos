import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { PROJECTS_DIR, resolveRepoDir } from "../../config/constants.js";
import {
  loadConfig,
  saveConfig,
  recordChange,
  removeWorkspaceChange,
  ensureDefaultRepoFiles,
  loadRepoWorkspaceChanges,
  saveRepoWorkspaceChanges,
} from "../../config/storage.js";
import { computeDiff } from "../../utils/diff.js";
import { isGitRepo, executeGit, getGitStatus } from "../../utils/git.js";
import { assertGitPath } from "../../utils/git-validate.js";
import {
  docsMetadataService,
  generateDocId,
  extractDocLinksFromMarkdown,
  type DocumentMetadataItem,
} from "./docs-metadata.service.js";
import { translationsService } from "../translations/translations.service.js";
import { governanceService } from "../governance/governance.service.js";
import { canAccessDocument } from "../../utils/crypto.js";
import { isPathInside, resolveSafeRepoPath } from "../../utils/repo-ref.js";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  title?: string;
  categories?: string;
  category?: string;
  status?: string;
  last_modified?: number;
}

export { generateDocId, extractDocLinksFromMarkdown, extractFrontmatterMeta };
export type { DocumentMetadataItem };
export { DEFAULT_HIDDEN_FILES, loadHiddenFiles, isPathHidden, isSystemPath } from "../../utils/hidden-files.js";
import { DEFAULT_HIDDEN_FILES, loadHiddenFiles, isPathHidden, isSystemPath } from "../../utils/hidden-files.js";
import { extractFrontmatterMeta } from "./docs-metadata.service.js";

export class WorkspaceService {
  private treeCache = new Map<string, { tree: TreeNode[]; timestamp: number }>();

  invalidateTreeCache(repoName?: string): void {
    if (repoName) {
      this.treeCache.delete(repoName);
      docsMetadataService.clearCache(repoName);
    } else {
      this.treeCache.clear();
      docsMetadataService.clearCache();
    }
  }

  private getRepoDir(repoName: string, ownerOrOrg?: string): string {
    const cfg = loadConfig();
    let effectiveOwner = ownerOrOrg || (cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined);
    if (!effectiveOwner && repoName && repoName.includes("/")) {
      effectiveOwner = repoName.split("/")[0];
    }
    return resolveRepoDir(repoName || "local", effectiveOwner);
  }

  loadDocsMetadata(repoName: string): DocumentMetadataItem[] {
    return docsMetadataService.loadDocsMetadata(repoName);
  }

  saveDocsMetadata(repoName: string, metaList: DocumentMetadataItem[]): void {
    docsMetadataService.saveDocsMetadata(repoName, metaList);
    this.invalidateTreeCache(repoName);
  }

  buildTree(
    dir: string,
    baseDir: string,
    docsMetadata?: DocumentMetadataItem[] | Map<string, DocumentMetadataItem>,
    hiddenFiles?: string[],
  ): TreeNode[] {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    const metaMap: Map<string, DocumentMetadataItem> =
      docsMetadata instanceof Map
        ? docsMetadata
        : new Map((docsMetadata || []).map((d) => [d.path, d]));

    const hiddenList = hiddenFiles || loadHiddenFiles(baseDir);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.name.charCodeAt(0) === 46 /* '.' */) {
        if (isPathHidden(entry.name, hiddenList)) continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

      if (isPathHidden(relPath, hiddenList) || isPathHidden(entry.name, hiddenList)) continue;

      if (entry.isDirectory()) {
        const children = this.buildTree(fullPath, baseDir, metaMap, hiddenList);

        nodes.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children,
        });
      } else if (entry.isFile()) {

        const docMeta = metaMap.get(relPath);

        nodes.push({
          name: entry.name,
          path: relPath,
          type: "file",
          title:
            docMeta?.title ||
            docMeta?.name ||
            entry.name.replace(/\.[^/.]+$/, ""),
          categories: docMeta?.categories || "",
          category: docMeta?.categories || "",
          status: docMeta?.status || "",
        });
      }
    }

    return nodes.sort((a, b) => {
      const aIsDir = a.type === "directory";
      const bIsDir = b.type === "directory";
      if (aIsDir === bIsDir) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      }
      return aIsDir ? -1 : 1;
    });
  }

  async getTree(
    targetRepoName?: string,
    ownerOrOrgOrForce?: string | boolean,
    forceRefresh = false,
  ) {
    const isBool = typeof ownerOrOrgOrForce === "boolean";
    const actualOwner = isBool ? undefined : ownerOrOrgOrForce;
    const actualForce = isBool ? ownerOrOrgOrForce : forceRefresh;
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName, actualOwner);

    if (!fs.existsSync(repoDir)) {
      return {
        repo: repoName,
        tree: [],
      };
    }

    if (actualForce) {
      this.invalidateTreeCache(repoName);
    } else {
      const cached = this.treeCache.get(repoName);
      if (cached && Date.now() - cached.timestamp < 30000) {
        return {
          repo: repoName,
          tree: cached.tree,
        };
      }
    }

    const docsMetadata = docsMetadataService.loadDocsMetadata(repoName, false);
    const metaMap = new Map(docsMetadata.map((d) => [d.path, d]));
    const tree = this.buildTree(repoDir, repoDir, metaMap);

    this.treeCache.set(repoName, {
      tree,
      timestamp: Date.now(),
    });

    return {
      repo: repoName,
      tree,
    };
  }

  getFile(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Arquivo '${cleanPath}' não encontrado no repositório '${repoName}'.`);
    }

    const stat = fs.statSync(fullPath);
    const ext = path.extname(cleanPath).replace(".", "").toLowerCase();
    const isBinary = [
      "pdf",
      "xlsx",
      "xls",
      "docx",
      "doc",
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "ico",
      "zip",
      "gz",
      "tar",
      "exe",
      "bin",
      "mp4",
      "mp3",
    ].includes(ext);

    let content = "";
    if (!isBinary) {
      try {
        content = fs.readFileSync(fullPath, "utf-8");
      } catch (e) {
        content = "";
      }
    }

    const meta = docsMetadataService.getDocMetadata(repoName, cleanPath);

    return {
      path: cleanPath,
      content,
      isBinary,
      size: stat.size,
      meta,
      repo: repoName,
    };
  }

  getRawFile(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Arquivo '${cleanPath}' não encontrado no repositório '${repoName}'.`);
    }

    const ext = path.extname(cleanPath).replace(".", "").toLowerCase();
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      csv: "text/csv; charset=utf-8",
      tsv: "text/tab-separated-values; charset=utf-8",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      json: "application/json; charset=utf-8",
      yaml: "text/yaml; charset=utf-8",
      yml: "text/yaml; charset=utf-8",
      txt: "text/plain; charset=utf-8",
      md: "text/markdown; charset=utf-8",
      html: "text/html; charset=utf-8",
      css: "text/css; charset=utf-8",
      js: "application/javascript; charset=utf-8",
      ts: "text/plain; charset=utf-8",
    };

    const mimeType = mimeTypes[ext] || "application/octet-stream";
    const buffer = fs.readFileSync(fullPath);
    return {
      buffer,
      mimeType,
      filename: path.basename(cleanPath),
      size: buffer.length,
    };
  }

  verifyUserClearance(repoName: string, filePath: string, meta?: any): void {
    const cfg = loadConfig();
    const activeUserLogin = cfg.user?.login || 'local';
    const pConfig = governanceService.readProjectConfig(repoName);
    const localMemberMeta = pConfig.governance_collaborators || {};
    const collabMeta = (Object.entries(localMemberMeta).find(
      ([k]) => k.toLowerCase() === activeUserLogin.toLowerCase()
    )?.[1] as any) || {};

    const repoObj = cfg.repos?.find((r: any) => r.name === repoName) || (cfg.active_repo?.name === repoName ? cfg.active_repo : undefined);
    const resolvedFullName = repoObj?.full_name || '';
    const isOwner = activeUserLogin.toLowerCase() === (resolvedFullName.split('/')[0] || cfg.user?.login || '').toLowerCase();

    const userProfile = {
      isOwner,
      departments: isOwner ? ['*'] : (Array.isArray(collabMeta.departments) && collabMeta.departments.length > 0 ? collabMeta.departments : ['engineering']),
      allowed_paths: isOwner ? ['*'] : (Array.isArray(collabMeta.allowed_paths) && collabMeta.allowed_paths.length > 0 ? collabMeta.allowed_paths : ['*']),
      denied_paths: Array.isArray(collabMeta.denied_paths) ? collabMeta.denied_paths : [],
    };

    const cleanPath = (filePath || '').trim().replace(/^\/+/, '');
    const docMeta = docsMetadataService.getDocMetadata(repoName, cleanPath);
    const docDept = meta?.department || (docMeta as any)?.department || cleanPath.split('/')[0];

    if (!canAccessDocument(userProfile, { department: docDept, path: cleanPath })) {
      throw new Error(`Acesso Negado: Você não possui autorização de departamento ou rota para acessar o documento '${cleanPath}'.`);
    }
  }

  async saveFile(filePath: string, content: string, meta?: any, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");
    
    // Validação estrita de Clearance de Governança
    this.verifyUserClearance(repoName, cleanPath, meta);

    let oldContent = "";
    let changeType: "ADDED" | "MODIFIED" = "ADDED";

    if (fs.existsSync(fullPath)) {
      oldContent = fs.readFileSync(fullPath, "utf-8");
      changeType = "MODIFIED";
    } else {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    }

    fs.writeFileSync(fullPath, content, "utf-8");
    recordChange(repoName, cleanPath, changeType, oldContent, content);

    // Extrair links e metadados automaticamente do conteúdo markdown para enriquecer o .docs.metadata.json
    const extractedLinks = extractDocLinksFromMarkdown(content);
    const frontmatterMeta = extractFrontmatterMeta(content);

    const metaUpdatePayload = {
      ...frontmatterMeta,
      ...(meta && typeof meta === "object" ? meta : {}),
      links: extractedLinks,
    };

    const { meta: updatedMetaItem } = docsMetadataService.updateDocMetadataItem(
      repoName,
      cleanPath,
      metaUpdatePayload,
    );

    // Otimização: arquivos modificados não alteram a topologia de pastas do workspace.
    // Evita reconstrução recursiva do disco (buildTree) e re-render massivo do React a cada autosave.
    let newTree: TreeNode[] | undefined = undefined;
    if (changeType === "ADDED") {
      this.invalidateTreeCache(repoName);
      newTree = (await this.getTree(repoName, true)).tree;
    }

    return {
      success: true,
      path: cleanPath,
      meta: updatedMetaItem,
      tree: newTree,
    };
  }

  async createFile(
    filePath: string,
    initialContent: string = "",
    isFolder: boolean = false,
    meta?: any,
    targetRepoName?: string,
  ) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    let cleanPath = (filePath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    if (!cleanPath) {
      throw new Error("Caminho não pode ser vazio.");
    }

    if (!isFolder) {
      const base = path.basename(cleanPath);
      if (!base.includes(".")) {
        cleanPath = `${cleanPath}.md`;
      } else if (base.endsWith(".")) {
        cleanPath = `${cleanPath.slice(0, -1)}.md`;
      }
    }

    // Validação estrita de Clearance de Governança
    if (!isFolder) {
      this.verifyUserClearance(repoName, cleanPath, meta);
    }

    const repoDir = this.getRepoDir(repoName);

    if (isFolder) {
      const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Pasta");
      if (fs.existsSync(fullPath)) {
        throw new Error(`Pasta '${cleanPath}' já existe.`);
      }
      fs.mkdirSync(fullPath, { recursive: true });
      recordChange(repoName, cleanPath, "ADDED", "", "");

      this.invalidateTreeCache(repoName);
      const newTree = (await this.getTree(repoName, true)).tree;
      return {
        success: true,
        path: cleanPath,
        is_folder: true,
        tree: newTree,
      };
    }

    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");
    if (fs.existsSync(fullPath)) {
      throw new Error(`Arquivo '${cleanPath}' já existe.`);
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, initialContent, "utf-8");

    recordChange(repoName, cleanPath, "ADDED", "", initialContent);

    const extractedLinks = extractDocLinksFromMarkdown(initialContent);
    const metaPayload = {
      ...(meta && typeof meta === "object" ? meta : {}),
      links: extractedLinks,
    };

    const { meta: newItem } = docsMetadataService.updateDocMetadataItem(
      repoName,
      cleanPath,
      metaPayload,
    );

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;

    return {
      success: true,
      path: cleanPath,
      is_folder: false,
      meta: newItem,
      tree: newTree,
    };
  }

  async importFiles(
    targetFolder: string = "",
    filesToImport: Array<{
      name: string;
      relativePath?: string;
      content?: string;
      base64?: string;
      meta?: any;
    }>,
    targetRepoName?: string,
  ) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const cleanTarget = (targetFolder || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const importedFiles: Array<{
      path: string;
      name: string;
      isBinary: boolean;
      size: number;
    }> = [];
    const errors: string[] = [];

    for (const item of filesToImport) {
      try {
        const itemRel = (item.relativePath || item.name || "")
          .trim()
          .replace(/^\/+/, "");
        if (!itemRel) continue;

        const fullRelPath = cleanTarget ? `${cleanTarget}/${itemRel}` : itemRel;
        const fullDiskPath = path.resolve(repoDir, fullRelPath);

        // Checagem robusta de segurança contra directory traversal
        if (!isPathInside(repoDir, fullDiskPath)) {
          errors.push(`Caminho inválido: ${fullRelPath}`);
          continue;
        }

        fs.mkdirSync(path.dirname(fullDiskPath), { recursive: true });

        let oldContent = "";
        const exists = fs.existsSync(fullDiskPath);
        if (exists) {
          try {
            oldContent = fs.readFileSync(fullDiskPath, "utf-8");
          } catch {
            oldContent = "";
          }
        }

        let isBinary = false;
        let fileSize = 0;

        if (item.base64) {
          const buffer = Buffer.from(item.base64, "base64");
          fs.writeFileSync(fullDiskPath, buffer);
          fileSize = buffer.length;
          isBinary = true;
        } else {
          const textContent = item.content ?? "";
          fs.writeFileSync(fullDiskPath, textContent, "utf-8");
          fileSize = Buffer.byteLength(textContent, "utf-8");
        }

        const isMd =
          fullRelPath.toLowerCase().endsWith(".md") ||
          fullRelPath.toLowerCase().endsWith(".markdown");
        const textForLinks = isMd && !item.base64 ? item.content || "" : "";
        const extractedLinks = textForLinks
          ? extractDocLinksFromMarkdown(textForLinks)
          : [];

        const defaultTitle = item.name.replace(/\.[^/.]+$/, "");
        const metaPayload = {
          title: defaultTitle,
          status: "",
          categories: "",
          tags: [],
          approvers: [],
          ...(item.meta && typeof item.meta === "object" ? item.meta : {}),
          links: extractedLinks,
        };

        docsMetadataService.updateDocMetadataItem(
          repoName,
          fullRelPath,
          metaPayload,
        );
        recordChange(
          repoName,
          fullRelPath,
          exists ? "MODIFIED" : "ADDED",
          oldContent,
          item.content || "",
        );

        importedFiles.push({
          path: fullRelPath,
          name: item.name,
          isBinary,
          size: fileSize,
        });
      } catch (err: any) {
        errors.push(`Erro ao importar ${item.name}: ${err.message}`);
      }
    }

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;

    return {
      success: importedFiles.length > 0,
      importedFiles,
      errors,
      tree: newTree,
    };
  }

  async renameFile(oldPath: string, newPath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const cleanOld = (oldPath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    let cleanNew = (newPath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    const fullOld = resolveSafeRepoPath(repoDir, cleanOld, "Origem");
    if (!fs.existsSync(fullOld)) {
      throw new Error(`Origem '${cleanOld}' não existe.`);
    }

    const isDir = fs.statSync(fullOld).isDirectory();
    if (!isDir && !path.extname(cleanNew)) {
      cleanNew += ".md";
    }

    const fullNew = resolveSafeRepoPath(repoDir, cleanNew, "Destino");
    if (fs.existsSync(fullNew)) {
      throw new Error(`Destino '${cleanNew}' já existe.`);
    }

    fs.mkdirSync(path.dirname(fullNew), { recursive: true });
    fs.renameSync(fullOld, fullNew);

    let oldContent = "";
    if (!isDir) {
      if (fs.existsSync(fullNew)) {
        oldContent = fs.readFileSync(fullNew, "utf-8");
      }
      recordChange(repoName, cleanOld, "DELETED", oldContent, "");
      recordChange(repoName, cleanNew, "ADDED", "", oldContent);
    }

    docsMetadataService.renameDocMetadata(repoName, cleanOld, cleanNew);
    translationsService.renameTranslationsForPath(repoName, cleanOld, cleanNew);
    if (isDir) {
      governanceService.handleFolderRename(cleanOld, cleanNew, repoName);
    }

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;

    return {
      success: true,
      oldPath: cleanOld,
      newPath: cleanNew,
      tree: newTree,
    };
  }

  async moveFile(
    sourcePath: string,
    targetPath: string,
    sourceRepoName?: string,
    targetRepoName?: string
  ) {
    const cfg = loadConfig();
    const sourceRepo = sourceRepoName || cfg.active_repo?.name || "local";
    const targetRepo = targetRepoName || sourceRepo;

    if (sourceRepo === targetRepo) {
      const renameRes = await this.renameFile(sourcePath, targetPath, sourceRepo);
      return {
        ...renameRes,
        sourceRepo,
        targetRepo,
        sourceTree: renameRes.tree,
        targetTree: renameRes.tree,
      };
    }

    const cleanOld = (sourcePath || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    let cleanNew = (targetPath || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");

    if (!cleanOld) throw new Error("Caminho de origem não pode ser vazio.");
    if (!cleanNew) throw new Error("Caminho de destino não pode ser vazio.");

    const sourceRepoDir = this.getRepoDir(sourceRepo);
    const targetRepoDir = this.getRepoDir(targetRepo);

    const fullOld = path.join(sourceRepoDir, cleanOld);
    if (!fs.existsSync(fullOld)) {
      throw new Error(`Origem '${cleanOld}' não existe no repositório '${sourceRepo}'.`);
    }

    const isDir = fs.statSync(fullOld).isDirectory();
    if (!isDir && !path.extname(cleanNew)) {
      cleanNew += path.extname(cleanOld) || ".md";
    }

    const fullNew = path.join(targetRepoDir, cleanNew);
    if (fs.existsSync(fullNew)) {
      throw new Error(`Destino '${cleanNew}' já existe no repositório '${targetRepo}'.`);
    }

    // Clearance check on target repo
    if (!isDir) {
      this.verifyUserClearance(targetRepo, cleanNew);
    }

    // Ensure target folder exists
    fs.mkdirSync(path.dirname(fullNew), { recursive: true });

    // Move file/folder across directories
    fs.cpSync(fullOld, fullNew, { recursive: true, force: true });
    fs.rmSync(fullOld, { recursive: true, force: true });

    // Record changes in both repositories
    if (!isDir) {
      let content = "";
      if (fs.existsSync(fullNew)) {
        try {
          content = fs.readFileSync(fullNew, "utf-8");
        } catch {}
      }
      recordChange(sourceRepo, cleanOld, "DELETED", content, "");
      recordChange(targetRepo, cleanNew, "ADDED", "", content);
    } else {
      recordChange(sourceRepo, cleanOld, "DELETED", "", "");
      recordChange(targetRepo, cleanNew, "ADDED", "", "");
    }

    // Migrate metadata & translations
    docsMetadataService.migrateDocMetadata(sourceRepo, targetRepo, cleanOld, cleanNew);
    translationsService.migrateTranslations(sourceRepo, targetRepo, cleanOld, cleanNew);

    // Invalidate caches for both repositories
    this.invalidateTreeCache(sourceRepo);
    this.invalidateTreeCache(targetRepo);

    const sourceTree = (await this.getTree(sourceRepo, true)).tree;
    const targetTree = (await this.getTree(targetRepo, true)).tree;

    return {
      success: true,
      sourceRepo,
      targetRepo,
      oldPath: cleanOld,
      newPath: cleanNew,
      sourceTree,
      targetTree,
    };
  }

  async deleteFile(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");

    if (!cleanPath) {
      throw new Error("Caminho de arquivo inválido.");
    }

    const repoDir = this.getRepoDir(repoName);
    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");
    let oldContent = "";

    // Verifica se o repositório é Git e se o arquivo já existia rastreado (no HEAD ou index)
    let existedInGit = false;
    const isGit = await isGitRepo(repoDir);
    if (isGit) {
      const safeClean = assertGitPath(cleanPath);
      const headCheck = await executeGit(
        ["cat-file", "-e", `HEAD:${safeClean}`],
        repoDir,
      );
      existedInGit = headCheck.success;
      if (!existedInGit) {
        const indexCheck = await executeGit(
          ["ls-files", "--error-unmatch", safeClean],
          repoDir,
        );
        existedInGit = indexCheck.success;
      }
    }

    if (fs.existsSync(fullPath)) {
      if (fs.statSync(fullPath).isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        oldContent = fs.readFileSync(fullPath, "utf-8");
        fs.unlinkSync(fullPath);
      }
    }

    if (isGit && !existedInGit) {
      // O arquivo nunca existiu no repositório Git (era apenas um rascunho/arquivo não rastreado local).
      // Se porventura tiver sido indexado com git add, limpa do index do Git
      await executeGit(["rm", "-f", "--cached", "--", assertGitPath(cleanPath)], repoDir).catch(() => {});
      removeWorkspaceChange(repoName, cleanPath);
    } else {
      recordChange(repoName, cleanPath, "DELETED", oldContent, "");
    }

    docsMetadataService.deleteDocMetadata(repoName, cleanPath);
    translationsService.deleteTranslationsForPath(repoName, cleanPath);

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;

    return {
      success: true,
      path: cleanPath,
      tree: newTree,
    };
  }

  async duplicateFile(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");

    if (!cleanPath) {
      throw new Error("Caminho de arquivo inválido.");
    }

    const repoDir = this.getRepoDir(repoName);
    const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Arquivo");
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Arquivo '${cleanPath}' não existe.`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error("Não é possível duplicar pastas diretamente.");
    }

    this.verifyUserClearance(repoName, cleanPath);

    const dir = path.dirname(cleanPath);
    const ext = path.extname(cleanPath);
    const baseName = path.basename(cleanPath, ext);

    let copyName = `${baseName}-copia${ext}`;
    let copyRelPath = dir === "." || !dir ? copyName : `${dir}/${copyName}`;
    let counter = 2;
    while (fs.existsSync(path.join(repoDir, copyRelPath))) {
      copyName = `${baseName}-copia-${counter}${ext}`;
      copyRelPath = dir === "." || !dir ? copyName : `${dir}/${copyName}`;
      counter++;
    }

    const fullCopyPath = path.join(repoDir, copyRelPath);
    fs.mkdirSync(path.dirname(fullCopyPath), { recursive: true });
    fs.copyFileSync(fullPath, fullCopyPath);

    let content = "";
    try {
      content = fs.readFileSync(fullCopyPath, "utf-8");
    } catch {}

    recordChange(repoName, copyRelPath, "ADDED", "", content);

    try {
      const existingMeta = docsMetadataService.getDocMetadata(repoName, cleanPath);
      const newTitle = (existingMeta?.title || baseName) + " (Cópia)";
      docsMetadataService.updateDocMetadataItem(repoName, copyRelPath, {
        ...(existingMeta || {}),
        title: newTitle,
      });
    } catch {}

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;

    return {
      success: true,
      originalPath: cleanPath,
      newPath: copyRelPath,
      repo: repoName,
      tree: newTree,
    };
  }

  async getWorkspaceChanges(targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const activeRepo = cfg.repos?.find((r: any) => r.name === repoName) || (cfg.active_repo?.name === repoName ? cfg.active_repo : { name: repoName, full_name: repoName, is_local: true });

    const repoDir = this.getRepoDir(repoName);
    const hiddenList = loadHiddenFiles(repoDir);
    const storedChanges = cfg.workspace_changes?.[repoName] || loadRepoWorkspaceChanges(repoName);

    // Map existing stored changes by clean relative path
    const mergedMap = new Map<string, any>();
    for (const c of storedChanges) {
      if (c?.path) {
        mergedMap.set(c.path.trim().replace(/^\/+/, ""), { ...c });
      }
    }

    // Se o diretório for um repositório git, reconcilia com alterações externas/do agente
    if (await isGitRepo(repoDir)) {
      try {
        const gitStatus = await getGitStatus(repoDir);
        const allGitFiles = [
          ...(gitStatus.files || []),
          ...(gitStatus.systemFiles || []),
        ];

        const gitFilesMap = new Map<string, any>();
        for (const gf of allGitFiles) {
          const cp = gf.path.trim().replace(/^\/+/, "");
          if (cp) gitFilesMap.set(cp, gf);
        }

        // Expurgar alterações fantasmas em mergedMap (ex: arquivos novos criados e depois apagados localmente)
        for (const [key, item] of Array.from(mergedMap.entries())) {
          const fullPath = path.join(repoDir, key);
          const fileExistsOnDisk = fs.existsSync(fullPath);

          if (item.type === "DELETED") {
            const headCheck = await executeGit(
              ["cat-file", "-e", `HEAD:${assertGitPath(key)}`],
              repoDir,
            );
            if (!headCheck.success && !gitFilesMap.has(key)) {
              mergedMap.delete(key);
              removeWorkspaceChange(repoName, key);
              continue;
            }
          } else if (item.type === "ADDED" && !fileExistsOnDisk && !gitFilesMap.has(key)) {
            mergedMap.delete(key);
            removeWorkspaceChange(repoName, key);
            continue;
          } else if (item.type === "MODIFIED" && !fileExistsOnDisk) {
            const headCheck = await executeGit(
              ["cat-file", "-e", `HEAD:${assertGitPath(key)}`],
              repoDir,
            );
            if (!headCheck.success && !gitFilesMap.has(key)) {
              mergedMap.delete(key);
              removeWorkspaceChange(repoName, key);
              continue;
            }
          }
        }

        for (const gf of allGitFiles) {
          const cleanPath = gf.path.trim().replace(/^\/+/, "");
          if (!cleanPath) continue;
          const isSys = isSystemPath(cleanPath);
          if (!isSys && isPathHidden(cleanPath, hiddenList)) continue;

          // Se já está no map de alterações da UI, mantém os dados originais preservados
          if (mergedMap.has(cleanPath)) continue;

          const fullPath = path.join(repoDir, cleanPath);
          const isAdded = gf.status === "??" || gf.status === "A";
          const isDeleted = gf.status === "D";

          let oldContent = "";
          let newContent = "";
          const changeType: "ADDED" | "MODIFIED" | "DELETED" = isAdded
            ? "ADDED"
            : isDeleted
              ? "DELETED"
              : "MODIFIED";

          if (isAdded) {
            if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
              try {
                newContent = fs.readFileSync(fullPath, "utf-8");
              } catch {}
            }
          } else if (isDeleted) {
            const showRes = await executeGit(
              ["show", `HEAD:${assertGitPath(cleanPath)}`],
              repoDir,
            );
            if (showRes.success && showRes.stdout) {
              oldContent = showRes.stdout;
            }
          } else {
            // MODIFIED
            const showRes = await executeGit(
              ["show", `HEAD:${assertGitPath(cleanPath)}`],
              repoDir,
            );
            if (showRes.success && showRes.stdout) {
              oldContent = showRes.stdout;
            }
            if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
              try {
                newContent = fs.readFileSync(fullPath, "utf-8");
              } catch {}
            }
          }

          mergedMap.set(cleanPath, {
            path: cleanPath,
            type: changeType,
            old_content: oldContent,
            new_content: newContent,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn("[WorkspaceService] Erro ao reconciliar status git com workspace_changes:", err);
      }
    }

    const allRaw = Array.from(mergedMap.values());
    const rawDocChanges = allRaw.filter(
      (c) => !isPathHidden(c.path, hiddenList) && !isSystemPath(c.path),
    );
    const rawSystemChanges = allRaw.filter(
      (c) => isSystemPath(c.path),
    );

    const detailedChanges = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const c of rawDocChanges) {
      const diffData = computeDiff(
        c.old_content || "",
        c.new_content || "",
        c.path,
      );
      totalAdditions += diffData.additions;
      totalDeletions += diffData.deletions;
      detailedChanges.push({
        path: c.path,
        type: c.type,
        timestamp: c.timestamp,
        additions: diffData.additions,
        deletions: diffData.deletions,
        diff_text: diffData.diff_text,
        old_content: c.old_content,
        new_content: c.new_content,
      });
    }

    const detailedSystemChanges = [];
    for (const c of rawSystemChanges) {
      const diffData = computeDiff(
        c.old_content || "",
        c.new_content || "",
        c.path,
      );
      detailedSystemChanges.push({
        path: c.path,
        type: c.type,
        timestamp: c.timestamp,
        additions: diffData.additions,
        deletions: diffData.deletions,
        diff_text: diffData.diff_text,
        old_content: c.old_content,
        new_content: c.new_content,
      });
    }

    const totalLines = totalAdditions + totalDeletions;
    const guardrail =
      totalLines < 120
        ? "PEQUENO (Ideal)"
        : totalLines < 350
          ? "MÉDIO"
          : "GRANDE (Atenção)";

    return {
      repo: activeRepo,
      changes: detailedChanges,
      system_changes: detailedSystemChanges,
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      total_files: detailedChanges.length,
      total_system_files: detailedSystemChanges.length,
      guardrail,
    };
  }

  async discardChanges(paths?: string[], targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repoName);
    const rawChanges = cfg.workspace_changes?.[repoName] || loadRepoWorkspaceChanges(repoName);

    const cleanPaths = paths && paths.length > 0 
      ? paths.map((p) => p.trim().replace(/^\/+/, "")).filter(Boolean)
      : null;
    const targetSet = cleanPaths ? new Set(cleanPaths) : null;
    const remainingChanges = [];

    for (const change of rawChanges) {
      const cleanChangePath = change.path.trim().replace(/^\/+/, "");
      if (!targetSet || targetSet.has(cleanChangePath)) {
        const fullPath = path.join(repoDir, cleanChangePath);
        try {
          if (change.type === "ADDED") {
            if (fs.existsSync(fullPath)) {
              if (fs.statSync(fullPath).isDirectory()) {
                fs.rmSync(fullPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(fullPath);
              }
            }
          } else if (change.type === "MODIFIED" || change.type === "DELETED") {
            if (change.old_content !== undefined) {
              fs.mkdirSync(path.dirname(fullPath), { recursive: true });
              fs.writeFileSync(fullPath, change.old_content, "utf-8");
            }
          }
        } catch (e) {
          console.error(`Erro ao descartar mudança em ${change.path}:`, e);
        }
      } else {
        remainingChanges.push(change);
      }
    }

    // Se o diretório for um repositório git, descartar alterações no git também
    if (await isGitRepo(repoDir)) {
      try {
        if (cleanPaths && cleanPaths.length > 0) {
          for (const p of cleanPaths) {
            const safeP = assertGitPath(p);
            await executeGit(["restore", "--staged", "--worktree", "--", safeP], repoDir);
            await executeGit(["checkout", "HEAD", "--", safeP], repoDir);
            await executeGit(["clean", "-fd", safeP], repoDir);
          }
        } else {
          await executeGit(["restore", "--staged", "--worktree", "."], repoDir);
          await executeGit(["checkout", "HEAD", "--", "."], repoDir);
          await executeGit(["clean", "-fd"], repoDir);
        }
      } catch (e) {
        console.warn(
          `[WorkspaceService] Aviso ao descartar alterações no git:`,
          e,
        );
      }
    }

    if (!cfg.workspace_changes) cfg.workspace_changes = {};
    cfg.workspace_changes[repoName] = remainingChanges;
    saveRepoWorkspaceChanges(repoName, remainingChanges);
    saveConfig(cfg);

    this.invalidateTreeCache(repoName);
    const newTree = (await this.getTree(repoName, true)).tree;
    return {
      success: true,
      message: "Alterações descartadas com sucesso.",
      tree: newTree,
    };
  }

  getDocumentContext(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const cleanPath = (filePath || "").trim().replace(/^\/+/, "");
    const repoDir = this.getRepoDir(repoName);
    const docsMetadata = docsMetadataService.loadDocsMetadata(repoName);

    const docMeta =
      docsMetadata.find((d) => d.path === cleanPath) ||
      ({} as Partial<DocumentMetadataItem>);

    // Ler o arquivo ativo para extrair links diretos
    const fullActive = path.join(repoDir, cleanPath);
    let activeContent = "";
    if (fs.existsSync(fullActive) && fs.statSync(fullActive).isFile()) {
      try {
        activeContent = fs.readFileSync(fullActive, "utf-8");
      } catch {}
    }

    const extractedActiveLinks = extractDocLinksFromMarkdown(activeContent);
    const rawOutgoingLinks = extractedActiveLinks;

    // 1. Dependencies (Outgoing links from this document)
    const dependencies: any[] = [];
    for (const link of rawOutgoingLinks) {
      const linkFilePath = link.split("#")[0].replace(/^\.?\//, "");
      const hash = link.includes("#") ? link.slice(link.indexOf("#")) : "";
      const matchedMeta = docsMetadata.find(
        (d) =>
          d.path === linkFilePath ||
          d.name === linkFilePath ||
          d.id === linkFilePath,
      );

      dependencies.push({
        path: link,
        filePath: linkFilePath,
        hash,
        title:
          matchedMeta?.title ||
          matchedMeta?.name ||
          path.basename(linkFilePath, path.extname(linkFilePath)) ||
          link,
        categories: matchedMeta?.categories || "",
        category: matchedMeta?.categories || "",
        status: matchedMeta?.status || "",
      });
    }

    // 2. Consumers (Backlinks - other documents that link to this file)
    const consumers: any[] = [];
    const thisFileBase = path.basename(cleanPath);
    const thisFileNoExt = path.basename(cleanPath, path.extname(cleanPath));

    for (const doc of docsMetadata) {
      if (doc.path === cleanPath) continue;

      let hasLink = false;
      if (Array.isArray(doc.links)) {
        hasLink = doc.links.some((l) => {
          const lClean = l.split("#")[0].replace(/^\.?\//, "");
          return (
            lClean === cleanPath ||
            lClean === thisFileBase ||
            lClean === thisFileNoExt ||
            l === docMeta.id
          );
        });
      }

      if (!hasLink) {
        const docFull = path.join(repoDir, doc.path);
        if (fs.existsSync(docFull)) {
          try {
            const c = fs.readFileSync(docFull, "utf-8");
            if (c.includes(cleanPath) || c.includes(thisFileBase)) {
              hasLink = true;
            }
          } catch {}
        }
      }

      if (hasLink) {
        consumers.push({
          path: doc.path,
          filePath: doc.path,
          title: doc.title || doc.name || doc.path,
          categories: doc.categories || "",
          category: doc.categories || "",
          status: doc.status || "",
        });
      }
    }

    const contextItems: any[] = [];
    const collectDocs = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(repoDir, full).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          collectDocs(full);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          try {
            const content = fs.readFileSync(full, "utf-8");
            const itemMeta =
              docsMetadata.find((d) => d.path === rel) ||
              ({} as Partial<DocumentMetadataItem>);
            contextItems.push({
              path: rel,
              title:
                itemMeta.title ||
                itemMeta.name ||
                entry.name.replace(".md", ""),
              categories: itemMeta.categories || "",
              category: itemMeta.categories || "",
              summary: content.slice(0, 300),
            });
          } catch {}
        }
      }
    };

    collectDocs(repoDir);

    return {
      active_file: cleanPath,
      repo: repoName,
      title: docMeta.title || docMeta.name || cleanPath,
      categories: docMeta.categories || "",
      category: docMeta.categories || "",
      status: docMeta.status || "",
      dependencies,
      consumers,
      documents: contextItems,
    };
  }

  revealInOS(
    relPath?: string,
    repoName?: string,
  ): { success: boolean; message: string; fullPath: string } {
    const cfg = loadConfig();
    const repo = repoName || cfg.active_repo?.name || "local";
    const repoDir = this.getRepoDir(repo);
    const cleanRel = (relPath || "").trim().replace(/^\/+/, "");
    const targetPath = cleanRel ? path.resolve(repoDir, cleanRel) : repoDir;

    if (!isPathInside(repoDir, targetPath)) {
      throw new Error(`Caminho fora do diretório permitido: ${cleanRel}`);
    }

    if (!fs.existsSync(targetPath)) {
      throw new Error(
        `Arquivo ou diretório não encontrado no disco: ${cleanRel || targetPath}`,
      );
    }

    const platform = process.platform;
    const isDirectory = fs.statSync(targetPath).isDirectory();

    try {
      if (platform === "darwin") {
        if (isDirectory) {
          execFile("open", [targetPath], (err) => {
            if (err)
              console.error(
                "[revealInOS] Error opening directory on macOS:",
                err,
              );
          });
        } else {
          execFile("open", ["-R", targetPath], (err) => {
            if (err)
              console.error("[revealInOS] Error revealing file on macOS:", err);
          });
        }
      } else if (platform === "win32") {
        if (isDirectory) {
          execFile("explorer.exe", [targetPath], (err) => {
            if (err)
              console.error(
                "[revealInOS] Error opening folder on Windows:",
                err,
              );
          });
        } else {
          // No Windows, usa execFile com array seguro de argumentos
          execFile(
            "explorer.exe",
            [`/select,${targetPath.replace(/\//g, "\\")}`],
            (err) => {
              if (err)
                console.error(
                  "[revealInOS] Error selecting file in Windows Explorer:",
                  err,
                );
            },
          );
        }
      } else {
        // Linux / other Unix
        const openDir = isDirectory ? targetPath : path.dirname(targetPath);
        execFile("xdg-open", [openDir], (err) => {
          if (err)
            console.error("[revealInOS] Error opening via xdg-open:", err);
        });
      }
    } catch (err: any) {
      console.error("[revealInOS] Execution failure:", err);
      throw new Error(
        `Falha ao abrir gerenciador de arquivos do sistema: ${err.message}`,
      );
    }

    return {
      success: true,
      message: `Aberto no gerenciador de arquivos do SO: ${cleanRel || "Raiz do projeto"}`,
      fullPath: targetPath,
    };
  }
}

export const workspaceService = new WorkspaceService();
