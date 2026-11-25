import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionStoreService } from './session-store.service.js';

function createTempDbPath(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `contexos-sql-test-${name}-`));
  return path.join(dir, 'sessions.db');
}

test('SessionStoreService: append, list, detail, delete e reset', () => {
  const dbPath = createTempDbPath('crud');
  const store = new SessionStoreService(dbPath);

  try {
    store.appendEvent('my-repo', 'docs/intro.md', 'sess-1', 'user', 'Olá Copilot', { model: 'gemini-2.5-flash' });
    store.appendEvent('my-repo', 'docs/intro.md', 'sess-1', 'model', 'Olá! Como posso ajudar?', { model: 'gemini-2.5-flash' });

    const history = store.getChatHistory('my-repo');
    assert.equal(history.sessions.length, 1);
    assert.equal(history.sessions[0].session_id, 'sess-1');
    assert.equal(history.sessions[0].event_count, 2);
    assert.equal(history.sessions[0].preview, 'Olá Copilot');

    const details = store.getSessionDetails('my-repo', 'sess-1');
    assert.ok(details);
    assert.equal(details.events.length, 2);
    assert.equal(details.events[1].text, 'Olá! Como posso ajudar?');

    const del = store.deleteSession('my-repo', 'sess-1');
    assert.equal(del.success, true);
    assert.equal(store.getChatHistory('my-repo').sessions.length, 0);
  } finally {
    store.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});

test('SessionStoreService: exportDatabase e importDatabase com merge aditivo sem perda de dados', () => {
  const dbPathA = createTempDbPath('store-a');
  const dbPathB = createTempDbPath('store-b');
  const storeA = new SessionStoreService(dbPathA);
  const storeB = new SessionStoreService(dbPathB);

  try {
    // Store A tem sess-shared (1 msg) e sess-only-a
    storeA.appendEvent('repo-x', 'a.md', 'sess-shared', 'user', 'Pergunta original A');
    storeA.appendEvent('repo-x', 'a.md', 'sess-only-a', 'user', 'Sessão exclusiva A');

    // Store B tem sess-only-b e uma nova mensagem em sess-shared
    storeB.appendEvent('repo-x', 'a.md', 'sess-shared', 'model', 'Resposta vinda do B');
    storeB.appendEvent('repo-x', 'b.md', 'sess-only-b', 'user', 'Sessão exclusiva B');

    // Exporta B como .sqlite
    const exported = storeB.exportDatabase('repo-x');
    assert.ok(exported.buffer.length > 100);
    assert.match(exported.filename, /\.sqlite$/);

    // Importa B dentro de A usando strategy = 'merge'
    const summary = storeA.importDatabase(exported.buffer, {
      targetRepo: 'repo-x',
      conflictStrategy: 'merge',
    });

    assert.equal(summary.success, true);
    assert.equal(summary.addedSessions, 1); // sess-only-b
    assert.equal(summary.mergedSessions, 1); // sess-shared
    assert.equal(summary.addedEvents, 2); // 1 de sess-only-b + 1 de sess-shared

    const mergedShared = storeA.getSessionDetails('repo-x', 'sess-shared');
    assert.ok(mergedShared);
    assert.equal(mergedShared.events.length, 2);
    assert.deepEqual(
      mergedShared.events.map((e) => e.text).sort(),
      ['Pergunta original A', 'Resposta vinda do B'].sort()
    );

    // Re-importar o mesmo arquivo deve ser idempotente (não duplicar eventos)
    const summaryAgain = storeA.importDatabase(exported.buffer, {
      targetRepo: 'repo-x',
      conflictStrategy: 'merge',
    });
    assert.equal(summaryAgain.addedSessions, 0);
    assert.equal(summaryAgain.addedEvents, 0);
    assert.equal(summaryAgain.skippedSessions, 2);
  } finally {
    storeA.close();
    storeB.close();
    fs.rmSync(path.dirname(dbPathA), { recursive: true, force: true });
    fs.rmSync(path.dirname(dbPathB), { recursive: true, force: true });
  }
});

test('SessionStoreService: rejeita arquivo inválido na importação', () => {
  const dbPath = createTempDbPath('invalid');
  const store = new SessionStoreService(dbPath);
  try {
    assert.throws(
      () => store.importDatabase(Buffer.from('not a sqlite file')),
      /Arquivo inválido/
    );
  } finally {
    store.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  }
});
