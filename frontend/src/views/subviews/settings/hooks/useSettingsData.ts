import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useAI } from "../../../../context/AIContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import { RAINBOW_28_HUES } from "../../../../components/common/ColorDotPicker";
import type {
  TaxonomyItem,
  DocumentMetadataItem,
  SupportedLanguage,
} from "../../../../types";
import type { SelectOption } from "../../../../components/ui";
import { formatStatusName, type DeleteDialogState } from "../types";

const ALL_28_COLORS = RAINBOW_28_HUES.flatMap((h) => h.colors);

export function useSettingsData() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { aiSettings, saveAISettings } = useAI();
  const { activeRepo, loadProjectConfig, saveProjectConfig } = useWorkspace();

  // AI Provider State
  const [provider, setProvider] = useState<string>("gemini");
  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState<string>("");
  const [endpoint, setEndpoint] = useState<string>("http://localhost:11434/v1");
  const [modelsList, setModelsList] = useState<
    Array<{ id: string; name: string; description?: string }>
  >([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Categories State
  const [categories, setCategories] = useState<TaxonomyItem[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState<boolean>(false);
  const [newCatName, setNewCatName] = useState<string>("");
  const [newCatColor, setNewCatColor] = useState<string>("#3b82f6");
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState<string>("");
  const [editCatColor, setEditCatColor] = useState<string>("#3b82f6");

  // Badges (Tipos de Documento) State
  const [badges, setBadges] = useState<TaxonomyItem[]>([]);
  const [isAddingBadge, setIsAddingBadge] = useState<boolean>(false);
  const [newBadgeName, setNewBadgeName] = useState<string>("");
  const [newBadgeColor, setNewBadgeColor] = useState<string>("#3b82f6");
  const [editingBadgeIndex, setEditingBadgeIndex] = useState<number | null>(null);
  const [editBadgeName, setEditBadgeName] = useState<string>("");
  const [editBadgeColor, setEditBadgeColor] = useState<string>("#3b82f6");

  // Tags State
  const [tags, setTags] = useState<TaxonomyItem[]>([]);
  const [isAddingTag, setIsAddingTag] = useState<boolean>(false);
  const [newTagName, setNewTagName] = useState<string>("");
  const [newTagColor, setNewTagColor] = useState<string>("#6366f1");
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editTagName, setEditTagName] = useState<string>("");
  const [editTagColor, setEditTagColor] = useState<string>("#6366f1");

  // Statuses State
  const [statuses, setStatuses] = useState<TaxonomyItem[]>([]);
  const [isAddingStatus, setIsAddingStatus] = useState<boolean>(false);
  const [newStatusName, setNewStatusName] = useState<string>("");
  const [newStatusColor, setNewStatusColor] = useState<string>("#22c55e");
  const [editingStatusIndex, setEditingStatusIndex] = useState<number | null>(null);
  const [editStatusName, setEditStatusName] = useState<string>("");
  const [editStatusColor, setEditStatusColor] = useState<string>("#22c55e");

  // Documentos no workspace para verificar referências
  const [docMetadataList, setDocMetadataList] = useState<DocumentMetadataItem[]>([]);

  // Estado de confirmação de exclusão com alerta de referências
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    isOpen: false,
    type: "status",
    nameOrKey: "",
    label: "",
    referencingDocs: [],
    onConfirm: async () => {},
  });

  // Governance Rules State
  const [minApprovals, setMinApprovals] = useState<number>(1);

  // Language & SSOT Translation Governance State
  const [defaultLanguage, setDefaultLanguage] = useState<string>("pt-BR");
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([
    { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
    { code: "en", label: "English", flag: "🇺🇸" },
    { code: "es", label: "Español", flag: "🇪🇸" },
  ]);
  const [translationEngine, setTranslationEngine] = useState<string>("lightweight-local");
  const [languageChangeDialog, setLanguageChangeDialog] = useState<{
    isOpen: boolean;
    targetLang: string;
  }>({ isOpen: false, targetLang: "" });

  const [isAddLanguageModalOpen, setIsAddLanguageModalOpen] = useState(false);
  const [languageSearchFilter, setLanguageSearchFilter] = useState("");

  // Connected Agent Harness State
  const [harnessProvider, setHarnessProvider] = useState<string>("antigravity");
  const [antigravityCliPath, setAntigravityCliPath] = useState<string>("");
  const [claudeCliPath, setClaudeCliPath] = useState<string>("");
  const [agentEffort, setAgentEffort] = useState<"low" | "medium" | "high">("medium");
  const [agentModelOverride, setAgentModelOverride] = useState<string>("");
  const [detectedProviders, setDetectedProviders] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      mode: string;
      isAvailable: boolean;
      isAuthenticated: boolean;
      statusMessage?: string;
    }>
  >([]);
  const [isCheckingHarness, setIsCheckingHarness] = useState<boolean>(false);
  const [harnessCheckFeedback, setHarnessCheckFeedback] = useState<string | null>(null);

  const checkHarnessProviders = useCallback(async () => {
    setIsCheckingHarness(true);
    try {
      const res = await API.getAIProviders();
      if (res.ok && res.data?.providers) {
        setDetectedProviders(res.data.providers);
        setHarnessCheckFeedback("Conectividade e status dos agentes atualizados!");
      }
    } catch (err) {
      console.error("[SettingsSubView] Erro ao checar provedores de agentes:", err);
      setHarnessCheckFeedback("Erro ao verificar conectividade dos agentes.");
    } finally {
      setIsCheckingHarness(false);
      setTimeout(() => setHarnessCheckFeedback(null), 3500);
    }
  }, []);

  // Status feedback
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);

  const fetchModelsForProvider = useCallback(
    async (provId: string, customKey?: string, customEp?: string) => {
      setIsLoadingModels(true);
      try {
        const res = await API.getAIModels({
          provider: provId,
          api_key: customKey || apiKey || undefined,
          custom_endpoint: customEp || endpoint || undefined,
        });

        if (res.ok && res.data) {
          let items: Array<{ id: string; name: string; description?: string }> = [];
          if (res.data.detailedModels && res.data.detailedModels.length > 0) {
            items = res.data.detailedModels;
          } else if (res.data.models && res.data.models.length > 0) {
            items = res.data.models.map((m: any) =>
              typeof m === "string" ? { id: m, name: m } : m,
            );
          }
          setModelsList(items);
        } else {
          setModelsList([]);
        }
      } catch (err) {
        console.error("[SettingsSubView] Erro ao buscar lista de modelos:", err);
        setModelsList([]);
      } finally {
        setIsLoadingModels(false);
      }
    },
    [apiKey, endpoint],
  );

  useEffect(() => {
    if (aiSettings) {
      const activeProv = aiSettings.active_provider || aiSettings.provider || "gemini";
      setProvider(activeProv);
      setModel(
        aiSettings.active_model ||
          aiSettings.model ||
          (activeProv === "gemini" ? "gemini-2.5-flash" : "gpt-4o"),
      );
      setEndpoint(aiSettings.custom_endpoint || "http://localhost:11434/v1");
      if (aiSettings.default_provider) {
        setHarnessProvider(aiSettings.default_provider);
      }
      if (aiSettings.antigravity_cli_path) {
        setAntigravityCliPath(aiSettings.antigravity_cli_path);
      }
      if (aiSettings.claude_cli_path) {
        setClaudeCliPath(aiSettings.claude_cli_path);
      }
      if (aiSettings.agent_effort) {
        setAgentEffort(aiSettings.agent_effort);
      }
      if (aiSettings.agent_model) {
        setAgentModelOverride(aiSettings.agent_model);
      }
      fetchModelsForProvider(activeProv, undefined, aiSettings.custom_endpoint);
    }
    checkHarnessProviders();
  }, [aiSettings, fetchModelsForProvider, checkHarnessProviders]);

  const selectOptions: SelectOption[] = useMemo(() => {
    if (modelsList.length === 0) {
      return [
        { value: model, label: model, description: "Modelo ativo selecionado" },
        {
          value: "gemini-2.5-flash",
          label: "Gemini 2.5 Flash",
          description: "Alta velocidade e capacidades multimodais",
          badge: "Flash",
          badgeType: "success",
        },
        {
          value: "gemini-2.5-pro",
          label: "Gemini 2.5 Pro",
          description: "Raciocínio complexo e codificação profunda",
          badge: "Pro",
          badgeType: "warning",
        },
        {
          value: "gemini-1.5-flash",
          label: "Gemini 1.5 Flash",
          description: "Modelo versátil",
          badge: "Flash",
          badgeType: "info",
        },
      ];
    }

    return modelsList.map((m) => {
      let badge: string | undefined;
      let badgeType: "primary" | "success" | "warning" | "neutral" | "info" =
        "primary";

      if (m.id.includes("pro")) {
        badge = "Pro";
        badgeType = "warning";
      } else if (m.id.includes("flash")) {
        badge = "Flash";
        badgeType = "success";
      } else if (m.id.includes("reason") || m.id.includes("r1")) {
        badge = "Reasoner";
        badgeType = "info";
      }

      return {
        value: m.id,
        label: m.name !== m.id ? m.name : m.id,
        description: m.description || m.id,
        icon: "smart_toy",
        badge,
        badgeType,
      };
    });
  }, [modelsList, model]);

  // Carregar Configurações e Documentos
  const loadAllSettings = useCallback(async () => {
    try {
      const pCfg = await loadProjectConfig();
      if (pCfg) {
        if (Array.isArray(pCfg.categories)) {
          const parsedCats: TaxonomyItem[] = pCfg.categories.map(
            (c: any, idx: number) => {
              if (typeof c === "string") {
                return {
                  name: c,
                  color: ALL_28_COLORS[idx % ALL_28_COLORS.length],
                };
              }
              return {
                name: String(c.name || ""),
                color: String(c.color || ALL_28_COLORS[idx % ALL_28_COLORS.length]),
              };
            },
          );
          setCategories(parsedCats);
        }

        if (Array.isArray(pCfg.badges)) {
          const defaultBadgeColors: Record<string, string> = {
            RFC: "#3b82f6",
            ADR: "#8b5cf6",
            PRD: "#10b981",
            DOC: "#64748b",
            API: "#f59e0b",
            SPEC: "#06b6d4",
            GUIDE: "#ec4899",
            TEST: "#14b8a6",
          };
          const parsedBadges: TaxonomyItem[] = pCfg.badges.map(
            (b: any, idx: number) => {
              if (typeof b === "string") {
                const name = b.trim().toUpperCase();
                return {
                  name,
                  color:
                    defaultBadgeColors[name] ||
                    ALL_28_COLORS[(idx * 2) % ALL_28_COLORS.length],
                };
              }
              const name = String(b.name || "").trim().toUpperCase();
              const color = String(
                b.color ||
                  defaultBadgeColors[name] ||
                  ALL_28_COLORS[(idx * 2) % ALL_28_COLORS.length],
              );
              return { name, color };
            },
          );
          setBadges(parsedBadges);
        }

        if (Array.isArray(pCfg.tags)) {
          const parsedTags: TaxonomyItem[] = pCfg.tags.map(
            (t: any, idx: number) => {
              if (typeof t === "string") {
                return {
                  name: t,
                  color: ALL_28_COLORS[(idx + 4) % ALL_28_COLORS.length],
                };
              }
              return {
                name: String(t.name || ""),
                color: String(t.color || ALL_28_COLORS[(idx + 4) % ALL_28_COLORS.length]),
              };
            },
          );
          setTags(parsedTags);
        }

        if (Array.isArray(pCfg.statuses)) {
          const defaultColors: Record<string, string> = {
            draft: "#fdba74",
            review: "#67e8f9",
            "in-review": "#67e8f9",
            proposed: "#fde047",
            approved: "#86efac",
            superseded: "#d8b4fe",
            deprecated: "#fca5a5",
          };
          const parsedStatuses: TaxonomyItem[] = pCfg.statuses.map(
            (s: any, idx: number) => {
              if (typeof s === "string") {
                const name = formatStatusName(s);
                return {
                  name,
                  color: ALL_28_COLORS[(idx * 3) % ALL_28_COLORS.length],
                };
              }
              const name = formatStatusName(
                String(s.name || s.key || s.label || `status-${idx + 1}`),
              );
              const color = String(
                s.color ||
                  defaultColors[name] ||
                  ALL_28_COLORS[(idx * 3) % ALL_28_COLORS.length],
              );
              return { name, color };
            },
          );
          setStatuses(parsedStatuses);
        }

        if (pCfg.governance_rules?.min_approvals_default !== undefined) {
          setMinApprovals(pCfg.governance_rules.min_approvals_default);
        }

        if (pCfg.default_language) {
          setDefaultLanguage(pCfg.default_language);
        }

        if (Array.isArray(pCfg.supported_languages) && pCfg.supported_languages.length > 0) {
          setSupportedLanguages(pCfg.supported_languages);
        }

        if (pCfg.translation_engine) {
          setTranslationEngine(pCfg.translation_engine);
        }
      }

      const metaRes = await API.getProjectMetadata(activeRepo?.name);
      if (metaRes.ok && Array.isArray(metaRes.data)) {
        setDocMetadataList(metaRes.data);
      }
    } catch (err) {
      console.error("[SettingsSubView] Erro ao carregar configurações:", err);
    }
  }, [loadProjectConfig, activeRepo?.name]);

  useEffect(() => {
    loadAllSettings();
  }, [loadAllSettings]);

  // Propagações
  const propagateCategoryRename = async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    const affectedDocs = docMetadataList.filter(
      (d) => d.categories === oldName || d.category === oldName,
    );
    for (const doc of affectedDocs) {
      try {
        await API.updateDocumentMetadataItem({
          path: doc.path,
          meta: { categories: newName },
          repo: activeRepo?.name,
        });
      } catch (err) {
        console.warn(`Erro ao atualizar categoria no documento ${doc.path}:`, err);
      }
    }
  };

  const propagateBadgeRename = async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    const affectedDocs = docMetadataList.filter(
      (d) =>
        (d.badge && d.badge.toUpperCase() === oldName.toUpperCase()) ||
        (d.type && d.type.toUpperCase() === oldName.toUpperCase()),
    );
    for (const doc of affectedDocs) {
      try {
        await API.updateDocumentMetadataItem({
          path: doc.path,
          meta: { badge: newName },
          repo: activeRepo?.name,
        });
      } catch (err) {
        console.warn(`Erro ao atualizar badge no documento ${doc.path}:`, err);
      }
    }
  };

  const propagateTagRename = async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    const affectedDocs = docMetadataList.filter(
      (d) => Array.isArray(d.tags) && d.tags.includes(oldName),
    );
    for (const doc of affectedDocs) {
      const updatedTags = doc.tags.map((t) => (t === oldName ? newName : t));
      try {
        await API.updateDocumentMetadataItem({
          path: doc.path,
          meta: { tags: updatedTags },
          repo: activeRepo?.name,
        });
      } catch (err) {
        console.warn(`Erro ao atualizar tag no documento ${doc.path}:`, err);
      }
    }
  };

  const propagateStatusRename = async (oldName: string, newName: string) => {
    if (oldName === newName) return;
    const affectedDocs = docMetadataList.filter((d) => d.status === oldName);
    for (const doc of affectedDocs) {
      try {
        await API.updateDocumentMetadataItem({
          path: doc.path,
          meta: { status: newName },
          repo: activeRepo?.name,
        });
      } catch (err) {
        console.warn(`Erro ao atualizar status no documento ${doc.path}:`, err);
      }
    }
  };

  const persistTaxonomy = useCallback(
    async (overrides: {
      categories?: TaxonomyItem[];
      badges?: TaxonomyItem[];
      tags?: TaxonomyItem[];
      statuses?: TaxonomyItem[];
    }) => {
      try {
        const res = await saveProjectConfig({
          categories: overrides.categories ?? categories,
          badges: overrides.badges ?? badges,
          tags: overrides.tags ?? tags,
          statuses: overrides.statuses ?? statuses,
          governance_rules: {
            min_approvals_default: minApprovals,
          },
          default_language: defaultLanguage,
          supported_languages: supportedLanguages,
          translation_engine: translationEngine,
        });
        if (!res.success) {
          setSaveStatus(res.error || "Erro ao salvar taxonomia.");
          return;
        }
        setSaveStatus("Taxonomia atualizada e salva!");
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("[SettingsSubView] Erro ao salvar taxonomia:", err);
        setSaveStatus("Erro ao salvar taxonomia.");
      }
    },
    [
      saveProjectConfig,
      categories,
      badges,
      tags,
      statuses,
      minApprovals,
      defaultLanguage,
      supportedLanguages,
      translationEngine,
    ],
  );

  // Handlers Categories
  const handleAddCategory = () => {
    const trimmed = newCatName.trim().toLowerCase();
    if (!trimmed || categories.some((c) => c.name.toLowerCase() === trimmed)) return;
    const next = [...categories, { name: trimmed, color: newCatColor }];
    setCategories(next);
    setNewCatName("");
    setIsAddingCategory(false);
    void persistTaxonomy({ categories: next });
  };

  const handleRequestRemoveCategory = (index: number) => {
    const target = categories[index];
    if (!target) return;
    const referencing = docMetadataList.filter(
      (d) => d.categories === target.name || d.category === target.name,
    );

    if (referencing.length > 0) {
      setDeleteDialog({
        isOpen: true,
        type: "category",
        nameOrKey: target.name,
        label: target.name.toUpperCase(),
        referencingDocs: referencing,
        onConfirm: async () => {
          for (const doc of referencing) {
            try {
              await API.updateDocumentMetadataItem({
                path: doc.path,
                meta: { categories: "" },
                repo: activeRepo?.name,
              });
            } catch {}
          }
          const next = categories.filter((_, i) => i !== index);
          setCategories(next);
          setDeleteDialog((d) => ({ ...d, isOpen: false }));
          await persistTaxonomy({ categories: next });
        },
      });
    } else {
      const next = categories.filter((_, i) => i !== index);
      setCategories(next);
      if (editingCatIndex === index) setEditingCatIndex(null);
      void persistTaxonomy({ categories: next });
    }
  };

  const handleStartEditCategory = (index: number) => {
    setEditingCatIndex(index);
    setEditCatName(categories[index].name);
    setEditCatColor(categories[index].color);
  };

  const handleSaveEditCategory = async () => {
    if (editingCatIndex === null) return;
    const oldName = categories[editingCatIndex].name;
    const trimmed = editCatName.trim().toLowerCase();
    if (!trimmed) return;

    const updated = [...categories];
    updated[editingCatIndex] = { name: trimmed, color: editCatColor };
    setCategories(updated);
    setEditingCatIndex(null);

    if (oldName !== trimmed) {
      await propagateCategoryRename(oldName, trimmed);
    }
    await persistTaxonomy({ categories: updated });
  };

  // Handlers Badges
  const handleAddBadge = () => {
    const trimmed = newBadgeName.trim().toUpperCase();
    if (!trimmed || badges.some((b) => b.name.toUpperCase() === trimmed)) return;
    const next = [...badges, { name: trimmed, color: newBadgeColor }];
    setBadges(next);
    setNewBadgeName("");
    setIsAddingBadge(false);
    void persistTaxonomy({ badges: next });
  };

  const handleRequestRemoveBadge = (index: number) => {
    const target = badges[index];
    if (!target) return;
    const referencing = docMetadataList.filter(
      (d) =>
        (d.badge && d.badge.toUpperCase() === target.name.toUpperCase()) ||
        (d.type && d.type.toUpperCase() === target.name.toUpperCase()),
    );

    if (referencing.length > 0) {
      setDeleteDialog({
        isOpen: true,
        type: "badge",
        nameOrKey: target.name,
        label: target.name.toUpperCase(),
        referencingDocs: referencing,
        onConfirm: async () => {
          for (const doc of referencing) {
            try {
              await API.updateDocumentMetadataItem({
                path: doc.path,
                meta: { badge: "" },
                repo: activeRepo?.name,
              });
            } catch {}
          }
          const next = badges.filter((_, i) => i !== index);
          setBadges(next);
          setDeleteDialog((d) => ({ ...d, isOpen: false }));
          await persistTaxonomy({ badges: next });
        },
      });
    } else {
      const next = badges.filter((_, i) => i !== index);
      setBadges(next);
      if (editingBadgeIndex === index) setEditingBadgeIndex(null);
      void persistTaxonomy({ badges: next });
    }
  };

  const handleStartEditBadge = (index: number) => {
    setEditingBadgeIndex(index);
    setEditBadgeName(badges[index].name);
    setEditBadgeColor(badges[index].color || "#3b82f6");
  };

  const handleSaveEditBadge = async () => {
    if (editingBadgeIndex === null) return;
    const oldName = badges[editingBadgeIndex].name;
    const trimmed = editBadgeName.trim().toUpperCase();
    if (!trimmed) return;

    const updated = [...badges];
    updated[editingBadgeIndex] = { name: trimmed, color: editBadgeColor };
    setBadges(updated);
    setEditingBadgeIndex(null);

    if (oldName !== trimmed) {
      await propagateBadgeRename(oldName, trimmed);
    }
    await persistTaxonomy({ badges: updated });
  };

  // Handlers Tags
  const handleAddTag = () => {
    const trimmed = newTagName.trim().toLowerCase();
    if (!trimmed || tags.some((t) => t.name.toLowerCase() === trimmed)) return;
    const next = [...tags, { name: trimmed, color: newTagColor }];
    setTags(next);
    setNewTagName("");
    setIsAddingTag(false);
    void persistTaxonomy({ tags: next });
  };

  const handleRequestRemoveTag = (index: number) => {
    const target = tags[index];
    if (!target) return;
    const referencing = docMetadataList.filter(
      (d) => Array.isArray(d.tags) && d.tags.includes(target.name),
    );

    if (referencing.length > 0) {
      setDeleteDialog({
        isOpen: true,
        type: "tag",
        nameOrKey: target.name,
        label: `#${target.name}`,
        referencingDocs: referencing,
        onConfirm: async () => {
          for (const doc of referencing) {
            const cleanTags = doc.tags.filter((t) => t !== target.name);
            try {
              await API.updateDocumentMetadataItem({
                path: doc.path,
                meta: { tags: cleanTags },
                repo: activeRepo?.name,
              });
            } catch {}
          }
          const next = tags.filter((_, i) => i !== index);
          setTags(next);
          setDeleteDialog((d) => ({ ...d, isOpen: false }));
          await persistTaxonomy({ tags: next });
        },
      });
    } else {
      const next = tags.filter((_, i) => i !== index);
      setTags(next);
      if (editingTagIndex === index) setEditingTagIndex(null);
      void persistTaxonomy({ tags: next });
    }
  };

  const handleStartEditTag = (index: number) => {
    setEditingTagIndex(index);
    setEditTagName(tags[index].name);
    setEditTagColor(tags[index].color);
  };

  const handleSaveEditTag = async () => {
    if (editingTagIndex === null) return;
    const oldName = tags[editingTagIndex].name;
    const trimmed = editTagName.trim().toLowerCase();
    if (!trimmed) return;

    const updated = [...tags];
    updated[editingTagIndex] = { name: trimmed, color: editTagColor };
    setTags(updated);
    setEditingTagIndex(null);

    if (oldName !== trimmed) {
      await propagateTagRename(oldName, trimmed);
    }
    await persistTaxonomy({ tags: updated });
  };

  // Handlers Statuses
  const handleAddStatus = () => {
    const formatted = formatStatusName(newStatusName);
    if (!formatted || statuses.some((s) => s.name === formatted)) return;
    const next = [...statuses, { name: formatted, color: newStatusColor }];
    setStatuses(next);
    setNewStatusName("");
    setIsAddingStatus(false);
    void persistTaxonomy({ statuses: next });
  };

  const handleRequestRemoveStatus = (index: number) => {
    const target = statuses[index];
    if (!target) return;
    const referencing = docMetadataList.filter((d) => d.status === target.name);

    if (referencing.length > 0) {
      setDeleteDialog({
        isOpen: true,
        type: "status",
        nameOrKey: target.name,
        label: target.name.toUpperCase(),
        referencingDocs: referencing,
        onConfirm: async () => {
          for (const doc of referencing) {
            try {
              await API.updateDocumentMetadataItem({
                path: doc.path,
                meta: { status: "" },
                repo: activeRepo?.name,
              });
            } catch {}
          }
          const next = statuses.filter((_, i) => i !== index);
          setStatuses(next);
          setDeleteDialog((d) => ({ ...d, isOpen: false }));
          await persistTaxonomy({ statuses: next });
        },
      });
    } else {
      const next = statuses.filter((_, i) => i !== index);
      setStatuses(next);
      if (editingStatusIndex === index) setEditingStatusIndex(null);
      void persistTaxonomy({ statuses: next });
    }
  };

  const handleStartEditStatus = (index: number) => {
    setEditingStatusIndex(index);
    setEditStatusName(statuses[index].name);
    setEditStatusColor(statuses[index].color || "#22c55e");
  };

  const handleSaveEditStatus = async () => {
    if (editingStatusIndex === null) return;
    const oldName = statuses[editingStatusIndex].name;
    const formatted = formatStatusName(editStatusName);
    if (!formatted) return;

    const updated = [...statuses];
    updated[editingStatusIndex] = { name: formatted, color: editStatusColor };
    setStatuses(updated);
    setEditingStatusIndex(null);

    if (oldName !== formatted) {
      await propagateStatusRename(oldName, formatted);
    }
    await persistTaxonomy({ statuses: updated });
  };

  const handleSaveAISettings = async () => {
    try {
      await saveAISettings(provider, model, apiKey, endpoint, {
        default_provider: harnessProvider,
        antigravity_cli_path: antigravityCliPath,
        claude_cli_path: claudeCliPath,
        agent_effort: agentEffort,
        agent_model: agentModelOverride,
      });
      await checkHarnessProviders();
      setSaveStatus("Configurações de IA e Agentes CLI salvas com sucesso!");
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err) {
      console.error("[SettingsSubView] Erro ao salvar IA:", err);
      setSaveStatus("Erro ao salvar configurações de IA.");
    }
  };

  const handleSaveAllSettings = async () => {
    setIsSavingAll(true);
    try {
      await saveAISettings(provider, model, apiKey, endpoint, {
        default_provider: harnessProvider,
        antigravity_cli_path: antigravityCliPath,
        claude_cli_path: claudeCliPath,
        agent_effort: agentEffort,
        agent_model: agentModelOverride,
      });
      await saveProjectConfig({
        categories,
        badges,
        tags,
        statuses,
        governance_rules: {
          min_approvals_default: minApprovals,
        },
        default_language: defaultLanguage,
        supported_languages: supportedLanguages,
        translation_engine: translationEngine,
      });
      await checkHarnessProviders();

      setSaveStatus("Todas as configurações foram salvas com sucesso!");
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err) {
      console.error("[SettingsSubView] Erro ao salvar tudo:", err);
      setSaveStatus("Erro ao salvar configurações gerais.");
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleSaveLanguages = async () => {
    try {
      await saveProjectConfig({
        categories,
        badges,
        tags,
        statuses,
        governance_rules: {
          min_approvals_default: minApprovals,
        },
        default_language: defaultLanguage,
        supported_languages: supportedLanguages,
        translation_engine: translationEngine,
      });
      setSaveStatus(
        "Configurações de Idiomas & Governança salvas com sucesso!",
      );
      setTimeout(() => setSaveStatus(null), 3500);
    } catch {
      setSaveStatus("Erro ao salvar configurações de idiomas.");
    }
  };

  return {
    navigate,
    user,
    logout,
    activeRepo,
    provider,
    setProvider,
    model,
    setModel,
    apiKey,
    setApiKey,
    endpoint,
    setEndpoint,
    modelsList,
    isLoadingModels,
    categories,
    isAddingCategory,
    setIsAddingCategory,
    newCatName,
    setNewCatName,
    newCatColor,
    setNewCatColor,
    editingCatIndex,
    setEditingCatIndex,
    editCatName,
    setEditCatName,
    editCatColor,
    setEditCatColor,
    handleAddCategory,
    handleRequestRemoveCategory,
    handleStartEditCategory,
    handleSaveEditCategory,
    badges,
    isAddingBadge,
    setIsAddingBadge,
    newBadgeName,
    setNewBadgeName,
    newBadgeColor,
    setNewBadgeColor,
    editingBadgeIndex,
    setEditingBadgeIndex,
    editBadgeName,
    setEditBadgeName,
    editBadgeColor,
    setEditBadgeColor,
    handleAddBadge,
    handleRequestRemoveBadge,
    handleStartEditBadge,
    handleSaveEditBadge,
    tags,
    isAddingTag,
    setIsAddingTag,
    newTagName,
    setNewTagName,
    newTagColor,
    setNewTagColor,
    editingTagIndex,
    setEditingTagIndex,
    editTagName,
    setEditTagName,
    editTagColor,
    setEditTagColor,
    handleAddTag,
    handleRequestRemoveTag,
    handleStartEditTag,
    handleSaveEditTag,
    statuses,
    isAddingStatus,
    setIsAddingStatus,
    newStatusName,
    setNewStatusName,
    newStatusColor,
    setNewStatusColor,
    editingStatusIndex,
    setEditingStatusIndex,
    editStatusName,
    setEditStatusName,
    editStatusColor,
    setEditStatusColor,
    handleAddStatus,
    handleRequestRemoveStatus,
    handleStartEditStatus,
    handleSaveEditStatus,
    deleteDialog,
    setDeleteDialog,
    minApprovals,
    setMinApprovals,
    defaultLanguage,
    setDefaultLanguage,
    supportedLanguages,
    setSupportedLanguages,
    translationEngine,
    setTranslationEngine,
    languageChangeDialog,
    setLanguageChangeDialog,
    isAddLanguageModalOpen,
    setIsAddLanguageModalOpen,
    languageSearchFilter,
    setLanguageSearchFilter,
    harnessProvider,
    setHarnessProvider,
    antigravityCliPath,
    setAntigravityCliPath,
    claudeCliPath,
    setClaudeCliPath,
    agentEffort,
    setAgentEffort,
    agentModelOverride,
    setAgentModelOverride,
    detectedProviders,
    isCheckingHarness,
    harnessCheckFeedback,
    checkHarnessProviders,
    saveStatus,
    setSaveStatus,
    isSavingAll,
    handleSaveAISettings,
    handleSaveAllSettings,
    handleSaveLanguages,
    fetchModelsForProvider,
    selectOptions,
    docMetadataList,
    loadProjectConfig,
  };
}
