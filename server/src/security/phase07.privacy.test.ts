import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkAiPolicy, getProjectAiPolicy } from "../modules/ai/ai-policy.service.js";
import {
  recordAuditEvent,
  verifyAuditChain,
} from "../modules/audit/audit-chain.service.js";
import { validateCliExecutable } from "../utils/cli-validate.js";
import { RagIndexer } from "../modules/rag/rag.indexer.js";

describe("Fase 7: Governança de IA, LGPD, Trilha de Auditoria e Validação de CLIs", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctxos-phase07-test-"));
  });

  after(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe("7.1: Política de Privacidade de IA (LGPD)", () => {
    test("deve bloquear envio de documento confidencial para provedores de nuvem (Gemini, OpenAI, Anthropic)", () => {
      const policyGemini = checkAiPolicy({
        classification: "confidential",
        provider: "gemini",
      });
      assert.equal(policyGemini.allowed, false);
      assert.ok(policyGemini.reason?.includes("LGPD") || policyGemini.reason?.includes("confidencial"));

      const policyOpenAI = checkAiPolicy({
        classification: "restricted",
        provider: "openai",
      });
      assert.equal(policyOpenAI.allowed, false);

      const policyAnthropic = checkAiPolicy({
        classification: "confidential",
        provider: "anthropic",
      });
      assert.equal(policyAnthropic.allowed, false);
    });

    test("deve permitir documento confidencial para Ollama local se configurado local_only", () => {
      const policyOllama = checkAiPolicy({
        classification: "restricted",
        provider: "ollama",
      });
      assert.equal(policyOllama.allowed, true);
    });

    test("deve carregar política dinâmica a partir do .project.config.json sem listas estáticas", () => {
      const configPath = path.join(tmpDir, ".project.config.json");
      const customConfig = {
        project: { name: "test-repo" },
        ai_policy: {
          default: "allow_external",
          by_classification: {
            ultra_secreto: "deny",
            publico: "allow_external",
          },
          by_department: {
            recursos_humanos: "deny",
          },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2), "utf-8");

      const loadedPolicy = getProjectAiPolicy(tmpDir);
      assert.equal(loadedPolicy.by_classification?.ultra_secreto, "deny");
      assert.equal(loadedPolicy.by_department?.recursos_humanos, "deny");

      const checkCustom = checkAiPolicy({
        projectRoot: tmpDir,
        classification: "ultra_secreto",
        provider: "gemini",
      });
      assert.equal(checkCustom.allowed, false);

      const checkDept = checkAiPolicy({
        projectRoot: tmpDir,
        department: "recursos_humanos",
        provider: "gemini",
      });
      assert.equal(checkDept.allowed, false);
    });

    test("deve excluir documentos confidenciais do índice incremental RAG", () => {
      const ragRepoDir = path.join(tmpDir, "rag-repo");
      fs.mkdirSync(ragRepoDir, { recursive: true });

      // Cria .project.config.json
      fs.writeFileSync(
        path.join(ragRepoDir, ".project.config.json"),
        JSON.stringify({
          project: { name: "rag-repo" },
          ai_policy: {
            default: "allow_external",
            by_classification: {
              confidential: "deny",
              public: "allow_external",
            },
          },
        }),
        "utf-8"
      );

      // Cria metadados .docs.metadata.json
      fs.writeFileSync(
        path.join(ragRepoDir, ".docs.metadata.json"),
        JSON.stringify([
          {
            path: "docs/secret-finances.md",
            classification: "confidential",
          },
          {
            path: "docs/public-guide.md",
            classification: "public",
          },
        ]),
        "utf-8"
      );

      // Cria arquivos
      const docsDir = path.join(ragRepoDir, "docs");
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, "secret-finances.md"), "# Contas Bancárias Secretas\nDados sigilosos.", "utf-8");
      fs.writeFileSync(path.join(docsDir, "public-guide.md"), "# Guia Aberto\nInstruções públicas da comunidade.", "utf-8");

      const indexer = new RagIndexer();
      const result = indexer.indexRepositoryIncremental("rag-repo", ragRepoDir);

      const indexedFiles = result.chunks.map((c) => c.relativePath);
      assert.ok(indexedFiles.some((f) => f.includes("public-guide.md")));
      assert.ok(!indexedFiles.some((f) => f.includes("secret-finances.md")), "Arquivo confidencial não deve ser indexado no RAG");
    });
  });

  describe("7.2: Trilha de Auditoria Criptográfica Encadeada (Hash Chain)", () => {
    test("deve registrar eventos encadeados e validar a integridade da cadeia", async () => {
      const auditDir = path.join(tmpDir, ".audit");
      fs.mkdirSync(auditDir, { recursive: true });

      const e1 = await recordAuditEvent(tmpDir, {
        eventType: "ai_request",
        user: "qa-analyst",
        payload: { prompt: "Revisar política de segurança", provider: "ollama" },
      });
      assert.ok(e1.hash);
      assert.equal(e1.index, 0);

      const e2 = await recordAuditEvent(tmpDir, {
        eventType: "tool_approval",
        user: "qa-analyst",
        payload: { tool: "run_tests", approved: true },
      });
      assert.ok(e2.hash);
      assert.equal(e2.index, 1);
      assert.equal(e2.prevHash, e1.hash);

      const e3 = await recordAuditEvent(tmpDir, {
        eventType: "push",
        user: "qa-analyst",
        payload: { branch: "main", commit: "abc1234" },
      });
      assert.equal(e3.index, 2);
      assert.equal(e3.prevHash, e2.hash);

      const auditCheck = verifyAuditChain(tmpDir);
      assert.equal(auditCheck.valid, true);
      assert.equal(auditCheck.totalEntries, 3);
    });

    test("deve detectar adulteração em qualquer registro da trilha", async () => {
      const chainPath = path.join(tmpDir, ".audit", "audit-chain.jsonl");
      const lines = fs.readFileSync(chainPath, "utf-8").split("\n").filter(Boolean);
      assert.ok(lines.length >= 3);

      // Adultera o registro 1
      const tamperedRecord = JSON.parse(lines[1]);
      tamperedRecord.payload.tool = "malicious_script";
      lines[1] = JSON.stringify(tamperedRecord);
      fs.writeFileSync(chainPath, lines.join("\n") + "\n", "utf-8");

      const checkTampered = verifyAuditChain(tmpDir);
      assert.equal(checkTampered.valid, false);
      assert.equal(checkTampered.brokenIndex, 1);
    });
  });

  describe("7.3: Validação Estrita de Binários de CLIs Externos", () => {
    let dummyClaude: string;
    let dummyEvil: string;

    before(() => {
      dummyClaude = path.join(tmpDir, "claude");
      fs.writeFileSync(dummyClaude, "#!/bin/sh\necho claude-cli", { mode: 0o755 });

      dummyEvil = path.join(tmpDir, "evil.sh; rm -rf");
      fs.writeFileSync(dummyEvil, "#!/bin/sh\necho evil", { mode: 0o755 });
    });

    test("deve aprovar binário legítimo executável dentro da allowlist", () => {
      const res = validateCliExecutable(dummyClaude, ["claude"]);
      assert.equal(res.valid, true);
      assert.ok(res.realPath);
    });

    test("deve rejeitar binário com caracteres especiais de shell no nome", () => {
      const res = validateCliExecutable(dummyEvil, ["claude", "evil.sh"]);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("caracteres inválidos"));
    });

    test("deve rejeitar binário executável que não está na allowlist", () => {
      const res = validateCliExecutable(dummyClaude, ["antigravity", "agy"]);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("allowlist"));
    });

    test("deve rejeitar arquivo não executável", () => {
      const nonExec = path.join(tmpDir, "agy");
      fs.writeFileSync(nonExec, "not executable", { mode: 0o644 });

      const res = validateCliExecutable(nonExec, ["agy"]);
      assert.equal(res.valid, false);
      assert.ok(res.error?.includes("executável"));
    });
  });
});
