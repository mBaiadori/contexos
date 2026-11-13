import React, { useState, useEffect } from "react";
import {
  FolderPlus,
  X,
  Lock,
  Globe,
  Shield,
  AlertCircle,
  Sparkles,
  User,
  ExternalLink,
} from "lucide-react";
import { Button, IconButton, FormField, Input, Switch, Spinner } from "../ui";
import { API } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { Repo } from "../../types";
import { AccessGovernanceManager } from "../governance/AccessGovernanceManager";
import type {
  SelectedGovernanceTeam,
  SelectedGovernanceMember,
} from "../governance/AccessGovernanceManager";

interface CreateRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (repo: Repo, isReady?: boolean, diagnosis?: any) => void;
  defaultOwner?: string;
}

export const CreateRepoModal: React.FC<CreateRepoModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  defaultOwner,
}) => {
  const { user } = useAuth();
  const { orgs: contextOrgs, repos } = useWorkspace();

  const [repoName, setRepoName] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<string>("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [enableProtection, setEnableProtection] = useState(true);
  const [requiredApprovals, setRequiredApprovals] = useState(1);
  const [selectedTeams, setSelectedTeams] = useState<SelectedGovernanceTeam[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SelectedGovernanceMember[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Monta a lista unificada de proprietários (Pessoal + Organizações)
  const availableOwners = React.useMemo(() => {
    const list: Array<{ id: string; name: string; isOrg: boolean }> = [];

    if (user?.login) {
      list.push({
        id: user.login,
        name: `@${user.login} (Pessoal • Acesso Total)`,
        isOrg: false,
      });
    }

    const seen = new Set<string>();
    if (user?.login) seen.add(user.login.toLowerCase());

    for (const o of contextOrgs || []) {
      if (o.login && !seen.has(o.login.toLowerCase())) {
        seen.add(o.login.toLowerCase());
        const orgLabel = (o as any).name || (o as any).full_name || o.login;
        const role = (o as any).role;
        const roleSuffix = role ? ` • ${role === 'admin' ? 'Admin' : 'Membro'}` : '';
        list.push({
          id: o.login,
          name: `${orgLabel} (Org${roleSuffix})`,
          isOrg: true,
        });
      }
    }

    for (const r of repos || []) {
      const owner = r.owner || (r.full_name ? r.full_name.split("/")[0] : "");
      if (owner && !seen.has(owner.toLowerCase()) && owner !== "local") {
        seen.add(owner.toLowerCase());
        list.push({
          id: owner,
          name: `${owner} (Org)`,
          isOrg: true,
        });
      }
    }

    return list;
  }, [user, contextOrgs, repos]);

  useEffect(() => {
    if (isOpen) {
      setRepoName("");
      setDescription("");
      setIsPrivate(true);
      setEnableProtection(true);
      setRequiredApprovals(1);
      setSelectedTeams([]);
      setSelectedMembers([]);
      setErrorMessage(null);

      if (defaultOwner && defaultOwner !== "all" && defaultOwner !== "local") {
        setSelectedOwner(defaultOwner);
      } else if (availableOwners.length > 0) {
        setSelectedOwner(availableOwners[0].id);
      }
    }
  }, [isOpen, defaultOwner, availableOwners]);

  if (!isOpen) return null;

  const currentOwner = selectedOwner || user?.login || "user";
  const previewFullName = `${currentOwner}/${repoName.trim() || "novo-repositorio"}`;

  const isAdminError =
    Boolean(errorMessage) &&
    (errorMessage?.toLowerCase().includes("admin access") ||
      errorMessage?.toLowerCase().includes("administrator") ||
      errorMessage?.toLowerCase().includes("admin") ||
      errorMessage?.toLowerCase().includes("permission"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = repoName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleanName) {
      setErrorMessage("Por favor, digite um nome para o repositório.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await API.createRepo({
        name: cleanName,
        owner: selectedOwner || user?.login,
        description: description.trim(),
        is_private: isPrivate,
        enable_protection: enableProtection,
        required_approvals: requiredApprovals,
        initialTeams: selectedTeams.map((t) => ({
          slug: t.slug,
          permission: t.permission,
        })),
        initialCollaborators: selectedMembers.map((m) => ({
          username: m.username,
          permission: m.permission,
        })),
      });

      if (res.ok && res.data?.repo) {
        onCreated(res.data.repo, res.data.is_ready, res.data.diagnosis);
        onClose();
      } else {
        setErrorMessage(
          (res.data as any)?.message ||
            (res.data as any)?.error ||
            "Não foi possível criar o repositório no GitHub.",
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Ocorreu um erro ao comunicar com a API do GitHub.",
      );
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
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #1e293b)",
          borderRadius: "16px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          boxShadow:
            "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                backgroundColor: "var(--color-primary-container, #eff6ff)",
                color: "var(--color-primary, #1a73e8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FolderPlus size={22} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "var(--color-on-surface, #0f172a)",
                }}
              >
                Novo Repositório
              </h2>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Crie um novo repositório no GitHub vinculado ao seu espaço
              </p>
            </div>
          </div>
          <IconButton size="sm" onClick={onClose} tooltip="Fechar">
            <X size={18} />
          </IconButton>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div
            style={{
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxHeight: "calc(80vh - 140px)",
              overflowY: "auto",
            }}
          >
            {errorMessage && (
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "10px",
                  backgroundColor: "var(--color-error-container, #fef2f2)",
                  border: "1px solid var(--color-error, #ef4444)",
                  color: "var(--color-on-error-container, #991b1b)",
                  fontSize: "13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, lineHeight: "1.4" }}>
                    <strong style={{ fontSize: "14px" }}>
                      {isAdminError ? "Permissão de Administrador ou Restrição da Organização" : "Erro ao criar repositório"}
                    </strong>
                    <div style={{ marginTop: "4px" }}>
                      {errorMessage}
                    </div>
                    {isAdminError && (
                      <div style={{ marginTop: "4px", fontSize: "12px", opacity: 0.9 }}>
                        Dica: Verifique se a organização permite que membros criem repositórios ou se há restrições para aplicativos de terceiros nas configurações da organização no GitHub.
                      </div>
                    )}
                  </div>
                </div>

                {isAdminError && (
                  <div
                    style={{
                      marginTop: "4px",
                      paddingTop: "10px",
                      borderTop: "1px solid rgba(239, 68, 68, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    {user?.login && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOwner(user.login);
                          setErrorMessage(null);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          backgroundColor: "var(--color-primary, #1a73e8)",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <User size={13} />
                        Criar na Conta Pessoal (@{user.login})
                      </button>
                    )}

                    {selectedOwner && (
                      <a
                        href={`https://github.com/organizations/${selectedOwner}/settings/oauth_application_policy`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          color: "var(--color-error, #ef4444)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          fontSize: "12px",
                          fontWeight: 600,
                          textDecoration: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <ExternalLink size={13} />
                        Autorizar App na Org
                      </a>
                    )}

                    {selectedOwner && (
                      <a
                        href={`https://github.com/organizations/${selectedOwner}/repositories/new`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px",
                          borderRadius: "6px",
                          backgroundColor: "#ffffff",
                          color: "var(--color-on-surface, #0f172a)",
                          border: "1px solid var(--color-outline, #cbd5e1)",
                          fontSize: "12px",
                          fontWeight: 600,
                          textDecoration: "none",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <ExternalLink size={13} />
                        Criar no GitHub ({selectedOwner})
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Grid Owner + Name */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.6fr",
                gap: "12px",
              }}
            >
              <FormField label="Proprietário (Owner)">
                <select
                  id="create-repo-owner"
                  className="ui-input"
                  style={{
                    height: "38px",
                    width: "100%",
                    borderRadius: "8px",
                    border: "1px solid var(--color-outline, #cbd5e1)",
                    padding: "0 10px",
                    fontSize: "13px",
                    backgroundColor: "var(--color-surface, #ffffff)",
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                  value={selectedOwner}
                  onChange={(e) => setSelectedOwner(e.target.value)}
                >
                  {availableOwners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Nome do Repositório" required>
                <Input
                  id="create-repo-name"
                  placeholder="ex: design-system"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  required
                  autoFocus
                />
              </FormField>
            </div>

            {/* Live Preview Path */}
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                backgroundColor: "var(--color-surface-container, #f8fafc)",
                border: "1px dashed var(--color-outline-variant, #e2e8f0)",
                fontSize: "12px",
                color: "var(--color-on-surface-variant, #64748b)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span style={{ fontWeight: 600 }}>Caminho no GitHub:</span>
              <code
                style={{
                  color: "var(--color-primary, #1a73e8)",
                  fontWeight: 600,
                  backgroundColor: "var(--color-surface-container-high, #eff6ff)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                {previewFullName}
              </code>
            </div>

            {/* Description */}
            <FormField label="Descrição (Opcional)">
              <Input
                id="create-repo-desc"
                placeholder="ex: Especificações e documentação de arquitetura"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>

            {/* Approvals */}
            <FormField label="Aprovações de Governança">
              <select
                id="create-repo-approvals"
                className="ui-input"
                style={{
                  height: "38px",
                  width: "100%",
                  borderRadius: "8px",
                  border: "1px solid var(--color-outline, #cbd5e1)",
                  padding: "0 10px",
                  fontSize: "13px",
                  backgroundColor: "var(--color-surface, #ffffff)",
                  color: "var(--color-on-surface, #0f172a)",
                }}
                value={requiredApprovals}
                onChange={(e) => setRequiredApprovals(Number(e.target.value))}
              >
                <option value="1">1 aprovação obrigatória (Padrão)</option>
                <option value="2">2 aprovações obrigatórias (Alta Governança)</option>
              </select>
            </FormField>

            {/* Switches */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "4px",
                padding: "12px",
                borderRadius: "10px",
                backgroundColor: "var(--color-surface-container-low, #f8fafc)",
                border: "1px solid var(--color-outline-variant, #e2e8f0)",
              }}
            >
              <Switch
                id="create-repo-protection"
                checked={enableProtection}
                onChange={setEnableProtection}
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield size={14} color="#1a73e8" />
                    Bloquear branch <code>main</code> (Exige PR obrigatório)
                  </span>
                }
                description="Garante que nenhuma alteração direta seja feita sem revisão de governança"
              />

              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--color-outline-variant, #e2e8f0)",
                }}
              />

              <Switch
                id="create-repo-private"
                checked={isPrivate}
                onChange={setIsPrivate}
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isPrivate ? (
                      <Lock size={14} color="#d97706" />
                    ) : (
                      <Globe size={14} color="#10b981" />
                    )}
                    {isPrivate ? "Repositório Privado" : "Repositório Público"}
                  </span>
                }
                description={
                  isPrivate
                    ? "Apenas você e os membros autorizados da sua organização terão acesso"
                    : "Qualquer pessoa na internet poderá visualizar este repositório"
                }
              />
            </div>

            {/* Governança de Times e Colaboradores */}
            {selectedOwner && selectedOwner !== "local" && (
              <div
                style={{
                  paddingTop: "12px",
                  borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--color-on-surface, #0f172a)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "10px",
                  }}
                >
                  <Shield size={14} color="#1a73e8" />
                  Governança & Acessos Iniciais
                </span>
                <AccessGovernanceManager
                  orgLogin={selectedOwner}
                  mode="form"
                  selectedTeams={selectedTeams}
                  onChangeTeams={setSelectedTeams}
                  selectedMembers={selectedMembers}
                  onChangeMembers={setSelectedMembers}
                  compact={true}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
              backgroundColor: "var(--color-surface-container-low, #f8fafc)",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              id="btn-submit-create-repo-modal"
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting}
              disabled={!repoName.trim()}
              style={{ minWidth: "160px" }}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" /> Criando...
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Criar Repositório
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
