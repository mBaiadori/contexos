import { FastifyInstance } from "fastify";
import { gitService } from "./git.service.js";
import { draftsTrashService } from "./drafts-trash.service.js";

export async function gitRoutes(app: FastifyInstance) {
  // 1. Get current Git Status
  app.get("/api/git/status", async (req, reply) => {
    try {
      const { repo } = req.query as { repo?: string };
      const data = await gitService.getStatus(repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter status do Git" });
    }
  });

  // 2. Get Git Log / Commits history
  app.get("/api/git/log", async (req, reply) => {
    try {
      const { limit, repo } = req.query as { limit?: string; repo?: string };
      const data = await gitService.getLog(limit ? parseInt(limit, 10) : 20, repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter histórico de commits" });
    }
  });

  // 3. Get Branches
  app.get("/api/git/branches", async (req, reply) => {
    try {
      const { repo } = req.query as { repo?: string };
      const data = await gitService.getBranches(repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao listar branches" });
    }
  });

  // 3.1 Get Version Graph (Nodes, Proposals, Status)
  app.get("/api/git/version-graph", async (req, reply) => {
    try {
      const { repo } = req.query as { repo?: string };
      const data = await gitService.getVersionGraph(repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao carregar grafo de versões" });
    }
  });

  // 3.2 Safe Switch (Check, Stash, Discard or Switch)
  app.post("/api/git/safe-switch", async (req, reply) => {
    try {
      const body = req.body as {
        branch?: string;
        commitHash?: string;
        repo?: string;
        action?: "check" | "switch" | "stash" | "discard";
      };
      if (!body?.branch && !body?.commitHash) {
        return reply
          .status(400)
          .send({ error: "Nome da versão (branch) ou hash do commit é obrigatório" });
      }
      const res = await gitService.safeSwitch(body);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao alternar de versão com segurança" });
    }
  });

  // 3.3 Restore Stashed Drafts
  app.post("/api/git/stash-pop", async (req, reply) => {
    try {
      const { repo, stashId } = (req.body as { repo?: string; stashId?: string }) || {};
      const res = await gitService.popStash(repo, stashId);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao restaurar rascunhos" });
    }
  });

  // 3.4 Drop Stashed Drafts
  app.post("/api/git/stash-drop", async (req, reply) => {
    try {
      const { repo, stashId } = (req.body as { repo?: string; stashId?: string }) || {};
      const res = await gitService.dropStash(repo, stashId);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao descartar rascunho" });
    }
  });

  // 3.5 Clear All Stashes
  app.post("/api/git/stash-clear", async (req, reply) => {
    try {
      const { repo } = (req.body as { repo?: string }) || {};
      const res = await gitService.clearStashes(repo);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao limpar stashes" });
    }
  });

  // 3.6 Get Stash Details
  app.get("/api/git/stash-details", async (req, reply) => {
    try {
      const { repo, stashId, owner } = req.query as {
        repo?: string;
        stashId?: string;
        owner?: string;
      };
      const details = await gitService.getStashDetails(repo, stashId, owner);
      return details;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter detalhes do rascunho guardado" });
    }
  });

  // 3.7 List Drafts Trash
  app.get("/api/git/trash", async (req, reply) => {
    try {
      const { repo, owner } = req.query as { repo?: string; owner?: string };
      const items = await draftsTrashService.listTrash(repo, owner);
      return { trash: items };
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao listar lixeira de rascunhos" });
    }
  });

  // 3.8 Restore Draft From Trash
  app.post("/api/git/trash/restore", async (req, reply) => {
    try {
      const { id, repo, owner } = req.body as { id: string; repo?: string; owner?: string };
      if (!id) {
        return reply.status(400).send({ error: "ID do rascunho é obrigatório para restauração." });
      }
      const res = await draftsTrashService.restoreTrash(id, repo, owner);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao restaurar rascunho da lixeira" });
    }
  });

  // 3.9 Delete Single Trash Item
  app.delete("/api/git/trash/:id", async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const { repo, owner } = req.query as { repo?: string; owner?: string };
      const res = await draftsTrashService.deleteTrashItem(id, repo, owner);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao excluir rascunho da lixeira" });
    }
  });

  // 3.10 Empty Drafts Trash
  app.delete("/api/git/trash", async (req, reply) => {
    try {
      const { repo, owner } = req.query as { repo?: string; owner?: string };
      const res = await draftsTrashService.clearTrash(repo, owner);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao esvaziar lixeira" });
    }
  });

  // 4. Create or Switch Branch
  app.post("/api/git/branch", async (req, reply) => {
    try {
      const { branch, repo, baseBranch } = req.body as {
        branch: string;
        repo?: string;
        baseBranch?: string;
      };
      if (!branch) {
        return reply
          .status(400)
          .send({ error: "Nome da branch é obrigatório" });
      }
      const res = await gitService.switchOrCreateBranch(branch, repo, undefined, baseBranch);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao trocar de branch" });
    }
  });

  // 5. Commit changes
  app.post("/api/git/commit", async (req, reply) => {
    try {
      const { message, files, user, repo } = req.body as {
        message: string;
        files?: string[];
        user?: string;
        repo?: string;
      };
      if (!message || !message.trim()) {
        return reply
          .status(400)
          .send({ error: "Mensagem de commit é obrigatória" });
      }
      const res = await gitService.commit(message.trim(), files, user, repo);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao realizar commit" });
    }
  });

  // 6. Sync with remote (Push/Pull)
  app.post("/api/git/sync", async (req, reply) => {
    try {
      const { branch, repo } = (req.body as { branch?: string; repo?: string }) || {};
      const res = await gitService.sync(branch, repo);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao sincronizar com remote" });
    }
  });

  // 7. Get File Blame
  app.get("/api/git/blame", async (req, reply) => {
    try {
      const { path, repo } = req.query as { path: string; repo?: string };
      if (!path) {
        return reply
          .status(400)
          .send({ error: "Caminho do arquivo é obrigatório" });
      }
      const res = await gitService.getBlame(path, repo);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter blame do arquivo" });
    }
  });

  // 8. Get Specific File History (Commits)
  app.get("/api/git/file-history", async (req, reply) => {
    try {
      const { path, limit, repo } = req.query as { path: string; limit?: string; repo?: string };
      if (!path) {
        return reply
          .status(400)
          .send({ error: "Caminho do arquivo é obrigatório" });
      }
      const res = await gitService.getFileHistory(
        path,
        limit ? parseInt(limit, 10) : 30,
        repo
      );
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter histórico do arquivo" });
    }
  });

  // 9. Get Specific File Content at Historical Commit
  app.get("/api/git/file-version", async (req, reply) => {
    try {
      const { path, hash, repo } = req.query as { path: string; hash: string; repo?: string };
      if (!path || !hash) {
        return reply
          .status(400)
          .send({ error: "Parâmetros path e hash são obrigatórios" });
      }
      const res = await gitService.getFileVersion(path, hash, repo);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter versão do arquivo" });
    }
  });

  // 10. Get File / Working Tree Diff
  app.get("/api/git/diff", async (req, reply) => {
    try {
      const { path, repo } = req.query as { path?: string; repo?: string };
      const data = await gitService.getDiff(path, repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter diff do Git" });
    }
  });

  // 11. Get Whats New Summary
  app.get("/api/git/whats-new", async (req, reply) => {
    try {
      const { lastSeenHash, repo } = req.query as { lastSeenHash?: string; repo?: string };
      const data = await gitService.getWhatsNew(lastSeenHash, repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao obter novidades d" });
    }
  });

  // 12. Get Whats New Single File Diff
  app.get("/api/git/whats-new-diff", async (req, reply) => {
    try {
      const { path: filePath, lastSeenHash, repo } = req.query as {
        path: string;
        lastSeenHash?: string;
        repo?: string;
      };
      if (!filePath) {
        return reply
          .status(400)
          .send({ error: "Parâmetro path é obrigatório" });
      }
      const data = await gitService.getWhatsNewDiff(filePath, lastSeenHash, repo);
      return data;
    } catch (err: any) {
      return reply
        .status(500)
        .send({
          error: err.message || "Erro ao obter comparativo do documento",
        });
    }
  });

  // 13. Get Git Diagnostic / Version
  app.get("/api/git/diagnostic", async (req, reply) => {
    try {
      const res = await gitService.getGitVersion();
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao diagnosticar Git" });
    }
  });

  // 14. Check Remote Updates (Commit comparison without blocking)
  app.get("/api/git/check-remote", async (req, reply) => {
    try {
      const { repo, branch } = req.query as { repo?: string; branch?: string };
      const res = await gitService.checkRemote(repo, branch);
      return res;
    } catch (err: any) {
      return reply
        .status(500)
        .send({ error: err.message || "Erro ao verificar atualizações remotas" });
    }
  });

  // 15. Explicit Clone Repo
  app.post("/api/git/clone", async (req, reply) => {
    try {
      const { repo, owner, remote_url } = req.body as { repo: string; owner?: string; remote_url?: string };
      if (!repo) {
        return reply.status(400).send({ error: "Nome do repositório é obrigatório para clone." });
      }
      const res = await gitService.clone({ repo, owner, remote_url });
      return res;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Erro ao clonar repositório" });
    }
  });

  // 16. Explicit Pull Repo
  app.post("/api/git/pull", async (req, reply) => {
    try {
      const { repo, branch, owner } = (req.body as { repo?: string; branch?: string; owner?: string }) || {};
      const res = await gitService.pull(repo, branch, owner);
      return res;
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Erro ao puxar alterações do repositório" });
    }
  });
}
