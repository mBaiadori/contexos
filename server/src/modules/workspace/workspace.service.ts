import {
  generateDocId,
  extractDocLinksFromMarkdown,
  extractFrontmatterMeta,
  type DocumentMetadataItem,
  docsMetadataService,
} from "./docs-metadata.service.js";
import {
  DEFAULT_HIDDEN_FILES,
  loadHiddenFiles,
  isPathHidden,
  isSystemPath,
} from "../../utils/hidden-files.js";
import type { TreeNode } from "./workspace-types.js";
import {
  WorkspaceTreeService,
  workspaceTreeService,
  getRepoDir,
} from "./workspace-tree.service.js";
import {
  WorkspaceOpsService,
  workspaceOpsService,
} from "./workspace-ops.service.js";
import {
  WorkspaceChangesService,
  workspaceChangesService,
} from "./workspace-changes.service.js";

export type { TreeNode, DocumentMetadataItem };
export {
  generateDocId,
  extractDocLinksFromMarkdown,
  extractFrontmatterMeta,
  DEFAULT_HIDDEN_FILES,
  loadHiddenFiles,
  isPathHidden,
  isSystemPath,
  WorkspaceTreeService,
  workspaceTreeService,
  WorkspaceOpsService,
  workspaceOpsService,
  WorkspaceChangesService,
  workspaceChangesService,
  getRepoDir,
};

/**
 * WorkspaceService (Facade)
 * Mantém 100% de compatibilidade com todos os módulos, rotas e testes consumidores,
 * delegando responsabilidades aos sub-serviços especializados de Tree, Operações (CRUD) e Alterações (Changes).
 */
export class WorkspaceService {
  invalidateTreeCache(repoName?: string): void {
    workspaceTreeService.invalidateTreeCache(repoName);
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
    return workspaceTreeService.buildTree(dir, baseDir, docsMetadata, hiddenFiles);
  }

  async getTree(
    targetRepoName?: string,
    ownerOrOrgOrForce?: string | boolean,
    forceRefresh = false,
  ) {
    return workspaceTreeService.getTree(
      targetRepoName,
      ownerOrOrgOrForce,
      forceRefresh,
    );
  }

  getFile(filePath: string, targetRepoName?: string) {
    return workspaceOpsService.getFile(filePath, targetRepoName);
  }

  getRawFile(filePath: string, targetRepoName?: string) {
    return workspaceOpsService.getRawFile(filePath, targetRepoName);
  }

  verifyUserClearance(repoName: string, filePath: string, meta?: Record<string, unknown>): void {
    workspaceOpsService.verifyUserClearance(repoName, filePath, meta);
  }

  async saveFile(
    filePath: string,
    content: string,
    meta?: Record<string, unknown>,
    targetRepoName?: string,
  ) {
    return workspaceOpsService.saveFile(
      filePath,
      content,
      meta,
      targetRepoName,
    );
  }

  async createFile(
    filePath: string,
    initialContent: string = "",
    isFolder: boolean = false,
    meta?: Record<string, unknown>,
    targetRepoName?: string,
  ) {
    return workspaceOpsService.createFile(
      filePath,
      initialContent,
      isFolder,
      meta,
      targetRepoName,
    );
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
    return workspaceOpsService.importFiles(
      targetFolder,
      filesToImport,
      targetRepoName,
    );
  }

  async renameFile(oldPath: string, newPath: string, targetRepoName?: string) {
    return workspaceOpsService.renameFile(oldPath, newPath, targetRepoName);
  }

  async moveFile(
    sourcePath: string,
    targetPath: string,
    sourceRepoName?: string,
    targetRepoName?: string,
  ) {
    return workspaceOpsService.moveFile(
      sourcePath,
      targetPath,
      sourceRepoName,
      targetRepoName,
    );
  }

  async deleteFile(filePath: string, targetRepoName?: string) {
    return workspaceOpsService.deleteFile(filePath, targetRepoName);
  }

  async duplicateFile(filePath: string, targetRepoName?: string) {
    return workspaceOpsService.duplicateFile(filePath, targetRepoName);
  }

  async getWorkspaceChanges(targetRepoName?: string) {
    return workspaceChangesService.getWorkspaceChanges(targetRepoName);
  }

  async discardChanges(paths?: string[], targetRepoName?: string) {
    return workspaceChangesService.discardChanges(paths, targetRepoName);
  }

  getDocumentContext(filePath: string, targetRepoName?: string) {
    return workspaceChangesService.getDocumentContext(filePath, targetRepoName);
  }

  revealInOS(
    relPath?: string,
    repoName?: string,
  ): { success: boolean; message: string; fullPath: string } {
    return workspaceTreeService.revealInOS(relPath, repoName);
  }
}

export const workspaceService = new WorkspaceService();
