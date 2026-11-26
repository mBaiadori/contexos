import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { workspaceService } from "./workspace.service.js";
import { gitService } from "../git/git.service.js";
import { recordChange, loadRepoWorkspaceChanges } from "../../config/storage.js";
import { executeGit } from "../../utils/git.js";

test("WorkspaceService - Deleção e ciclo de vida de arquivos locais", async (t) => {
  const repo = "test-delete-lifecycle-repo";
  const repoDir = resolveRepoDir(repo);

  fs.mkdirSync(repoDir, { recursive: true });
  await executeGit(["init"], repoDir);
  await executeGit(["config", "user.email", "test@test.com"], repoDir);
  await executeGit(["config", "user.name", "Test User"], repoDir);

  // Cria um arquivo oficial commitado
  const committedFile = path.join(repoDir, "oficial.md");
  fs.writeFileSync(committedFile, "# Arquivo Oficial", "utf-8");
  await executeGit(["add", "oficial.md"], repoDir);
  await executeGit(["commit", "-m", "Initial commit"], repoDir);

  await t.test(
    "Arquivo criado localmente e depois excluído NÃO deve ficar marcado como DELETED / REMOVIDO",
    async () => {
      // 1. Cria um arquivo local via workspaceService
      const createRes = await workspaceService.createFile(
        "draft-temporario.md",
        "# Rascunho",
        false,
        {},
        repo,
      );
      assert.strictEqual(createRes.success, true);

      // Verifica se registrou como ADDED
      let changes = loadRepoWorkspaceChanges(repo);
      assert.strictEqual(changes.some((c) => c.path === "draft-temporario.md" && c.type === "ADDED"), true);

      // 2. Deleta o arquivo local via workspaceService
      const deleteRes = await workspaceService.deleteFile("draft-temporario.md", repo);
      assert.strictEqual(deleteRes.success, true);

      // 3. Verifica se as alterações NÃO listam o arquivo como DELETED nem como ADDED
      changes = loadRepoWorkspaceChanges(repo);
      const tempEntry = changes.find((c) => c.path === "draft-temporario.md");
      assert.strictEqual(tempEntry, undefined, "Arquivo criado e deletado localmente não deve existir em workspace_changes");

      // 4. Verifica getWorkspaceChanges
      const wsChanges = await workspaceService.getWorkspaceChanges(repo);
      const wsEntry = wsChanges.changes.find((c: any) => c.path === "draft-temporario.md");
      assert.strictEqual(wsEntry, undefined, "Não deve aparecer em getWorkspaceChanges");
    },
  );

  await t.test(
    "Excluir arquivo que REALMENTE existia no Git HEAD deve registrá-lo como DELETED",
    async () => {
      // Deleta o arquivo oficial que está no Git
      const deleteRes = await workspaceService.deleteFile("oficial.md", repo);
      assert.strictEqual(deleteRes.success, true);

      // getWorkspaceChanges deve listar como DELETED
      const wsChanges = await workspaceService.getWorkspaceChanges(repo);
      const deletedEntry = wsChanges.changes.find((c: any) => c.path === "oficial.md");
      assert.ok(deletedEntry, "oficial.md deve constar nas alterações");
      assert.strictEqual(deletedEntry.type, "DELETED");
    },
  );

  await t.test(
    "getWorkspaceChanges deve expurgar alterações fantasmas pré-existentes de arquivos não rastreados",
    async () => {
      // Força inserção de um registro fantasma DELETED de arquivo inexistente no Git
      recordChange(repo, "fantasma-antigo.md", "DELETED", "conteudo", "");

      let changes = loadRepoWorkspaceChanges(repo);
      assert.ok(changes.some((c) => c.path === "fantasma-antigo.md"));

      // Chama getWorkspaceChanges para disparar a reconciliação e expurgo
      const wsChanges = await workspaceService.getWorkspaceChanges(repo);
      const ghostInWs = wsChanges.changes.find((c: any) => c.path === "fantasma-antigo.md");
      assert.strictEqual(ghostInWs, undefined, "Arquivo fantasma deve ter sido expurgado da resposta");

      // Verifica se foi removido de workspace_changes.json em disco
      changes = loadRepoWorkspaceChanges(repo);
      assert.strictEqual(changes.some((c) => c.path === "fantasma-antigo.md"), false, "Fantasma deve ter sido removido do arquivo em disco");
    },
  );

  await t.test(
    "getWorkspaceChanges deve ignorar .translations e expurgar alterações já commitadas via checkpoint",
    async () => {
      await executeGit(["checkout", "-b", "rascunho-teste"], repoDir);
      fs.mkdirSync(path.join(repoDir, ".translations/en"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, ".translations/en/inserção nomercado.md"), "# Trad\n", "utf-8");

      await workspaceService.createFile("novo-doc.md", "# Novo Doc\n", false, {}, repo);
      let wsChanges = await workspaceService.getWorkspaceChanges(repo);
      assert.ok(wsChanges.changes.some((c: any) => c.path === "novo-doc.md"));
      assert.strictEqual(
        wsChanges.changes.some((c: any) => c.path.includes(".translations")),
        false,
        ".translations não deve aparecer em getWorkspaceChanges",
      );

      const commitRes = await gitService.commit("Salva checkpoint", undefined, undefined, repo);
      assert.strictEqual(commitRes.success, true);

      wsChanges = await workspaceService.getWorkspaceChanges(repo);
      assert.strictEqual(
        wsChanges.changes.some((c: any) => c.path === "novo-doc.md"),
        false,
        "Arquivo commitado no checkpoint não deve permanecer pendente em getWorkspaceChanges",
      );
    },
  );

  // Cleanup
  try {
    fs.rmSync(repoDir, { recursive: true, force: true });
  } catch {}
});
