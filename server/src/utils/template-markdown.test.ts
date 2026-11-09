import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadMarkdownTemplatesFromDir,
  writeMarkdownTemplateFile,
  deleteMarkdownTemplateFile,
  sanitizeTemplateSlug,
} from './template-markdown.js';
import type { ProjectTemplate } from '../config/constants.js';

test('Template Modular: grava pasta com template.md, prompt.md e metadata.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-modular-test-'));
  const templatesDir = path.join(tmpDir, 'templates');

  try {
    const tpl: ProjectTemplate = {
      id: 'tpl-modelagem-1',
      templateName: 'Modelagem',
      title: 'Modelagem de Sistemas',
      ext: 'md',
      category: 'arquitetura',
      tags: ['modelagem', 'entidades'],
      skills: ['living-docs-governance'],
      updated_at: '2026-11-09T10:30:00.000Z',
      badge: 'DOC',
      description: 'Template de modelagem',
      source: 'local',
      prompt: 'Você é um assistente especialista em modelagem de dados.\nFaça perguntas passo a passo.',
      content: '## Description\n\n## Entity\n\n## Relations\n\n## Actions',
    };

    const res = writeMarkdownTemplateFile(templatesDir, tpl);
    const expectedFolder = path.join(templatesDir, 'modelagem');

    assert.equal(res.folderPath, expectedFolder);
    assert.ok(fs.existsSync(path.join(expectedFolder, 'template.md')));
    assert.ok(fs.existsSync(path.join(expectedFolder, 'prompt.md')));
    assert.ok(fs.existsSync(path.join(expectedFolder, 'metadata.json')));

    // Verifica conteúdo isolado
    const templateContent = fs.readFileSync(path.join(expectedFolder, 'template.md'), 'utf-8').trim();
    assert.equal(templateContent, tpl.content);

    const promptContent = fs.readFileSync(path.join(expectedFolder, 'prompt.md'), 'utf-8').trim();
    assert.equal(promptContent, tpl.prompt);

    // Lê via loadMarkdownTemplatesFromDir
    const loaded = loadMarkdownTemplatesFromDir(templatesDir);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, tpl.id);
    assert.equal(loaded[0].title, tpl.title);
    assert.equal(loaded[0].content, tpl.content);
    assert.equal(loaded[0].prompt, tpl.prompt);
    assert.deepEqual(loaded[0].tags, tpl.tags);
    assert.deepEqual(loaded[0].skills, tpl.skills);

    // Deleta a pasta
    const deleted = deleteMarkdownTemplateFile(templatesDir, tpl.id);
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(expectedFolder), false);
    assert.equal(loadMarkdownTemplatesFromDir(templatesDir).length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
