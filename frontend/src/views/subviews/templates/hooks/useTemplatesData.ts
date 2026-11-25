import { useEffect, useMemo, useRef, useState } from "react";
import type { SelectOption } from "../../../../components/common/SelectDropdown";
import { useAI } from "../../../../context/AIContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { useTemplate, useTemplateStore } from "../../../../hooks/useTemplate";
import { API } from "../../../../services/api";
import type { SkillItem, TemplateItem } from "../../../../types";
import type { BadgePreset, TemplateTab, TemplateViewMode } from "../types";

export function useTemplatesData() {
  const { projectMetaOptions, projectConfig } = useWorkspace();
  const {
    templates,
    communityTemplates,
    loading,
    importingId,
    fetchTemplates,
    fetchCommunityTemplates,
    createTemplate,
    updateTemplate,
    importFromCommunity,
    deleteTemplate,
  } = useTemplate();

  const setActiveEditingTemplate = useTemplateStore((s) => s.setActiveEditingTemplate);
  const updateActiveEditingTemplate = useTemplateStore((s) => s.updateActiveEditingTemplate);
  const { setDynamicContext, setActiveSkillId } = useAI();

  const [viewMode, setViewMode] = useState<TemplateViewMode>("grid");
  const [activeTab, setActiveTab] = useState<TemplateTab>("projeto");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Active Template State (for rich editor)
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const isSlugManuallyEditedRef = useRef(false);

  const [tplId, setTplId] = useState("");
  const [tplTemplateName, setTplTemplateName] = useState("");
  const [tplTitle, setTplTitle] = useState("");
  const [tplCategory, setTplCategory] = useState("");
  const [tplBadge, setTplBadge] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplTags, setTplTags] = useState<string[]>([]);
  const [tagInputValue, setTagInputValue] = useState("");
  const [tplContent, setTplContent] = useState("");
  const [tplPrompt, setTplPrompt] = useState("");
  const [tplSkills, setTplSkills] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillItem[]>([]);

  // Import feedback
  const [importFeedback, setImportFeedback] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});

  const loadAvailableSkills = async () => {
    try {
      const [hubRes, projRes] = await Promise.all([
        API.getSkillsHub(),
        API.getSkillsProject(),
      ]);
      const hubList = hubRes.ok && hubRes.data?.skills ? hubRes.data.skills : [];
      const projList =
        projRes.ok && projRes.data?.installed_skills
          ? projRes.data.installed_skills
          : [];
      // Combine unique by ID
      const map = new Map<string, SkillItem>();
      [...hubList, ...projList].forEach((s) => map.set(s.id, s));
      setAvailableSkills(Array.from(map.values()));
    } catch (e) {
      console.error("Erro ao carregar skills para templates:", e);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchCommunityTemplates();
    loadAvailableSkills();
  }, [fetchTemplates, fetchCommunityTemplates]);

  // Sync AI Context dynamic template content for Copilot
  useEffect(() => {
    if (viewMode === "editor") {
      if (tplSkills.length > 0) {
        setActiveSkillId(tplSkills[0]);
      }
      setDynamicContext({
        filePath: tplTemplateName
          ? `templates/${tplTemplateName}.md`
          : `templates/${tplId || "novo-template"}.md`,
        content: tplContent,
        badge: `🛠️ Template: ${tplTitle || tplId || "Novo"}`,
      });
    } else {
      setActiveEditingTemplate(null);
      setDynamicContext(null);
    }
    return () => {
      setActiveEditingTemplate(null);
      setDynamicContext(null);
    };
  }, [
    viewMode,
    tplContent,
    tplTitle,
    tplId,
    tplTemplateName,
    tplSkills,
    setDynamicContext,
    setActiveEditingTemplate,
    setActiveSkillId,
  ]);

  // Derived list
  const activeList = activeTab === "comunidade" ? communityTemplates : templates;
  const allCategories = Array.from(
    new Set(activeList.map((t) => t.category).filter(Boolean))
  ).sort() as string[];

  const filteredTemplates = activeList.filter((tpl) => {
    const matchesCat =
      activeCategory === "all" ||
      tpl.category?.toLowerCase() === activeCategory.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      tpl.title.toLowerCase().includes(q) ||
      (tpl.templateName || "").toLowerCase().includes(q) ||
      (tpl.description || "").toLowerCase().includes(q) ||
      (tpl.tags || []).some((t) => t.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  // Dynamic Badge Presets from .project.config.json
  const badgePresets = useMemo<BadgePreset[]>(() => {
    const raw = projectMetaOptions?.badges || projectConfig?.badges;
    if (Array.isArray(raw) && raw.length > 0) {
      return (raw as Array<string | { name?: string; color?: string; description?: string }>)
        .map((b) =>
          typeof b === "string"
            ? { name: b.toUpperCase() }
            : {
                name: String(b.name || "").toUpperCase(),
                color: b.color,
                description: b.description,
              }
        )
        .filter((b) => Boolean(b.name));
    }
    return [];
  }, [projectMetaOptions?.badges, projectConfig?.badges]);

  // Options for Category SelectDropdown from .project.config.json
  const categoryDropdownOptions: SelectOption[] = useMemo(() => {
    const rawProjectCats = projectMetaOptions?.categories || projectConfig?.categories;
    let baseList: SelectOption[] = [];

    if (Array.isArray(rawProjectCats) && rawProjectCats.length > 0) {
      baseList = (rawProjectCats as Array<string | { name?: string }>).map((cat) => {
        const name = typeof cat === "string" ? cat : String(cat.name || "");
        const lower = String(name || "").toLowerCase();
        return {
          value: lower,
          label: name.charAt(0).toUpperCase() + name.slice(1),
          description: `Categoria do projeto (${name})`,
          icon: "folder",
        };
      });
    }

    if (
      tplCategory &&
      !baseList.some((o) => o.value.toLowerCase() === tplCategory.toLowerCase().trim())
    ) {
      baseList.push({
        value: tplCategory,
        label: tplCategory.charAt(0).toUpperCase() + tplCategory.slice(1),
        description: "Categoria personalizada",
        icon: "label",
      });
    }
    return baseList;
  }, [projectMetaOptions?.categories, projectConfig?.categories, tplCategory]);

  // Options for Skills SelectDropdown
  const skillDropdownOptions: SelectOption[] = useMemo(() => {
    return availableSkills.map((s) => {
      const isSelected = tplSkills.includes(s.id);
      return {
        value: s.id,
        label: s.title || s.name || s.id,
        description: s.description
          ? s.description.length > 75
            ? `${s.description.slice(0, 75)}...`
            : s.description
          : `Skill padrão ECC (${s.id})`,
        icon: "auto_awesome",
        badge: isSelected ? "Vinculada" : undefined,
        badgeType: isSelected ? "primary" : undefined,
      };
    });
  }, [availableSkills, tplSkills]);

  const handleOpenCreate = () => {
    isSlugManuallyEditedRef.current = false;
    setIsEditMode(false);
    setTplId("");
    setTplTemplateName("");
    setTplTitle("");
    setTplCategory("");
    setTplBadge("DOC");
    setTplDesc("");
    setTplTags([]);
    setTagInputValue("");
    setTplContent("");
    setTplPrompt("");
    setTplSkills([]);
    setSaveError("");
    setSaveSuccessMsg("");
    setShowConfigDrawer(false);

    setActiveEditingTemplate({
      id: "",
      title: "",
      category: "",
      description: "",
      prompt: "",
      skills: [],
    });

    setViewMode("editor");
  };

  const handleOpenEdit = (tpl: TemplateItem) => {
    isSlugManuallyEditedRef.current = true;
    setIsEditMode(true);
    setTplId(tpl.id);
    setTplTemplateName(tpl.templateName || tpl.title || tpl.id);
    setTplTitle(tpl.title);
    setTplCategory(tpl.category || "");
    setTplBadge(tpl.badge || "");
    setTplDesc(tpl.description || "");
    setTplTags(tpl.tags || []);
    setTagInputValue("");
    setTplContent(tpl.content || "");
    setTplPrompt(tpl.prompt || "");
    setTplSkills(tpl.skills || []);
    setSaveError("");
    setSaveSuccessMsg("");
    setShowConfigDrawer(false);

    setActiveEditingTemplate({
      id: tpl.id,
      templateName: tpl.templateName || tpl.id,
      title: tpl.title,
      category: tpl.category || "",
      badge: tpl.badge,
      description: tpl.description,
      tags: tpl.tags,
      prompt: tpl.prompt,
      skills: tpl.skills || [],
    });

    setViewMode("editor");
  };

  const handleAddTag = (tag: string) => {
    const clean = tag.trim().replace(/^#/, "");
    if (clean && !tplTags.includes(clean)) {
      const updated = [...tplTags, clean];
      setTplTags(updated);
      updateActiveEditingTemplate({ tags: updated });
    }
    setTagInputValue("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = tplTags.filter((t) => t !== tagToRemove);
    setTplTags(updated);
    updateActiveEditingTemplate({ tags: updated });
  };

  const handleSkillSelect = (selectedId: string) => {
    if (!selectedId) return;
    if (!tplSkills.includes(selectedId)) {
      const updated = [...tplSkills, selectedId];
      setTplSkills(updated);
      setActiveSkillId(selectedId);
      updateActiveEditingTemplate({ skills: updated });
    }
  };

  const handleRemoveSkill = (skillId: string) => {
    const updated = tplSkills.filter((id) => id !== skillId);
    setTplSkills(updated);
    if (updated.length > 0) {
      setActiveSkillId(updated[0]);
    }
    updateActiveEditingTemplate({ skills: updated });
  };

  const handleSaveTemplate = async () => {
    if (!tplTitle.trim()) {
      setSaveError("O título do template é obrigatório.");
      return;
    }
    const finalId = tplId.trim() || tplTitle.toLowerCase().replace(/[^a-z0-9-_]/g, "");
    if (!finalId) {
      setSaveError("Slug/Identificador inválido.");
      return;
    }

    const tagsArray = tplTags.map((t) => t.trim()).filter(Boolean);

    const templateData: Partial<TemplateItem> = {
      id: finalId,
      templateName: tplTemplateName.trim() || tplTitle.trim() || finalId,
      title: tplTitle.trim(),
      category: tplCategory.trim(),
      badge: tplBadge.trim() || undefined,
      description: tplDesc.trim() || undefined,
      tags: tagsArray,
      content: tplContent,
      prompt: tplPrompt.trim() || undefined,
      skills: tplSkills,
    };

    setIsSaving(true);
    setSaveError("");
    setSaveSuccessMsg("");

    try {
      if (isEditMode) {
        await updateTemplate(tplId, templateData);
        setSaveSuccessMsg("Template atualizado com sucesso!");
      } else {
        await createTemplate(templateData as Partial<TemplateItem>);
        setIsEditMode(true);
        setTplId(finalId);
        setSaveSuccessMsg("Template criado com sucesso!");
      }

      updateActiveEditingTemplate({
        id: finalId,
        templateName: finalId,
        title: tplTitle.trim(),
        category: tplCategory.trim(),
        badge: tplBadge.trim() || undefined,
        description: tplDesc.trim() || undefined,
        tags: tagsArray,
        prompt: tplPrompt.trim() || undefined,
        skills: tplSkills,
      });

      setTimeout(() => setSaveSuccessMsg(""), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar template.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (tpl: TemplateItem, isCommunity: boolean) => {
    if (window.confirm(`Tem certeza que deseja remover o template "${tpl.title}"?`)) {
      try {
        await deleteTemplate(tpl.id, isCommunity);
      } catch (err: unknown) {
        alert(`Erro: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  const handleImport = async (tpl: TemplateItem) => {
    try {
      await importFromCommunity(tpl.id);
      setImportFeedback((prev) => ({
        ...prev,
        [tpl.id]: { ok: true, msg: "Importado para o projeto!" },
      }));
      setTimeout(() => {
        setImportFeedback((prev) => {
          const next = { ...prev };
          delete next[tpl.id];
          return next;
        });
      }, 3500);
    } catch (err: unknown) {
      setImportFeedback((prev) => ({
        ...prev,
        [tpl.id]: { ok: false, msg: err instanceof Error ? err.message : "Falha ao importar." },
      }));
    }
  };

  const handleContentChange = (newContent: string) => {
    setTplContent(newContent);
  };

  const handlePromptChange = (newPrompt: string) => {
    setTplPrompt(newPrompt);
    updateActiveEditingTemplate({ prompt: newPrompt });
  };

  const handleTitleChange = (newTitle: string) => {
    setTplTitle(newTitle);
    updateActiveEditingTemplate({ title: newTitle });
    if (!isEditMode) {
      if (!isSlugManuallyEditedRef.current) {
        const generatedSlug = newTitle
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9-_]+/g, "-")
          .replace(/^-+|-+$/g, "");
        setTplId(generatedSlug);
      }
      setTplTemplateName(newTitle.trim());
    }
  };

  return {
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    templates,
    communityTemplates,
    loading,
    importingId,
    fetchTemplates,
    fetchCommunityTemplates,
    allCategories,
    activeList,
    filteredTemplates,
    badgePresets,
    categoryDropdownOptions,
    skillDropdownOptions,
    availableSkills,
    isEditMode,
    isSaving,
    saveError,
    setSaveError,
    saveSuccessMsg,
    setSaveSuccessMsg,
    showConfigDrawer,
    setShowConfigDrawer,
    tplId,
    setTplId: (val: string) => {
      isSlugManuallyEditedRef.current = !!val.trim();
      setTplId(val);
    },
    tplTemplateName,
    tplTitle,
    tplCategory,
    setTplCategory,
    tplBadge,
    setTplBadge,
    tplDesc,
    setTplDesc,
    tplTags,
    tagInputValue,
    setTagInputValue,
    tplContent,
    tplPrompt,
    tplSkills,
    importFeedback,
    handleOpenCreate,
    handleOpenEdit,
    handleAddTag,
    handleRemoveTag,
    handleSkillSelect,
    handleRemoveSkill,
    handleSaveTemplate,
    handleDelete,
    handleImport,
    handleContentChange,
    handlePromptChange,
    handleTitleChange,
    updateActiveEditingTemplate,
  };
}
