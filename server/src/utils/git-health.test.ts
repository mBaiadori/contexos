import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeGit, ensureGitRepo } from "./git.js";
import { healRepositoryState } from "./git-health.js";

test("GitHealthGuard - Auto-cura preventiva do repositório Git", async (t) => {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-health-test-"));

  // Setup: cria repo Git real para teste
  fs.mkdirSync(repoDir, { recursive: true });
  await executeGit(["init"], repoDir);
  await executeGit(["config", "user.name", "Test Runner"], repoDir);
  await executeGit(["config", "user.email", "test@example.com"], repoDir);

  // Cria commit inicial
  fs.writeFileSync(path.join(repoDir, "documento.md"), "# Documento Inicial\n", "utf-8");
  await executeGit(["add", "documento.md"], repoDir);
  await executeGit(["commit", "-m", "initial commit"], repoDir);

  await t.test("Repositório limpo deve retornar healed = false", async () => {
    const result = await healRepositoryState(repoDir, { unshallowIfNeeded: false });
    assert.strictEqual(result.healed, false);
    assert.strictEqual(result.actions.length, 0);
  });

  await t.test("Deve abortar merge travado caso exista MERGE_HEAD", async () => {
    const gitDir = path.join(repoDir, ".git");
    const mergeHeadPath = path.join(gitDir, "MERGE_HEAD");
    fs.writeFileSync(mergeHeadPath, "dummy-hash\n", "utf-8");

    const result = await healRepositoryState(repoDir, { unshallowIfNeeded: false });
    assert.strictEqual(result.healed, true);
    assert.strictEqual(result.actions.includes("aborted_in_progress_merge"), true);
    assert.strictEqual(fs.existsSync(mergeHeadPath), false);
  });

  await t.test("Deve limpar .workspace_changes.json transitório e desindexar do Git", async () => {
    const changesFile = path.join(repoDir, ".workspace_changes.json");
    fs.writeFileSync(changesFile, '{"changes": []}', "utf-8");

    // Simula git add no arquivo transitório
    await executeGit(["add", "-f", ".workspace_changes.json"], repoDir);

    const result = await healRepositoryState(repoDir, { unshallowIfNeeded: false });
    assert.strictEqual(result.healed, true);
    assert.strictEqual(
      result.actions.some((a) => a.includes("transient")),
      true,
    );

    // O arquivo não deve mais estar rastreado no index
    const checkRes = await executeGit(
      ["ls-files", "--error-unmatch", ".workspace_changes.json"],
      repoDir,
    );
    assert.strictEqual(checkRes.success, false);
  });

  // Cleanup
  try {
    fs.rmSync(repoDir, { recursive: true, force: true });
  } catch {}
});
