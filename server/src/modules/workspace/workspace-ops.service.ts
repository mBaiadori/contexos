import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  recordChange,
  removeWorkspaceChange,
} from "../../config/storage.js";
import { isGitRepo, executeGit } from "../../utils/git.js";
import { assertGitPath } from "../../utils/git-validate.js";
import {
  docsMetadataService,
  extractDocLinksFromMarkdown,
  extractFrontmatterMeta,
} from "./docs-metadata.service.js";
import { translationsService } from "../translations/translations.service.js";
import { governanceService } from "../governance/governance.service.js";
import { canAccessDocument } from "../../utils/crypto.js";
import { isPathInside, resolveSafeRepoPath } from "../../utils/repo-ref.js";
import { getRepoDir, workspaceTreeService } from "./workspace-tree.service.js";
import type { TreeNode } from "./workspace-types.js";

export class WorkspaceOpsService {
  getFile(filePath: string, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = getRepoDir(repoName);
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
      } catch {
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
    const repoDir = getRepoDir(repoName);
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
      docx: "application/vnd.wordprocessingml.document",
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

  verifyUserClearance(repoName: string, filePath: string, meta?: { department?: string; [key: string]: unknown }): void {
    const cfg = loadConfig();
    const activeUserLogin = cfg.user?.login || 'local';
    const pConfig = governanceService.readProjectConfig(repoName);
    const localMemberMeta = pConfig.governance_collaborators || {};
    const collabMeta = (Object.entries(localMemberMeta).find(
      ([k]) => k.toLowerCase() === activeUserLogin.toLowerCase()
    )?.[1] as { departments?: string[]; allowed_paths?: string[]; denied_paths?: string[] } | undefined) || {};

    const repoObj = cfg.repos?.find((r: { name?: string }) => r.name === repoName) || (cfg.active_repo?.name === repoName ? cfg.active_repo : undefined);
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
    const docDept = meta?.department || docMeta?.department || cleanPath.split('/')[0];

    if (!canAccessDocument(userProfile, { department: docDept, path: cleanPath })) {
      throw new Error(`Acesso Negado: Você não possui autorização de departamento ou rota para acessar o documento '${cleanPath}'.`);
    }
  }

  async saveFile(filePath: string, content: string, meta?: Record<string, unknown>, targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = getRepoDir(repoName);
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

    if (changeType === "ADDED" || oldContent !== content) {
      fs.writeFileSync(fullPath, content, "utf-8");
    }
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
      workspaceTreeService.invalidateTreeCache(repoName);
      newTree = (await workspaceTreeService.getTree(repoName, true)).tree;
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
    meta?: Record<string, unknown>,
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

    const repoDir = getRepoDir(repoName);

    if (isFolder) {
      const fullPath = resolveSafeRepoPath(repoDir, cleanPath, "Pasta");
      if (fs.existsSync(fullPath)) {
        throw new Error(`Pasta '${cleanPath}' já existe.`);
      }
      fs.mkdirSync(fullPath, { recursive: true });
      recordChange(repoName, cleanPath, "ADDED", "", "");

      workspaceTreeService.invalidateTreeCache(repoName);
      const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;
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

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;

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
      meta?: Record<string, unknown>;
    }>,
    targetRepoName?: string,
  ) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = getRepoDir(repoName);
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
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Erro ao importar ${item.name}: ${errMsg}`);
      }
    }

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;

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
    const repoDir = getRepoDir(repoName);
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

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;

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

    const sourceRepoDir = getRepoDir(sourceRepo);
    const targetRepoDir = getRepoDir(targetRepo);

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
    workspaceTreeService.invalidateTreeCache(sourceRepo);
    workspaceTreeService.invalidateTreeCache(targetRepo);

    const sourceTree = (await workspaceTreeService.getTree(sourceRepo, true)).tree;
    const targetTree = (await workspaceTreeService.getTree(targetRepo, true)).tree;

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

    const repoDir = getRepoDir(repoName);
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

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;

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

    const repoDir = getRepoDir(repoName);
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

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;

    return {
      success: true,
      originalPath: cleanPath,
      newPath: copyRelPath,
      repo: repoName,
      tree: newTree,
    };
  }
}

export const workspaceOpsService = new WorkspaceOpsService();
