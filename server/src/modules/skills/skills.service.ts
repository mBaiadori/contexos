import fs from 'node:fs';
import path from 'node:path';
import { BASE_DIR, PROJECTS_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig, recordChange } from '../../config/storage.js';
import { SkillDefinition, ProjectSkillsManifest, SkillMetadata } from './skills.types.js';
import { ECC_SEED_SKILLS } from './seeds/seeds.data.js';

function getSafeRepo(repoName?: string): string {
  if (repoName) return repoName.replace(/[^a-zA-Z0-9_-]/g, '') || 'local';
  const cfg = loadConfig();
  return (cfg.active_repo?.name || 'local').replace(/[^a-zA-Z0-9_-]/g, '');
}

export class SkillsService {
  private getRepoDir(repoName: string): string {
    const cfg = loadConfig();
    const safeName = getSafeRepo(repoName);
    const effectiveOwner = cfg.active_repo?.name === safeName ? cfg.active_repo?.owner : undefined;
    return resolveRepoDir(safeName, effectiveOwner);
  }

  private getSkillsDir(repoName: string): string {
    return path.join(this.getRepoDir(repoName), '.skills');
  }

  private getManifestPath(repoName: string): string {
    return path.join(this.getSkillsDir(repoName), '.skills.manifest.json');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Hub Global de Skills (Catálogo ECC + Sementes)
  // ──────────────────────────────────────────────────────────────────────────

  getHubSkills(): SkillDefinition[] {
    const hubMap = new Map<string, SkillDefinition>();

    // 1. Sementes oficiais pré-compiladas
    for (const seed of ECC_SEED_SKILLS) {
      hubMap.set(seed.id, seed);
    }

    // 2. Carrega todas as skills da pasta ECC-main/skills
    const candidateDirs = [
      path.join(BASE_DIR, 'ECC-main', 'skills'),
      path.resolve(process.cwd(), 'ECC-main', 'skills'),
      path.resolve(process.cwd(), '..', 'ECC-main', 'skills'),
      path.resolve(PROJECTS_DIR, '..', 'ECC-main', 'skills'),
    ];
    const eccMainSkillsDir = candidateDirs.find((p) => fs.existsSync(p));

    if (eccMainSkillsDir) {
      try {
        const skillFolders = fs.readdirSync(eccMainSkillsDir, { withFileTypes: true });
        for (const folder of skillFolders) {
          if (!folder.isDirectory()) continue;

          const skillMdPath = path.join(eccMainSkillsDir, folder.name, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            try {
              const rawContent = fs.readFileSync(skillMdPath, 'utf-8');
              const parsed = this.parseSkillMarkdown(rawContent, folder.name);
              // Mantém as sementes se já existirem ou atualiza com a versão completa do ECC-main
              if (!hubMap.has(parsed.id) || hubMap.get(parsed.id)?.source === 'community') {
                hubMap.set(parsed.id, parsed);
              }
            } catch (skillErr) {
              console.warn(`[SkillsService] Falha ao processar skill '${folder.name}':`, skillErr);
            }
          }
        }
      } catch (err) {
        console.warn('[SkillsService] Aviso ao ler ECC-main/skills:', err);
      }
    }

    return Array.from(hubMap.values());
  }

  getHubSkill(id: string): SkillDefinition | null {
    const all = this.getHubSkills();
    return all.find((s) => s.id === id) || null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Skills Instaladas no Projeto
  // ──────────────────────────────────────────────────────────────────────────

  getProjectManifest(repoName: string): ProjectSkillsManifest {
    const manifestPath = this.getManifestPath(repoName);
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch {}
    }

    return {
      version: '1.0.0',
      project_repo: getSafeRepo(repoName),
      installed_skills: [],
    };
  }

  saveProjectManifest(repoName: string, manifest: ProjectSkillsManifest) {
    const manifestPath = this.getManifestPath(repoName);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  getProjectSkills(repoName: string): SkillDefinition[] {
    const safeRepo = getSafeRepo(repoName);
    const skillsDir = this.getSkillsDir(safeRepo);
    const manifest = this.getProjectManifest(safeRepo);
    const result: SkillDefinition[] = [];

    if (!fs.existsSync(skillsDir)) return result;

    for (const item of manifest.installed_skills) {
      const skillMdPath = path.join(skillsDir, item.id, 'SKILL.md');
      if (fs.existsSync(skillMdPath)) {
        try {
          const raw = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = this.parseSkillMarkdown(raw, item.id);
          parsed.installed_at = item.installed_at;
          parsed.updated_at = item.updated_at;
          parsed.is_customized = item.is_customized || false;
          parsed.source = 'project';
          result.push(parsed);
        } catch {}
      }
    }

    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Instalação, Desinstalação e Customização (Fork)
  // ──────────────────────────────────────────────────────────────────────────

  installSkill(repoName: string, skillId: string): { success: boolean; skill: SkillDefinition } {
    const safeRepo = getSafeRepo(repoName);
    const targetSkill = this.getHubSkill(skillId);

    if (!targetSkill) {
      throw new Error(`Skill '${skillId}' não encontrada no catálogo global.`);
    }

    const skillsDir = this.getSkillsDir(safeRepo);
    const targetDir = path.join(skillsDir, skillId);
    fs.mkdirSync(targetDir, { recursive: true });

    const skillMdPath = path.join(targetDir, 'SKILL.md');
    const fileContent = this.formatSkillMarkdown(targetSkill);
    fs.writeFileSync(skillMdPath, fileContent, 'utf-8');

    // Atualiza manifesto
    const manifest = this.getProjectManifest(safeRepo);
    const existingIdx = manifest.installed_skills.findIndex((s) => s.id === skillId);
    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      manifest.installed_skills[existingIdx] = {
        id: skillId,
        version: targetSkill.version,
        source: targetSkill.sourceUrl || targetSkill.source,
        installed_at: manifest.installed_skills[existingIdx].installed_at || now,
        updated_at: now,
        is_customized: false,
      };
    } else {
      manifest.installed_skills.push({
        id: skillId,
        version: targetSkill.version,
        source: targetSkill.sourceUrl || targetSkill.source,
        installed_at: now,
        updated_at: now,
        is_customized: false,
      });
    }

    this.saveProjectManifest(safeRepo, manifest);
    recordChange(safeRepo, `.skills/${skillId}/SKILL.md`, 'ADDED', '', fileContent);

    return {
      success: true,
      skill: {
        ...targetSkill,
        installed_at: now,
        updated_at: now,
        is_customized: false,
      },
    };
  }

  uninstallSkill(repoName: string, skillId: string): { success: boolean; message: string } {
    const safeRepo = getSafeRepo(repoName);
    const skillDir = path.join(this.getSkillsDir(safeRepo), skillId);

    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    const manifest = this.getProjectManifest(safeRepo);
    manifest.installed_skills = manifest.installed_skills.filter((s) => s.id !== skillId);
    this.saveProjectManifest(safeRepo, manifest);

    recordChange(safeRepo, `.skills/${skillId}`, 'DELETED', '', '');

    return {
      success: true,
      message: `Skill '${skillId}' desinstalada com sucesso do projeto '${safeRepo}'.`,
    };
  }

  customizeSkill(
    repoName: string,
    skillId: string,
    data: { content?: string; title?: string; description?: string; tools?: string[]; tags?: string[] }
  ): { success: boolean; skill: SkillDefinition } {
    const safeRepo = getSafeRepo(repoName);
    const skillDir = path.join(this.getSkillsDir(safeRepo), skillId);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.existsSync(skillMdPath)) {
      throw new Error(`Skill '${skillId}' não está instalada no projeto. Instale-a antes de customizar.`);
    }

    const current = this.parseSkillMarkdown(fs.readFileSync(skillMdPath, 'utf-8'), skillId);
    const updated: SkillDefinition = {
      ...current,
      title: data.title || current.title,
      description: data.description || current.description,
      tools: data.tools || current.tools,
      tags: data.tags || current.tags,
      content: data.content !== undefined ? data.content : current.content,
      is_customized: true,
      updated_at: new Date().toISOString(),
    };

    const newContent = this.formatSkillMarkdown(updated);
    fs.writeFileSync(skillMdPath, newContent, 'utf-8');

    const manifest = this.getProjectManifest(safeRepo);
    const item = manifest.installed_skills.find((s) => s.id === skillId);
    if (item) {
      item.is_customized = true;
      item.updated_at = updated.updated_at || new Date().toISOString();
      this.saveProjectManifest(safeRepo, manifest);
    }

    return { success: true, skill: updated };
  }

  /**
   * Resolve a skill ativa: Busca no projeto instalado; se não encontrar, tenta no Hub ECC.
   */
  resolveSkill(skillId: string, repoName?: string): SkillDefinition | null {
    if (!skillId) return null;
    const safeRepo = getSafeRepo(repoName);
    const projectSkills = this.getProjectSkills(safeRepo);
    const foundLocal = projectSkills.find((s) => s.id === skillId);
    if (foundLocal) return foundLocal;

    return this.getHubSkill(skillId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Utilitários de Markdown e Frontmatter
  // ──────────────────────────────────────────────────────────────────────────

  private parseSkillMarkdown(fileContent: string, defaultId: string): SkillDefinition {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = fileContent.match(frontmatterRegex);

    const metadata: Record<string, any> = {};
    let content = fileContent;

    if (match) {
      const yamlBlock = match[1];
      content = match[2];

      const lines = yamlBlock.split('\n');
      let currentKey: string | null = null;

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Check if list item of current key
        if (rawLine.startsWith('  - ') || rawLine.startsWith('- ')) {
          const itemVal = trimmed.replace(/^-\s*/, '').replace(/^["']|["']$/g, '');
          if (currentKey) {
            if (!Array.isArray(metadata[currentKey])) {
              metadata[currentKey] = [];
            }
            metadata[currentKey].push(itemVal);
          }
          continue;
        }

        // Check if continuation of multi-line string
        if ((rawLine.startsWith('  ') || rawLine.startsWith('\t')) && currentKey && typeof metadata[currentKey] === 'string') {
          metadata[currentKey] += ' ' + trimmed.replace(/^["']|["']$/g, '');
          continue;
        }

        const colonIdx = rawLine.indexOf(':');
        if (colonIdx > 0) {
          const key = rawLine.slice(0, colonIdx).trim();
          const val = rawLine.slice(colonIdx + 1).trim();
          currentKey = key;

          if (val === '' || val === '|' || val === '>') {
            metadata[key] = '';
          } else if (val.startsWith('[') && val.endsWith(']')) {
            try {
              metadata[key] = JSON.parse(val.replace(/'/g, '"'));
            } catch {
              metadata[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            }
          } else {
            metadata[key] = val.replace(/^["']|["']$/g, '');
          }
        }
      }
    }

    const name = metadata.name || defaultId;
    const title = metadata.title || name
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    let category = metadata.category;
    if (!category) {
      const lower = (name + ' ' + (metadata.description || '')).toLowerCase();
      if (lower.includes('governance') || lower.includes('spec') || lower.includes('compliance') || lower.includes('audit') || lower.includes('guard')) {
        category = 'governance';
      } else if (lower.includes('architect') || lower.includes('pattern') || lower.includes('design') || lower.includes('system') || lower.includes('ddd')) {
        category = 'architecture';
      } else if (lower.includes('test') || lower.includes('quality') || lower.includes('review') || lower.includes('benchmark') || lower.includes('eval')) {
        category = 'quality';
      } else if (lower.includes('memory') || lower.includes('graph') || lower.includes('recall') || lower.includes('context')) {
        category = 'memory';
      } else {
        category = 'engineering';
      }
    }

    // Parse tools if string or array
    let tools: string[] = [];
    if (Array.isArray(metadata.tools)) {
      tools = metadata.tools;
    } else if (typeof metadata.tools === 'string' && metadata.tools.trim()) {
      tools = metadata.tools.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }

    let tags: string[] = [];
    if (Array.isArray(metadata.tags)) {
      tags = metadata.tags;
    } else if (typeof metadata.tags === 'string' && metadata.tags.trim()) {
      tags = metadata.tags.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }

    return {
      id: metadata.id || defaultId,
      name,
      title,
      description: metadata.description || 'Instruções de engenharia e governança para agentes de contexto.',
      category: category as SkillMetadata['category'],
      version: metadata.version || '1.0.0',
      source: (metadata.source as SkillMetadata['source']) || 'community',
      sourceUrl: metadata.sourceUrl || 'https://github.com/affaan-m/everything-claude-code',
      license: metadata.license || 'MIT',
      author: metadata.author || 'Comunidade (ECC • Licença MIT)',
      tools,
      suggested_templates: Array.isArray(metadata.suggested_templates) ? metadata.suggested_templates : [],
      tags,
      icon: metadata.icon || 'Sparkles',
      content: content.trim(),
    };
  }

  private formatSkillMarkdown(skill: SkillDefinition): string {
    const toolsJson = JSON.stringify(skill.tools || []);
    const templatesJson = JSON.stringify(skill.suggested_templates || []);
    const tagsJson = JSON.stringify(skill.tags || []);

    return `---
id: "${skill.id}"
name: "${skill.name}"
title: "${skill.title || skill.name}"
description: "${skill.description.replace(/"/g, '\\"')}"
category: "${skill.category}"
version: "${skill.version}"
source: "${skill.source}"
sourceUrl: "${skill.sourceUrl || ''}"
author: "${skill.author || ''}"
license: "${skill.license || ''}"
tools: ${toolsJson}
suggested_templates: ${templatesJson}
tags: ${tagsJson}
icon: "${skill.icon || 'Sparkles'}"
---

${skill.content}
`;
  }
}

export const skillsService = new SkillsService();
