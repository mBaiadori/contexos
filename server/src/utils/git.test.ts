import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseGitProgress,
  isGitRepo,
  ensureGitIgnore,
  commitChanges,
  getGitStatus,
  compareGitBranches,
  createAndCheckoutBranch,
  getGitBranches,
  getGitLog,
  getFileGitLog,
  getFileContentAtCommit,
  getGitDiff,
  rollbackToCommit,
  executeGit,
} from "./git.js";
import { isPathHidden } from "./hidden-files.js";

test("Git Utilities Suite - Cobertura de Funções Core de Versionamento", async (t) => {
  // 1. parseGitProgress (sem depender de repositório em disco)
  await t.test("parseGitProgress deve interpretar corretamente eventos de progresso do Git", () => {
    const receiving = parseGitProgress("Receiving objects:  45% (450/1000)");
    assert.ok(receiving);
    assert.strictEqual(receiving.stage, "Recebendo objetos");
    assert.strictEqual(receiving.percent, 45);

    const resolving = parseGitProgress("Resolving deltas: 100% (200/200)");
    assert.ok(resolving);
    assert.strictEqual(resolving.stage, "Resolvendo deltas");
    assert.strictEqual(resolving.percent, 100);

    const compressing = parseGitProgress("Compressing objects: 12% (12/100)");
    assert.ok(compressing);
    assert.strictEqual(compressing.stage, "Comprimindo");
    assert.strictEqual(compressing.percent, 12);

    const nonProgress = parseGitProgress("Everything up-to-date");
    assert.strictEqual(nonProgress, null);
  });

  // Setup do repositório temporário isolado no tmpdir do sistema
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "git-util-test-"));

  try {
    // 2. isGitRepo antes de inicializar
    await t.test("isGitRepo deve retornar false para diretório sem .git", async () => {
      assert.strictEqual(await isGitRepo(path.join(repoDir, "non-existent")), false);
      assert.strictEqual(await isGitRepo(repoDir), false);
    });

    // 3. ensureGitIgnore
    await t.test("ensureGitIgnore deve criar e proteger arquivos de sistema e transitórios", () => {
      const gitignorePath = path.join(repoDir, ".gitignore");
      fs.writeFileSync(gitignorePath, "meu_arquivo_custom.txt\n.project.config.json\n", "utf-8");

      ensureGitIgnore(repoDir);

      const content = fs.readFileSync(gitignorePath, "utf-8");
      // Deve preservar a regra do usuário
      assert.ok(content.includes("meu_arquivo_custom.txt"));
      // Deve ter designorado .project.config.json
      assert.strictEqual(content.includes(".project.config.json"), false);
      // Deve conter os padrões essenciais do Context OS
      assert.ok(content.includes(".prs.json"));
      assert.ok(content.includes(".rag/"));
      assert.ok(content.includes(".workspace_changes.json"));
      assert.ok(content.includes(".sessions/"));
      assert.ok(content.includes(".env"));
      assert.ok(content.includes(".DS_Store"));
    });

    // Inicializa o repositório git para os próximos testes
    await executeGit(["init", "-b", "main"], repoDir);
    await executeGit(["config", "user.name", "Test Dev"], repoDir);
    await executeGit(["config", "user.email", "testdev@example.com"], repoDir);

    // 4. isGitRepo após inicializar
    await t.test("isGitRepo deve retornar true após git init", async () => {
      assert.strictEqual(await isGitRepo(repoDir), true);
    });

    // 5. getGitStatus em repositório novo
    await t.test("getGitStatus deve identificar arquivos novos não rastreados", async () => {
      fs.writeFileSync(path.join(repoDir, "artigo.md"), "# Artigo Inicial\n", "utf-8");
      const status = await getGitStatus(repoDir);

      assert.strictEqual(status.isRepo, true);
      assert.strictEqual(status.isClean, false);
      assert.ok(status.files.some((f) => f.path === "artigo.md" && f.status === "??"));
    });

    // 6. commitChanges
    let firstCommitHash = "";
    await t.test("commitChanges deve commitar arquivos e retornar commitHash", async () => {
      const result = await commitChanges(repoDir, "Commit inicial do artigo", ["artigo.md"]);

      assert.strictEqual(result.success, true);
      assert.ok(result.commitHash);
      firstCommitHash = result.commitHash;

      // Status agora deve estar limpo para artigo.md
      const status = await getGitStatus(repoDir);
      assert.strictEqual(status.files.some((f) => f.path === "artigo.md"), false);
    });

    // 7. Proteção contra commit de .workspace_changes.json
    await t.test("commitChanges deve desindexar arquivos transitórios antes de commitar", async () => {
      fs.writeFileSync(path.join(repoDir, ".workspace_changes.json"), '{"changes":[]}', "utf-8");

      // Força staging do arquivo transitório
      await executeGit(["add", "-f", ".workspace_changes.json"], repoDir);

      // Modifica artigo.md e commita
      fs.writeFileSync(path.join(repoDir, "artigo.md"), "# Artigo Atualizado\n", "utf-8");
      const result = await commitChanges(repoDir, "Atualiza artigo com segurança");
      assert.strictEqual(result.success, true);

      // Verifica se .workspace_changes.json NÃO foi commitado
      const lsResult = await executeGit(
        ["ls-files", "--error-unmatch", ".workspace_changes.json"],
        repoDir,
      );
      assert.strictEqual(lsResult.success, false);
    });

    // 8. createAndCheckoutBranch e getGitBranches
    await t.test("createAndCheckoutBranch e getGitBranches devem criar e alternar branches", async () => {
      const branchRes = await createAndCheckoutBranch(repoDir, "gov/feature-nova");
      assert.strictEqual(branchRes.success, true);

      const branches = await getGitBranches(repoDir);
      assert.strictEqual(branches.current, "gov/feature-nova");
      assert.ok(branches.branches.includes("gov/feature-nova"));
      assert.ok(branches.branches.includes("main"));

      // Alterna de volta para main
      const backRes = await createAndCheckoutBranch(repoDir, "main");
      assert.strictEqual(backRes.success, true);
      const afterBack = await getGitBranches(repoDir);
      assert.strictEqual(afterBack.current, "main");
    });

    // 9. getGitLog e getFileGitLog
    await t.test("getGitLog e getFileGitLog devem retornar histórico ordenado", async () => {
      const log = await getGitLog(repoDir, 10);
      assert.ok(log.length >= 2);
      assert.strictEqual(log[0].author, "Test Dev");
      assert.ok(log[0].hash.length >= 7);

      const fileLog = await getFileGitLog(repoDir, "artigo.md", 10);
      assert.ok(fileLog.length >= 2);
      assert.ok(fileLog.some((c) => c.message.includes("Commit inicial do artigo")));
    });

    // 10. getFileContentAtCommit (Time-Travel)
    await t.test("getFileContentAtCommit deve ler versão antiga sem alterar branch atual", async () => {
      assert.ok(firstCommitHash);
      const pastVersion = await getFileContentAtCommit(repoDir, "artigo.md", firstCommitHash);

      assert.strictEqual(pastVersion.success, true);
      assert.strictEqual(pastVersion.content.trim(), "# Artigo Inicial");

      // O arquivo atual no disco continua sendo a versão mais recente
      const currentDisk = fs.readFileSync(path.join(repoDir, "artigo.md"), "utf-8");
      assert.strictEqual(currentDisk.trim(), "# Artigo Atualizado");
    });

    // 11. getGitDiff
    await t.test("getGitDiff deve extrair diff de modificações locais e de novos arquivos", async () => {
      // Modifica artigo.md
      fs.writeFileSync(path.join(repoDir, "artigo.md"), "# Artigo com Diff\n", "utf-8");
      const diffMod = await getGitDiff(repoDir, "artigo.md");
      assert.ok(diffMod.diff.includes("-# Artigo Atualizado"));
      assert.ok(diffMod.diff.includes("+# Artigo com Diff"));

      // Novo arquivo não rastreado
      fs.writeFileSync(path.join(repoDir, "novo.md"), "Conteúdo do novo arquivo\n", "utf-8");
      const diffNew = await getGitDiff(repoDir, "novo.md");
      assert.ok(diffNew.diff.includes("+Conteúdo do novo arquivo"));
    });

    // 12. rollbackToCommit com proteção contra perda de dados não salvos (C5)
    await t.test("rollbackToCommit deve abortar se houver alterações não commitadas a menos que force seja true", async () => {
      assert.ok(firstCommitHash);
      // Há alterações não commitadas (novo.md e artigo.md modificado do teste anterior)
      const abortRes = await rollbackToCommit(repoDir, firstCommitHash);
      assert.strictEqual(abortRes.success, false);
      assert.ok(abortRes.message.includes("alterações não commitadas"));

      // Com force: true deve realizar o rollback com sucesso
      const forceRes = await rollbackToCommit(repoDir, firstCommitHash, "Rollback forçado", { force: true });
      assert.strictEqual(forceRes.success, true);
    });

    // 13. getGitStatus e compareGitBranches com espaços, acentos, aspas e .translations
    await t.test("getGitStatus e compareGitBranches devem retornar caminhos sem aspas C-style e sem fantasmas de rename", async () => {
      await executeGit(["checkout", "-b", "gov/paths-especiais"], repoDir);
      fs.mkdirSync(path.join(repoDir, ".translations/en"), { recursive: true });
      const hiddenTranslation = ".translations/en/inserção nomercado.md";
      const specialDoc = 'docs/inserção "especial" nomercado.md';
      fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, hiddenTranslation), "# EN\n", "utf-8");
      fs.writeFileSync(path.join(repoDir, specialDoc), "# Especial\n", "utf-8");

      const status = await getGitStatus(repoDir);
      const paths = status.files.map((f) => f.path);
      assert.ok(paths.includes(hiddenTranslation), `Esperava caminho sem aspas, veio: ${JSON.stringify(paths)}`);
      assert.ok(paths.includes(specialDoc), `Esperava caminho especial sem aspas, veio: ${JSON.stringify(paths)}`);
      assert.strictEqual(isPathHidden(hiddenTranslation), true);

      const commitRes = await commitChanges(repoDir, "Adiciona doc especial", [specialDoc]);
      assert.strictEqual(commitRes.success, true);

      // Renomeia specialDoc para testar diff --numstat -z / --name-status -z
      const renamedDoc = "docs/inserção renomeada.md";
      await executeGit(["mv", specialDoc, renamedDoc], repoDir);
      await executeGit(["commit", "-m", "Renomeia doc"], repoDir);

      const comparison = await compareGitBranches(repoDir, "main", "gov/paths-especiais");
      const comparedPaths = comparison.files.map((f) => f.path);
      assert.ok(comparedPaths.includes(renamedDoc));
      assert.strictEqual(comparedPaths.some((p) => p.includes("=>")), false);

      // Limpa arquivo untracked oculto e volta para main
      fs.rmSync(path.join(repoDir, ".translations"), { recursive: true, force: true });
      await executeGit(["checkout", "main"], repoDir);
    });
  } finally {
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {}
  }
});
