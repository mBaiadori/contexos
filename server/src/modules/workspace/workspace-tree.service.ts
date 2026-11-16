import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import {
  loadHiddenFiles,
  isPathHidden,
} from "../../utils/hidden-files.js";
import { isPathInside } from "../../utils/repo-ref.js";
import {
  docsMetadataService,
  type DocumentMetadataItem,
} from "./docs-metadata.service.js";
import type { TreeNode } from "./workspace-types.js";

export function getRepoDir(repoName: string, ownerOrOrg?: string): string {
  const cfg = loadConfig();
  let effectiveOwner =
    ownerOrOrg ||
    (cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined);
  if (!effectiveOwner && repoName && repoName.includes("/")) {
    effectiveOwner = repoName.split("/")[0];
  }
  return resolveRepoDir(repoName || "local", effectiveOwner);
}

export class WorkspaceTreeService {
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
    const repoDir = getRepoDir(repoName, actualOwner);

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

  revealInOS(
    relPath?: string,
    repoName?: string,
  ): { success: boolean; message: string; fullPath: string } {
    const cfg = loadConfig();
    const repo = repoName || cfg.active_repo?.name || "local";
    const repoDir = getRepoDir(repo);
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
        const openDir = isDirectory ? targetPath : path.dirname(targetPath);
        execFile("xdg-open", [openDir], (err) => {
          if (err)
            console.error("[revealInOS] Error opening via xdg-open:", err);
        });
      }
    } catch (err: unknown) {
      console.error("[revealInOS] Execution failure:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Falha ao abrir gerenciador de arquivos do sistema: ${errMsg}`,
      );
    }

    return {
      success: true,
      message: `Aberto no gerenciador de arquivos do SO: ${cleanRel || "Raiz do projeto"}`,
      fullPath: targetPath,
    };
  }
}

export const workspaceTreeService = new WorkspaceTreeService();
