import { FastifyInstance } from "fastify";
import { workspaceService } from "./workspace.service.js";
import { docsMetadataService } from "./docs-metadata.service.js";
import { loadConfig } from "../../config/storage.js";

function getErrMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function workspaceRoutes(fastify: FastifyInstance) {
  fastify.get("/api/project/tree", async (request, reply) => {
    try {
      const query = request.query as { repo?: string; org?: string; owner?: string };
      return reply.send(await workspaceService.getTree(query.repo, query.org || query.owner));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/project/file", async (request, reply) => {
    const query = request.query as { path?: string; repo?: string };
    const filePath = query.path?.trim();
    if (!filePath) {
      return reply.status(400).send({ error: "Parâmetro path é obrigatório" });
    }
    try {
      return reply.send(workspaceService.getFile(filePath, query.repo));
    } catch (err: unknown) {
      return reply.status(404).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/project/file/raw", async (request, reply) => {
    const query = request.query as { path?: string; repo?: string };
    const filePath = query.path?.trim();
    if (!filePath) {
      return reply.status(400).send({ error: "Parâmetro path é obrigatório" });
    }
    try {
      const { buffer, mimeType, filename } = workspaceService.getRawFile(
        filePath,
        query.repo,
      );
      return reply
        .header("Content-Type", mimeType)
        .header(
          "Content-Disposition",
          `inline; filename="${encodeURIComponent(filename)}"`,
        )
        .send(buffer);
    } catch (err: unknown) {
      return reply.status(404).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/project/metadata", async (request, reply) => {
    try {
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || "local";
      return reply.send(docsMetadataService.loadDocsMetadata(repoName));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/project/metadata/options", async (request, reply) => {
    try {
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || "local";
      return reply.send(
        docsMetadataService.getProjectMetadataOptions(repoName),
      );
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/workspace/context-bundle", async (request, reply) => {
    try {
      const query = request.query as { path?: string; repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || "local";
      const filePath = query.path || "index.md";
      return reply.send(
        docsMetadataService.buildDocumentContextBundle(repoName, filePath),
      );
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/project/config", async (request, reply) => {
    try {
      const query = request.query as { repo?: string };
      const cfg = loadConfig();
      const repoName = query.repo || cfg.active_repo?.name || "local";
      return reply.send(docsMetadataService.getProjectConfig(repoName));
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/config", async (request, reply) => {
    try {
      const body = (request.body || {}) as {
        config?: Record<string, unknown>;
        repo?: string;
        [key: string]: unknown;
      };
      const configData = (body.config || body) as Parameters<typeof docsMetadataService.saveProjectConfig>[1];
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || "local";
      const result = docsMetadataService.saveProjectConfig(
        repoName,
        configData,
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.patch("/api/project/metadata/item", async (request, reply) => {
    const body = request.body as { path?: string; meta?: Record<string, unknown>; repo?: string };
    const cleanPath = (body.path || "").trim().replace(/^\/+/, "");
    if (!cleanPath) {
      return reply.status(400).send({ error: "Parâmetro path é obrigatório" });
    }
    try {
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || "local";
      const result = docsMetadataService.updateDocMetadataItem(
        repoName,
        cleanPath,
        body.meta || {},
      );
      workspaceService.invalidateTreeCache(repoName);
      const tree = (await workspaceService.getTree(repoName, true)).tree;
      return reply.send({
        success: true,
        meta: result.meta,
        tree,
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/metadata/sync-frontmatters", async (request, reply) => {
    try {
      const body = (request.body as { repo?: string }) || {};
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || "local";
      const result = await docsMetadataService.syncMetadataToFrontmatters(repoName);
      return reply.send({ success: true, ...result });
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/metadata/reconcile", async (request, reply) => {
    try {
      const body = (request.body as { repo?: string }) || {};
      const cfg = loadConfig();
      const repoName = body.repo || cfg.active_repo?.name || "local";
      docsMetadataService.scheduleBackgroundReconciliation(repoName);
      return reply.send({ success: true, message: "Reconciliação iniciada em segundo plano." });
    } catch (err: unknown) {
      return reply.status(500).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/workspace/save", { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const body = request.body as {
      path?: string;
      content?: string;
      meta?: Record<string, unknown>;
      repo?: string;
    };
    if (!body.path) {
      return reply.status(400).send({ error: "Parâmetro path é obrigatório" });
    }
    try {
      return reply.send(
        await workspaceService.saveFile(
          body.path,
          body.content || "",
          body.meta,
          body.repo,
        ),
      );
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/file/create", async (request, reply) => {
    const body = request.body as {
      path?: string;
      content?: string;
      is_folder?: boolean;
      isFolder?: boolean;
      meta?: { templateId?: string; prompt?: string; [key: string]: unknown };
      templateId?: string;
      repo?: string;
    };
    try {
      const isFolder = !!(body.is_folder || body.isFolder);
      let content = body.content || "";
      let templatePrompt = "";
      const templateId = body.templateId || body.meta?.templateId || "";

      // If a templateId is provided, resolve and apply the template content and templatePrompt
      if (!isFolder && templateId) {
        const { templatesService } =
          await import("../templates/templates.service.js");
        const cfg = loadConfig();
        const repoName = body.repo || cfg.active_repo?.name || "local";
        const tpl = templatesService.resolveTemplate(templateId, repoName);
        if (tpl) {
          content = tpl.content;
          templatePrompt = tpl.prompt || tpl.systemPrompt || "";
        }
      }

      const meta = {
        ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
        templateId: templateId || "",
        prompt: body.meta?.prompt || "",
      };

      const result = await workspaceService.createFile(
        body.path || "",
        content,
        isFolder,
        meta,
        body.repo,
      );
      return reply.send({
        ...result,
        templatePrompt,
        systemPrompt: templatePrompt,
        templateId,
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/files/import", { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const body = request.body as {
      target_folder?: string;
      targetFolder?: string;
      files?: Array<{
        name: string;
        relativePath?: string;
        content?: string;
        base64?: string;
        meta?: Record<string, unknown>;
      }>;
      repo?: string;
    };
    try {
      const targetFolder = body.target_folder ?? body.targetFolder ?? "";
      const files = body.files || [];
      if (!Array.isArray(files) || files.length === 0) {
        return reply
          .status(400)
          .send({ error: "Nenhum arquivo enviado para importação." });
      }

      const result = await workspaceService.importFiles(
        targetFolder,
        files,
        body.repo,
      );
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/file/rename", async (request, reply) => {
    const body = request.body as {
      old_path?: string;
      new_path?: string;
      oldPath?: string;
      newPath?: string;
      repo?: string;
      source_repo?: string;
      target_repo?: string;
    };
    const oldPath = body.old_path || body.oldPath || "";
    const newPath = body.new_path || body.newPath || "";
    const sourceRepo = body.source_repo || body.repo;
    const targetRepo = body.target_repo || sourceRepo;
    try {
      if (targetRepo && sourceRepo && targetRepo !== sourceRepo) {
        return reply.send(
          await workspaceService.moveFile(
            oldPath,
            newPath,
            sourceRepo,
            targetRepo,
          ),
        );
      }
      return reply.send(
        await workspaceService.renameFile(oldPath, newPath, sourceRepo),
      );
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/file/move", async (request, reply) => {
    const body = request.body as {
      source_path?: string;
      old_path?: string;
      target_path?: string;
      new_path?: string;
      source_repo?: string;
      target_repo?: string;
      repo?: string;
    };
    const sourcePath = body.source_path || body.old_path || "";
    const targetPath = body.target_path || body.new_path || "";
    const sourceRepo = body.source_repo || body.repo;
    const targetRepo = body.target_repo || sourceRepo;
    try {
      return reply.send(
        await workspaceService.moveFile(
          sourcePath,
          targetPath,
          sourceRepo,
          targetRepo,
        ),
      );
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.delete("/api/project/file", async (request, reply) => {
    const query = request.query as { path?: string; repo?: string };
    try {
      return reply.send(
        await workspaceService.deleteFile(query.path || "", query.repo),
      );
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/file/duplicate", async (request, reply) => {
    const body = request.body as { path?: string; repo?: string };
    try {
      return reply.send(
        await workspaceService.duplicateFile(body.path || "", body.repo),
      );
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.get("/api/workspace/changes", async (request, reply) => {
    const query = request.query as { repo?: string };
    return reply.send(await workspaceService.getWorkspaceChanges(query.repo));
  });

  fastify.post("/api/workspace/discard", async (request, reply) => {
    const body = request.body as {
      path?: string;
      paths?: string[];
      repo?: string;
    };
    const paths = body?.paths || (body?.path ? [body.path] : undefined);
    return reply.send(await workspaceService.discardChanges(paths, body?.repo));
  });

  fastify.get("/api/project/document-context", async (request, reply) => {
    const query = request.query as { path?: string; repo?: string };
    return reply.send(
      workspaceService.getDocumentContext(query.path || "", query.repo),
    );
  });

  fastify.get("/api/project/status", async (request, reply) => {
    const query = request.query as { repo?: string };
    const treeData = await workspaceService.getTree(query.repo);
    const changesData = await workspaceService.getWorkspaceChanges(query.repo);
    return reply.send({
      repo: treeData.repo,
      total_files: treeData.tree.length,
      pending_changes: changesData.changes.length,
      guardrail: changesData.guardrail,
    });
  });

  fastify.get("/api/project/domains-docs", async (request, reply) => {
    const query = request.query as { path?: string };
    return reply.send(workspaceService.getDocumentContext(query.path || ""));
  });

  fastify.get("/api/project/sync-status", async (_request, reply) => {
    return reply.send({
      synced: true,
      last_sync: new Date().toISOString(),
    });
  });

  fastify.post("/api/project/bootstrap", async (_request, reply) => {
    const treeData = await workspaceService.getTree();
    return reply.send({
      success: true,
      message: "Workspace inicializado com sucesso!",
      tree: treeData.tree,
    });
  });

  fastify.post("/api/project/scaffold", async (request, reply) => {
    const body = request.body as {
      template_id?: string;
      folder?: string;
      filename?: string;
      title?: string;
    };
    const folder = (body.folder || "domains").trim().replace(/^\/+/, "");
    const filename = (body.filename || `${body.template_id || "feature"}.md`)
      .trim()
      .replace(/^\/+/, "");
    const fullRelPath = `${folder}/${filename}`;

    try {
      const created = await workspaceService.createFile(
        fullRelPath,
        "",
        false,
        {
          title: body.title || "Novo Documento",
          categories: "",
          status: "-",
        },
      );
      return reply.send({
        success: true,
        path: fullRelPath,
        tree: created.tree,
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/open-in-os", async (request, reply) => {
    const body = request.body as { path?: string; repo?: string };
    try {
      const result = workspaceService.revealInOS(body?.path, body?.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });

  fastify.post("/api/project/reveal-in-os", async (request, reply) => {
    const body = request.body as { path?: string; repo?: string };
    try {
      const result = workspaceService.revealInOS(body?.path, body?.repo);
      return reply.send(result);
    } catch (err: unknown) {
      return reply.status(400).send({ error: getErrMsg(err) });
    }
  });
}
