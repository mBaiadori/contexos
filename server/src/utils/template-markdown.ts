import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTemplate } from '../config/constants.js';

/**
 * Normaliza um slug seguro para arquivos de template
 */
export function sanitizeTemplateSlug(nameOrTitle: string): string {
  return (nameOrTitle || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'template';
}

/**
 * Serializa um ProjectTemplate em formato Markdown puro com Frontmatter YAML
 */
export function serializeTemplateToMarkdown(tpl: ProjectTemplate): string {
  const lines: string[] = ['---'];

  const id = tpl.id || `tpl-${Date.now()}`;
  lines.push(`id: "${id.replace(/"/g, '\\"')}"`);

  if (tpl.title) {
    lines.push(`title: "${tpl.title.replace(/"/g, '\\"')}"`);
  }

  if (tpl.templateName) {
    lines.push(`templateName: "${tpl.templateName.replace(/"/g, '\\"')}"`);
  }

  if (tpl.category) {
    lines.push(`category: "${tpl.category.replace(/"/g, '\\"')}"`);
  }

  if (tpl.badge) {
    lines.push(`badge: "${tpl.badge.replace(/"/g, '\\"')}"`);
  }

  if (tpl.description) {
    lines.push(`description: "${tpl.description.replace(/"/g, '\\"')}"`);
  }

  if (tpl.source) {
    lines.push(`source: "${tpl.source.replace(/"/g, '\\"')}"`);
  }

  if (tpl.updated_at) {
    lines.push(`updated_at: "${tpl.updated_at}"`);
  }

  const tags = Array.isArray(tpl.tags) ? tpl.tags : [];
  lines.push(`tags: [${tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]`);

  const skills = Array.isArray(tpl.skills) ? tpl.skills : [];
  lines.push(`skills: [${skills.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(', ')}]`);

  const promptText = (tpl.prompt || tpl.systemPrompt || tpl.assistant_prompt || '').trim();
  if (promptText) {
    if (promptText.includes('\n')) {
      lines.push('prompt: |');
      for (const pLine of promptText.split('\n')) {
        lines.push(`  ${pLine}`);
      }
    } else {
      lines.push(`prompt: "${promptText.replace(/"/g, '\\"')}"`);
    }
  }

  lines.push('---');

  const rawContent = (tpl.content || '').trim();
  return lines.join('\n') + (rawContent ? `\n\n${rawContent}\n` : '\n');
}

/**
 * Faz o parse de um arquivo Markdown com Frontmatter para ProjectTemplate
 */
export function parseTemplateFromMarkdown(
  fileContent: string,
  fallbackFileName?: string
): ProjectTemplate {
  const fallbackId = fallbackFileName
    ? fallbackFileName.replace(/\.(md|markdown)$/i, '')
    : `tpl-${Date.now()}`;

  if (!fileContent || typeof fileContent !== 'string') {
    return {
      id: fallbackId,
      templateName: fallbackId,
      title: fallbackId,
      ext: 'md',
      category: 'geral',
      tags: [],
      skills: [],
      updated_at: new Date().toISOString(),
      content: '',
      prompt: '',
      systemPrompt: '',
      assistant_prompt: '',
      source: 'local',
      description: '',
      badge: 'Local',
    };
  }

  const match = fileContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  let body = fileContent;
  const meta: Record<string, any> = {};

  if (match) {
    body = fileContent.slice(match[0].length);
    const rawFm = match[1];
    const lines = rawFm.split('\n');

    let currentMultilineKey: string | null = null;
    let multilineBuffer: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Bloco multilinhas em andamento (ex: prompt: |)
      if (currentMultilineKey) {
        if (/^\s{2,}/.test(line) || line.trim() === '') {
          // Remove a indentação de 2 espaços
          multilineBuffer.push(line.replace(/^\s{2}/, ''));
          continue;
        } else {
          // Fim do bloco multilinhas
          meta[currentMultilineKey] = multilineBuffer.join('\n').trim();
          currentMultilineKey = null;
          multilineBuffer = [];
        }
      }

      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (val === '|') {
        currentMultilineKey = key;
        multilineBuffer = [];
        continue;
      }

      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        meta[key] = inner
          ? inner
              .split(',')
              .map((item) => item.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean)
          : [];
        continue;
      }

      let cleanVal = val;
      if (
        (cleanVal.startsWith('"') && cleanVal.endsWith('"')) ||
        (cleanVal.startsWith("'") && cleanVal.endsWith("'"))
      ) {
        cleanVal = cleanVal.slice(1, -1);
      }
      meta[key] = cleanVal;
    }

    if (currentMultilineKey) {
      meta[currentMultilineKey] = multilineBuffer.join('\n').trim();
    }
  }

  const id = meta.id || fallbackId;
  const templateName = meta.templateName || fallbackFileName?.replace(/\.(md|markdown)$/i, '') || id;
  const title = meta.title || templateName || id;
  const prompt = meta.prompt || meta.systemPrompt || meta.assistant_prompt || '';

  return {
    id,
    templateName,
    title,
    ext: 'md',
    category: meta.category || 'geral',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    skills: Array.isArray(meta.skills) ? meta.skills : [],
    updated_at: meta.updated_at || new Date().toISOString(),
    content: body.trim(),
    prompt,
    systemPrompt: prompt,
    assistant_prompt: prompt,
    source: meta.source || 'local',
    description: meta.description || '',
    badge: meta.badge || 'Local',
  };
}

/**
 * Lê todos os arquivos .md da pasta templates/ de um repositório
 */
export function loadMarkdownTemplatesFromDir(templatesDir: string): ProjectTemplate[] {
  if (!fs.existsSync(templatesDir)) return [];

  const results: ProjectTemplate[] = [];
  try {
    const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        const fullPath = path.join(templatesDir, entry.name);
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const tpl = parseTemplateFromMarkdown(raw, entry.name);
          results.push(tpl);
        } catch (readErr) {
          console.warn(`[template-markdown] Falha ao ler ${fullPath}:`, readErr);
        }
      }
    }
  } catch (err) {
    console.error(`[template-markdown] Erro ao listar diretório ${templatesDir}:`, err);
  }

  return results;
}

/**
 * Grava um ProjectTemplate como arquivo .md na pasta templates/
 */
export function writeMarkdownTemplateFile(
  templatesDir: string,
  tpl: ProjectTemplate
): { filePath: string; relativePath: string } {
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  const baseSlug = sanitizeTemplateSlug(tpl.templateName || tpl.id || tpl.title);
  const fileName = `${baseSlug}.md`;
  const fullPath = path.join(templatesDir, fileName);

  const markdown = serializeTemplateToMarkdown(tpl);
  fs.writeFileSync(fullPath, markdown, 'utf-8');

  return {
    filePath: fullPath,
    relativePath: path.join('templates', fileName),
  };
}

/**
 * Remove o arquivo .md de um template pelo id ou slug
 */
export function deleteMarkdownTemplateFile(templatesDir: string, idOrSlug: string): boolean {
  if (!fs.existsSync(templatesDir)) return false;

  const targetSlug = sanitizeTemplateSlug(idOrSlug);
  let removed = false;

  try {
    const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        const fullPath = path.join(templatesDir, entry.name);
        const fileSlug = entry.name.replace(/\.(md|markdown)$/i, '');

        if (fileSlug === targetSlug) {
          fs.unlinkSync(fullPath);
          removed = true;
          continue;
        }

        // Também confere se o ID interno do arquivo bate
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = parseTemplateFromMarkdown(raw, entry.name);
          if (parsed.id === idOrSlug || parsed.id === targetSlug) {
            fs.unlinkSync(fullPath);
            removed = true;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error(`[template-markdown] Erro ao deletar template em ${templatesDir}:`, err);
  }

  return removed;
}
