import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { METADATA_CACHE_DIR, resolveRepoDir } from "../../config/constants.js";
import { executeGit } from "../../utils/git-core.js";
import { checkAiPolicy } from "../ai/ai-policy.service.js";
import {
  docsMetadataService,
  extractFrontmatterMeta,
  updateFrontmatterInMarkdown,
  areArraysEqual,
  areMetadataItemsEqual,
  areMetadataListsEqual,
  DocumentMetadataItem,
} from "./docs-metadata.service.js";

test("DocsMetadataService - Suite de Metadados e Performance", async (t) => {
  await t.test("extractFrontmatterMeta deve extrair todos os metadados com fidelidade", () => {
    const markdownWithYaml = `---
title: "Documento de Arquitetura"
status: "approved"
categories: "Engenharia"
tags: ["core", "rfc", "backend"]
department: "engineering"
templateId: "rfc-template"
approvers:
  - "@marcos"
  - "@techlead"
version: 2
isDraft: false
---

# Conteúdo principal
Este é o corpo do documento markdown.`;

    const meta = extractFrontmatterMeta(markdownWithYaml);

    assert.strictEqual(meta.title, "Documento de Arquitetura");
    assert.strictEqual(meta.status, "approved");
    assert.strictEqual(meta.categories, "Engenharia");
    assert.deepStrictEqual(meta.tags, ["core", "rfc", "backend"]);
    assert.strictEqual(meta.department, "engineering");
    assert.strictEqual(meta.templateId, "rfc-template");
    assert.deepStrictEqual(meta.approvers, ["@marcos", "@techlead"]);
  });

  await t.test("extractFrontmatterMeta e updateFrontmatterInMarkdown devem expurgar lixo residual como ['[]'], templateId 't' e '{}'", () => {
    const dirtyMd = `---
id: "patient"
title: "Nurse"
type: "spec"
version: "1.0.0"
path: "patient.md"
stage: "docs"
feedback_loops: "{}"
tags: []
name: "patient"
ext: "md"
updated_at: "2026-10-22T21:13:45.841Z"
approvers: "[]"
templateId: "t"
links: "[]"
---
## Description
Conteúdo limpo aqui.`;

    const cleanedMeta = extractFrontmatterMeta(dirtyMd);
    assert.deepStrictEqual(cleanedMeta, {
      title: "Nurse",
      type: "spec",
      tags: [],
      templateId: "t",
      approvers: [],
    });

    const rewritten = updateFrontmatterInMarkdown(dirtyMd, {});
    assert.strictEqual(
      rewritten.trim(),
      `---
title: "Nurse"
type: "spec"
tags: []
templateId: "t"
approvers: []
---

## Description
Conteúdo limpo aqui.`.trim(),
    );
  });

  await t.test("extractFrontmatterMeta deve lidar com tags multiline e tags inline", () => {
    const multilineMd = `---
title: "Guia de Testes"
status: "draft"
tags:
  - unit-test
  - e2e
---
Corpo`;

    const meta = extractFrontmatterMeta(multilineMd);
    assert.deepStrictEqual(meta.tags, ["unit-test", "e2e"]);
  });

  await t.test("updateFrontmatterInMarkdown deve injetar ou atualizar cabeçalho mantendo ordem canônica", () => {
    const rawDoc = "# Apenas Título\n\nTexto sem frontmatter.";
    const updated = updateFrontmatterInMarkdown(rawDoc, {
      title: "Título Oficial",
      status: "review",
      tags: ["qa", "docs"],
      department: "quality",
    });

    assert.match(updated, /^---\ntitle: "Título Oficial"\nstatus: "review"/);
    assert.match(updated, /tags: \["qa", "docs"\]/);
    assert.match(updated, /department: "quality"/);
    assert.match(updated, /# Apenas Título/);

    // Atualização preservando campos existentes
    const secondUpdate = updateFrontmatterInMarkdown(updated, {
      status: "approved",
    });

    const parsedSecond = extractFrontmatterMeta(secondUpdate);
    assert.strictEqual(parsedSecond.title, "Título Oficial");
    assert.strictEqual(parsedSecond.status, "approved");
    assert.strictEqual(parsedSecond.department, "quality");
    assert.deepStrictEqual(parsedSecond.tags, ["qa", "docs"]);
  });

  await t.test("areMetadataListsEqual deve comparar profundamente listas e detectar alterações reais", () => {
    const listA: DocumentMetadataItem[] = [
      {
        id: "doc-1",
        name: "doc-1",
        title: "Doc 1",
        ext: "md",
        path: "docs/doc-1.md",
        status: "draft",
        categories: "geral",
        tags: ["a", "b"],
        updated_at: "2026-01-01T00:00:00Z",
        approvers: [],
        links: ["link1"],
        templateId: "",
        prompt: "",
      },
    ];

    const listB: DocumentMetadataItem[] = [
      {
        id: "doc-1",
        name: "doc-1",
        title: "Doc 1",
        ext: "md",
        path: "docs/doc-1.md",
        status: "draft",
        categories: "geral",
        tags: ["a", "b"],
        updated_at: "2026-10-23T12:00:00Z", // Timestamp diferente mas semântica idêntica
        approvers: [],
        links: ["link1"],
        templateId: "",
        prompt: "",
      },
    ];

    assert.strictEqual(areMetadataListsEqual(listA, listB), true);

    const listC: DocumentMetadataItem[] = [
      {
        ...listA[0],
        status: "approved", // Mudança real de status
      },
    ];

    assert.strictEqual(areMetadataListsEqual(listA, listC), false);
  });

  await t.test("Reconciliação incremental inteligente e sincronização transparente de frontmatters", async () => {
    const testRepo = "test-perf-metadata-repo";
    const repoDir = resolveRepoDir(testRepo);

    fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });

    const docPath = path.join(repoDir, "docs", "guia.md");
    fs.writeFileSync(
      docPath,
      "# Guia de Desenvolvimento\n\nEste documento inicial não tem frontmatter.",
      "utf-8",
    );

    // Inicializa catálogo com metadados para este arquivo
    docsMetadataService.saveDocsMetadata(testRepo, [
      {
        id: "docs-guia",
        name: "guia",
        title: "Guia de Desenvolvimento",
        ext: "md",
        path: "docs/guia.md",
        status: "proposed",
        categories: "engenharia",
        tags: ["dev", "normas"],
        department: "engineering",
        updated_at: new Date().toISOString(),
        approvers: [],
        links: [],
        templateId: "tpl-1",
        prompt: "",
      },
    ]);

    // Executa sincronização transparente de metadados para o frontmatter do arquivo físico
    const syncRes = await docsMetadataService.syncMetadataToFrontmatters(testRepo);
    assert.strictEqual(syncRes.synced, 1);

    // Verifica se o frontmatter foi gravado no arquivo físico
    const diskContent = fs.readFileSync(docPath, "utf-8");
    const parsedFm = extractFrontmatterMeta(diskContent);
    assert.strictEqual(parsedFm.status, "proposed");
    assert.strictEqual(parsedFm.categories, "engenharia");
    assert.deepStrictEqual(parsedFm.tags, ["dev", "normas"]);
    assert.strictEqual(parsedFm.department, "engineering");

    // Limpeza
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      const cachePath = docsMetadataService.getDocsMetadataPath(testRepo);
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      docsMetadataService.clearCache(testRepo);
    } catch {}
  });

  await t.test("scheduleBackgroundReconciliation deve escanear disco e detectar alterações incrementais", async () => {
    const testRepo = "test-bg-recon-repo";
    const repoDir = resolveRepoDir(testRepo);

    fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });

    const f1 = path.join(repoDir, "docs", "doc1.md");
    const f2 = path.join(repoDir, "docs", "doc2.md");
    fs.writeFileSync(f1, "---\ntitle: \"Doc 1\"\nstatus: \"draft\"\n---\nCorpo 1", "utf-8");
    fs.writeFileSync(f2, "---\ntitle: \"Doc 2\"\nstatus: \"review\"\n---\nCorpo 2", "utf-8");

    docsMetadataService.scheduleBackgroundReconciliation(testRepo);
    await new Promise((r) => setTimeout(r, 100));

    const metaList = docsMetadataService.loadDocsMetadata(testRepo);
    assert.strictEqual(metaList.length, 2);
    const item1 = metaList.find((d) => d.path === "docs/doc1.md");
    const item2 = metaList.find((d) => d.path === "docs/doc2.md");
    assert.strictEqual(item1?.status, "draft");
    assert.strictEqual(item2?.status, "review");

    // Altera doc2 no disco
    fs.writeFileSync(f2, "---\ntitle: \"Doc 2 Atualizado\"\nstatus: \"approved\"\n---\nCorpo 2 alterado", "utf-8");
    docsMetadataService.scheduleBackgroundReconciliation(testRepo);
    await new Promise((r) => setTimeout(r, 100));

    const updatedList = docsMetadataService.loadDocsMetadata(testRepo);
    const updatedItem2 = updatedList.find((d) => d.path === "docs/doc2.md");
    assert.strictEqual(updatedItem2?.status, "approved");
    assert.strictEqual(updatedItem2?.title, "Doc 2 Atualizado");

    // Limpeza
    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      const cachePath = docsMetadataService.getDocsMetadataPath(testRepo);
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      docsMetadataService.clearCache(testRepo);
    } catch {}
  });

  await t.test("Cache externo deve ficar fora do repositório e hidratar cold start em RAM", async () => {
    const testRepo = "test-external-cache-repo";
    const repoDir = resolveRepoDir(testRepo);
    const cachePath = docsMetadataService.getDocsMetadataPath(testRepo);

    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      docsMetadataService.clearCache(testRepo);

      fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(repoDir, "docs", "spec.md"),
        '---\ntitle: "Spec Externa"\nstatus: "approved"\nclassification: "restricted"\n---\nCorpo',
        "utf-8",
      );

      // Caminho de cache deve apontar para METADATA_CACHE_DIR e não para dentro do repoDir
      assert.ok(path.resolve(cachePath).startsWith(path.resolve(METADATA_CACHE_DIR)));
      assert.strictEqual(fs.existsSync(path.join(repoDir, ".docs.metadata.json")), false);

      docsMetadataService.scheduleBackgroundReconciliation(testRepo);
      await new Promise((r) => setTimeout(r, 120));

      assert.strictEqual(fs.existsSync(cachePath), true);
      assert.strictEqual(fs.existsSync(path.join(repoDir, ".docs.metadata.json")), false);

      // Simula cold start limpando toda a RAM
      docsMetadataService.clearCache(testRepo);
      const hydrated = docsMetadataService.loadDocsMetadata(testRepo, false);
      assert.strictEqual(hydrated.length, 1);
      assert.strictEqual(hydrated[0].title, "Spec Externa");
      assert.strictEqual(hydrated[0].classification, "restricted");
    } finally {
      try {
        fs.rmSync(repoDir, { recursive: true, force: true });
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        docsMetadataService.clearCache(testRepo);
      } catch {}
    }
  });

  await t.test("Reconciliação Git delta deve detectar novos commits e arquivos sujos sem sujar o repo", async () => {
    const testRepo = "test-git-delta-repo";
    const repoDir = resolveRepoDir(testRepo);
    const cachePath = docsMetadataService.getDocsMetadataPath(testRepo);

    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      docsMetadataService.clearCache(testRepo);

      fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
      await executeGit(["init", "-b", "main"], repoDir);
      await executeGit(["config", "user.name", "Test"], repoDir);
      await executeGit(["config", "user.email", "test@example.com"], repoDir);

      const f1 = path.join(repoDir, "docs", "a.md");
      fs.writeFileSync(f1, '---\ntitle: "Doc A"\nstatus: "draft"\n---\nTexto A', "utf-8");
      await executeGit(["add", "."], repoDir);
      await executeGit(["commit", "-m", "init"], repoDir);

      docsMetadataService.scheduleBackgroundReconciliation(testRepo);
      await new Promise((r) => setTimeout(r, 150));

      let list = docsMetadataService.loadDocsMetadata(testRepo);
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].title, "Doc A");

      // Novo commit adicionando doc b.md
      const f2 = path.join(repoDir, "docs", "b.md");
      fs.writeFileSync(f2, '---\ntitle: "Doc B"\nstatus: "review"\n---\nTexto B', "utf-8");
      await executeGit(["add", "."], repoDir);
      await executeGit(["commit", "-m", "add b"], repoDir);

      // Simula cold start e reconciliação via HEAD diff
      docsMetadataService.clearCache(testRepo);
      docsMetadataService.loadDocsMetadata(testRepo, true);
      await new Promise((r) => setTimeout(r, 180));

      list = docsMetadataService.loadDocsMetadata(testRepo);
      assert.strictEqual(list.length, 2);
      assert.strictEqual(list.find((d) => d.path === "docs/b.md")?.status, "review");

      // Edição não commitada (working tree dirty)
      fs.writeFileSync(f1, '---\ntitle: "Doc A Editado"\nstatus: "approved"\n---\nTexto A2', "utf-8");
      docsMetadataService.scheduleBackgroundReconciliation(testRepo);
      await new Promise((r) => setTimeout(r, 150));

      list = docsMetadataService.loadDocsMetadata(testRepo);
      assert.strictEqual(list.find((d) => d.path === "docs/a.md")?.status, "approved");
      assert.strictEqual(fs.existsSync(path.join(repoDir, ".docs.metadata.json")), false);
    } finally {
      try {
        fs.rmSync(repoDir, { recursive: true, force: true });
        if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        docsMetadataService.clearCache(testRepo);
      } catch {}
    }
  });

  await t.test("checkAiPolicy deve respeitar classification no frontmatter sem depender de .docs.metadata.json", () => {
    const testRepo = "test-ai-policy-fm-repo";
    const repoDir = resolveRepoDir(testRepo);

    try {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
      fs.writeFileSync(
        path.join(repoDir, "docs", "segredo.md"),
        '---\ntitle: "Segredo"\nclassification: "confidential"\n---\nConteúdo confidencial',
        "utf-8",
      );

      const res = checkAiPolicy({
        projectRoot: repoDir,
        filePath: "docs/segredo.md",
        provider: "openai",
      });
      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.policy, "deny");
    } finally {
      try {
        fs.rmSync(repoDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
