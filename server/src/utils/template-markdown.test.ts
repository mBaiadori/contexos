import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  serializeTemplateToMarkdown,
  parseTemplateFromMarkdown,
  loadMarkdownTemplatesFromDir,
  writeMarkdownTemplateFile,
  deleteMarkdownTemplateFile,
  sanitizeTemplateSlug,
} from './template-markdown.js';
import type { ProjectTemplate } from '../config/constants.js';

test('Template Markdown: serialize e parse roundtrip', () => {
  const original: ProjectTemplate = {
    id: 'tpl-vision-123',
    templateName: 'vision',
    title: 'Visão do Produto',
    ext: 'md',
    category: 'produto',
    tags: ['arquitetura', 'v1'],
    skills: ['living-docs-governance'],
    updated_at: '2026-11-09T10:00:00.000Z',
    badge: 'DOC',
    description: 'Template para documentar a visão do produto',
    source: 'local',
    prompt: `Linha 1 do prompt.\nLinha 2 com regras:\n- Regra 1\n- Regra 2`,
    content: `## Description\n\nTexto descritivo do template.\n\n## Entity\n\nCampos da entidade.`,
  };

  const serialized = serializeTemplateToMarkdown(original);
  assert.ok(serialized.startsWith('---\n'));
  assert.ok(serialized.includes('id: "tpl-vision-123"'));
  assert.ok(serialized.includes('title: "Visão do Produto"'));
  assert.ok(serialized.includes('prompt: |'));
  assert.ok(serialized.includes('  Linha 1 do prompt.'));
  assert.ok(serialized.includes('## Description'));

  const parsed = parseTemplateFromMarkdown(serialized, 'vision.md');
  assert.equal(parsed.id, original.id);
  assert.equal(parsed.title, original.title);
  assert.equal(parsed.templateName, original.templateName);
  assert.equal(parsed.category, original.category);
  assert.deepEqual(parsed.tags, original.tags);
  assert.deepEqual(parsed.skills, original.skills);
  assert.equal(parsed.prompt, original.prompt);
  assert.equal(parsed.content, original.content);
});

test('Template Markdown: I/O em diretório templates/', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-test-'));
  const templatesDir = path.join(tmpDir, 'templates');

  try {
    const tpl1: ProjectTemplate = {
      id: 'tpl-adr',
      templateName: 'adr',
      title: 'Registro de Decisão Arquitetural',
      ext: 'md',
      category: 'arquitetura',
      tags: ['adr'],
      skills: [],
      updated_at: '2026-11-09T11:00:00.000Z',
      badge: 'ADR',
      description: 'Template ADR',
      source: 'local',
      prompt: 'Prompt do assistente para ADR.',
      content: '# ADR 001\n\n## Contexto',
    };

    const writeRes = writeMarkdownTemplateFile(templatesDir, tpl1);
    assert.ok(fs.existsSync(writeRes.filePath));
    assert.equal(writeRes.relativePath, 'templates/adr.md');

    // Listar templates do diretório
    const loaded = loadMarkdownTemplatesFromDir(templatesDir);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 'tpl-adr');
    assert.equal(loaded[0].title, 'Registro de Decisão Arquitetural');

    // Deletar
    const deleted = deleteMarkdownTemplateFile(templatesDir, 'tpl-adr');
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(writeRes.filePath), false);
    assert.equal(loadMarkdownTemplatesFromDir(templatesDir).length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
