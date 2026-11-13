import fs from "fs";
import path from "path";
import { executeGit } from "../../utils/git.js";
import { loadConfig } from "../../config/storage.js";
import { resolveRepoDir } from "../../config/constants.js";
import { workspaceService } from "../workspace/workspace.service.js";

export interface DiscardedDraftItem {
  id: string;
  discardedAt: string;
  fromBranch: string;
  source: "stash" | "workspace" | "safe_switch";
  message?: string;
  fileCount: number;
  files: Array<{
    path: string;
    additions?: number;
    deletions?: number;
    status?: string;
  }>;
  patch: string;
  summary?: string;
}

export class DraftsTrashService {
  private getTrashDir(repoDir: string): string {
    const trashDir = path.join(repoDir, ".spec-memory", "drafts-trash");
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
    return trashDir;
  }

  private getIndexPath(trashDir: string): string {
    return path.join(trashDir, "trash-index.json");
  }

  private loadIndex(trashDir: string): DiscardedDraftItem[] {
    const indexPath = this.getIndexPath(trashDir);
    if (!fs.existsSync(indexPath)) return [];
    try {
      const content = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  private saveIndex(trashDir: string, items: DiscardedDraftItem[]): void {
    const indexPath = this.getIndexPath(trashDir);
    fs.writeFileSync(indexPath, JSON.stringify(items, null, 2), "utf-8");
  }

  private getRepoDir(repoName?: string, ownerParam?: string): string {
    if (repoName && path.isAbsolute(repoName) && fs.existsSync(repoName)) {
      return repoName;
    }
    const cfg = loadConfig();
    const activeRepoName = repoName || cfg.active_repo?.name || "local";
    const effectiveOwner =
      ownerParam ||
      (cfg.active_repo?.name === activeRepoName
        ? (typeof cfg.active_repo?.owner === "string"
            ? cfg.active_repo.owner
            : cfg.active_repo?.owner?.login)
        : undefined);

    return resolveRepoDir(activeRepoName, effectiveOwner);
  }

  async listTrash(repoName?: string, ownerParam?: string): Promise<DiscardedDraftItem[]> {
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const trashDir = this.getTrashDir(repoDir);
    return this.loadIndex(trashDir);
  }

  async moveToTrash(
    draft: {
      fromBranch?: string;
      source?: "stash" | "workspace" | "safe_switch";
      message?: string;
      files?: Array<{ path: string; additions?: number; deletions?: number; status?: string }>;
      patch?: string;
      summary?: string;
    },
    repoName?: string,
    ownerParam?: string
  ): Promise<DiscardedDraftItem> {
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const trashDir = this.getTrashDir(repoDir);
    const items = this.loadIndex(trashDir);

    const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: DiscardedDraftItem = {
      id,
      discardedAt: new Date().toISOString(),
      fromBranch: draft.fromBranch || "Principal",
      source: draft.source || "workspace",
      message: draft.message || "Rascunho descartado",
      fileCount: draft.files?.length || 0,
      files: draft.files || [],
      patch: draft.patch || "",
      summary: draft.summary,
    };

    // Salvar o patch individual se houver
    if (draft.patch) {
      const patchesDir = path.join(trashDir, "patches");
      if (!fs.existsSync(patchesDir)) {
        fs.mkdirSync(patchesDir, { recursive: true });
      }
      fs.writeFileSync(path.join(patchesDir, `${id}.patch`), draft.patch, "utf-8");
    }

    items.unshift(newItem);
    this.saveIndex(trashDir, items);
    return newItem;
  }

  async restoreTrash(
    id: string,
    repoName?: string,
    ownerParam?: string
  ): Promise<{ success: boolean; message: string; appliedFiles?: string[] }> {
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const trashDir = this.getTrashDir(repoDir);
    const items = this.loadIndex(trashDir);
    const item = items.find((i) => i.id === id);

    if (!item) {
      return { success: false, message: `Rascunho descartado com ID ${id} não foi encontrado.` };
    }

    if (!item.patch || !item.patch.trim()) {
      return { success: false, message: "Rascunho não contém patch válido para restauração." };
    }

    // Tentar aplicar patch via git apply
    const tempPatchPath = path.join(trashDir, `temp-${Date.now()}.patch`);
    fs.writeFileSync(tempPatchPath, item.patch, "utf-8");

    try {
      const applyRes = await executeGit(["apply", "--whitespace=nowarn", tempPatchPath], repoDir);
      if (!applyRes.success) {
        // Tentar git apply com 3way se disponível
        const apply3WayRes = await executeGit(["apply", "-3", "--whitespace=nowarn", tempPatchPath], repoDir);
        if (!apply3WayRes.success) {
          return {
            success: false,
            message: `Não foi possível restaurar automaticamente devido a conflitos com a versão atual: ${apply3WayRes.stderr || applyRes.stderr}`,
          };
        }
      }

      // Remover da lixeira após restauração bem sucedida
      const updatedItems = items.filter((i) => i.id !== id);
      this.saveIndex(trashDir, updatedItems);
      const patchFile = path.join(trashDir, "patches", `${id}.patch`);
      if (fs.existsSync(patchFile)) {
        try {
          fs.unlinkSync(patchFile);
        } catch {}
      }

      workspaceService.invalidateTreeCache(repoName || "local");

      return {
        success: true,
        message: `Rascunho de "${item.fromBranch}" restaurado com sucesso no workspace.`,
        appliedFiles: item.files.map((f) => f.path),
      };
    } finally {
      if (fs.existsSync(tempPatchPath)) {
        try {
          fs.unlinkSync(tempPatchPath);
        } catch {}
      }
    }
  }

  async deleteTrashItem(
    id: string,
    repoName?: string,
    ownerParam?: string
  ): Promise<{ success: boolean; message: string }> {
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const trashDir = this.getTrashDir(repoDir);
    const items = this.loadIndex(trashDir);
    const updatedItems = items.filter((i) => i.id !== id);

    this.saveIndex(trashDir, updatedItems);
    const patchFile = path.join(trashDir, "patches", `${id}.patch`);
    if (fs.existsSync(patchFile)) {
      try {
        fs.unlinkSync(patchFile);
      } catch {}
    }

    return { success: true, message: "Rascunho descartado excluído permanentemente da lixeira." };
  }

  async clearTrash(
    repoName?: string,
    ownerParam?: string
  ): Promise<{ success: boolean; message: string }> {
    const repoDir = this.getRepoDir(repoName, ownerParam);
    const trashDir = this.getTrashDir(repoDir);
    this.saveIndex(trashDir, []);
    const patchesDir = path.join(trashDir, "patches");
    if (fs.existsSync(patchesDir)) {
      try {
        fs.rmSync(patchesDir, { recursive: true, force: true });
      } catch {}
    }
    return { success: true, message: "Lixeira de rascunhos esvaziada com sucesso." };
  }
}

export const draftsTrashService = new DraftsTrashService();
