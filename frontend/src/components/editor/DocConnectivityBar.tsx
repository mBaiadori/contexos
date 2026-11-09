import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSecurity } from "../../context/SecurityContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { API } from "../../services/api";
import type { StatusItem, TaxonomyItem } from "../../types";
import { useTemplateStore } from "../../stores/templateStore";
import { InsertLinkModal } from "../modals/InsertLinkModal";
import { DocConnectivityActions } from "./connectivity/DocConnectivityActions";
import { DocLinksMenu } from "./connectivity/DocLinksMenu";
import { DocMetadataPickers } from "./connectivity/DocMetadataPickers";

interface DocConnectivityBarProps {
  filePath: string;
  onNavigateFile: (path: string) => void;
  onCopyDoc?: () => void;
  onExportDoc?: () => void;
  onImportDoc?: () => void;
  isGitMode?: boolean;
  onToggleGitMode?: () => void;
  isHistoryDrawerOpen?: boolean;
  onToggleHistoryDrawer?: () => void;
  onSave?: (metaOverride?: Record<string, any>) => void;
  saveStatus?: string;
  isDirty?: boolean;
  onAddLink?: (url: string, text: string, type: "dependency" | "consumer") => Promise<void>;
}

export const DocConnectivityBar: React.FC<DocConnectivityBarProps> = ({
  filePath,
  onNavigateFile,
  onCopyDoc,
  onExportDoc,
  onImportDoc,
  isGitMode = false,
  onToggleGitMode,
  isHistoryDrawerOpen = false,
  onToggleHistoryDrawer,
  onSave,
  saveStatus,
  isDirty = false,
  onAddLink,
}) => {
  const { fileMetadata, updateFileMetadata, projectMetaOptions, projectConfig } =
    useWorkspace();
  const { templates, fetchTemplates } = useTemplateStore();
  const [contextData, setContextData] = useState<any>(null);
  type ActivePickerType =
    | "status"
    | "category"
    | "template"
    | "tag"
    | "consumers"
    | "deps"
    | null;
  const [activePicker, setActivePicker] = useState<ActivePickerType>(null);

  const showStatusPicker = activePicker === "status";
  const setShowStatusPicker = (v: boolean) =>
    setActivePicker((curr) => (v ? "status" : curr === "status" ? null : curr));

  const showCategoryPicker = activePicker === "category";
  const setShowCategoryPicker = (v: boolean) =>
    setActivePicker((curr) => (v ? "category" : curr === "category" ? null : curr));

  const showTemplatePicker = activePicker === "template";
  const setShowTemplatePicker = (v: boolean) =>
    setActivePicker((curr) => (v ? "template" : curr === "template" ? null : curr));

  const showTagPicker = activePicker === "tag";
  const setShowTagPicker = (v: boolean) =>
    setActivePicker((curr) => (v ? "tag" : curr === "tag" ? null : curr));

  const showConsumers = activePicker === "consumers";
  const setShowConsumers = (v: boolean) =>
    setActivePicker((curr) => (v ? "consumers" : curr === "consumers" ? null : curr));

  const showDeps = activePicker === "deps";
  const setShowDeps = (v: boolean) =>
    setActivePicker((curr) => (v ? "deps" : curr === "deps" ? null : curr));

  const [templateSearchInput, setTemplateSearchInput] = useState("");
  const [newTagInput, setNewTagInput] = useState("");
  const [customCategoryInput, setCustomCategoryInput] = useState("");
  const [isAddLinkModalOpen, setIsAddLinkModalOpen] = useState(false);
  const [addLinkType, setAddLinkType] = useState<"dependency" | "consumer">("dependency");
  const barRef = useRef<HTMLDivElement>(null);

  const closeOtherPickers = () => {
    setActivePicker(null);
  };

  const openAddLinkModal = (type: "dependency" | "consumer") => {
    setAddLinkType(type);
    setIsAddLinkModalOpen(true);
    setActivePicker(null);
  };

  useEffect(() => {
    if (!templates || templates.length === 0) {
      fetchTemplates();
    }
  }, [templates, fetchTemplates]);

  const loadContext = React.useCallback(async () => {
    if (!filePath) return;
    try {
      const data = await API.getDocumentContext(filePath);
      setContextData(data);
    } catch (err) {
      console.warn("[DocConnectivityBar] Erro ao carregar contexto:", err);
    }
  }, [filePath]);

  useEffect(() => {
    if (filePath) {
      loadContext();
    }
  }, [filePath, loadContext]);

  const handleConfirmAddLink = async (url: string, text: string) => {
    if (onAddLink) {
      await onAddLink(url, text, addLinkType);
    }
    await loadContext();
    setIsAddLinkModalOpen(false);
  };

  // Atualização em tempo real das dependências e consumidores ao salvar documento ou metadados
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleDocumentSaved = (e: any) => {
      const savedPath = e.detail?.filePath;
      if (
        !savedPath ||
        !filePath ||
        savedPath === filePath ||
        savedPath === filePath.split("#")[0] ||
        filePath.startsWith(savedPath)
      ) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          loadContext();
        }, 1200);
      }
    };
    window.addEventListener("workspace:document-saved", handleDocumentSaved);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(
        "workspace:document-saved",
        handleDocumentSaved,
      );
    };
  }, [filePath, loadContext]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        closeOtherPickers();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOtherPickers();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const consumers = contextData?.consumers || [];
  const dependencies = contextData?.dependencies || [];

  // Metadados ativos combinando o contextData com o fileMetadata reativo
  const rawStatus = fileMetadata?.status ?? contextData?.status ?? "";
  const currentStatus = rawStatus && rawStatus !== "-" ? rawStatus : "";

  const rawCat =
    fileMetadata?.categories ||
    fileMetadata?.category ||
    contextData?.categories ||
    contextData?.category ||
    "";
  const currentCategories = rawCat && rawCat !== "-" ? rawCat : "";

  const currentTags: string[] = Array.isArray(fileMetadata?.tags)
    ? fileMetadata.tags
    : [];

  // Opções do projeto
  const statusOptions = useMemo<StatusItem[]>(() => {
    const raw = projectMetaOptions?.statuses || projectConfig?.statuses || [];
    return raw.map((s: any) => {
      const name = String(s.name || s.key || s.label || "")
        .toLowerCase()
        .replace(/\s+/g, "-");
      const label = String(s.label || name.toUpperCase().replace(/-/g, " "));
      const key = String(s.key || name);
      const color = String(s.color || "#3b82f6");
      return { name, key, label, color };
    });
  }, [projectMetaOptions?.statuses, projectConfig?.statuses]);

  const categoryOptions = useMemo<TaxonomyItem[]>(() => {
    const raw = projectMetaOptions?.categories || projectConfig?.categories || [];
    return raw.map((c: any) =>
      typeof c === "string"
        ? { name: c, color: "#3b82f6" }
        : { name: c.name || "", color: c.color || "#3b82f6" },
    );
  }, [projectMetaOptions?.categories, projectConfig?.categories]);

  const availableTags = useMemo<TaxonomyItem[]>(() => {
    const raw = projectMetaOptions?.tags || projectConfig?.tags || [];
    return raw.map((t: any) =>
      typeof t === "string"
        ? { name: t, color: "#6366f1" }
        : { name: t.name || "", color: t.color || "#6366f1" },
    );
  }, [projectMetaOptions?.tags, projectConfig?.tags]);

  const handleStatusChange = async (newStatus: string) => {
    await updateFileMetadata({ status: newStatus });
    onSave?.({ status: newStatus });
  };

  const handleCategoryChange = async (newCat: string) => {
    await updateFileMetadata({ categories: newCat });
    onSave?.({ categories: newCat });
  };

  const handleAddTag = async (tagToAdd: string) => {
    const trimmed = tagToAdd.trim().toLowerCase();
    if (!trimmed || currentTags.includes(trimmed)) return;
    const updated = [...currentTags, trimmed];
    await updateFileMetadata({ tags: updated });
    onSave?.({ tags: updated });
  };

  const handleRemoveTag = async (tagToRemove: string) => {
    const updated = currentTags.filter((t) => t !== tagToRemove);
    await updateFileMetadata({ tags: updated });
    onSave?.({ tags: updated });
  };

  const { departments } = useSecurity();

  const currentDeptId = fileMetadata?.department || "";
  const activeDept = departments.find(
    (d) =>
      d.id === currentDeptId ||
      d.folder.toLowerCase() === currentDeptId.toLowerCase(),
  );

  const activeStatusObj = currentStatus
    ? statusOptions.find(
        (s) =>
          (s.name && s.name.toLowerCase() === currentStatus.toLowerCase()) ||
          (s.key && s.key.toLowerCase() === currentStatus.toLowerCase()),
      ) || {
        name: currentStatus,
        key: currentStatus,
        label: currentStatus.toUpperCase().replace(/-/g, " "),
        color: "#64748b",
      }
    : null;

  const activeCatObj = currentCategories
    ? categoryOptions.find(
        (c) =>
          c.name.toLowerCase() ===
            String(currentCategories || "").toLowerCase() ||
          c.name.toLowerCase() ===
            (Array.isArray(currentCategories)
              ? currentCategories[0]
              : ""
            ).toLowerCase(),
      )
    : null;
  const catColor = activeCatObj?.color || "#3b82f6";

  const currentTemplateId = fileMetadata?.templateId || "";
  const activeTemplate = useMemo(() => {
    if (!currentTemplateId) return null;
    return (
      templates.find(
        (t) =>
          t.id === currentTemplateId ||
          t.templateName === currentTemplateId ||
          t.title === currentTemplateId,
      ) || null
    );
  }, [templates, currentTemplateId]);

  const filteredTemplates = useMemo(() => {
    if (!templateSearchInput.trim()) return templates;
    const q = templateSearchInput.toLowerCase();
    return templates.filter(
      (t) =>
        t.title?.toLowerCase().includes(q) ||
        t.id?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q),
    );
  }, [templates, templateSearchInput]);

  const handleTemplateChange = async (newTemplateId: string) => {
    await updateFileMetadata({ templateId: newTemplateId });
    setShowTemplatePicker(false);
    setTemplateSearchInput("");
    onSave?.({ templateId: newTemplateId });
  };

  return (
    <div
      ref={barRef}
      className="doc-connectivity-bar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "5px 16px",
        background: "var(--color-surface-container-lowest, #ffffff)",
        borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
        fontSize: "12px",
        position: "relative",
        minHeight: "38px",
        zIndex: 30,
      }}
    >
      {/* Left: Status + Categoria + Tags + Departamento + Conectividade */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "nowrap",
        }}
      >
        <DocMetadataPickers
          currentStatus={currentStatus}
          activeStatusObj={activeStatusObj}
          statusOptions={statusOptions}
          showStatusPicker={showStatusPicker}
          setShowStatusPicker={setShowStatusPicker}
          onStatusChange={handleStatusChange}
          currentCategories={currentCategories}
          catColor={catColor}
          categoryOptions={categoryOptions}
          showCategoryPicker={showCategoryPicker}
          setShowCategoryPicker={setShowCategoryPicker}
          customCategoryInput={customCategoryInput}
          setCustomCategoryInput={setCustomCategoryInput}
          onCategoryChange={handleCategoryChange}
          currentTemplateId={currentTemplateId}
          activeTemplate={activeTemplate}
          showTemplatePicker={showTemplatePicker}
          setShowTemplatePicker={setShowTemplatePicker}
          templateSearchInput={templateSearchInput}
          setTemplateSearchInput={setTemplateSearchInput}
          filteredTemplates={filteredTemplates}
          onTemplateChange={handleTemplateChange}
          currentTags={currentTags}
          availableTags={availableTags}
          showTagPicker={showTagPicker}
          setShowTagPicker={setShowTagPicker}
          newTagInput={newTagInput}
          setNewTagInput={setNewTagInput}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          activeDept={activeDept}
          onCloseOtherPickers={closeOtherPickers}
        />

        <DocLinksMenu
          consumers={consumers}
          dependencies={dependencies}
          showConsumers={showConsumers}
          setShowConsumers={setShowConsumers}
          showDeps={showDeps}
          setShowDeps={setShowDeps}
          onNavigateFile={onNavigateFile}
          onOpenAddLinkModal={openAddLinkModal}
          onCloseOtherPickers={closeOtherPickers}
        />
      </div>

      {/* Right: Ações do Editor (Copiar, Baixar, Upload, Raw, Histórico, Salvar) */}
      <DocConnectivityActions
        onCopyDoc={onCopyDoc}
        onExportDoc={onExportDoc}
        onImportDoc={onImportDoc}
        isGitMode={isGitMode}
        onToggleGitMode={onToggleGitMode}
        isHistoryDrawerOpen={isHistoryDrawerOpen}
        onToggleHistoryDrawer={onToggleHistoryDrawer}
        onSave={onSave}
        saveStatus={saveStatus}
        isDirty={isDirty}
      />

      <InsertLinkModal
        isOpen={isAddLinkModalOpen}
        title={
          addLinkType === "consumer"
            ? "Adicionar Documento Dependente"
            : "Adicionar Documento Referenciado (Link)"
        }
        onClose={() => setIsAddLinkModalOpen(false)}
        onConfirm={handleConfirmAddLink}
      />
    </div>
  );
};
