import React, { useState } from "react";
import type {
  Repo,
  RepoDiagnosis,
  RepoInitializePayload,
  TaxonomyItem,
} from "../../types";
import { API } from "../../services/api";
import {
  ShieldCheck,
  Sparkles,
  Sliders,
  Lock,
  X,
  FolderTree,
  Tag,
  FileBadge,
  AlertCircle,
} from "lucide-react";
import { Button, IconButton, FormField, Input, Switch } from "../ui";
import { TaxonomyChipEditor } from "../common/TaxonomyChipEditor";

interface RepoSetupWizardModalProps {
  isOpen: boolean;
  repo: Repo | null;
  diagnosis: RepoDiagnosis | null;
  onComplete: (repo: Repo) => void;
  onClose: () => void;
}

const DEFAULT_CATEGORIES: TaxonomyItem[] = [
  {
    id: "visao-geral",
    name: "Visão Geral",
    label: "Visão Geral",
    color: "#1a73e8",
    description: "Arquitetura e visão geral",
  },
  {
    id: "especificacoes",
    name: "Especificações",
    label: "Especificações",
    color: "#10b981",
    description: "Regras de negócio e PRDs",
  },
  {
    id: "engenharia",
    name: "Engenharia",
    label: "Engenharia",
    color: "#8b5cf6",
    description: "Guias técnicos e padrões",
  },
];

const DEFAULT_BADGES: TaxonomyItem[] = [
  { id: "ssot", name: "SSOT", label: "SSOT", color: "#1a73e8" },
  { id: "rfc", name: "RFC", label: "RFC", color: "#8b5cf6" },
  { id: "sdd", name: "SDD", label: "SDD", color: "#10b981" },
  { id: "prd", name: "PRD", label: "PRD", color: "#06b6d4" },
];

const DEFAULT_STATUSES: TaxonomyItem[] = [
  { id: "-", name: "Rascunho", label: "Rascunho", color: "#94a3b8" },
  {
    id: "in_review",
    name: "Em Revisão",
    label: "Em Revisão",
    color: "#f59e0b",
  },
  { id: "approved", name: "Aprovado", label: "Aprovado", color: "#10b981" },
  {
    id: "deprecated",
    name: "Depreciado",
    label: "Depreciado",
    color: "#ef4444",
  },
];

export const RepoSetupWizardModal: React.FC<RepoSetupWizardModalProps> = ({
  isOpen,
  repo,
  diagnosis,
  onComplete,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<
    "general" | "categories" | "badges" | "statuses"
  >("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [projectName, setProjectName] = useState(repo?.name || "");
  const [projectDesc, setProjectDesc] = useState(
    repo?.description || "Repositório de especificações e governança.",
  );
  const [defaultLanguage, setDefaultLanguage] = useState("pt-BR");
  const [enableProtection, setEnableProtection] = useState(true);
  const [requiredApprovals, setRequiredApprovals] = useState(1);

  // Categories State
  const [categories, setCategories] =
    useState<TaxonomyItem[]>(DEFAULT_CATEGORIES);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#1a73e8");
  const [editingCatIndex, setEditingCatIndex] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [editCatColor, setEditCatColor] = useState("#1a73e8");

  // Badges State
  const [badges, setBadges] = useState<TaxonomyItem[]>(DEFAULT_BADGES);
  const [isAddingBadge, setIsAddingBadge] = useState(false);
  const [newBadgeName, setNewBadgeName] = useState("");
  const [newBadgeColor, setNewBadgeColor] = useState("#8b5cf6");
  const [editingBadgeIndex, setEditingBadgeIndex] = useState<number | null>(
    null,
  );
  const [editBadgeName, setEditBadgeName] = useState("");
  const [editBadgeColor, setEditBadgeColor] = useState("#8b5cf6");

  // Statuses State
  const [statuses, setStatuses] = useState<TaxonomyItem[]>(DEFAULT_STATUSES);
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusColor, setNewStatusColor] = useState("#10b981");
  const [editingStatusIndex, setEditingStatusIndex] = useState<number | null>(
    null,
  );
  const [editStatusName, setEditStatusName] = useState("");
  const [editStatusColor, setEditStatusColor] = useState("#10b981");

  React.useEffect(() => {
    if (repo) {
      setProjectName(repo.name);
      setProjectDesc(
        repo.description || "Repositório de especificações e governança.",
      );
      setCategories(DEFAULT_CATEGORIES);
      setBadges(DEFAULT_BADGES);
      setStatuses(DEFAULT_STATUSES);
    }
    setErrorMsg(null);
  }, [repo]);

  if (!isOpen || !repo) return null;

  const canAdmin =
    diagnosis?.can_admin ??
    (repo.permissions?.admin || repo.is_owner || repo.is_local);
  const isLocal = Boolean(
    repo.is_local || !diagnosis?.checks?.branch_protection?.supported,
  );

  const handleSaveAndInitialize = async (isRecommended = false) => {
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formattedCategories = (
        isRecommended ? DEFAULT_CATEGORIES : categories
      ).map((c) => ({
        id: c.id || c.name.toLowerCase().replace(/\s+/g, "-"),
        label: c.label || c.name,
        name: c.name || c.label,
        color: c.color || "#1a73e8",
        description: c.description || "",
      }));

      const formattedBadges = (isRecommended ? DEFAULT_BADGES : badges).map(
        (b) => ({
          id: b.id || b.name.toLowerCase().replace(/\s+/g, "-"),
          label: b.label || b.name,
          name: b.name || b.label,
          color: b.color || "#8b5cf6",
        }),
      );

      const formattedStatuses = (
        isRecommended ? DEFAULT_STATUSES : statuses
      ).map((s) => ({
        id: s.id || s.name.toLowerCase().replace(/\s+/g, "-"),
        label: s.label || s.name,
        name: s.name || s.label,
        color: s.color || "#10b981",
      }));

      const payload: RepoInitializePayload = {
        name: repo.name,
        preset: isRecommended ? "recommended" : "custom",
        project_config: {
          name: isRecommended ? repo.name : projectName.trim() || repo.name,
          description: isRecommended
            ? repo.description || "Repositório de especificações e governança."
            : projectDesc.trim(),
          categories: formattedCategories,
          badges: formattedBadges,
          statuses: formattedStatuses,
          governance_rules: { min_approvals_default: requiredApprovals },
        },
        security: {
          enable_branch_protection: canAdmin && !isLocal && enableProtection,
          required_approvals: requiredApprovals,
          create_codeowners: true,
        },
      };

      const res = await API.initializeRepo(payload);
      if (res.ok && res.data?.active_repo) {
        onComplete(res.data.active_repo);
      } else {
        setErrorMsg(res.data?.error || "Erro ao inicializar o repositório");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Falha de comunicação com o servidor");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #1e293b)",
          borderRadius: "16px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "10px",
                background:
                  "linear-gradient(135deg, var(--color-primary, #1a73e8) 0%, #6366f1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-on-surface, #0f172a)",
                }}
              >
                Configuração de Governança
              </h2>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                {repo.full_name || repo.name}
              </span>
            </div>
          </div>

          <IconButton size="sm" tooltip="Fechar" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        {/* Abas de Configuração de Governança */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface, #ffffff)",
            padding: "0 24px",
            gap: "16px",
          }}
        >
          <button
            type="button"
            className={`tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
            style={{
              padding: "12px 4px",
              border: "none",
              background: "transparent",
              borderBottom:
                activeTab === "general"
                  ? "2px solid var(--color-primary, #1a73e8)"
                  : "2px solid transparent",
              color:
                activeTab === "general"
                  ? "var(--color-primary, #1a73e8)"
                  : "var(--color-outline, #64748b)",
              fontWeight: activeTab === "general" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sliders size={14} />
            <span>Geral & Segurança</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "categories" ? "active" : ""}`}
            onClick={() => setActiveTab("categories")}
            style={{
              padding: "12px 4px",
              border: "none",
              background: "transparent",
              borderBottom:
                activeTab === "categories"
                  ? "2px solid var(--color-primary, #1a73e8)"
                  : "2px solid transparent",
              color:
                activeTab === "categories"
                  ? "var(--color-primary, #1a73e8)"
                  : "var(--color-outline, #64748b)",
              fontWeight: activeTab === "categories" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FolderTree size={14} />
            <span>Categorias ({categories.length})</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "badges" ? "active" : ""}`}
            onClick={() => setActiveTab("badges")}
            style={{
              padding: "12px 4px",
              border: "none",
              background: "transparent",
              borderBottom:
                activeTab === "badges"
                  ? "2px solid var(--color-primary, #1a73e8)"
                  : "2px solid transparent",
              color:
                activeTab === "badges"
                  ? "var(--color-primary, #1a73e8)"
                  : "var(--color-outline, #64748b)",
              fontWeight: activeTab === "badges" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileBadge size={14} />
            <span>Tipos de Doc ({badges.length})</span>
          </button>

          <button
            type="button"
            className={`tab-btn ${activeTab === "statuses" ? "active" : ""}`}
            onClick={() => setActiveTab("statuses")}
            style={{
              padding: "12px 4px",
              border: "none",
              background: "transparent",
              borderBottom:
                activeTab === "statuses"
                  ? "2px solid var(--color-primary, #1a73e8)"
                  : "2px solid transparent",
              color:
                activeTab === "statuses"
                  ? "var(--color-primary, #1a73e8)"
                  : "var(--color-outline, #64748b)",
              fontWeight: activeTab === "statuses" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Tag size={14} />
            <span>Status ({statuses.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {errorMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid #ef4444",
                color: "#ef4444",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: GERAL & SEGURANÇA */}
          {activeTab === "general" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <FormField label="Nome do Projeto:">
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                  />
                </FormField>

                <FormField label="Linguagem Padrão:">
                  <select
                    className="ui-input"
                    value={defaultLanguage}
                    onChange={(e) => setDefaultLanguage(e.target.value)}
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-US">English (US)</option>
                    <option value="es">Español</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Descrição do Projeto:">
                <Input
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                />
              </FormField>

              {/* Segurança */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  backgroundColor:
                    "var(--color-surface-container-low, #f8fafc)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Lock size={14} />
                  Segurança no Git Provider
                </span>

                <Switch
                  id="wizard-switch-branch-prot"
                  checked={enableProtection}
                  onChange={setEnableProtection}
                  disabled={!canAdmin || isLocal}
                  label={
                    <span>
                      Bloquear branch <code>main</code> (Exige PR para
                      alterações)
                    </span>
                  }
                  description={
                    !canAdmin
                      ? "Requer permissão de administrador no repositório"
                      : isLocal
                        ? "Não aplicável a repositórios locais"
                        : "Evita force push e alterações sem revisão de código"
                  }
                />

                {enableProtection && canAdmin && !isLocal && (
                  <FormField label="Aprovações mínimas de revisão:">
                    <select
                      className="ui-input"
                      value={requiredApprovals}
                      onChange={(e) =>
                        setRequiredApprovals(Number(e.target.value))
                      }
                    >
                      <option value="1">1 Aprovação (1-of-N)</option>
                      <option value="2">2 Aprovações</option>
                    </select>
                  </FormField>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CATEGORIAS */}
          {activeTab === "categories" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Clique no chip para editar o nome, no ponto de cor para alterar
                a cor, ou adicione novas categorias:
              </p>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  backgroundColor:
                    "var(--color-surface-container-low, #f8fafc)",
                }}
              >
                <TaxonomyChipEditor
                  items={categories}
                  editingIndex={editingCatIndex}
                  editName={editCatName}
                  editColor={editCatColor}
                  onStartEdit={(idx) => {
                    setEditingCatIndex(idx);
                    setEditCatName(
                      categories[idx].name || categories[idx].label || "",
                    );
                    setEditCatColor(categories[idx].color || "#1a73e8");
                  }}
                  onEditNameChange={setEditCatName}
                  onEditColorChange={setEditCatColor}
                  onSaveEdit={() => {
                    if (editingCatIndex !== null && editCatName.trim()) {
                      const updated = [...categories];
                      updated[editingCatIndex] = {
                        ...updated[editingCatIndex],
                        name: editCatName.trim(),
                        label: editCatName.trim(),
                        color: editCatColor,
                      };
                      setCategories(updated);
                      setEditingCatIndex(null);
                    }
                  }}
                  onCancelEdit={() => setEditingCatIndex(null)}
                  onRequestRemove={(idx) => {
                    setCategories(categories.filter((_, i) => i !== idx));
                  }}
                  isAdding={isAddingCategory}
                  newName={newCatName}
                  newColor={newCatColor}
                  onStartAdd={() => {
                    setIsAddingCategory(true);
                    setNewCatName("");
                    setNewCatColor("#1a73e8");
                  }}
                  onNewNameChange={setNewCatName}
                  onNewColorChange={setNewCatColor}
                  onSaveAdd={() => {
                    if (newCatName.trim()) {
                      setCategories([
                        ...categories,
                        {
                          id: newCatName.toLowerCase().replace(/\s+/g, "-"),
                          name: newCatName.trim(),
                          label: newCatName.trim(),
                          color: newCatColor,
                        },
                      ]);
                      setIsAddingCategory(false);
                      setNewCatName("");
                    }
                  }}
                  onCancelAdd={() => setIsAddingCategory(false)}
                  placeholder="Nova Categoria..."
                  addTooltip="Adicionar Categoria"
                />
              </div>
            </div>
          )}

          {/* TAB 3: TIPOS DE DOCUMENTO (BADGES) */}
          {activeTab === "badges" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Tipos de documento canônicos e badges de governança para
                catalogação (ex: SSOT, RFC, PRD, SDD):
              </p>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  backgroundColor:
                    "var(--color-surface-container-low, #f8fafc)",
                }}
              >
                <TaxonomyChipEditor
                  items={badges}
                  editingIndex={editingBadgeIndex}
                  editName={editBadgeName}
                  editColor={editBadgeColor}
                  onStartEdit={(idx) => {
                    setEditingBadgeIndex(idx);
                    setEditBadgeName(
                      badges[idx].name || badges[idx].label || "",
                    );
                    setEditBadgeColor(badges[idx].color || "#8b5cf6");
                  }}
                  onEditNameChange={setEditBadgeName}
                  onEditColorChange={setEditBadgeColor}
                  onSaveEdit={() => {
                    if (editingBadgeIndex !== null && editBadgeName.trim()) {
                      const updated = [...badges];
                      updated[editingBadgeIndex] = {
                        ...updated[editingBadgeIndex],
                        name: editBadgeName.trim(),
                        label: editBadgeName.trim(),
                        color: editBadgeColor,
                      };
                      setBadges(updated);
                      setEditingBadgeIndex(null);
                    }
                  }}
                  onCancelEdit={() => setEditingBadgeIndex(null)}
                  onRequestRemove={(idx) => {
                    setBadges(badges.filter((_, i) => i !== idx));
                  }}
                  isAdding={isAddingBadge}
                  newName={newBadgeName}
                  newColor={newBadgeColor}
                  onStartAdd={() => {
                    setIsAddingBadge(true);
                    setNewBadgeName("");
                    setNewBadgeColor("#8b5cf6");
                  }}
                  onNewNameChange={setNewBadgeName}
                  onNewColorChange={setNewBadgeColor}
                  onSaveAdd={() => {
                    if (newBadgeName.trim()) {
                      setBadges([
                        ...badges,
                        {
                          id: newBadgeName.toLowerCase().replace(/\s+/g, "-"),
                          name: newBadgeName.trim(),
                          label: newBadgeName.trim(),
                          color: newBadgeColor,
                        },
                      ]);
                      setIsAddingBadge(false);
                      setNewBadgeName("");
                    }
                  }}
                  onCancelAdd={() => setIsAddingBadge(false)}
                  placeholder="Novo Tipo (ex: ADR)..."
                  addTooltip="Adicionar Tipo de Documento"
                />
              </div>
            </div>
          )}

          {/* TAB 4: STATUS DE GOVERNANÇA */}
          {activeTab === "statuses" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Ciclos de vida e status de aprovação de documentos (ex:
                Rascunho, Em Revisão, Aprovado):
              </p>

              <div
                style={{
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  backgroundColor:
                    "var(--color-surface-container-low, #f8fafc)",
                }}
              >
                <TaxonomyChipEditor
                  items={statuses}
                  editingIndex={editingStatusIndex}
                  editName={editStatusName}
                  editColor={editStatusColor}
                  onStartEdit={(idx) => {
                    setEditingStatusIndex(idx);
                    setEditStatusName(
                      statuses[idx].name || statuses[idx].label || "",
                    );
                    setEditStatusColor(statuses[idx].color || "#10b981");
                  }}
                  onEditNameChange={setEditStatusName}
                  onEditColorChange={setEditStatusColor}
                  onSaveEdit={() => {
                    if (editingStatusIndex !== null && editStatusName.trim()) {
                      const updated = [...statuses];
                      updated[editingStatusIndex] = {
                        ...updated[editingStatusIndex],
                        name: editStatusName.trim(),
                        label: editStatusName.trim(),
                        color: editStatusColor,
                      };
                      setStatuses(updated);
                      setEditingStatusIndex(null);
                    }
                  }}
                  onCancelEdit={() => setEditingStatusIndex(null)}
                  onRequestRemove={(idx) => {
                    setStatuses(statuses.filter((_, i) => i !== idx));
                  }}
                  isAdding={isAddingStatus}
                  newName={newStatusName}
                  newColor={newStatusColor}
                  onStartAdd={() => {
                    setIsAddingStatus(true);
                    setNewStatusName("");
                    setNewStatusColor("#10b981");
                  }}
                  onNewNameChange={setNewStatusName}
                  onNewColorChange={setNewStatusColor}
                  onSaveAdd={() => {
                    if (newStatusName.trim()) {
                      setStatuses([
                        ...statuses,
                        {
                          id: newStatusName.toLowerCase().replace(/\s+/g, "-"),
                          name: newStatusName.trim(),
                          label: newStatusName.trim(),
                          color: newStatusColor,
                        },
                      ]);
                      setIsAddingStatus(false);
                      setNewStatusName("");
                    }
                  }}
                  onCancelAdd={() => setIsAddingStatus(false)}
                  placeholder="Novo Status (ex: Em Validação)..."
                  addTooltip="Adicionar Status"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>

          <div style={{ display: "flex", gap: "10px" }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<Sparkles size={14} />}
              isLoading={isSubmitting}
              onClick={() => handleSaveAndInitialize(true)}
            >
              ✨ Aplicar Padrões Recomendados
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isSubmitting}
              onClick={() => handleSaveAndInitialize(false)}
            >
              Salvar e Inicializar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
