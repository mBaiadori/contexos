import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";
import { draftsTrashService } from "./drafts-trash.service.js";

describe("DraftsTrashService - Lixeira Permanente de Rascunhos", () => {
  const tmpRepo = path.join(os.tmpdir(), `test-trash-repo-${Date.now()}`);

  before(() => {
    fs.mkdirSync(tmpRepo, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    } catch {}
  });

  it("deve arquivar rascunho descartado com patch e metadados", async () => {
    const patch = `diff --git a/docs/spec.md b/docs/spec.md\n--- a/docs/spec.md\n+++ b/docs/spec.md\n@@ -1,1 +1,2 @@\n Linha inicial\n+Linha nova adicionada`;
    const item = await draftsTrashService.moveToTrash(
      {
        fromBranch: "Principal",
        source: "stash",
        message: "Stash recente descartado",
        files: [{ path: "docs/spec.md", additions: 1, deletions: 0 }],
        patch,
      },
      tmpRepo,
    );

    assert.ok(item.id.startsWith("draft-"));
    assert.strictEqual(item.fromBranch, "Principal");
    assert.strictEqual(item.fileCount, 1);
    assert.strictEqual(item.files[0].path, "docs/spec.md");

    const trashList = await draftsTrashService.listTrash(tmpRepo);
    assert.strictEqual(trashList.length, 1);
    assert.strictEqual(trashList[0].id, item.id);
  });

  it("deve permitir exclusão individual e limpeza da lixeira", async () => {
    const item2 = await draftsTrashService.moveToTrash(
      {
        fromBranch: "prop-1-teste",
        source: "workspace",
        message: "Outro rascunho",
        files: [],
        patch: "",
      },
      tmpRepo,
    );

    let list = await draftsTrashService.listTrash(tmpRepo);
    assert.strictEqual(list.length, 2);

    await draftsTrashService.deleteTrashItem(item2.id, tmpRepo);
    list = await draftsTrashService.listTrash(tmpRepo);
    assert.strictEqual(list.length, 1);

    await draftsTrashService.clearTrash(tmpRepo);
    list = await draftsTrashService.listTrash(tmpRepo);
    assert.strictEqual(list.length, 0);
  });
});

