import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadDotTemplates,
  writeDotTemplate,
  deleteDotTemplate,
  serializeTemplateHeader,
  parseTemplateHeader,
  sanitizeTemplateSlug,
} from './template-markdown.js';
import type { ProjectTemplate } from '../config/constants.js';

test('Template Header: serialize e parse isolado', () => {
  const tpl: ProjectTemplate = {
    id: 'tpl-visao',
    templateName: 'visao',
    title: 'Visão Geral',
    ext: 'md',
    category: 'produto',
    tags: ['estrategia'],
    skills: ['living-docs-governance'],
    updated_at: '2026-11-09T10:00:00.000Z',
    badge: 'DOC',
    description: 'Descrição do template',
    source: 'local',
    prompt: 'Prompt da IA',
    content: '## Seção 1\n\nConteúdo do template',
  };

  const serialized = serializeTemplateHeader(tpl);
  assert.ok(serialized.startsWith('---\n'));
  assert.ok(serialized.includes('id: "tpl-visao"'));
  assert.ok(serialized.includes('title: "Visão Geral"'));
  assert.ok(!serialized.includes('prompt:')); // prompt não fica no YAML!
  assert.ok(serialized.includes('## Seção 1'));

  const parsed = parseTemplateHeader(serialized, 'visao');
  assert.equal(parsed.meta.id, tpl.id);
  assert.equal(parsed.meta.title, tpl.title);
  assert.equal(parsed.content, tpl.content);
});

test('DotTemplates: I/O modular em .templates/<slug>/ (template.md + prompt.md)', () => {
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dot-tpl-repo-'));

  try {
    const tpl: ProjectTemplate = {
      id: 't',
      templateName: 'Modelagem',
      title: 'Modelagem',
      ext: 'md',
      category: 'geral',
      tags: ['arquitetura'],
      skills: ['living-docs-governance'],
      updated_at: '2026-11-09T10:34:15.981Z',
      badge: 'DOC',
      description: '',
      source: 'local',
      prompt: 'Você é um assistente especialista.\nFaça perguntas passo a passo.',
      content: '## Description\n\n## Entity\n\n## Relations',
    };

    // Grava
    const writeRes = writeDotTemplate(tmpRepo, tpl);
    const expectedFolder = path.join(tmpRepo, '.templates', 'modelagem');

    assert.equal(writeRes.folderPath, expectedFolder);
    assert.ok(fs.existsSync(path.join(expectedFolder, 'template.md')));
    assert.ok(fs.existsSync(path.join(expectedFolder, 'prompt.md')));

    // Verifica conteúdo isolado
    const templateRaw = fs.readFileSync(path.join(expectedFolder, 'template.md'), 'utf-8');
    assert.ok(templateRaw.includes('id: "t"'));
    assert.ok(templateRaw.includes('## Description'));

    const promptRaw = fs.readFileSync(path.join(expectedFolder, 'prompt.md'), 'utf-8').trim();
    assert.equal(promptRaw, tpl.prompt);

    // Carrega com reconciliação e cache
    const loaded = loadDotTemplates(tmpRepo);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, 't');
    assert.equal(loaded[0].title, 'Modelagem');
    assert.equal(loaded[0].content, tpl.content);
    assert.equal(loaded[0].prompt, tpl.prompt);
    assert.deepEqual(loaded[0].tags, tpl.tags);

    // Deleta
    const deleted = deleteDotTemplate(tmpRepo, 't');
    assert.equal(deleted, true);
    assert.equal(fs.existsSync(expectedFolder), false);
    assert.equal(loadDotTemplates(tmpRepo).length, 0);
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
});
