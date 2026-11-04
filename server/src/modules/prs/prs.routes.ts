import { FastifyInstance } from "fastify";
import { prsService } from "./prs.service.js";
import { prConflictsService } from "./pr-conflicts.service.js";
import { loadConfig } from "../../config/storage.js";

export async function prsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/prs", async (request, reply) => {
    const query = request.query as {
      repo?: string;
      user?: string;
      page?: string;
      limit?: string;
      status?: string;
      search?: string;
    };
    const cfg = loadConfig();
    const userLogin = query.user || cfg.user?.login || "local_user";
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await prsService.getPRs(query.repo, userLogin, {
      page,
      limit,
      status: query.status,
      search: query.search,
    });
    return reply.send(result);
  });

  fastify.get("/api/prs/file-diff", async (request, reply) => {
    const query = request.query as {
      repo?: string;
      path?: string;
      commit?: string;
      pr_id?: string;
      user?: string;
    };
    const cfg = loadConfig();
    const userLogin = query.user || cfg.user?.login || "local_user";
    const diff = await prsService.getPRFileDiff(
      query.repo || "",
      query.path || "",
      query.commit,
      query.pr_id,
      userLogin,
    );
    return reply.send(diff);
  });

  fastify.get("/api/prs/file", async (request, reply) => {
    const query = request.query as {
      repo?: string;
      pr_id?: string;
      path?: string;
      user?: string;
    };
    if (!query.pr_id || !query.path) {
      return reply
        .status(400)
        .send({ error: "Parâmetros pr_id e path são obrigatórios." });
    }
    const cfg = loadConfig();
    const userLogin = query.user || cfg.user?.login || "local_user";
    try {
      const fileData = await prsService.getPRFileContent(
        query.repo || "",
        query.pr_id,
        query.path,
        userLogin,
      );
      return reply.send(fileData);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get("/api/prs/mergeability", async (request, reply) => {
    const query = request.query as { repo?: string; pr_id?: string };
    if (!query.pr_id) {
      return reply
        .status(400)
        .send({ error: "Parâmetro pr_id é obrigatório." });
    }
    const foundData = prsService.findPRAcrossRepos(query.pr_id, query.repo);
    if (!foundData) {
      return reply
        .status(404)
        .send({ error: `PR #${query.pr_id} não encontrado.` });
    }
    const { pr, repoName } = foundData;
    try {
      const mergeability = await prConflictsService.getMergeability(
        repoName,
        pr,
      );
      return reply.send(mergeability);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  fastify.get("/api/prs/conflict", async (request, reply) => {
    const query = request.query as {
      repo?: string;
      pr_id?: string;
      path?: string;
      user?: string;
    };
    if (!query.pr_id || !query.path) {
      return reply
        .status(400)
        .send({ error: "Parâmetros pr_id e path são obrigatórios." });
    }
    const foundData = prsService.findPRAcrossRepos(query.pr_id, query.repo);
    if (!foundData) {
      return reply
        .status(404)
        .send({ error: `PR #${query.pr_id} não encontrado.` });
    }
    const { pr, repoName } = foundData;
    const cfg = loadConfig();
    const userLogin = query.user || cfg.user?.login || "local_user";
    try {
      const bundle = await prConflictsService.getConflictBundle(
        repoName,
        pr,
        query.path,
        userLogin,
      );
      return reply.send(bundle);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/resolve-conflict", async (request, reply) => {
    const body = request.body as {
      repo?: string;
      pr_id?: string | number;
      filePath?: string;
      resolvedContent?: string;
      user?: string;
    };
    if (!body.pr_id || !body.filePath || body.resolvedContent === undefined) {
      return reply
        .status(400)
        .send({
          error: "Campos pr_id, filePath e resolvedContent são obrigatórios.",
        });
    }
    const foundData = prsService.findPRAcrossRepos(body.pr_id, body.repo);
    if (!foundData) {
      return reply
        .status(404)
        .send({ error: `PR #${body.pr_id} não encontrado.` });
    }
    const { pr, repoName, prs } = foundData;
    const cfg = loadConfig();
    const userLogin = body.user || cfg.user?.login || "local_user";
    try {
      const res = await prConflictsService.resolveConflict(
        repoName,
        pr,
        body.filePath,
        body.resolvedContent,
        userLogin,
      );
      prsService.afterPRHeadChanged(repoName, pr, {
        actor: userLogin,
        file: body.filePath,
        newHead: res.commitHash,
      });
      prsService.saveRepoPRs(repoName, prs);
      return reply.send({ success: true, commitHash: res.commitHash });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/update-from-base", async (request, reply) => {
    const body = request.body as {
      repo?: string;
      pr_id?: string | number;
      user?: string;
    };
    if (!body.pr_id) {
      return reply.status(400).send({ error: "Campo pr_id é obrigatório." });
    }
    const foundData = prsService.findPRAcrossRepos(body.pr_id, body.repo);
    if (!foundData) {
      return reply
        .status(404)
        .send({ error: `PR #${body.pr_id} não encontrado.` });
    }
    const { pr, repoName, prs } = foundData;
    const cfg = loadConfig();
    const userLogin = body.user || cfg.user?.login || "local_user";
    try {
      const res = await prConflictsService.updateFromBase(
        repoName,
        pr,
        userLogin,
      );
      if (res.newCommitHash) {
        prsService.afterPRHeadChanged(repoName, pr, {
          actor: userLogin,
          newHead: res.newCommitHash,
        });
        prsService.saveRepoPRs(repoName, prs);
      }
      return reply.send(res);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/workspace/generate-pr-summary", async (request, reply) => {
    const body = request.body as { repo?: string } | undefined;
    return reply.send(await prsService.generatePRSummary(body?.repo));
  });

  fastify.post("/api/prs/check-conflicts", async (request, reply) => {
    try {
      const body = (request.body as { repo?: string; files?: string[] }) || {};
      const result = await prsService.checkConflictingProposals(
        body.repo,
        body.files,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Erro ao verificar propostas concorrentes" });
    }
  });

  fastify.post("/api/workspace/create-pr", async (request, reply) => {
    try {
      const result = await prsService.createPR(request.body as any);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/approve", async (request, reply) => {
    const body = request.body as {
      id?: number | string;
      approver?: string;
      role?: string;
      comment?: string;
      repo?: string;
    };
    try {
      const result = await prsService.approvePR(body.id || "", body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/edit-file", async (request, reply) => {
    try {
      const result = await prsService.editPRFile(request.body as any);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/merge", async (request, reply) => {
    const body = request.body as { id?: number | string; repo?: string };
    try {
      const result = await prsService.mergePR(body.id || "", body.repo);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/reject", async (request, reply) => {
    const body = request.body as {
      id?: number | string;
      reason?: string;
      repo?: string;
    };
    try {
      const result = await prsService.rejectPR(
        body.id || "",
        body.reason,
        body.repo,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post("/api/prs/rollback", async (request, reply) => {
    const body = request.body as {
      id?: number | string;
      commit_hash?: string;
      repo?: string;
    };
    try {
      const result = await prsService.rollbackRevision(body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
