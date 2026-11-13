import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { gitService } from "./git.service.js";
import { executeGit } from "../../utils/git.js";

test("Git Version Graph & Safe Switch Suite", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "context-os-vgraph-test-"));
  const repoName = "test-graph-repo";
  const repoPath = path.join(tmpDir, repoName);
  fs.mkdirSync(repoPath, { recursive: true });

  // Mock getRepoDir temporariamente para apontar para tmpDir
  const originalGetRepoDir = (gitService as any).getRepoDir;
  (gitService as any).getRepoDir = () => repoPath;

  try {
    // 1. Repo não inicializado retorna nós padrão sem estourar erro
    await t.test("Retorna fallback limpo quando não for repositório git", async () => {
      const graph = await gitService.getVersionGraph(repoName);
      assert.strictEqual(graph.nodes.length, 1);
      assert.strictEqual(graph.nodes[0].name, "main");
      assert.strictEqual(graph.nodes[0].isCurrent, true);
      assert.strictEqual(graph.nodes[0].isDefault, true);
      assert.strictEqual(graph.nodes[0].type, "main");
    });

    // Inicializa git repo real
    await executeGit(["init", "-b", "main"], repoPath);
    await executeGit(["config", "user.name", "Tester"], repoPath);
    await executeGit(["config", "user.email", "tester@test.com"], repoPath);

    fs.writeFileSync(path.join(repoPath, "doc.md"), "# Documento Principal\n");
    await executeGit(["add", "."], repoPath);
    await executeGit(["commit", "-m", "Commit inicial na Principal"], repoPath);

    // 2. Grafo com uma única branch (main)
    await t.test("Grafo identifica a versão Principal e o commit recente", async () => {
      const graph = await gitService.getVersionGraph(repoName);
      assert.strictEqual(graph.nodes.length, 1);
      assert.strictEqual(graph.nodes[0].name, "main");
      assert.strictEqual(graph.nodes[0].isDefault, true);
      assert.strictEqual(graph.nodes[0].isCurrent, true);
      assert.strictEqual(graph.nodes[0].lastCommit?.message, "Commit inicial na Principal");
    });

    // 3. Cria uma segunda versão (rascunho)
    await executeGit(["checkout", "-b", "versao-rascunho"], repoPath);
    fs.writeFileSync(path.join(repoPath, "rascunho.md"), "Novo rascunho\n");
    await executeGit(["add", "."], repoPath);
    await executeGit(["commit", "-m", "Novo marco no rascunho"], repoPath);

    await t.test("Grafo lista múltiplas versões com status de current e ahead", async () => {
      const graph = await gitService.getVersionGraph(repoName);
      assert.strictEqual(graph.nodes.length, 2);
      assert.strictEqual(graph.currentBranch, "versao-rascunho");

      const draftNode = graph.nodes.find((n) => n.name === "versao-rascunho");
      assert.ok(draftNode);
      assert.strictEqual(draftNode.isCurrent, true);
      assert.strictEqual(draftNode.type, "draft");
      assert.strictEqual(draftNode.ahead, 1);
    });

    // 4. Safe Switch: verificação de segurança (check)
    await t.test("Safe Switch check identifica quando repo está limpo", async () => {
      const checkClean = await gitService.safeSwitch({
        branch: "main",
        repo: repoName,
        action: "check",
      });
      assert.strictEqual(checkClean.canSwitch, true);
      assert.strictEqual(checkClean.hasUncommitted, false);
    });

    // Modifica arquivo sem commitar
    fs.appendFileSync(path.join(repoPath, "rascunho.md"), "Alteração pendente\n");

    await t.test("Safe Switch check bloqueia troca com arquivos modificados", async () => {
      const checkDirty = await gitService.safeSwitch({
        branch: "main",
        repo: repoName,
        action: "check",
      });
      assert.strictEqual(checkDirty.canSwitch, false);
      assert.strictEqual(checkDirty.hasUncommitted, true);
      assert.ok(checkDirty.changedCount >= 1);
    });

    // 5. Safe Switch com Stash automático
    await t.test("Safe Switch com stash guarda alterações e alterna", async () => {
      const switchStash = await gitService.safeSwitch({
        branch: "main",
        repo: repoName,
        action: "stash",
      });
      assert.strictEqual(switchStash.success, true);
      assert.strictEqual(switchStash.branch, "main");
      assert.strictEqual(switchStash.stashed, true);
    });

    // 6. Criação de nova branch a partir de main sem novos commits (ahead === 0)
    await t.test("Branch limpa recém-criada tem ahead === 0 e commits vazios", async () => {
      const res = await gitService.switchOrCreateBranch(
        "versao-limpa",
        repoName,
        undefined,
        "main",
        "Título Amigável da Versão Limpa",
      );
      assert.strictEqual(res.success, true);

      const graph = await gitService.getVersionGraph(repoName);
      const cleanNode = graph.nodes.find((n) => n.name === "versao-limpa") as any;
      assert.ok(cleanNode, "Nó da nova branch deve existir no grafo");
      assert.strictEqual(cleanNode.ahead, 0, "Branch sem commits próprios deve ter ahead === 0");
      assert.strictEqual(cleanNode.commits?.length || 0, 0, "Lista de commits próprios deve estar vazia");
      assert.strictEqual(cleanNode.displayName, "Título Amigável da Versão Limpa");
    });

    // 7. Tentativa de criar branch que já existe quando baseBranch é fornecido
    await t.test("Bloqueia recriação acidental de branch existente ao fornecer baseBranch", async () => {
      const dupRes = await gitService.switchOrCreateBranch(
        "versao-limpa",
        repoName,
        undefined,
        "main",
      );
      assert.strictEqual(dupRes.success, false);
      assert.match(dupRes.message, /já existe/i);
    });

    // 8. Detached HEAD detection & checkout commit
    await t.test("Identifica detached HEAD corretamente quando faz checkout de commit", async () => {
      const graphBefore = await gitService.getVersionGraph(repoName);
      const initialCommit = graphBefore.mainCommits?.find((c) => c.message.includes("Commit inicial"));
      assert.ok(initialCommit);

      const switchCommitRes = await gitService.safeSwitch({
        commitHash: initialCommit.hash,
        repo: repoName,
        action: "switch",
      });
      assert.strictEqual(switchCommitRes.success, true);

      const graphDetached = await gitService.getVersionGraph(repoName);
      assert.strictEqual(graphDetached.isDetached, true);
      assert.strictEqual(graphDetached.currentBranch, "HEAD");
      assert.strictEqual(graphDetached.headHash, initialCommit.hash);

      // Volta para a main
      const switchBack = await gitService.safeSwitch({
        branch: "main",
        repo: repoName,
        action: "switch",
      });
      assert.strictEqual(switchBack.success, true);
      const graphBack = await gitService.getVersionGraph(repoName);
      assert.strictEqual(graphBack.isDetached, false);
      assert.strictEqual(graphBack.currentBranch, "main");
    });

    // 9. Merge branch
    await t.test("Merge de branch integra alterações e marca como merged no grafo", async () => {
      const mergeRes = await gitService.mergeBranch({
        sourceBranch: "versao-rascunho",
        repo: repoName,
      });
      assert.strictEqual(mergeRes.success, true);

      const graph = await gitService.getVersionGraph(repoName);
      const draftNode = graph.nodes.find((n) => n.name === "versao-rascunho") as any;
      assert.ok(draftNode);
      assert.strictEqual(draftNode.isMerged, true);
    });
  } finally {
    (gitService as any).getRepoDir = originalGetRepoDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

