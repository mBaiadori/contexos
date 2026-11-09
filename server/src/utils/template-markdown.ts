import fs from 'node:fs';
import path from 'node:path';
import type { ProjectTemplate } from '../config/constants.js';

/**
 * Cache em memória para leitura ultrarrápida (0-2ms) dos templates por repositório
 */
const templatesMemoryCache = new Map<
  string,
  { timestamp: number; mtimeMs: number; data: ProjectTemplate[] }
>();

/**
 * Normaliza um slug seguro para pastas de template
 */
export function sanitizeTemplateSlug(nameOrTitle: string): string {
  return (
    (nameOrTitle || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'template'
  );
}

/**
 * Serializa os metadados leves de um template no cabeçalho Frontmatter do template.md
 * (o prompt é mantido fora, no arquivo dedicado prompt.md)
 */
export function serializeTemplateHeader(tpl: ProjectTemplate): string {
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

  lines.push('---');

  const rawContent = (tpl.content || '').trim();
  return lines.join('\n') + (rawContent ? `\n\n${rawContent}\n` : '\n');
}

/**
 * Faz o parse do template.md extraindo os marcadores Frontmatter e o corpo
 */
export function parseTemplateHeader(
  fileContent: string,
  fallbackSlug: string
): { meta: Partial<ProjectTemplate>; content: string } {
  if (!fileContent || typeof fileContent !== 'string') {
    return {
      meta: {
        id: fallbackSlug,
        templateName: fallbackSlug,
        title: fallbackSlug,
        category: 'geral',
        tags: [],
        skills: [],
        badge: 'Local',
        source: 'local',
        updated_at: new Date().toISOString(),
      },
      content: '',
    };
  }

  const match = fileContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let body = fileContent;
  const meta: Record<string, any> = {};

  if (match) {
    body = fileContent.slice(match[0].length);
    const rawFm = match[1];
    const lines = rawFm.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

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
  }

  const id = meta.id || fallbackSlug;
  const templateName = meta.templateName || fallbackSlug;
  const title = meta.title || templateName || id;

  return {
    meta: {
      id,
      templateName,
      title,
      ext: 'md',
      category: meta.category || 'geral',
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      skills: Array.isArray(meta.skills) ? meta.skills : [],
      updated_at: meta.updated_at || new Date().toISOString(),
      source: meta.source || 'local',
      description: meta.description || '',
      badge: meta.badge || 'Local',
    },
    content: body.trim(),
  };
}

/**
 * Resolve o caminho do diretório oficial de templates de um repositório (.templates/)
 */
export function getRepoDotTemplatesDir(repoDir: string): string {
  const dotTemplates = path.join(repoDir, '.templates');
  return dotTemplates;
}

/**
 * Lê todos os templates modulares de .templates/ com suporte a cache em memória e reconciliação
 */
export function loadDotTemplates(repoDir: string): ProjectTemplate[] {
  const dotTemplatesDir = getRepoDotTemplatesDir(repoDir);
  if (!fs.existsSync(dotTemplatesDir)) {
    return [];
  }

  let dirMtime = 0;
  try {
    dirMtime = fs.statSync(dotTemplatesDir).mtimeMs;
  } catch {}

  const cached = templatesMemoryCache.get(repoDir);
  if (cached && cached.mtimeMs === dirMtime && Date.now() - cached.timestamp < 10000) {
    return cached.data;
  }

  const results: ProjectTemplate[] = [];

  try {
    const entries = fs.readdirSync(dotTemplatesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const folderPath = path.join(dotTemplatesDir, entry.name);
      const templateMdPath = path.join(folderPath, 'template.md');
      const promptMdPath = path.join(folderPath, 'prompt.md');

      let rawTemplate = '';
      if (fs.existsSync(templateMdPath)) {
        try {
          rawTemplate = fs.readFileSync(templateMdPath, 'utf-8');
        } catch {}
      }

      let prompt = '';
      if (fs.existsSync(promptMdPath)) {
        try {
          prompt = fs.readFileSync(promptMdPath, 'utf-8').trim();
        } catch {}
      }

      const { meta, content } = parseTemplateHeader(rawTemplate, entry.name);

      results.push({
        id: meta.id || entry.name,
        templateName: meta.templateName || entry.name,
        title: meta.title || entry.name,
        ext: 'md',
        category: meta.category || 'geral',
        tags: meta.tags || [],
        skills: meta.skills || [],
        updated_at: meta.updated_at || new Date().toISOString(),
        content: content || '',
        prompt: prompt || '',
        systemPrompt: prompt || '',
        assistant_prompt: prompt || '',
        source: meta.source || 'local',
        description: meta.description || '',
        badge: meta.badge || 'Local',
      });
    }
  } catch (err) {
    console.error(`[template-markdown] Erro ao ler templates de ${dotTemplatesDir}:`, err);
  }

  // Atualiza cache em memória
  templatesMemoryCache.set(repoDir, {
    timestamp: Date.now(),
    mtimeMs: dirMtime,
    data: results,
  });

  return results;
}

/**
 * Grava um template no formato modular em .templates/<slug>/
 *   ├── template.md  (Frontmatter leve com id, title, tags, skills + corpo markdown)
 *   └── prompt.md    (Instruções isoladas da IA em texto puro markdown)
 */
export function writeDotTemplate(
  repoDir: string,
  tpl: ProjectTemplate
): { folderPath: string; relativePath: string } {
  const dotTemplatesDir = getRepoDotTemplatesDir(repoDir);
  if (!fs.existsSync(dotTemplatesDir)) {
    fs.mkdirSync(dotTemplatesDir, { recursive: true });
  }

  const baseSlug = sanitizeTemplateSlug(tpl.templateName || tpl.id || tpl.title);
  const folderPath = path.join(dotTemplatesDir, baseSlug);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // 1. Grava template.md com marcadores YAML no topo e esqueleto do template no corpo
  const templateMdPath = path.join(folderPath, 'template.md');
  const serialized = serializeTemplateHeader(tpl);
  fs.writeFileSync(templateMdPath, serialized, 'utf-8');

  // 2. Grava prompt.md com o prompt puro da IA (sem YAML)
  const promptMdPath = path.join(folderPath, 'prompt.md');
  const cleanPrompt = (tpl.prompt || tpl.systemPrompt || tpl.assistant_prompt || '').trim();
  fs.writeFileSync(promptMdPath, cleanPrompt ? `${cleanPrompt}\n` : '', 'utf-8');

  // Invalida cache do repositório
  templatesMemoryCache.delete(repoDir);

  return {
    folderPath,
    relativePath: path.join('.templates', baseSlug),
  };
}

/**
 * Remove um template em .templates/<slug>/
 */
export function deleteDotTemplate(repoDir: string, idOrSlug: string): boolean {
  const dotTemplatesDir = getRepoDotTemplatesDir(repoDir);
  if (!fs.existsSync(dotTemplatesDir)) return false;

  const targetSlug = sanitizeTemplateSlug(idOrSlug);
  let removed = false;

  try {
    const entries = fs.readdirSync(dotTemplatesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const folderPath = path.join(dotTemplatesDir, entry.name);
      let match = entry.name === targetSlug;

      if (!match) {
        const templateMdPath = path.join(folderPath, 'template.md');
        if (fs.existsSync(templateMdPath)) {
          try {
            const raw = fs.readFileSync(templateMdPath, 'utf-8');
            const { meta } = parseTemplateHeader(raw, entry.name);
            if (meta.id === idOrSlug || meta.id === targetSlug) {
              match = true;
            }
          } catch {}
        }
      }

      if (match) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        removed = true;
      }
    }
  } catch (err) {
    console.error(`[template-markdown] Erro ao deletar template em ${dotTemplatesDir}:`, err);
  }

  if (removed) {
    templatesMemoryCache.delete(repoDir);
  }

  return removed;
}

/**
 * Invalida manualmente o cache de templates de um repositório
 */
export function invalidateTemplatesCache(repoDir?: string): void {
  if (repoDir) {
    templatesMemoryCache.delete(repoDir);
  } else {
    templatesMemoryCache.clear();
  }
}
