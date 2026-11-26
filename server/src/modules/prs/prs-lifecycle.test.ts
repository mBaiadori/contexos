import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CONFIG_PATH, resolveRepoDir } from "../../config/constants.js";
import { loadConfig, saveConfig } from "../../config/storage.js";
import { executeGit } from "../../utils/git.js";
import { prsService } from "./prs.service.js";
import { prWorktreeService } from "./pr-worktree.service.js";

function assertIsolatedTestEnv() {
  if (!CONFIG_PATH.startsWith(os.tmpdir())) {
    throw new Error(
      `ABORT: CONFIG_PATH ("${CONFIG_PATH}") fora de os.tmpdir(). Execute via scripts/run-tests.mjs.`,
    );
  }
}

async function initGitRepo(repoDir: string, initialFiles: Record<string, string>) {
  fs.mkdirSync(repoDir, { recursive: true });
  await executeGit(["init", "-b", "main"], repoDir);
  await executeGit(["config", "user.name", "Tester"], repoDir);
  await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);

  for (const [rel, content] of Object.entries(initialFiles)) {
    const abs = path.join(repoDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
  }
  await executeGit(["add", "-A"], repoDir);
  await executeGit(["commit", "-m", "Initial commit"], repoDir);
}

describe("PRsLifecycleService - Fluxos completos e cenários fora do happy path", () => {
  let repoName: string;
  let repoDir: string;
  let seq = 0;

  beforeEach(async () => {
    assertIsolatedTestEnv();
    repoName = `test-pr-lifecycle-${Date.now()}-${++seq}`;
    repoDir = resolveRepoDir(repoName);

    await initGitRepo(repoDir, {
      "README.md": "# Projeto Teste\n",
      "docs/spec.md": "# Spec\n\nLinha 1\nLinha 2\nLinha 3\nLinha 4\nLinha 5\n",
    });

    const cfg = loadConfig();
    cfg.authenticated = false;
    cfg.token = "";
    cfg.user = { login: "alice", name: "Alice" };
    cfg.active_repo = {
      name: repoName,
      full_name: `local/${repoName}`,
      default_branch: "main",
      is_local: true,
      is_cloned_locally: true,
    };
    cfg.repos = [cfg.active_repo];
    saveConfig(cfg);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {}
  });

  it("cria PR a partir da main suja, isola em branch de rascunho e retorna para main limpa", async () => {
    fs.writeFileSync(
      path.join(repoDir, "docs/spec.md"),
      "# Spec\n\nLinha 1 editada\nLinha 2\nLinha 3\nLinha 4\nLinha 5\n",
      "utf-8",
    );

    const res = await prsService.createPR({
      title: "Atualiza especificação principal",
      description: "Ajuste inicial",
      repo: repoName,
    });

    assert.strictEqual(res.success, true);
    assert.ok(res.pr);
    assert.strictEqual(res.pr.status, "OPEN");
    assert.notStrictEqual(res.pr.branch, "main");
    assert.ok(res.pr.head_sha && res.pr.head_sha.length >= 7);
    assert.ok(res.pr.files?.some((f) => f.path === "docs/spec.md"));

    // Deve voltar para main sem sujeira residual
    const curBranch = (await executeGit(["branch", "--show-current"], repoDir)).stdout.trim();
    assert.strictEqual(curBranch, "main");
    const mainContent = fs.readFileSync(path.join(repoDir, "docs/spec.md"), "utf-8");
    assert.ok(mainContent.includes("Linha 1\n"));
  });

  it("bloqueia createPR quando há alterações em outra branch diferente da sourceBranch solicitada", async () => {
    await executeGit(["checkout", "-b", "rascunho-a"], repoDir);
    fs.writeFileSync(path.join(repoDir, "docs/a.md"), "# Doc A\n", "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Commit em A"], repoDir);

    // Volta para main e cria alteração não salva lá
    await executeGit(["checkout", "main"], repoDir);
    fs.writeFileSync(path.join(repoDir, "docs/pendente.md"), "# Pendente na main\n", "utf-8");

    await assert.rejects(
      () =>
        prsService.createPR({
          title: "Publicar rascunho A estando na main suja",
          description: "",
          sourceBranch: "rascunho-a",
          repo: repoName,
        }),
      /alterações locais pendentes/i,
    );

    // Garante que o arquivo pendente na main NÃO foi perdido
    assert.strictEqual(fs.existsSync(path.join(repoDir, "docs/pendente.md")), true);
  });

  it("atualiza PR aberto existente automaticamente quando cria novamente na mesma branch", async () => {
    await executeGit(["checkout", "-b", "rascunho-update"], repoDir);
    fs.writeFileSync(path.join(repoDir, "docs/spec.md"), "# Spec v1\n", "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Checkpoint 1"], repoDir);

    const first = await prsService.createPR({
      title: "Proposta iterativa",
      description: "Primeira versão",
      sourceBranch: "rascunho-update",
      repo: repoName,
    });
    assert.strictEqual(first.success, true);
    assert.ok(first.pr);
    const firstSha = first.pr.head_sha;

    // Nova edição na mesma branch
    fs.writeFileSync(path.join(repoDir, "docs/extra.md"), "# Extra\n", "utf-8");
    const second = (await prsService.createPR({
      title: "Adiciona extra",
      description: "",
      sourceBranch: "rascunho-update",
      repo: repoName,
    })) as { updated?: boolean; head_sha?: string; id?: number | string };

    assert.strictEqual(second.updated, true);
    assert.strictEqual(String(second.id), String(first.pr.id));
    assert.notStrictEqual(second.head_sha, firstSha);

    const stored = prsService.loadRepoPRs(repoName);
    assert.strictEqual(stored.length, 1);
    assert.ok(stored[0].files?.some((f) => f.path === "docs/extra.md"));
  });

  it("bloqueia createPR quando detecta segredos expostos sem criar PR", async () => {
    fs.writeFileSync(
      path.join(repoDir, "docs/leak.md"),
      "Token vazado: ghp_1234567890abcdefghijklmnopqrstuvwx\n",
      "utf-8",
    );

    await assert.rejects(
      () =>
        prsService.createPR({
          title: "Doc com segredo",
          description: "",
          repo: repoName,
        }),
      /Secret Guard/i,
    );

    assert.strictEqual(prsService.loadRepoPRs(repoName).length, 0);
  });

  it("aplica governança de aprovação em modo equipe (anti-self-approval + quórum) e invalida ao editar PR", async () => {
    // Configura modo equipe (2 colaboradores, min 2 aprovações, anti-self-approval)
    fs.writeFileSync(
      path.join(repoDir, ".project.config.json"),
      JSON.stringify(
        {
          governance_collaborators: {
            alice: { role: "owner", departments: ["*"] },
            bob: { role: "reviewer", departments: ["*"] },
            carol: { role: "reviewer", departments: ["*"] },
          },
          governance_rules: {
            min_approvals_default: 2,
            anti_self_approval: true,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    fs.writeFileSync(path.join(repoDir, "docs/spec.md"), "# Spec revisada\n", "utf-8");
    const created = await prsService.createPR({
      title: "Mudança governada",
      description: "Precisa de 2 revisores",
      repo: repoName,
    });
    assert.ok(created.pr);
    const pr = created.pr;
    const prId = pr.id;

    // 1. Autor do PR não pode aprovar próprio PR em modo equipe
    const authorLogin = String(pr.author || "alice").replace(/^@/, "");
    await assert.rejects(
      () => prsService.approvePR(prId, { approver: authorLogin, repo: repoName }),
      /não pode aprovar o seu próprio Pull Request/i,
    );

    // 2. Bob aprova (1/2 -> ainda sem quórum)
    const app1 = await prsService.approvePR(prId, { approver: "bob", repo: repoName });
    assert.strictEqual(app1.quorum_reached, false);
    assert.strictEqual(app1.approvals_count, 1);

    // 3. Carol aprova (2/2 -> quórum atingido)
    const app2 = await prsService.approvePR(prId, { approver: "carol", repo: repoName });
    assert.strictEqual(app2.quorum_reached, true);
    assert.strictEqual(app2.approvals_count, 2);

    // 4. Edição no PR via editPRFile deve invalidar aprovações anteriores
    const editRes = await prsService.editPRFile(
      {
        id: prId,
        filePath: "docs/spec.md",
        content: "# Spec revisada v2\n",
        expectedBaseSha: pr.head_sha,
        repo: repoName,
      },
      "bob",
    );

    assert.strictEqual(editRes.conflict, false);
    assert.strictEqual(editRes.reset_approvals, true);
    assert.ok(editRes.head_sha);
    assert.strictEqual(editRes.head_sha, editRes.new_commit_hash);

    const updatedPR = prsService.loadRepoPRs(repoName).find((p) => String(p.id) === String(prId));
    assert.ok(updatedPR);
    assert.ok(
      (updatedPR.approvals || []).every(
        (a) => typeof a === "object" && a.status === "INVALIDATED",
      ),
    );
  });

  it("editPRFile realiza merge 3-vias automático em linhas diferentes e retorna conflito nas mesmas linhas (usando expectedBaseSha)", async () => {
    await executeGit(["checkout", "-b", "rascunho-collab"], repoDir);
    const baseText = "Linha 1\nLinha 2\nLinha 3\nLinha 4\nLinha 5\nLinha 6\nLinha 7\n";
    fs.writeFileSync(path.join(repoDir, "docs/collab.md"), baseText, "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Base collab"], repoDir);

    const created = await prsService.createPR({
      title: "Edição colaborativa",
      description: "",
      sourceBranch: "rascunho-collab",
      repo: repoName,
    });
    assert.ok(created.pr);
    const pr = created.pr;
    const prId = pr.id;
    const baseSha = pr.head_sha!;

    // Volta para main para provar que o worktree isolado não toca o workspace ativo
    await executeGit(["checkout", "main"], repoDir);

    // Usuário A edita Linha 1
    const editA = await prsService.editPRFile(
      {
        id: prId,
        filePath: "docs/collab.md",
        content: "Linha 1 (Alice)\nLinha 2\nLinha 3\nLinha 4\nLinha 5\nLinha 6\nLinha 7\n",
        expectedBaseSha: baseSha,
        repo: repoName,
      },
      "alice",
    );
    assert.strictEqual(editA.conflict, false);
    assert.ok(editA.head_sha && editA.head_sha !== baseSha);

    // Usuário B envia edição baseada no baseSha ANTIGO, mexendo apenas na Linha 7 -> 3-way merge automático!
    const editB = await prsService.editPRFile(
      {
        id: prId,
        filePath: "docs/collab.md",
        content: "Linha 1\nLinha 2\nLinha 3\nLinha 4\nLinha 5\nLinha 6\nLinha 7 (Bob)\n",
        expectedBaseSha: baseSha,
        repo: repoName,
      },
      "bob",
    );
    assert.strictEqual(editB.conflict, false);
    assert.ok(editB.head_sha && editB.head_sha !== editA.head_sha);

    const mergedOnBranch = (
      await executeGit(["show", `${pr.branch}:docs/collab.md`], repoDir)
    ).stdout;
    assert.ok(mergedOnBranch.includes("Linha 1 (Alice)"));
    assert.ok(mergedOnBranch.includes("Linha 7 (Bob)"));

    // Usuário C envia edição baseada no baseSha ANTIGO mexendo na MESMA Linha 1 -> deve detectar CONFLITO!
    const editC = await prsService.editPRFile(
      {
        id: prId,
        filePath: "docs/collab.md",
        content: "Linha 1 (Carol Conflito)\nLinha 2\nLinha 3\nLinha 4\nLinha 5\nLinha 6\nLinha 7\n",
        expectedBaseSha: baseSha,
        repo: repoName,
      },
      "carol",
    );

    assert.strictEqual(editC.conflict, true);
    assert.ok((editC.merged || "").includes("<<<<<<<"));
    assert.strictEqual(editC.merged, editC.mergedContent);
    assert.ok((editC.merged || "").includes("Linha 1 (Carol Conflito)"));
    assert.ok((editC.merged || "").includes("Linha 1 (Alice)"));

    // Branch não pode ter sido sobrescrita pelo conflito
    const branchHeadAfterConflict = (
      await executeGit(["rev-parse", pr.branch], repoDir)
    ).stdout.trim();
    assert.strictEqual(branchHeadAfterConflict, editB.head_sha);
  });

  it("mergePR integra alterações na main, limpa worktree e preserva alterações locais em stash se houver conflito no stash pop", async () => {
    fs.writeFileSync(
      path.join(repoDir, "docs/spec.md"),
      "# Spec\n\nLinha 1 publicada via PR\nLinha 2\nLinha 3\nLinha 4\nLinha 5\n",
      "utf-8",
    );

    const created = await prsService.createPR({
      title: "Publicação oficial",
      description: "",
      repo: repoName,
    });
    assert.ok(created.pr);
    const prId = created.pr.id;

    // Inicializa um worktree para garantir que o mergePR vai limpá-lo
    const wtDir = await prWorktreeService.ensurePRWorktree(repoName, created.pr);
    assert.strictEqual(fs.existsSync(wtDir), true);

    // Usuário tem edição local não commitada na MESMA linha em main (vai gerar conflito no stash pop)
    fs.writeFileSync(
      path.join(repoDir, "docs/spec.md"),
      "# Spec\n\nLinha 1 edição local não salva\nLinha 2\nLinha 3\nLinha 4\nLinha 5\n",
      "utf-8",
    );

    const merged = await prsService.mergePR(prId, repoName);
    assert.strictEqual(merged.success, true);
    assert.strictEqual(merged.pr.status, "MERGED");
    assert.strictEqual(fs.existsSync(wtDir), false);

    // Main deve conter a versão publicada SEM marcadores de conflito quebrados no working tree
    const diskContent = fs.readFileSync(path.join(repoDir, "docs/spec.md"), "utf-8");
    assert.ok(diskContent.includes("Linha 1 publicada via PR"));
    assert.strictEqual(diskContent.includes("<<<<<<<"), false);

    // E a edição local do usuário NÃO foi perdida: permanece preservada no git stash
    const stashList = (await executeGit(["stash", "list"], repoDir)).stdout;
    assert.ok(stashList.includes("context-os-pre-merge-stash"));
  });

  it("rejectPR arquiva proposta, remove worktree e impede merge/edição posterior", async () => {
    fs.writeFileSync(path.join(repoDir, "docs/spec.md"), "# Spec rejeitada\n", "utf-8");
    const created = await prsService.createPR({
      title: "Proposta a rejeitar",
      description: "",
      repo: repoName,
    });
    assert.ok(created.pr);
    const prId = created.pr.id;
    const wtDir = await prWorktreeService.ensurePRWorktree(repoName, created.pr);
    assert.strictEqual(fs.existsSync(wtDir), true);

    const rejected = await prsService.rejectPR(prId, "Fora de escopo", repoName);
    assert.strictEqual(rejected.success, true);
    assert.strictEqual(rejected.pr.status, "CLOSED");
    assert.strictEqual(fs.existsSync(wtDir), false);

    await assert.rejects(() => prsService.mergePR(prId, repoName), /arquivado\/fechado/i);
    await assert.rejects(
      () =>
        prsService.editPRFile({
          id: prId,
          filePath: "docs/spec.md",
          content: "nova edição",
          repo: repoName,
        }),
      /finalizado ou arquivado/i,
    );
  });

  it("rollbackRevision restaura versão anterior na main e bloqueia se houver alterações locais não commitadas", async () => {
    const initialSha = (await executeGit(["rev-parse", "HEAD"], repoDir)).stdout.trim();

    fs.writeFileSync(path.join(repoDir, "docs/spec.md"), "# Spec v2\n", "utf-8");
    const created = await prsService.createPR({
      title: "Versão v2",
      description: "",
      repo: repoName,
    });
    assert.ok(created.pr);
    await prsService.mergePR(created.pr.id, repoName);
    assert.ok(fs.readFileSync(path.join(repoDir, "docs/spec.md"), "utf-8").includes("Spec v2"));

    // Suja o working tree -> rollback deve recusar para não perder dados
    fs.writeFileSync(path.join(repoDir, "docs/nao-salvo.md"), "rascunho\n", "utf-8");
    await assert.rejects(
      () => prsService.rollbackRevision({ commit_hash: initialSha, repo: repoName }),
      /alterações não commitadas/i,
    );

    // Limpa o arquivo não salvo e executa o rollback
    fs.unlinkSync(path.join(repoDir, "docs/nao-salvo.md"));
    const rb = await prsService.rollbackRevision({ commit_hash: initialSha, repo: repoName });
    assert.strictEqual(rb.success, true);
    assert.ok(rb.new_commit_hash);

    const restored = fs.readFileSync(path.join(repoDir, "docs/spec.md"), "utf-8");
    assert.ok(restored.includes("Linha 1\n"));
  });
});
