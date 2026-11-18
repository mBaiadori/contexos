import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import { RAINBOW_28_HUES } from "../../../../components/common/ColorDotPicker";
import type {
  TaxonomyItem,
  DocumentMetadataItem,
  SupportedLanguage,
} from "../../../../types";
import { formatStatusName, type DeleteDialogState } from "../types";

const ALL_28_COLORS = RAINBOW_28_HUES.flatMap((h) => h.colors);

export function useSettingsData() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeRepo, loadProjectConfig, saveProjectConfig } = useWorkspace();

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

  // Status feedback
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  const persistProjectConfig = useCallback(
    async (
      overrides: {
        categories?: TaxonomyItem[];
        badges?: TaxonomyItem[];
        tags?: TaxonomyItem[];
        statuses?: TaxonomyItem[];
        defaultLanguage?: string;
        supportedLanguages?: SupportedLanguage[];
        translationEngine?: string;
      },
      successMessage: string,
    ) => {
      try {
        const res = await saveProjectConfig({
          categories: overrides.categories ?? categories,
          badges: overrides.badges ?? badges,
          tags: overrides.tags ?? tags,
          statuses: overrides.statuses ?? statuses,
          governance_rules: {
            min_approvals_default: minApprovals,
          },
          default_language: overrides.defaultLanguage ?? defaultLanguage,
          supported_languages: overrides.supportedLanguages ?? supportedLanguages,
          translation_engine: overrides.translationEngine ?? translationEngine,
        });
        if (!res.success) {
          setSaveStatus(res.error || "Erro ao salvar configurações do projeto.");
          return;
        }
        setSaveStatus(successMessage);
        setTimeout(() => setSaveStatus(null), 2500);
      } catch (err) {
        console.error("[SettingsSubView] Erro ao salvar configurações:", err);
        setSaveStatus("Erro ao salvar configurações do projeto.");
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

  const persistTaxonomy = useCallback(
    async (overrides: {
      categories?: TaxonomyItem[];
      badges?: TaxonomyItem[];
      tags?: TaxonomyItem[];
      statuses?: TaxonomyItem[];
    }) => {
      await persistProjectConfig(overrides, "Taxonomia atualizada e salva!");
    },
    [persistProjectConfig],
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

  const handleSaveLanguages = useCallback(
    async (overrides?: {
      defaultLanguage?: string;
      supportedLanguages?: SupportedLanguage[];
      translationEngine?: string;
    }) => {
      await persistProjectConfig(
        overrides ?? {},
        "Configurações de Idiomas & Governança salvas!",
      );
    },
    [persistProjectConfig],
  );

  return {
    navigate,
    user,
    logout,
    activeRepo,
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
    saveStatus,
    setSaveStatus,
    handleSaveLanguages,
    docMetadataList,
    loadProjectConfig,
  };
}
