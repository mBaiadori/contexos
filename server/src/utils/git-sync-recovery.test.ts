import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CONFIG_PATH, resolveRepoDir } from "../config/constants.js";
import { loadConfig, saveConfig } from "../config/storage.js";
import {
  cloneGitRepo,
  executeGit,
  mergeGitBranch,
  pullGitRepo,
  syncGit,
} from "./git.js";
import { gitService } from "../modules/git/git.service.js";
import { draftsTrashService } from "../modules/git/drafts-trash.service.js";

function assertIsolatedTestEnv() {
  if (!CONFIG_PATH.startsWith(os.tmpdir())) {
    throw new Error(
      `ABORT: CONFIG_PATH ("${CONFIG_PATH}") fora de os.tmpdir(). Execute via scripts/run-tests.mjs.`,
    );
  }
}

async function setupBareAndTwoClones(rootTmp: string) {
  const bareDir = path.join(rootTmp, "origin.git");
  const userADir = path.join(rootTmp, "user-a");
  const userBDir = path.join(rootTmp, "user-b");

  fs.mkdirSync(bareDir, { recursive: true });
  await executeGit(["init", "--bare", "-b", "main"], bareDir);

  const cloneA = await cloneGitRepo(userADir, bareDir, undefined, {
    name: "Alice",
    login: "alice",
    email: "alice@contexos.local",
  });
  assert.strictEqual(cloneA.success, true);

  // Primeiro commit em A e push para origin/main
  await executeGit(["branch", "-M", "main"], userADir).catch(() => {});
  fs.writeFileSync(path.join(userADir, "README.md"), "# Projeto\nLinha base\n", "utf-8");
  fs.writeFileSync(path.join(userADir, "doc.md"), "Linha 1\nLinha 2\nLinha 3\n", "utf-8");
  await executeGit(["add", "-A"], userADir);
  await executeGit(["commit", "-m", "Commit inicial"], userADir);
  await executeGit(["push", "-u", "origin", "main"], userADir);

  const cloneB = await cloneGitRepo(userBDir, bareDir, undefined, {
    name: "Bob",
    login: "bob",
    email: "bob@contexos.local",
  });
  assert.strictEqual(cloneB.success, true);

  return { bareDir, userADir, userBDir };
}

describe("Git Sync, Pull, Clone, Stash & Trash Recovery (com origin --bare real)", () => {
  let rootTmp: string;

  beforeEach(() => {
    assertIsolatedTestEnv();
    rootTmp = fs.mkdtempSync(path.join(os.tmpdir(), "contexos-sync-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(rootTmp, { recursive: true, force: true });
    } catch {}
  });

  it("cloneGitRepo protege pasta existente com arquivos do usuário (sem .git) contra sobrescrita", async () => {
    const bareDir = path.join(rootTmp, "remote.git");
    fs.mkdirSync(bareDir, { recursive: true });
    await executeGit(["init", "--bare", "-b", "main"], bareDir);

    const occupiedDir = path.join(rootTmp, "pasta-usuario");
    fs.mkdirSync(occupiedDir, { recursive: true });
    fs.writeFileSync(path.join(occupiedDir, "meu-arquivo-importante.md"), "NÃO APAGAR", "utf-8");

    const res = await cloneGitRepo(occupiedDir, bareDir);
    assert.strictEqual(res.success, false);
    assert.match(res.message, /já existe e contém arquivos locais/i);
    assert.strictEqual(
      fs.readFileSync(path.join(occupiedDir, "meu-arquivo-importante.md"), "utf-8"),
      "NÃO APAGAR",
    );
  });

  it("pullGitRepo trata remoto vazio, fast-forward limpo com .gitignore colidindo e recusa histórico divergente sem destruir dados", async () => {
    // 1. Remoto completamente vazio
    const emptyBare = path.join(rootTmp, "empty.git");
    const emptyClone = path.join(rootTmp, "empty-clone");
    fs.mkdirSync(emptyBare, { recursive: true });
    await executeGit(["init", "--bare", "-b", "main"], emptyBare);
    await cloneGitRepo(emptyClone, emptyBare);
    const pullEmpty = await pullGitRepo(emptyClone, "main");
    assert.strictEqual(pullEmpty.success, true);
    assert.match(pullEmpty.message, /remoto em branco/i);

    // 2. Fast-forward limpo mesmo quando .gitignore local untracked colide com .gitignore do remoto
    const ffTmp = path.join(rootTmp, "ff");
    const ffBare = path.join(ffTmp, "origin.git");
    const ffA = path.join(ffTmp, "user-a");
    const ffB = path.join(ffTmp, "user-b");
    fs.mkdirSync(ffBare, { recursive: true });
    await executeGit(["init", "--bare", "-b", "main"], ffBare);
    await executeGit(["clone", ffBare, ffA], ffTmp);
    await executeGit(["config", "user.name", "Alice"], ffA);
    await executeGit(["config", "user.email", "alice@contexos.local"], ffA);
    await executeGit(["branch", "-M", "main"], ffA).catch(() => {});
    fs.writeFileSync(path.join(ffA, "README.md"), "# FF\n", "utf-8");
    await executeGit(["add", "README.md"], ffA);
    await executeGit(["commit", "-m", "Base sem gitignore"], ffA);
    await executeGit(["push", "-u", "origin", "main"], ffA);

    await executeGit(["clone", ffBare, ffB], ffTmp);
    await executeGit(["config", "user.name", "Bob"], ffB);
    await executeGit(["config", "user.email", "bob@contexos.local"], ffB);

    // A adiciona .gitignore e um novo doc no remoto
    fs.writeFileSync(path.join(ffA, ".gitignore"), "node_modules/\n", "utf-8");
    fs.writeFileSync(path.join(ffA, "novo-remoto.md"), "# Remoto\n", "utf-8");
    await executeGit(["add", "-A"], ffA);
    await executeGit(["commit", "-m", "Add gitignore e remoto"], ffA);
    await executeGit(["push", "origin", "main"], ffA);

    // Em B existe .gitignore untracked gerado automaticamente
    fs.writeFileSync(path.join(ffB, ".gitignore"), ".DS_Store\n", "utf-8");
    const pullFF = await pullGitRepo(ffB, "main");
    assert.strictEqual(pullFF.success, true);
    assert.strictEqual(fs.existsSync(path.join(ffB, "novo-remoto.md")), true);

    // 3. Histórico divergente -> pullGitRepo (--ff-only) deve falhar preservando commit local
    fs.writeFileSync(path.join(ffA, "a-only.md"), "A\n", "utf-8");
    await executeGit(["add", "-A"], ffA);
    await executeGit(["commit", "-m", "Commit A"], ffA);
    await executeGit(["push", "origin", "main"], ffA);

    fs.writeFileSync(path.join(ffB, "b-only.md"), "B\n", "utf-8");
    await executeGit(["add", "-A"], ffB);
    await executeGit(["commit", "-m", "Commit B local"], ffB);

    const pullDiv = await pullGitRepo(ffB, "main");
    assert.strictEqual(pullDiv.success, false);
    assert.match(pullDiv.message, /fast-forward|divergente/i);
    assert.strictEqual(fs.existsSync(path.join(ffB, "b-only.md")), true);
  });

  it("syncGit integra históricos divergentes sem conflito e envia ambos para o remoto", async () => {
    const { bareDir, userADir, userBDir } = await setupBareAndTwoClones(
      path.join(rootTmp, "sync-clean"),
    );

    // A envia arquivo A
    fs.writeFileSync(path.join(userADir, "arquivo-a.md"), "Conteúdo A\n", "utf-8");
    await executeGit(["add", "-A"], userADir);
    await executeGit(["commit", "-m", "Commit A"], userADir);
    await executeGit(["push", "origin", "main"], userADir);

    // B commita arquivo B localmente e chama syncGit
    fs.writeFileSync(path.join(userBDir, "arquivo-b.md"), "Conteúdo B\n", "utf-8");
    await executeGit(["add", "-A"], userBDir);
    await executeGit(["commit", "-m", "Commit B"], userBDir);

    const syncRes = await syncGit(userBDir, "origin", "main");
    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(fs.existsSync(path.join(userBDir, "arquivo-a.md")), true);
    assert.strictEqual(fs.existsSync(path.join(userBDir, "arquivo-b.md")), true);

    // Remoto deve conter tanto arquivo-a.md quanto arquivo-b.md
    const checkA = await executeGit(["--git-dir", bareDir, "cat-file", "-e", "main:arquivo-a.md"], rootTmp);
    const checkB = await executeGit(["--git-dir", bareDir, "cat-file", "-e", "main:arquivo-b.md"], rootTmp);
    assert.strictEqual(checkA.success, true);
    assert.strictEqual(checkB.success, true);
  });

  it("syncGit com conflito real aborta merge com segurança, não deixa MERGE_HEAD preso e preserva arquivo local", async () => {
    const { userADir, userBDir } = await setupBareAndTwoClones(
      path.join(rootTmp, "sync-conflict"),
    );

    // A altera linha 1 de doc.md e envia
    fs.writeFileSync(path.join(userADir, "doc.md"), "Linha 1 (Alice)\nLinha 2\nLinha 3\n", "utf-8");
    await executeGit(["add", "-A"], userADir);
    await executeGit(["commit", "-m", "Alice edita doc"], userADir);
    await executeGit(["push", "origin", "main"], userADir);

    // B altera a mesma linha 1 de doc.md localmente
    fs.writeFileSync(path.join(userBDir, "doc.md"), "Linha 1 (Bob)\nLinha 2\nLinha 3\n", "utf-8");
    await executeGit(["add", "-A"], userBDir);
    await executeGit(["commit", "-m", "Bob edita doc"], userBDir);

    const syncRes = await syncGit(userBDir, "origin", "main");
    assert.strictEqual(syncRes.success, false);
    assert.strictEqual(syncRes.hasConflicts, true);
    assert.ok(syncRes.conflictFiles?.includes("doc.md"));

    // Repositório NÃO pode ficar preso em estado MERGE_HEAD nem com marcadores de conflito no disco
    assert.strictEqual(fs.existsSync(path.join(userBDir, ".git", "MERGE_HEAD")), false);
    const diskDoc = fs.readFileSync(path.join(userBDir, "doc.md"), "utf-8");
    assert.strictEqual(diskDoc.includes("<<<<<<<"), false);
    assert.ok(diskDoc.includes("Linha 1 (Bob)"));
  });

  it("syncGit falha explicitamente quando o remoto está inacessível (sem falso positivo)", async () => {
    const { userADir } = await setupBareAndTwoClones(path.join(rootTmp, "sync-offline"));
    await executeGit(["remote", "set-url", "origin", path.join(rootTmp, "inexistente.git")], userADir);

    const syncRes = await syncGit(userADir, "origin", "main");
    assert.strictEqual(syncRes.success, false);
  });

  it("mergeGitBranch com conflito aborta automaticamente e informa arquivos em conflito sem corromper workspace", async () => {
    const { userADir } = await setupBareAndTwoClones(path.join(rootTmp, "merge-conflict"));

    await executeGit(["checkout", "-b", "rascunho-conflito"], userADir);
    fs.writeFileSync(path.join(userADir, "doc.md"), "Linha 1 (Rascunho)\nLinha 2\nLinha 3\n", "utf-8");
    await executeGit(["add", "-A"], userADir);
    await executeGit(["commit", "-m", "Edição no rascunho"], userADir);

    await executeGit(["checkout", "main"], userADir);
    fs.writeFileSync(path.join(userADir, "doc.md"), "Linha 1 (Main)\nLinha 2\nLinha 3\n", "utf-8");
    await executeGit(["add", "-A"], userADir);
    await executeGit(["commit", "-m", "Edição na main"], userADir);

    const mergeRes = await mergeGitBranch(userADir, "rascunho-conflito", "main");
    assert.strictEqual(mergeRes.success, false);
    assert.strictEqual(mergeRes.hasConflicts, true);
    assert.ok(mergeRes.conflictFiles?.includes("doc.md"));
    assert.strictEqual(fs.existsSync(path.join(userADir, ".git", "MERGE_HEAD")), false);
    assert.ok(fs.readFileSync(path.join(userADir, "doc.md"), "utf-8").includes("Linha 1 (Main)"));
  });

  it("safeSwitch(discard) envia para lixeira permanente e draftsTrashService.restoreTrash restaura ou reporta conflito com segurança", async () => {
    const repoName = `test-trash-recovery-${Date.now()}`;
    const repoDir = resolveRepoDir(repoName);
    try {
      fs.mkdirSync(repoDir, { recursive: true });
      await executeGit(["init", "-b", "main"], repoDir);
      await executeGit(["config", "user.name", "Tester"], repoDir);
      await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);
      fs.writeFileSync(path.join(repoDir, "notas.md"), "# Notas\nLinha 1\n", "utf-8");
      await executeGit(["add", "-A"], repoDir);
      await executeGit(["commit", "-m", "Base"], repoDir);
      await executeGit(["branch", "outra-branch"], repoDir);

      const cfg = loadConfig();
      cfg.active_repo = { name: repoName, full_name: `local/${repoName}`, default_branch: "main", is_local: true, is_cloned_locally: true };
      cfg.repos = [cfg.active_repo];
      saveConfig(cfg);

      // Modifica notas.md e descarta via safeSwitch
      fs.writeFileSync(path.join(repoDir, "notas.md"), "# Notas\nLinha 1 editada antes do descarte\n", "utf-8");
      const discardSwitch = await gitService.safeSwitch({
        branch: "outra-branch",
        repo: repoName,
        action: "discard",
      });
      assert.strictEqual(discardSwitch.success, true);
      assert.strictEqual(discardSwitch.discarded, true);

      // Deve existir 1 item na lixeira de rascunhos
      const trash = await draftsTrashService.listTrash(repoName);
      assert.strictEqual(trash.length, 1);

      // Restaura da lixeira com sucesso
      const restored = await draftsTrashService.restoreTrash(trash[0].id, repoName);
      assert.strictEqual(restored.success, true);
      assert.ok(
        fs.readFileSync(path.join(repoDir, "notas.md"), "utf-8").includes("Linha 1 editada antes do descarte"),
      );
      assert.strictEqual((await draftsTrashService.listTrash(repoName)).length, 0);
    } finally {
      try {
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it("popStash com conflito mantém o stash preservado e o working tree limpo (sem travar o repo)", async () => {
    const repoName = `test-stash-conflict-${Date.now()}`;
    const repoDir = resolveRepoDir(repoName);
    try {
      fs.mkdirSync(repoDir, { recursive: true });
      await executeGit(["init", "-b", "main"], repoDir);
      await executeGit(["config", "user.name", "Tester"], repoDir);
      await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);
      fs.writeFileSync(path.join(repoDir, "doc.md"), "Linha original\n", "utf-8");
      await executeGit(["add", "-A"], repoDir);
      await executeGit(["commit", "-m", "Base"], repoDir);

      // Cria branch 2 alterando a mesma linha
      await executeGit(["checkout", "-b", "branch-conflito"], repoDir);
      fs.writeFileSync(path.join(repoDir, "doc.md"), "Linha na branch-conflito\n", "utf-8");
      await executeGit(["add", "-A"], repoDir);
      await executeGit(["commit", "-m", "Altera linha"], repoDir);
      await executeGit(["checkout", "main"], repoDir);

      const cfg = loadConfig();
      cfg.active_repo = { name: repoName, full_name: `local/${repoName}`, default_branch: "main", is_local: true, is_cloned_locally: true };
      cfg.repos = [cfg.active_repo];
      saveConfig(cfg);

      // Modifica doc.md em main e guarda no stash ao trocar para branch-conflito
      fs.writeFileSync(path.join(repoDir, "doc.md"), "Linha guardada no stash\n", "utf-8");
      const sw = await gitService.safeSwitch({
        branch: "branch-conflito",
        repo: repoName,
        action: "stash",
      });
      assert.strictEqual(sw.success, true);
      assert.strictEqual(sw.stashed, true);

      // Tenta popStash na branch conflitante -> deve retornar hasConflicts: true e manter stash salvo
      const pop = (await gitService.popStash(repoName)) as {
        success: boolean;
        hasConflicts?: boolean;
        conflictFiles?: string[];
      };
      assert.strictEqual(pop.success, false);
      assert.strictEqual(pop.hasConflicts, true);
      assert.ok(pop.conflictFiles?.includes("doc.md"));

      // Working tree não ficou corrompido com <<<<<<<
      assert.strictEqual(
        fs.readFileSync(path.join(repoDir, "doc.md"), "utf-8").includes("<<<<<<<"),
        false,
      );
      // Stash continua salvo na lista
      const stashes = (await executeGit(["stash", "list"], repoDir)).stdout;
      assert.ok(stashes.includes("stash@{0}"));
    } finally {
      try {
        if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
