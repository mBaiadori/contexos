import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { gitService } from "./git.service.js";
import { prsService } from "../prs/prs.service.js";
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

    // 10. Guardrails de commit direto na Versão Oficial e HEAD desacoplado
    await t.test("Bloqueia commit direto na Versão Oficial (main) e em detached HEAD, permitindo apenas em rascunhos", async () => {
      fs.appendFileSync(path.join(repoPath, "doc.md"), "\nEdição direta na main\n");
      const commitOnMain = await gitService.commit("Tentativa na main", undefined, undefined, repoName);
      assert.strictEqual(commitOnMain.success, false);
      assert.match(commitOnMain.message, /Versão Oficial/i);

      // Troca para o rascunho ativo 'versao-limpa' levando a edição
      const switchDraft = await gitService.switchOrCreateBranch("versao-em-edicao", repoName, undefined, "main", "Versão em edição");
      assert.strictEqual(switchDraft.success, true);

      const commitOnDraft = await gitService.commit("Checkpoint válido no rascunho", undefined, undefined, repoName);
      assert.strictEqual(commitOnDraft.success, true);

      // Testa bloqueio em detached HEAD
      const headCommit = (await executeGit(["rev-parse", "HEAD"], repoPath)).stdout.trim();
      await executeGit(["checkout", headCommit], repoPath);
      fs.appendFileSync(path.join(repoPath, "doc.md"), "\nEdição em detached\n");
      const commitDetached = await gitService.commit("Tentativa em detached", undefined, undefined, repoName);
      assert.strictEqual(commitDetached.success, false);
      assert.match(commitDetached.message, /desacoplado|rascunho/i);

      // Limpa alteração em detached e volta para main
      await executeGit(["checkout", "--", "doc.md"], repoPath);
      await executeGit(["checkout", "main"], repoPath);
    });

    // 11. Exclusão de rascunho com defaultBranch contendo barra (gov/update-2675) e fechamento de PR aberto
    await t.test("deleteBranch alterna corretamente para defaultBranch com barra (gov/update-2675) e emite evento sem erro", async () => {
      const slashRepoName = "test-slash-delete-repo";
      const slashRepoPath = path.join(tmpDir, slashRepoName);
      fs.mkdirSync(slashRepoPath, { recursive: true });
      const prevGetRepoDir = (gitService as any).getRepoDir;
      const prevLoadRepoPRs = prsService.loadRepoPRs.bind(prsService);
      const prevRejectPR = prsService.rejectPR.bind(prsService);
      let rejectedId: number | string | null = null;

      (gitService as any).getRepoDir = (name: string) =>
        name === slashRepoName ? slashRepoPath : repoPath;
      (prsService as any).loadRepoPRs = (name: string) =>
        name === slashRepoName
          ? [{ id: 77, title: "Proposta teste", branch: "rascunho-para-excluir", status: "OPEN" }]
          : [];
      (prsService as any).rejectPR = async (id: number | string) => {
        rejectedId = id;
        return { success: true };
      };

      try {
        await executeGit(["init", "-b", "gov/update-2675"], slashRepoPath);
        await executeGit(["config", "user.name", "Tester"], slashRepoPath);
        await executeGit(["config", "user.email", "tester@test.com"], slashRepoPath);
        fs.writeFileSync(path.join(slashRepoPath, "README.md"), "# Base\n");
        await executeGit(["add", "."], slashRepoPath);
        await executeGit(["commit", "-m", "Base commit"], slashRepoPath);
        await executeGit(["update-ref", "refs/remotes/origin/gov/update-2675", "HEAD"], slashRepoPath);
        await executeGit(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/gov/update-2675"], slashRepoPath);

        await executeGit(["checkout", "-b", "rascunho-para-excluir"], slashRepoPath);
        fs.writeFileSync(path.join(slashRepoPath, "extra.md"), "Rascunho\n");
        await executeGit(["add", "."], slashRepoPath);
        await executeGit(["commit", "-m", "Commit no rascunho"], slashRepoPath);

        const delRes = await gitService.deleteBranch("rascunho-para-excluir", slashRepoName);
        assert.strictEqual(delRes.success, true);
        assert.strictEqual(rejectedId, 77);

        const headBranch = (await executeGit(["symbolic-ref", "--short", "HEAD"], slashRepoPath)).stdout.trim();
        assert.strictEqual(headBranch, "gov/update-2675");
      } finally {
        (gitService as any).getRepoDir = prevGetRepoDir;
        (prsService as any).loadRepoPRs = prevLoadRepoPRs;
        (prsService as any).rejectPR = prevRejectPR;
      }
    });
  } finally {
    (gitService as any).getRepoDir = originalGetRepoDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

