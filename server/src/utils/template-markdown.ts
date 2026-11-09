import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTemplate } from '../config/constants.js';

/**
 * Normaliza um slug seguro para arquivos e pastas de template
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
 * Lê todos os templates da pasta templates/ de um repositório.
 * Suporta o formato modular por pasta:
 * templates/<slug>/
 *   ├── template.md  (conteúdo / esqueleto do documento)
 *   ├── prompt.md    (instruções do assistente IA)
 *   └── metadata.json (id, title, category, tags, skills, etc.)
 *
 * Também suporta retrocompatibilidade com arquivos .md individuais com Frontmatter.
 */
export function loadMarkdownTemplatesFromDir(templatesDir: string): ProjectTemplate[] {
  if (!fs.existsSync(templatesDir)) return [];

  const results: ProjectTemplate[] = [];

  try {
    const entries = fs.readdirSync(templatesDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(templatesDir, entry.name);

      // 1. Formato Modular: Pasta por template
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const folderSlug = entry.name;
        const metaFile = path.join(fullPath, 'metadata.json');
        const templateMdFile = path.join(fullPath, 'template.md');
        const promptMdFile = path.join(fullPath, 'prompt.md');

        let meta: Record<string, any> = {};
        if (fs.existsSync(metaFile)) {
          try {
            meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
          } catch {}
        }

        let content = '';
        if (fs.existsSync(templateMdFile)) {
          try {
            content = fs.readFileSync(templateMdFile, 'utf-8');
          } catch {}
        }

        let prompt = '';
        if (fs.existsSync(promptMdFile)) {
          try {
            prompt = fs.readFileSync(promptMdFile, 'utf-8');
          } catch {}
        }

        const id = meta.id || folderSlug;
        const templateName = meta.templateName || folderSlug;
        const title = meta.title || templateName;

        results.push({
          id,
          templateName,
          title,
          ext: 'md',
          category: meta.category || 'geral',
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          skills: Array.isArray(meta.skills) ? meta.skills : [],
          updated_at: meta.updated_at || new Date().toISOString(),
          content: content.trim(),
          prompt: prompt.trim(),
          systemPrompt: prompt.trim(),
          assistant_prompt: prompt.trim(),
          source: meta.source || 'local',
          description: meta.description || '',
          badge: meta.badge || 'Local',
        });
        continue;
      }

      // 2. Fallback: Arquivos .md soltos na raiz de templates/
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
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
 * Grava um ProjectTemplate no formato modular de pasta em templates/<slug>/
 *   ├── template.md
 *   ├── prompt.md
 *   └── metadata.json
 */
export function writeMarkdownTemplateFile(
  templatesDir: string,
  tpl: ProjectTemplate
): { folderPath: string; relativePath: string } {
  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true });
  }

  const baseSlug = sanitizeTemplateSlug(tpl.templateName || tpl.id || tpl.title);
  const folderPath = path.join(templatesDir, baseSlug);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // 1. Grava template.md (conteúdo limpo em Markdown)
  const templateMdPath = path.join(folderPath, 'template.md');
  const cleanContent = (tpl.content || '').trim();
  fs.writeFileSync(templateMdPath, cleanContent ? `${cleanContent}\n` : '', 'utf-8');

  // 2. Grava prompt.md (instruções puras do assistente de IA)
  const promptMdPath = path.join(folderPath, 'prompt.md');
  const cleanPrompt = (tpl.prompt || tpl.systemPrompt || tpl.assistant_prompt || '').trim();
  fs.writeFileSync(promptMdPath, cleanPrompt ? `${cleanPrompt}\n` : '', 'utf-8');

  // 3. Grava metadata.json (metadados estruturados leves)
  const metaPath = path.join(folderPath, 'metadata.json');
  const metadata = {
    id: tpl.id || baseSlug,
    templateName: tpl.templateName || baseSlug,
    title: tpl.title || baseSlug,
    category: tpl.category || 'geral',
    badge: tpl.badge || 'Local',
    tags: Array.isArray(tpl.tags) ? tpl.tags : [],
    skills: Array.isArray(tpl.skills) ? tpl.skills : [],
    description: tpl.description || '',
    source: tpl.source || 'local',
    updated_at: tpl.updated_at || new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');

  return {
    folderPath,
    relativePath: path.join('templates', baseSlug),
  };
}

/**
 * Remove o template (pasta inteira templates/<slug>/ ou arquivo legado)
 */
export function deleteMarkdownTemplateFile(templatesDir: string, idOrSlug: string): boolean {
  if (!fs.existsSync(templatesDir)) return false;

  const targetSlug = sanitizeTemplateSlug(idOrSlug);
  let removed = false;

  try {
    const entries = fs.readdirSync(templatesDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(templatesDir, entry.name);

      // Se for diretório de template
      if (entry.isDirectory()) {
        const metaPath = path.join(fullPath, 'metadata.json');
        let folderMatches = entry.name === targetSlug;

        if (!folderMatches && fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            if (meta.id === idOrSlug || meta.id === targetSlug) {
              folderMatches = true;
            }
          } catch {}
        }

        if (folderMatches) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          removed = true;
          continue;
        }
      }

      // Se for arquivo legado solto .md
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        const fileSlug = entry.name.replace(/\.(md|markdown)$/i, '');
        if (fileSlug === targetSlug) {
          fs.unlinkSync(fullPath);
          removed = true;
          continue;
        }
      }
    }
  } catch (err) {
    console.error(`[template-markdown] Erro ao deletar template em ${templatesDir}:`, err);
  }

  return removed;
}

/**
 * Funções legadas de compatibilidade para parse de Markdown com Frontmatter
 */
export function serializeTemplateToMarkdown(tpl: ProjectTemplate): string {
  const lines: string[] = ['---'];
  const id = tpl.id || `tpl-${Date.now()}`;
  lines.push(`id: "${id.replace(/"/g, '\\"')}"`);
  if (tpl.title) lines.push(`title: "${tpl.title.replace(/"/g, '\\"')}"`);
  if (tpl.templateName) lines.push(`templateName: "${tpl.templateName.replace(/"/g, '\\"')}"`);
  if (tpl.category) lines.push(`category: "${tpl.category.replace(/"/g, '\\"')}"`);
  if (tpl.badge) lines.push(`badge: "${tpl.badge.replace(/"/g, '\\"')}"`);
  if (tpl.description) lines.push(`description: "${tpl.description.replace(/"/g, '\\"')}"`);
  if (tpl.source) lines.push(`source: "${tpl.source.replace(/"/g, '\\"')}"`);
  if (tpl.updated_at) lines.push(`updated_at: "${tpl.updated_at}"`);
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
      if (currentMultilineKey) {
        if (/^\s{2,}/.test(line) || line.trim() === '') {
          multilineBuffer.push(line.replace(/^\s{2}/, ''));
          continue;
        } else {
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
          ? inner.split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
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
