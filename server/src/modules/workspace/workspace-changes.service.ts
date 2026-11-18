import fs from "node:fs";
import path from "node:path";
import {
  loadConfig,
  saveConfig,
  removeWorkspaceChange,
  loadRepoWorkspaceChanges,
  saveRepoWorkspaceChanges,
} from "../../config/storage.js";
import { computeDiff } from "../../utils/diff.js";
import { isGitRepo, executeGit, getGitStatus } from "../../utils/git.js";
import { assertGitPath } from "../../utils/git-validate.js";
import {
  docsMetadataService,
  extractDocLinksFromMarkdown,
  type DocumentMetadataItem,
} from "./docs-metadata.service.js";
import { draftsTrashService } from "../git/drafts-trash.service.js";
import { getRepoDir, workspaceTreeService } from "./workspace-tree.service.js";

export class WorkspaceChangesService {
  async getWorkspaceChanges(targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const activeRepo =
      cfg.repos?.find((r: { name?: string }) => r.name === repoName) ||
      (cfg.active_repo?.name === repoName
        ? cfg.active_repo
        : { name: repoName, full_name: repoName, is_local: true });

    const repoDir = getRepoDir(repoName);
    const storedChanges =
      cfg.workspace_changes?.[repoName] || loadRepoWorkspaceChanges(repoName);

    // Map existing stored changes by clean relative path
    const mergedMap = new Map<string, {
      path: string;
      type: "ADDED" | "MODIFIED" | "DELETED";
      old_content?: string;
      new_content?: string;
      timestamp?: string;
      [key: string]: unknown;
    }>();

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

        const gitFilesMap = new Map<string, { path: string; status: string }>();
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
          if (!cleanPath || cleanPath === ".docs.metadata.json") continue;

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
    const rawDocChanges = allRaw.filter((c) => {
      const clean = (c.path || "").trim().replace(/^\/+/, "").replace(/\\/g, "/");
      if (!clean) return false;
      const base = path.basename(clean);
      return (
        clean !== ".docs.metadata.json" &&
        base !== ".DS_Store" &&
        base !== ".env" &&
        !base.endsWith(".log") &&
        !clean.startsWith(".git/") &&
        clean !== ".git" &&
        !clean.includes("/node_modules/") &&
        !clean.startsWith("node_modules/")
      );
    });

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
      system_changes: [],
      total_additions: totalAdditions,
      total_deletions: totalDeletions,
      total_files: detailedChanges.length,
      total_system_files: 0,
      guardrail,
    };
  }

  async discardChanges(paths?: string[], targetRepoName?: string) {
    const cfg = loadConfig();
    const repoName = targetRepoName || cfg.active_repo?.name || "local";
    const repoDir = getRepoDir(repoName);
    const rawChanges =
      cfg.workspace_changes?.[repoName] || loadRepoWorkspaceChanges(repoName);

    const cleanPaths =
      paths && paths.length > 0
        ? paths.map((p) => p.trim().replace(/^\/+/, "")).filter(Boolean)
        : null;
    const targetSet = cleanPaths ? new Set(cleanPaths) : null;

    // Preservar alterações na lixeira permanente antes de descartar
    try {
      let fromBranch = "Principal";
      const filesToArchive: Array<{ path: string; status?: string }> = [];
      let patch = "";

      if (await isGitRepo(repoDir)) {
        const curBranchRes = await executeGit(["branch", "--show-current"], repoDir);
        if (curBranchRes.success && curBranchRes.stdout.trim()) {
          fromBranch = curBranchRes.stdout.trim();
        }

        const diffArgs = ["diff", "HEAD"];
        if (cleanPaths && cleanPaths.length > 0) {
          diffArgs.push("--", ...cleanPaths.map((p) => assertGitPath(p)));
        }
        const diffRes = await executeGit(diffArgs, repoDir);
        patch = diffRes.stdout || "";

        const statusRes = await getGitStatus(repoDir);
        const candidateFiles = (statusRes.files || []).filter(
          (f) => !targetSet || targetSet.has(f.path.trim().replace(/^\/+/, ""))
        );

        for (const uf of candidateFiles) {
          filesToArchive.push({ path: uf.path, status: uf.status });
          if (uf.status === "A" || uf.status === "U" || uf.status === "??") {
            const filePath = path.join(repoDir, uf.path);
            if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
              const content = fs.readFileSync(filePath, "utf-8");
              patch +=
                `\n--- /dev/null\n+++ b/${uf.path}\n@@ -0,0 +1,${content.split("\n").length} @@\n` +
                content
                  .split("\n")
                  .map((l) => `+${l}`)
                  .join("\n");
            }
          }
        }
      }

      for (const ch of rawChanges) {
        const cp = ch.path.trim().replace(/^\/+/, "");
        if (!targetSet || targetSet.has(cp)) {
          if (!filesToArchive.some((f) => f.path === cp)) {
            filesToArchive.push({ path: cp, status: ch.type });
          }
          if (!patch.includes(cp) && (ch.old_content !== undefined || ch.new_content !== undefined)) {
            const oldLines = (ch.old_content || "").split("\n");
            const newLines = (ch.new_content || "").split("\n");
            patch += `\n--- a/${cp}\n+++ b/${cp}\n@@ -1,${oldLines.length} +1,${newLines.length} @@\n`;
            for (const l of oldLines) patch += `-${l}\n`;
            for (const l of newLines) patch += `+${l}\n`;
          }
        }
      }

      if (patch.trim() && filesToArchive.length > 0) {
        await draftsTrashService.moveToTrash(
          {
            fromBranch,
            source: "workspace",
            message: cleanPaths
              ? `Alterações descartadas em ${cleanPaths.length === 1 ? cleanPaths[0] : `${cleanPaths.length} arquivos`}`
              : "Todas as alterações descartadas no workspace",
            files: filesToArchive,
            patch,
          },
          repoName
        );
      }
    } catch (trashErr) {
      console.warn("[WorkspaceService] Falha ao arquivar rascunho descartado na lixeira:", trashErr);
    }

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

    workspaceTreeService.invalidateTreeCache(repoName);
    const newTree = (await workspaceTreeService.getTree(repoName, true)).tree;
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
    const repoDir = getRepoDir(repoName);
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
    const dependencies: Array<{
      path: string;
      filePath: string;
      hash: string;
      title: string;
      categories: string;
      category: string;
      status: string;
    }> = [];
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
    const consumers: Array<{
      path: string;
      filePath: string;
      title: string;
      categories: string;
      category: string;
      status: string;
    }> = [];
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

    const contextItems: Array<{
      path: string;
      title: string;
      categories: string;
      category: string;
      summary: string;
    }> = [];
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
}

export const workspaceChangesService = new WorkspaceChangesService();
