import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { FastifyInstance } from "fastify";
import { CONFIG_PATH, resolveRepoDir } from "../../config/constants.js";
import { loadConfig, saveConfig } from "../../config/storage.js";
import { executeGit } from "../../utils/git.js";
import { buildApp } from "../../app.js";
import { getSessionToken } from "../../security/session.js";
import { prsService } from "./prs.service.js";
import {
  prConflictsService,
  parseMergeTreeConflictPaths,
} from "./pr-conflicts.service.js";
import { prWorktreeService } from "./pr-worktree.service.js";

function assertIsolatedTestEnv() {
  if (!CONFIG_PATH.startsWith(os.tmpdir())) {
    throw new Error(
      `ABORT: CONFIG_PATH ("${CONFIG_PATH}") fora de os.tmpdir(). Execute via scripts/run-tests.mjs.`,
    );
  }
}

describe("parseMergeTreeConflictPaths - Parser de conflitos git merge-tree", () => {
  it("extrai arquivos da seção --name-only e de linhas CONFLICT (content e modify/delete)", () => {
    const fakeTreeOid = "a".repeat(40);
    const stdout = [
      fakeTreeOid,
      "docs/guia principal.md",
      "docs/arquitetura.md",
      "",
      "Auto-merging docs/guia principal.md",
      "CONFLICT (content): Merge conflict in docs/guia principal.md",
      "CONFLICT (modify/delete): docs/arquitetura.md deleted in HEAD and modified in feature-1.",
    ].join("\n");

    const parsed = parseMergeTreeConflictPaths(stdout, "");
    assert.deepStrictEqual(parsed, ["docs/guia principal.md", "docs/arquitetura.md"]);
  });

  it("extrai caminho corretamente mesmo quando apenas stderr contém CONFLICT modify/delete", () => {
    const parsed = parseMergeTreeConflictPaths(
      "",
      "CONFLICT (modify/delete): docs/removido.md deleted in main and modified in pr-branch.",
    );
    assert.deepStrictEqual(parsed, ["docs/removido.md"]);
  });
});

describe("PRConflictsService & PRWorktreeService - Conflitos reais, worktrees e sync com remoto bare", () => {
  let repoName: string;
  let repoDir: string;
  let tmpBareParent: string;
  let bareDir: string;
  let seq = 0;

  beforeEach(async () => {
    assertIsolatedTestEnv();
    repoName = `test-pr-conflicts-${Date.now()}-${++seq}`;
    repoDir = resolveRepoDir(repoName);
    tmpBareParent = fs.mkdtempSync(path.join(os.tmpdir(), "contexos-pr-bare-"));
    bareDir = path.join(tmpBareParent, "origin.git");

    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(bareDir, { recursive: true });

    await executeGit(["init", "--bare", "-b", "main"], bareDir);
    await executeGit(["init", "-b", "main"], repoDir);
    await executeGit(["config", "user.name", "Tester"], repoDir);
    await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);
    await executeGit(["remote", "add", "origin", bareDir], repoDir);

    fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, "docs/contrato.md"),
      "# Contrato\n\nCláusula 1: Original\nCláusula 2: Original\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(repoDir, "docs/apagar.md"),
      "# Documento que será removido\n",
      "utf-8",
    );
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Commit base"], repoDir);
    await executeGit(["push", "-u", "origin", "main"], repoDir);

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
      if (fs.existsSync(tmpBareParent)) fs.rmSync(tmpBareParent, { recursive: true, force: true });
    } catch {}
  });

  it("detecta conflito de conteúdo e modify/delete, gera bundle 3-vias, resolve no worktree e libera merge", async () => {
    // 1. Cria PR na branch de rascunho alterando docs/contrato.md e docs/apagar.md
    fs.writeFileSync(
      path.join(repoDir, "docs/contrato.md"),
      "# Contrato\n\nCláusula 1: Versão da Proposta\nCláusula 2: Original\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(repoDir, "docs/apagar.md"),
      "# Documento editado na proposta\n",
      "utf-8",
    );

    const created = await prsService.createPR({
      title: "Alteração conflitante",
      description: "",
      repo: repoName,
    });
    assert.ok(created.pr);
    const pr = created.pr;

    // 2. Enquanto o PR está aberto, a main avança alterando a mesma linha e deletando docs/apagar.md
    fs.writeFileSync(
      path.join(repoDir, "docs/contrato.md"),
      "# Contrato\n\nCláusula 1: Versão Oficial na Main\nCláusula 2: Original\n",
      "utf-8",
    );
    fs.unlinkSync(path.join(repoDir, "docs/apagar.md"));
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Atualização concorrente na main"], repoDir);

    // 3. checkConflicts deve reportar mergeable: false e ambos arquivos
    const status = await prConflictsService.checkConflicts(repoName, pr);
    assert.strictEqual(status.mergeable, false);
    assert.strictEqual(status.behind_by, 1);
    assert.strictEqual(status.ahead_by, 1);
    const conflictPaths = status.conflicts.map((c) => c.path).sort();
    assert.deepStrictEqual(conflictPaths, ["docs/apagar.md", "docs/contrato.md"]);

    // 4. mergePR deve bloquear explicitamente enquanto houver conflito
    await assert.rejects(() => prsService.mergePR(pr.id, repoName), /edições concorrentes|conflitos/i);

    // 5. syncWithTargetBranch com conflito deve abortar merge sem deixar MERGE_HEAD preso no worktree
    await assert.rejects(
      () => prConflictsService.syncWithTargetBranch(repoName, pr, "alice"),
      /Existem conflitos/i,
    );
    const wtDir = prWorktreeService.getWorktreeDir(repoName, pr.id);
    assert.strictEqual(fs.existsSync(path.join(wtDir, ".git", "MERGE_HEAD")), false);

    // 6. getConflictBundle deve devolver tanto `merged` quanto `mergedContent` com marcadores reais
    const bundle = await prConflictsService.getConflictBundle(
      repoName,
      pr,
      "docs/contrato.md",
      "alice",
    );
    assert.strictEqual(bundle.hasConflict, true);
    assert.strictEqual(bundle.hasConflicts, true);
    assert.strictEqual(bundle.merged, bundle.mergedContent);
    assert.ok(bundle.merged.includes("<<<<<<<"));
    assert.ok(bundle.merged.includes("Cláusula 1: Versão da Proposta"));
    assert.ok(bundle.merged.includes("Cláusula 1: Versão Oficial na Main"));

    // 7. Resolve conflito em docs/contrato.md no worktree
    const resolveRes = await prConflictsService.resolveFileConflict(
      repoName,
      pr,
      "docs/contrato.md",
      "# Contrato\n\nCláusula 1: Versão Unificada\nCláusula 2: Original\n",
      "alice",
    );
    assert.strictEqual(resolveRes.success, true);
    assert.ok(resolveRes.commitHash);
  });

  it("syncWithTargetBranch puxa origin/main quando remoto está à frente da main local e falha explicitamente se push quebrar", async () => {
    // 1. Cria PR limpo em arquivo próprio
    await executeGit(["checkout", "-b", "rascunho-sync"], repoDir);
    fs.writeFileSync(path.join(repoDir, "docs/feature.md"), "# Feature nova\n", "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Add feature"], repoDir);
    await executeGit(["push", "-u", "origin", "rascunho-sync"], repoDir);
    await executeGit(["checkout", "main"], repoDir);

    const created = await prsService.createPR({
      title: "Feature limpa",
      description: "",
      sourceBranch: "rascunho-sync",
      repo: repoName,
    });
    assert.ok(created.pr);
    const pr = created.pr;

    // 2. Outro colaborador (segundo clone) envia commit novo para origin/main (main local fica atrasada!)
    const peerDir = path.join(tmpBareParent, "peer-clone");
    await executeGit(["clone", bareDir, peerDir], tmpBareParent);
    await executeGit(["config", "user.name", "Bob"], peerDir);
    await executeGit(["config", "user.email", "bob@contexos.local"], peerDir);
    fs.writeFileSync(path.join(peerDir, "docs/remoto.md"), "# Veio do remoto\n", "utf-8");
    await executeGit(["add", "-A"], peerDir);
    await executeGit(["commit", "-m", "Commit remoto na main"], peerDir);
    await executeGit(["push", "origin", "main"], peerDir);

    // Simula modo remoto de forma isolada deste processo (sem race condition no config.json compartilhado)
    const origConflictsResolve = (prConflictsService as any).resolveRemoteTarget;
    const origWorktreeResolve = (prWorktreeService as any).resolveRemoteTarget;
    const remoteMock = () => ({
      cfg: loadConfig(),
      repoObj: {
        name: repoName,
        full_name: `org/${repoName}`,
        default_branch: "main",
        is_local: false,
        is_cloned_locally: true,
      },
      activeToken: "ghp_fake_token_for_local_bare_remote",
      isRemoteGitHub: true,
    });
    (prConflictsService as any).resolveRemoteTarget = remoteMock;
    (prWorktreeService as any).resolveRemoteTarget = remoteMock;

    try {
      // 3. syncWithTargetBranch deve incorporar docs/remoto.md vindo de origin/main e enviar para origin
      const syncRes = await prConflictsService.syncWithTargetBranch(repoName, pr, "alice");
      assert.strictEqual(syncRes.success, true);
      assert.ok(syncRes.newCommitHash);

      const remoteFeatureFile = await executeGit(
        ["--git-dir", bareDir, "show", "rascunho-sync:docs/remoto.md"],
        tmpBareParent,
      );
      assert.strictEqual(remoteFeatureFile.success, true);
      assert.ok(remoteFeatureFile.stdout.includes("Veio do remoto"));

      // 4. Se o remoto ficar indisponível, commitAndPushWorktree NÃO pode retornar sucesso silencioso
      await executeGit(["remote", "set-url", "origin", path.join(tmpBareParent, "nao-existe.git")], repoDir);
      const wtDir = await prWorktreeService.ensurePRWorktree(repoName, pr);
      await prWorktreeService.writePlainAtWorktree(wtDir, "docs/feature.md", "# Feature editada offline\n");

      await assert.rejects(
        () =>
          prWorktreeService.commitAndPushWorktree(
            wtDir,
            pr.branch,
            "Edição com remoto quebrado",
            "alice",
            repoName,
          ),
        /não foi possível enviar/i,
      );
    } finally {
      (prConflictsService as any).resolveRemoteTarget = origConflictsResolve;
      (prWorktreeService as any).resolveRemoteTarget = origWorktreeResolve;
    }
  });
});

describe("Contrato HTTP /api/prs/* (Fastify app.inject)", () => {
  let app: FastifyInstance;
  let token: string;
  let repoName: string;
  let repoDir: string;

  beforeEach(async () => {
    assertIsolatedTestEnv();
    app = await buildApp();
    await app.ready();
    token = getSessionToken();

    repoName = `test-pr-http-${Date.now()}`;
    repoDir = resolveRepoDir(repoName);
    fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
    await executeGit(["init", "-b", "main"], repoDir);
    await executeGit(["config", "user.name", "Tester"], repoDir);
    await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);
    fs.writeFileSync(path.join(repoDir, "docs/doc.md"), "Linha A\nLinha B\n", "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Base"], repoDir);

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

  afterEach(async () => {
    await app.close();
    try {
      if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {}
  });

  it("respeita o contrato entre frontend e backend em /api/prs/edit-file e /api/prs/conflict", async () => {
    const headers = {
      host: "127.0.0.1:4100",
      "x-contextos-token": token,
    };

    // Cria PR com alteração em docs/doc.md
    fs.writeFileSync(path.join(repoDir, "docs/doc.md"), "Linha A (PR)\nLinha B\n", "utf-8");
    const createRes = await app.inject({
      method: "POST",
      url: "/api/workspace/create-pr",
      headers,
      payload: {
        title: "PR HTTP Test",
        description: "desc",
        repo: repoName,
      },
    });
    assert.strictEqual(createRes.statusCode, 200);
    const created = JSON.parse(createRes.body);
    const prId = created.pr.id;
    const baseSha = created.pr.head_sha;

    // 1. Primeira edição via /api/prs/edit-file enviando expectedBaseSha (como faz prs.api.ts)
    const edit1Res = await app.inject({
      method: "POST",
      url: "/api/prs/edit-file",
      headers,
      payload: {
        id: prId,
        filePath: "docs/doc.md",
        content: "Linha A (Edit 1)\nLinha B\n",
        expectedBaseSha: baseSha,
        repo: repoName,
      },
    });
    assert.strictEqual(edit1Res.statusCode, 200);
    const edit1 = JSON.parse(edit1Res.body);
    assert.strictEqual(edit1.conflict, false);
    assert.ok(edit1.head_sha);

    // 2. Segunda edição concorrente com expectedBaseSha antigo -> deve acusar conflito e devolver `merged`
    const edit2Res = await app.inject({
      method: "POST",
      url: "/api/prs/edit-file",
      headers,
      payload: {
        id: prId,
        filePath: "docs/doc.md",
        content: "Linha A (Edit 2 concorrente)\nLinha B\n",
        expectedBaseSha: baseSha,
        repo: repoName,
      },
    });
    assert.strictEqual(edit2Res.statusCode, 200);
    const edit2 = JSON.parse(edit2Res.body);
    assert.strictEqual(edit2.conflict, true);
    assert.ok(edit2.merged && edit2.merged.includes("<<<<<<<"));

    // 3. Gera conflito com a main e valida /api/prs/mergeability + /api/prs/conflict
    fs.writeFileSync(path.join(repoDir, "docs/doc.md"), "Linha A (Main)\nLinha B\n", "utf-8");
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Main edit"], repoDir);

    const mergeabilityRes = await app.inject({
      method: "GET",
      url: `/api/prs/mergeability?pr_id=${prId}&repo=${encodeURIComponent(repoName)}`,
      headers,
    });
    assert.strictEqual(mergeabilityRes.statusCode, 200);
    const mergeability = JSON.parse(mergeabilityRes.body);
    assert.strictEqual(mergeability.mergeable, false);
    assert.ok(mergeability.conflicts.some((c: { path: string }) => c.path === "docs/doc.md"));

    const conflictRes = await app.inject({
      method: "GET",
      url: `/api/prs/conflict?pr_id=${prId}&path=${encodeURIComponent("docs/doc.md")}&repo=${encodeURIComponent(repoName)}`,
      headers,
    });
    assert.strictEqual(conflictRes.statusCode, 200);
    const conflictBody = JSON.parse(conflictRes.body);
    assert.strictEqual(conflictBody.hasConflict, true);
    assert.strictEqual(conflictBody.hasConflicts, true);
    assert.ok(conflictBody.merged && conflictBody.merged.includes("<<<<<<<"));
    assert.strictEqual(conflictBody.merged, conflictBody.mergedContent);
  });
});
