import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { METADATA_CACHE_DIR, resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { validateJsonSchema } from "../../utils/schema.validator.js";
import {
  DEFAULT_DEPARTMENTS,
  DepartmentConfig,
} from "../governance/governance.types.js";
import { writeJsonAtomic } from "../../utils/atomic-write.js";
import type { ProjectMetadataOptions } from "./docs-metadata-parser.js";

export class DocsMetadataConfigService {
  getRepoDir(repoName: string): string {
    const cfg = loadConfig();
    const effectiveOwner =
      cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(repoName || "local", effectiveOwner);
  }

  getDocsMetadataPath(repoName: string): string {
    const repoDir = path.resolve(this.getRepoDir(repoName));
    const safeName = (repoName || "local").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const hash = crypto
      .createHash("sha256")
      .update(repoDir)
      .digest("hex")
      .slice(0, 12);
    return path.join(METADATA_CACHE_DIR, `${safeName}-${hash}.json`);
  }

  getLegacyRepoMetadataPath(repoName: string): string | null {
    const repoDir = this.getRepoDir(repoName);
    const hiddenPath = path.join(repoDir, ".docs.metadata.json");
    if (fs.existsSync(hiddenPath)) {
      return hiddenPath;
    }
    const legacyPath = path.join(repoDir, "project", "docs.metadata.json");
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
    return null;
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
    { config: Record<string, unknown>; mtimeMs: number }
  >();

  clearProjectConfigCache(repoName?: string): void {
    if (repoName) {
      this.projectConfigCache.delete(repoName);
    } else {
      this.projectConfigCache.clear();
    }
  }

  getProjectConfig(repoName: string): Record<string, unknown> {
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
    configData: Record<string, unknown>,
  ): { success: boolean; config: Record<string, unknown> } {
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

    const statuses = Array.isArray(config.statuses)
      ? (config.statuses as ProjectMetadataOptions["statuses"])
      : [];
    const categories = Array.isArray(config.categories)
      ? (config.categories as ProjectMetadataOptions["categories"])
      : [];
    const tags = Array.isArray(config.tags)
      ? (config.tags as ProjectMetadataOptions["tags"])
      : [];
    const badges = Array.isArray(config.badges)
      ? (config.badges as ProjectMetadataOptions["badges"])
      : [];

    const departments: DepartmentConfig[] =
      Array.isArray(config.departments) && config.departments.length > 0
        ? (config.departments as DepartmentConfig[])
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
          departments = config.departments as DepartmentConfig[];
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
}

export const docsMetadataConfigService = new DocsMetadataConfigService();
