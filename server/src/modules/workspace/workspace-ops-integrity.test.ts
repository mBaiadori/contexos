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
import { workspaceService } from "./workspace.service.js";
import { draftsTrashService } from "../git/drafts-trash.service.js";

function assertIsolatedTestEnv() {
  if (!CONFIG_PATH.startsWith(os.tmpdir())) {
    throw new Error(
      `ABORT: CONFIG_PATH ("${CONFIG_PATH}") fora de os.tmpdir(). Execute via scripts/run-tests.mjs.`,
    );
  }
}

// Header PNG real + bytes não-UTF-8 (0x89, 0xFF, 0x00, 0xFE) para validar integridade binária byte-a-byte
const SAMPLE_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0xff, 0xfe, 0x00, 0x01, 0xde, 0xad, 0xbe, 0xef,
]);

describe("WorkspaceOps & Changes - Integridade de arquivos, binários, download e clearance", () => {
  let repoName: string;
  let repoDir: string;
  let seq = 0;

  beforeEach(async () => {
    assertIsolatedTestEnv();
    repoName = `test-ws-integrity-${Date.now()}-${++seq}`;
    repoDir = resolveRepoDir(repoName);
    fs.mkdirSync(repoDir, { recursive: true });

    await executeGit(["init", "-b", "main"], repoDir);
    await executeGit(["config", "user.name", "Tester"], repoDir);
    await executeGit(["config", "user.email", "tester@contexos.local"], repoDir);

    fs.mkdirSync(path.join(repoDir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "docs/guia.md"), "# Guia Original\n", "utf-8");
    fs.writeFileSync(path.join(repoDir, "assets/logo.png"), SAMPLE_PNG_BYTES);
    await executeGit(["add", "-A"], repoDir);
    await executeGit(["commit", "-m", "Base com texto e binário"], repoDir);

    const cfg = loadConfig();
    cfg.authenticated = false;
    cfg.token = "";
    cfg.user = { login: "alice", name: "Alice" };
    cfg.active_repo = {
      name: repoName,
      full_name: `alice/${repoName}`,
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

  it("saveFile, getFile, getRawFile e importFiles preservam texto e binários byte-a-byte e bloqueiam traversal", async () => {
    // 1. Save texto
    const saveRes = await workspaceService.saveFile(
      "docs/guia.md",
      "---\ntitle: \"Guia Atualizado\"\n---\n# Guia Atualizado\n",
      undefined,
      repoName,
    );
    assert.strictEqual(saveRes.success, true);

    const loaded = workspaceService.getFile("docs/guia.md", repoName);
    assert.strictEqual(loaded.isBinary, false);
    assert.ok(loaded.content.includes("Guia Atualizado"));

    // 2. Importação mista: texto + binário base64 + tentativa de path traversal
    const importRes = await workspaceService.importFiles(
      "imports",
      [
        { name: "nota acentuada.md", content: "# Nota com acentuação çãé\n" },
        { name: "anexo.png", base64: SAMPLE_PNG_BYTES.toString("base64") },
        { name: "../fora-do-repo.md", content: "malicioso" },
      ],
      repoName,
    );

    assert.strictEqual(importRes.success, true);
    assert.strictEqual(importRes.importedFiles.length, 2);
    assert.strictEqual(importRes.errors.length, 1);

    // 3. Leitura binária via getFile e getRawFile preserva integridade byte-a-byte e MIME
    const binMeta = workspaceService.getFile("imports/anexo.png", repoName);
    assert.strictEqual(binMeta.isBinary, true);
    assert.strictEqual(binMeta.content, "");
    assert.strictEqual(binMeta.size, SAMPLE_PNG_BYTES.length);

    const raw = workspaceService.getRawFile("imports/anexo.png", repoName);
    assert.strictEqual(raw.mimeType, "image/png");
    assert.strictEqual(Buffer.compare(raw.buffer, SAMPLE_PNG_BYTES), 0);
  });

  it("renameFile e duplicateFile funcionam para binários e rejeitam colisão de destino", async () => {
    // Renomeia PNG preservando bytes exatos
    const ren = await workspaceService.renameFile(
      "assets/logo.png",
      "assets/marca.png",
      repoName,
    );
    assert.strictEqual(ren.success, true);
    assert.strictEqual(
      Buffer.compare(fs.readFileSync(path.join(repoDir, "assets/marca.png")), SAMPLE_PNG_BYTES),
      0,
    );

    // Duplica duas vezes para validar sufixos incrementais sem sobrescrever
    const dup1 = await workspaceService.duplicateFile("assets/marca.png", repoName);
    const dup2 = await workspaceService.duplicateFile("assets/marca.png", repoName);
    assert.strictEqual(dup1.newPath, "assets/marca-copia.png");
    assert.strictEqual(dup2.newPath, "assets/marca-copia-2.png");
    assert.strictEqual(
      Buffer.compare(fs.readFileSync(path.join(repoDir, dup1.newPath)), SAMPLE_PNG_BYTES),
      0,
    );

    // Destino já existente deve falhar sem apagar origem
    await assert.rejects(
      () => workspaceService.renameFile("assets/marca.png", "assets/marca-copia.png", repoName),
      /já existe/i,
    );
    assert.strictEqual(fs.existsSync(path.join(repoDir, "assets/marca.png")), true);
  });

  it("discardChanges restaura texto, restaura binário deletado byte-a-byte e preserva lixeira de rascunhos", async () => {
    // Modifica texto, cria arquivo novo e deleta o PNG commitado
    await workspaceService.saveFile("docs/guia.md", "# Guia alterado localmente\n", undefined, repoName);
    await workspaceService.createFile("docs/temporario.md", "# Temp\n", false, undefined, repoName);
    await workspaceService.deleteFile("assets/logo.png", repoName);

    assert.strictEqual(fs.existsSync(path.join(repoDir, "assets/logo.png")), false);

    // Descarta todas as alterações
    const disc = await workspaceService.discardChanges(undefined, repoName);
    assert.strictEqual(disc.success, true);

    // Texto restaurado, temporário removido e PNG restaurado byte-a-byte (sem corrupção UTF-8!)
    assert.strictEqual(
      fs.readFileSync(path.join(repoDir, "docs/guia.md"), "utf-8"),
      "# Guia Original\n",
    );
    assert.strictEqual(fs.existsSync(path.join(repoDir, "docs/temporario.md")), false);
    assert.strictEqual(
      Buffer.compare(fs.readFileSync(path.join(repoDir, "assets/logo.png")), SAMPLE_PNG_BYTES),
      0,
    );

    // Lixeira de rascunhos NÃO foi apagada pelo git clean -fd e permite restaurar o texto descartado
    const trash = await draftsTrashService.listTrash(repoName);
    assert.strictEqual(trash.length, 1);
    const restored = await draftsTrashService.restoreTrash(trash[0].id, repoName);
    assert.strictEqual(restored.success, true);
    assert.ok(
      fs.readFileSync(path.join(repoDir, "docs/guia.md"), "utf-8").includes("Guia alterado localmente"),
    );
  });

  it("verifyUserClearance bloqueia leitura, download (getRawFile) e escrita para colaborador sem permissão", async () => {
    fs.mkdirSync(path.join(repoDir, "financeiro"), { recursive: true });
    fs.writeFileSync(path.join(repoDir, "financeiro/folha.md"), "Salários confidenciais\n", "utf-8");
    fs.writeFileSync(
      path.join(repoDir, ".project.config.json"),
      JSON.stringify(
        {
          governance_collaborators: {
            bob: {
              departments: ["docs"],
              allowed_paths: ["docs/*"],
              denied_paths: ["financeiro/*"],
            },
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    // Troca usuário ativo para bob (não é o owner `alice`)
    const cfg = loadConfig();
    cfg.user = { login: "bob", name: "Bob" };
    saveConfig(cfg);

    assert.throws(
      () => workspaceService.getFile("financeiro/folha.md", repoName),
      /Acesso Negado/i,
    );
    assert.throws(
      () => workspaceService.getRawFile("financeiro/folha.md", repoName),
      /Acesso Negado/i,
    );
    await assert.rejects(
      () => workspaceService.saveFile("financeiro/folha.md", "sobrescrito", undefined, repoName),
      /Acesso Negado/i,
    );

    // Mas bob continua acessando docs/ normalmente
    const allowed = workspaceService.getFile("docs/guia.md", repoName);
    assert.ok(allowed.content.includes("Guia Original"));
  });

  it("rota HTTP /api/project/file/raw entrega arquivo binário com Content-Type e Content-Disposition corretos", async () => {
    const app: FastifyInstance = await buildApp();
    await app.ready();
    try {
      const token = getSessionToken();
      const res = await app.inject({
        method: "GET",
        url: `/api/project/file/raw?path=${encodeURIComponent("assets/logo.png")}&repo=${encodeURIComponent(repoName)}`,
        headers: {
          host: "127.0.0.1:4100",
          "x-contextos-token": token,
        },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers["content-type"], "image/png");
      assert.match(String(res.headers["content-disposition"] || ""), /logo\.png/);
      assert.strictEqual(Buffer.compare(res.rawPayload, SAMPLE_PNG_BYTES), 0);
    } finally {
      await app.close();
    }
  });
});
