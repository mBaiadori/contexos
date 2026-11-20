import { create } from 'zustand';
import { API } from '../services/api';
import type { TemplateItem } from '../types';
import { useGitStore } from './gitStore';

export interface TemplateStoreState {
  templates: TemplateItem[];
  communityTemplates: TemplateItem[];
  loading: boolean;
  importingId: string | null;
  error: string | null;

  // Active template currently being edited in TemplatesSubView
  activeEditingTemplate: Partial<TemplateItem> | null;
  isTemplateEditorMode: boolean;

  // Actions
  fetchTemplates: () => Promise<void>;
  fetchCommunityTemplates: () => Promise<void>;
  resolveTemplate: (id: string) => Promise<TemplateItem | null>;
  setActiveEditingTemplate: (tpl: Partial<TemplateItem> | null) => void;
  updateActiveEditingTemplate: (partial: Partial<TemplateItem>) => void;
  setIsTemplateEditorMode: (val: boolean) => void;
  createTemplate: (data: Partial<TemplateItem>) => Promise<{ success: boolean; message?: string; template?: TemplateItem }>;
  updateTemplate: (id: string, data: Partial<TemplateItem>) => Promise<{ success: boolean; message?: string; template?: TemplateItem }>;
  importFromCommunity: (id: string) => Promise<{ success: boolean; message: string }>;
  deleteTemplate: (id: string, isCommunity?: boolean) => Promise<{ success: boolean; message?: string }>;
  deleteCommunityTemplate: (id: string) => Promise<{ success: boolean; message?: string }>;
}

export const useTemplateStore = create<TemplateStoreState>((set, get) => ({
  templates: [],
  communityTemplates: [],
  loading: false,
  importingId: null,
  error: null,
  activeEditingTemplate: null,
  isTemplateEditorMode: false,

  fetchTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const res = await API.getProjectTemplates();
      if (res.ok && res.data?.templates) {
        set({ templates: res.data.templates });
      }
    } catch (err: any) {
      set({ error: err.message || 'Erro ao carregar templates.' });
    } finally {
      set({ loading: false });
    }
  },

  fetchCommunityTemplates: async () => {
    try {
      const res = await API.getCommunityTemplates();
      if (res.ok && res.data?.templates) {
        set({ communityTemplates: res.data.templates });
      }
    } catch {
      // ignore
    }
  },

  resolveTemplate: async (id: string) => {
    if (!id) return null;
    const existing = get().templates.find((t) => t.id === id || t.templateName === id);
    if (existing) return existing;

    try {
      const res = await API.getTemplate(id);
      if (res.ok && res.data?.template) {
        const tpl = res.data.template;
        set((state) => {
          const index = state.templates.findIndex((t) => t.id === tpl.id);
          if (index !== -1) {
            const updated = [...state.templates];
            updated[index] = tpl;
            return { templates: updated };
          }
          return { templates: [...state.templates, tpl] };
        });
        return tpl;
      }
      return null;
    } catch {
      return null;
    }
  },

  setActiveEditingTemplate: (tpl) => {
    set({ activeEditingTemplate: tpl, isTemplateEditorMode: !!tpl });
  },

  updateActiveEditingTemplate: (partial) => {
    set((state) => ({
      activeEditingTemplate: state.activeEditingTemplate
        ? { ...state.activeEditingTemplate, ...partial }
        : partial,
    }));
  },

  setIsTemplateEditorMode: (val) => {
    set({ isTemplateEditorMode: val });
  },

  createTemplate: async (data: Partial<TemplateItem>) => {
    try {
      const res = await API.createProjectTemplate({
        id: data.id,
        templateName: data.templateName || data.title,
        title: data.title || '',
        ext: 'md',
        category: data.category || 'geral',
        description: data.description || '',
        tags: data.tags || [],
        badge: data.badge || 'Local',
        content: data.content || '',
        prompt: data.prompt || data.systemPrompt || '',
        source: 'local',
      });
      if (res.ok && res.data?.template) {
        await get().fetchTemplates();
        useGitStore.getState().refreshGitStatus().catch(() => {});
        useGitStore.getState().refreshPendingChanges().catch(() => {});
        return { success: true, template: res.data.template };
      }
      return { success: false, message: (res.data as any)?.error || 'Erro ao criar template.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de conexão.' };
    }
  },

  updateTemplate: async (id: string, data: Partial<TemplateItem>) => {
    try {
      const res = await API.updateProjectTemplate(id, data);
      if (res.ok && res.data?.template) {
        await get().fetchTemplates();
        useGitStore.getState().refreshGitStatus().catch(() => {});
        useGitStore.getState().refreshPendingChanges().catch(() => {});
        return { success: true, template: res.data.template };
      }
      return { success: false, message: (res.data as any)?.error || 'Erro ao atualizar template.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de conexão.' };
    }
  },

  importFromCommunity: async (id: string) => {
    set({ importingId: id });
    try {
      const res = await API.importTemplateFromCommunity(id);
      if (res.ok) {
        await get().fetchTemplates();
        useGitStore.getState().refreshGitStatus().catch(() => {});
        useGitStore.getState().refreshPendingChanges().catch(() => {});
        return { success: true, message: res.data?.message || 'Template importado.' };
      }
      return { success: false, message: (res.data as any)?.error || 'Erro ao importar.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de conexão.' };
    } finally {
      set({ importingId: null });
    }
  },

  deleteTemplate: async (id: string, isCommunity = false) => {
    try {
      const res = isCommunity
        ? await API.deleteCommunityTemplate(id)
        : await API.deleteProjectTemplate(id);
      if (res.ok) {
        await Promise.all([get().fetchTemplates(), get().fetchCommunityTemplates()]);
        useGitStore.getState().refreshGitStatus().catch(() => {});
        useGitStore.getState().refreshPendingChanges().catch(() => {});
        return { success: true, message: res.data?.message || 'Template removido com sucesso.' };
      }
      return { success: false, message: (res.data as any)?.error || res.data?.message || 'Falha ao remover template.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de conexão.' };
    }
  },

  deleteCommunityTemplate: async (id: string) => {
    try {
      const res = await API.deleteCommunityTemplate(id);
      if (res.ok) {
        await Promise.all([get().fetchTemplates(), get().fetchCommunityTemplates()]);
        return { success: true, message: res.data?.message || 'Template removido da comunidade com sucesso.' };
      }
      return { success: false, message: (res.data as any)?.error || res.data?.message || 'Falha ao remover template da comunidade.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro de conexão.' };
    }
  },
}));
