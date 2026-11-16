import type { DepartmentConfig } from "../governance/governance.types.js";
import {
  generateDocId,
  areArraysEqual,
  areMetadataItemsEqual,
  areMetadataListsEqual,
  sanitizeMetadataForFrontmatter,
  extractFrontmatterMeta,
  updateFrontmatterInMarkdown,
  extractDocLinksFromMarkdown,
  extractDocTitleFromMarkdown,
  type DocumentMetadataItem,
  type ProjectMetadataOptions,
} from "./docs-metadata-parser.js";
import {
  DocsMetadataConfigService,
  docsMetadataConfigService,
} from "./docs-metadata-config.service.js";
import {
  DocsMetadataCrudService,
  docsMetadataCrudService,
} from "./docs-metadata-crud.service.js";
import {
  DocsMetadataGraphService,
  docsMetadataGraphService,
} from "./docs-metadata-graph.service.js";

export type { DocumentMetadataItem, ProjectMetadataOptions };
export {
  generateDocId,
  areArraysEqual,
  areMetadataItemsEqual,
  areMetadataListsEqual,
  sanitizeMetadataForFrontmatter,
  extractFrontmatterMeta,
  updateFrontmatterInMarkdown,
  extractDocLinksFromMarkdown,
  extractDocTitleFromMarkdown,
  DocsMetadataConfigService,
  docsMetadataConfigService,
  DocsMetadataCrudService,
  docsMetadataCrudService,
  DocsMetadataGraphService,
  docsMetadataGraphService,
};

/**
 * DocsMetadataService (Facade)
 * Mantém 100% de compatibilidade com todos os módulos, rotas e testes consumidores,
 * delegando responsabilidades aos sub-serviços especializados de Parser, Config, CRUD e Grafo.
 */
export class DocsMetadataService {
  getDocsMetadataPath(repoName: string): string {
    return docsMetadataConfigService.getDocsMetadataPath(repoName);
  }

  getProjectConfigPath(repoName: string): string {
    return docsMetadataConfigService.getProjectConfigPath(repoName);
  }

  getProjectConfig(repoName: string): Record<string, unknown> {
    return docsMetadataConfigService.getProjectConfig(repoName);
  }

  saveProjectConfig(
    repoName: string,
    configData: Record<string, unknown>,
  ): { success: boolean; config: Record<string, unknown> } {
    return docsMetadataConfigService.saveProjectConfig(repoName, configData);
  }

  getProjectMetadataOptions(repoName: string): ProjectMetadataOptions {
    return docsMetadataConfigService.getProjectMetadataOptions(repoName);
  }

  inferDepartmentFromPath(
    filePath: string,
    repoName?: string,
    cachedDepartments?: DepartmentConfig[],
  ): { department?: string } {
    return docsMetadataConfigService.inferDepartmentFromPath(
      filePath,
      repoName,
      cachedDepartments,
    );
  }

  setFileStat(
    repoName: string,
    relPath: string,
    mtimeMs: number,
    size: number,
  ): void {
    docsMetadataCrudService.setFileStat(repoName, relPath, mtimeMs, size);
  }

  clearCache(repoName?: string): void {
    docsMetadataCrudService.clearCache(repoName);
  }

  loadDocsMetadata(
    repoName: string,
    forceDiskScan = false,
  ): DocumentMetadataItem[] {
    return docsMetadataCrudService.loadDocsMetadata(repoName, forceDiskScan);
  }

  scheduleBackgroundReconciliation(repoName: string): void {
    docsMetadataCrudService.scheduleBackgroundReconciliation(repoName);
  }

  saveDocsMetadata(repoName: string, metaList: DocumentMetadataItem[]): void {
    docsMetadataCrudService.saveDocsMetadata(repoName, metaList);
  }

  async syncMetadataToFrontmatters(
    repoName: string,
  ): Promise<{ synced: number; total: number }> {
    return docsMetadataCrudService.syncMetadataToFrontmatters(repoName);
  }

  getDocMetadata(repoName: string, filePath: string): DocumentMetadataItem {
    return docsMetadataCrudService.getDocMetadata(repoName, filePath);
  }

  updateDocMetadataItem(
    repoName: string,
    filePath: string,
    partialMeta: Partial<DocumentMetadataItem>,
  ): { success: boolean; meta: DocumentMetadataItem } {
    return docsMetadataCrudService.updateDocMetadataItem(
      repoName,
      filePath,
      partialMeta,
    );
  }

  deleteDocMetadata(repoName: string, filePath: string): void {
    docsMetadataCrudService.deleteDocMetadata(repoName, filePath);
  }

  renameDocMetadata(repoName: string, oldPath: string, newPath: string): void {
    docsMetadataCrudService.renameDocMetadata(repoName, oldPath, newPath);
  }

  migrateDocMetadata(
    sourceRepo: string,
    targetRepo: string,
    oldPath: string,
    newPath: string,
  ): void {
    docsMetadataCrudService.migrateDocMetadata(
      sourceRepo,
      targetRepo,
      oldPath,
      newPath,
    );
  }

  detachTemplateFromDocs(repoName: string, templateId: string): number {
    return docsMetadataCrudService.detachTemplateFromDocs(repoName, templateId);
  }

  getDocumentNeighborhood(repoName: string, filePath: string, depth = 1) {
    const metaList = this.loadDocsMetadata(repoName);
    return docsMetadataGraphService.getDocumentNeighborhood(
      metaList,
      filePath,
      depth,
    );
  }

  buildDocumentContextBundle(repoName: string, filePath: string) {
    const metaList = this.loadDocsMetadata(repoName);
    return docsMetadataGraphService.buildDocumentContextBundle(
      metaList,
      filePath,
    );
  }
}

export const docsMetadataService = new DocsMetadataService();
