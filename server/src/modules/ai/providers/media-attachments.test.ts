import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { materializeAttachmentsForCli, normalizeAttachments } from './media-attachments.js';

describe('media-attachments', () => {
  it('normalizes valid base64 attachments and strips data URL prefix', () => {
    const rawBase64 = Buffer.from('hello-image').toString('base64');
    const result = normalizeAttachments([
      {
        id: 'att-1',
        name: 'screenshot.png',
        mimeType: 'image/png',
        size: 11,
        dataBase64: `data:image/png;base64,${rawBase64}`,
      },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].dataBase64, rawBase64);
    assert.equal(result[0].mimeType, 'image/png');
  });

  it('materializes attachments to temp files and builds CLI prompt block', () => {
    const payload = Buffer.from('png-binary-content');
    const { savedFiles, promptBlock } = materializeAttachmentsForCli('test-session', [
      {
        id: 'att-2',
        name: '../evil/../../diagram.png',
        mimeType: 'image/png',
        size: payload.length,
        dataBase64: payload.toString('base64'),
      },
    ]);

    assert.equal(savedFiles.length, 1);
    assert.ok(fs.existsSync(savedFiles[0].filePath));
    assert.equal(fs.readFileSync(savedFiles[0].filePath).toString(), 'png-binary-content');
    assert.ok(!savedFiles[0].filePath.includes('..'));
    assert.ok(promptBlock.includes(savedFiles[0].filePath));
    assert.ok(promptBlock.includes('read_file / Read'));

    fs.rmSync(path.dirname(savedFiles[0].filePath), { recursive: true, force: true });
  });
});
