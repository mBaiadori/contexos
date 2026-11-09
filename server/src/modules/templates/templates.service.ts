import {
  loadCommunityTemplates,
  saveCommunityTemplates,
  loadProjectTemplates,
  saveProjectTemplates,
  resolveRepoDir,
  type ProjectTemplate,
} from '../../config/constants.js';
import { loadConfig } from '../../config/storage.js';
import { docsMetadataService } from '../workspace/docs-metadata.service.js';
import { deleteDotTemplate } from '../../utils/template-markdown.js';

function getActiveRepo(): string {
  const cfg = loadConfig();
  return cfg.active_repo?.name || 'local';
}

function generateTemplateSlug(titleOrName: string): string {
  return titleOrName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class TemplatesService {
  // ─── Community (global) templates ───────────────────────────────────────────

  getCommunityTemplates(): ProjectTemplate[] {
    return loadCommunityTemplates();
  }

  getCommunityTemplate(id: string): ProjectTemplate | null {
    const list = this.getCommunityTemplates();
    return list.find((t) => t.id === id) || null;
  }

  // ─── Project templates ───────────────────────────────────────────────────────

  getProjectTemplates(repoName?: string): ProjectTemplate[] {
    const repo = repoName || getActiveRepo();
    return loadProjectTemplates(repo);
  }

  getProjectTemplate(id: string, repoName?: string): ProjectTemplate | null {
    const repo = repoName || getActiveRepo();
    const list = this.getProjectTemplates(repo);
    return list.find((t) => t.id === id) || null;
  }

  /**
   * Get a template by ID — searches project first, then community.
   * Returns the template content + prompt for use when creating docs.
   */
  resolveTemplate(id: string, repoName?: string): ProjectTemplate | null {
    if (!id) return null;
    const repo = repoName || getActiveRepo();
    return this.getProjectTemplate(id, repo) || this.getCommunityTemplate(id);
  }

  /**
   * Create a new template in the project .templates.json.
   */
  createProjectTemplate(
    repoName: string,
    data: {
      id?: string;
      templateName?: string;
      title: string;
      ext?: string;
      category?: string;
      tags?: string[];
      content?: string;
      prompt?: string;
      systemPrompt?: string;
      description?: string;
      badge?: string;
      source?: string;
      skills?: string[];
    }
  ): { success: boolean; template: ProjectTemplate } {
    const repo = repoName || getActiveRepo();
    const existing = loadProjectTemplates(repo);

    const baseName = data.templateName || data.title;
    const id = (data.id || generateTemplateSlug(baseName) || `tpl-${Date.now()}`)
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');

    if (!id) throw new Error('ID do template é obrigatório.');

    if (existing.some((t) => t.id === id)) {
      throw new Error(`Template '${id}' já existe no projeto.`);
    }

    const now = new Date().toISOString();
    const promptText = data.prompt !== undefined ? data.prompt : (data.systemPrompt || '');
    const newTemplate: ProjectTemplate = {
      id,
      templateName: data.templateName || data.title,
      title: data.title,
      ext: 'md',
      category: data.category || 'geral',
      tags: Array.isArray(data.tags) ? data.tags : [],
      updated_at: now,
      content: data.content || `# ${data.title}\n\n`,
      prompt: promptText,
      source: data.source || 'local',
      description: data.description || '',
      badge: data.badge || 'Local',
      skills: Array.isArray(data.skills) ? data.skills : [],
      systemPrompt: promptText,
      assistant_prompt: promptText,
    };

    existing.push(newTemplate);
    saveProjectTemplates(repo, existing);

    return { success: true, template: newTemplate };
  }

  /**
   * Update an existing project template in .templates.json.
   */
  updateProjectTemplate(
    repoName: string,
    id: string,
    partial: Partial<ProjectTemplate>
  ): { success: boolean; template: ProjectTemplate } {
    const repo = repoName || getActiveRepo();
    const existing = loadProjectTemplates(repo);
    const idx = existing.findIndex((t) => t.id === id);

    if (idx === -1) {
      throw new Error(`Template '${id}' não encontrado no projeto.`);
    }

    const current = existing[idx];
    const now = new Date().toISOString();
    const promptText = partial.prompt !== undefined
      ? partial.prompt
      : (partial.systemPrompt !== undefined ? partial.systemPrompt : current.prompt);

    const updated: ProjectTemplate = {
      ...current,
      ...partial,
      id: current.id, // ID remains invariant
      ext: 'md',
      updated_at: now,
      prompt: promptText,
      systemPrompt: promptText,
      assistant_prompt: promptText,
    };

    existing[idx] = updated;
    saveProjectTemplates(repo, existing);

    return { success: true, template: updated };
  }

  /**
   * Delete a project template from .templates.json.
   */
  deleteProjectTemplate(id: string, repoName?: string): { success: boolean; message: string } {
    const targetRepo = repoName || getActiveRepo();
    const targetSlug = id.toLowerCase().trim().replace(/\.md$/, '');

    let removed = false;

    // 1. Check in the target repo first
    const existing = loadProjectTemplates(targetRepo);
    const filtered = existing.filter((t) => {
      const tId = (t.id || '').toLowerCase().trim().replace(/\.md$/, '');
      const tName = (t.templateName || '').toLowerCase().trim().replace(/\.md$/, '');
      const tTitleSlug = generateTemplateSlug(t.title || '');
      return tId !== targetSlug && tName !== targetSlug && tTitleSlug !== targetSlug;
    });

    if (filtered.length < existing.length) {
      saveProjectTemplates(targetRepo, filtered);
      const repoDir = resolveRepoDir(targetRepo);
      deleteDotTemplate(repoDir, id);
      removed = true;
    }

    // 2. Fallback: check other repositories in projects directory
    const otherRepos = ['condominiums', 'default', 'project-boilerplate', 'local'];
    for (const otherRepo of otherRepos) {
      if (otherRepo === targetRepo) continue;
      const otherList = loadProjectTemplates(otherRepo);
      const otherFiltered = otherList.filter((t) => {
        const tId = (t.id || '').toLowerCase().trim().replace(/\.md$/, '');
        const tName = (t.templateName || '').toLowerCase().trim().replace(/\.md$/, '');
        const tTitleSlug = generateTemplateSlug(t.title || '');
        return tId !== targetSlug && tName !== targetSlug && tTitleSlug !== targetSlug;
      });
      if (otherFiltered.length < otherList.length) {
        saveProjectTemplates(otherRepo, otherFiltered);
        removed = true;
      }
    }

    // 3. Desvincular templateId dos documentos associados com total segurança (mantendo os arquivos markdown 100% intactos)
    try {
      docsMetadataService.detachTemplateFromDocs(targetRepo, id);
    } catch (err) {
      console.warn('[deleteProjectTemplate] Aviso ao desvincular template dos documentos:', err);
    }

    return {
      success: true,
      message: removed
        ? `Template '${id}' removido do projeto com sucesso.`
        : `Template '${id}' já não constava no projeto.`,
    };
  }

  /**
   * Delete a community template from global .templates.json.
   */
  deleteCommunityTemplate(id: string): { success: boolean; message: string } {
    const targetSlug = id.toLowerCase().trim().replace(/\.md$/, '');
    const communityList = this.getCommunityTemplates();
    const filtered = communityList.filter((t) => {
      const tId = (t.id || '').toLowerCase().trim().replace(/\.md$/, '');
      const tName = (t.templateName || '').toLowerCase().trim().replace(/\.md$/, '');
      const tTitleSlug = generateTemplateSlug(t.title || '');
      return tId !== targetSlug && tName !== targetSlug && tTitleSlug !== targetSlug;
    });

    if (filtered.length < communityList.length) {
      saveCommunityTemplates(filtered);
      return { success: true, message: `Template '${id}' removido da comunidade com sucesso.` };
    }
    return { success: true, message: `Template '${id}' não encontrado na comunidade.` };
  }

  /**
   * Import a community template into the active project's .templates.json.
   */
  importFromCommunity(
    id: string,
    repoName?: string
  ): { success: boolean; message: string; template: ProjectTemplate } {
    const repo = repoName || getActiveRepo();
    const communityList = this.getCommunityTemplates();
    const target = communityList.find((t) => t.id === id);

    if (!target) {
      throw new Error(`Template '${id}' não encontrado na comunidade.`);
    }

    const existing = loadProjectTemplates(repo);
    const alreadyIdx = existing.findIndex((t) => t.id === id);

    const now = new Date().toISOString();
    const importedTemplate: ProjectTemplate = {
      ...target,
      source: 'community',
      badge: 'Comunidade',
      updated_at: now,
    };

    if (alreadyIdx >= 0) {
      existing[alreadyIdx] = importedTemplate;
    } else {
      existing.push(importedTemplate);
    }

    saveProjectTemplates(repo, existing);

    return {
      success: true,
      message: `Template '${id}' importado da comunidade com sucesso.`,
      template: importedTemplate,
    };
  }

  /**
   * Sync / normalize templates metadata.
   */
  syncProjectTemplatesMetadata(repoName?: string): { success: boolean; count: number } {
    const repo = repoName || getActiveRepo();
    const templates = loadProjectTemplates(repo);
    saveProjectTemplates(repo, templates);
    return { success: true, count: templates.length };
  }

  getTemplates(repoName?: string): ProjectTemplate[] {
    const repo = repoName || getActiveRepo();
    const project = loadProjectTemplates(repo);
    const community = loadCommunityTemplates();
    return [...project, ...community];
  }
}

export const templatesService = new TemplatesService();
