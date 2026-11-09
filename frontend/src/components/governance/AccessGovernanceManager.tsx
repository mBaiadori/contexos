import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Play,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Spinner, Button } from "../ui";
import { API } from "../../services/api";
import type {
  OrganizationTeamInfo,
  OrganizationMemberInfo,
  RepoTeamInfo,
  CollaboratorInfo,
  OrgTeamMemberInfo,
  GovernanceActionWorkflowStatus,
} from "../../types";

export interface SelectedGovernanceTeam {
  slug: string;
  name: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin" | string;
  members_count?: number;
}

export interface SelectedGovernanceMember {
  username: string;
  name?: string;
  avatar_url?: string;
  permission: "pull" | "triage" | "push" | "maintain" | "admin" | string;
  role?: string;
  is_owner?: boolean;
  status?: "active" | "pending" | string;
}

export interface AccessGovernanceManagerProps {
  /** Organização alvo para sincronizar times e membros */
  orgLogin: string;
  /** Nome do repositório (opcional para modo direto/live) */
  repoName?: string;
  /** Modo: 'org' (gerenciamento global da org), 'repo' (gerenciamento de acesso ao repo) ou 'form' (criando repo) */
  mode?: "org" | "repo" | "form" | "live";
  /** Estado de times selecionados (modo form) */
  selectedTeams?: SelectedGovernanceTeam[];
  /** Callback para alteração de times (modo form) */
  onChangeTeams?: (teams: SelectedGovernanceTeam[]) => void;
  /** Estado de membros selecionados (modo form) */
  selectedMembers?: SelectedGovernanceMember[];
  /** Callback para alteração de membros (modo form) */
  onChangeMembers?: (members: SelectedGovernanceMember[]) => void;
  /** Estilo de layout compacto para modais */
  compact?: boolean;
}

const PERMISSION_OPTIONS = [
  {
    id: "pull",
    label: "Leitura",
    description: "Visualizar e ler documentos do projeto",
    color: "#0284c7", // Sky
    bg: "rgba(2, 132, 199, 0.12)",
  },
  {
    id: "triage",
    label: "Triagem",
    description: "Criar tarefas, apontar pendências e gerenciar discussões",
    color: "#0d9488", // Teal
    bg: "rgba(13, 148, 136, 0.12)",
  },
  {
    id: "push",
    label: "Edição e Escrita",
    description: "Criar rascunhos, editar documentos e propor alterações",
    color: "#10b981", // Emerald
    bg: "rgba(16, 185, 129, 0.12)",
  },
  {
    id: "maintain",
    label: "Coordenação",
    description: "Revisar, aprovar e integrar propostas à versão oficial",
    color: "#8b5cf6", // Indigo / Purple
    bg: "rgba(139, 92, 246, 0.12)",
  },
  {
    id: "admin",
    label: "Administração",
    description: "Acesso total, governança e configurações do repositório",
    color: "#ec4899", // Rose / Pink
    bg: "rgba(236, 72, 153, 0.12)",
  },
];

export const AccessGovernanceManager: React.FC<
  AccessGovernanceManagerProps
> = ({
  orgLogin,
  repoName,
  mode = "repo",
  selectedTeams = [],
  onChangeTeams,
  selectedMembers = [],
  onChangeMembers,
  compact = false,
}) => {
  const isOrgMode = mode === "org";
  const isFormMode = mode === "form";
  const isLiveRepoMode = mode === "repo" || mode === "live";

  const [activeTab, setActiveTab] = useState<
    "teams" | "members" | "repo_access" | "actions"
  >(isOrgMode ? "teams" : "repo_access");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dados remotos disponíveis na Org do GitHub
  const [orgTeams, setOrgTeams] = useState<OrganizationTeamInfo[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrganizationMemberInfo[]>([]);

  // Dados do repositório
  const [liveTeams, setLiveTeams] = useState<RepoTeamInfo[]>([]);
  const [liveCollaborators, setLiveCollaborators] = useState<
    CollaboratorInfo[]
  >([]);

  // Estado para criação de time
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamPrivacy, setNewTeamPrivacy] = useState<"closed" | "secret">(
    "closed",
  );

  // Estado para convidar membro para a Org
  const [showInviteOrgMember, setShowInviteOrgMember] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<"direct_member" | "admin">(
    "direct_member",
  );

  // Estado para gerenciar membros de um time específico
  const [expandedTeamSlug, setExpandedTeamSlug] = useState<string | null>(null);
  const [teamMembersList, setTeamMembersList] = useState<OrgTeamMemberInfo[]>(
    [],
  );
  const [isLoadingTeamMembers, setIsLoadingTeamMembers] = useState(false);
  const [addTeamMemberUsername, setAddTeamMemberUsername] = useState("");

  // Estado do GitHub Actions Workflow
  const [workflowStatus, setWorkflowStatus] =
    useState<GovernanceActionWorkflowStatus | null>(null);
  const [isInstallingWorkflow, setIsInstallingWorkflow] = useState(false);

  // Notificação temporária de sucesso
  const showFeedback = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Carrega dados da Organização e Repositório
  const fetchGovernanceData = async () => {
    if (!orgLogin || orgLogin === "local" || orgLogin === "all") return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [teamsRes, membersRes] = await Promise.all([
        API.getOrgTeams(orgLogin),
        API.getOrgMembers(orgLogin),
      ]);

      if (teamsRes.ok && teamsRes.data?.teams) {
        setOrgTeams(teamsRes.data.teams);
      }
      if (membersRes.ok && membersRes.data?.members) {
        setOrgMembers(membersRes.data.members);
      }

      if (isLiveRepoMode && repoName) {
        const [repoTeamsRes, collabRes, wfRes] = await Promise.all([
          API.getRepoTeams(orgLogin, repoName),
          API.getGovernanceCollaborators(repoName),
          API.getGovernanceWorkflow(repoName),
        ]);
        if (repoTeamsRes.ok && repoTeamsRes.data?.teams) {
          setLiveTeams(repoTeamsRes.data.teams);
        }
        if (collabRes.ok && collabRes.data?.collaborators) {
          setLiveCollaborators(collabRes.data.collaborators as any);
        }
        if (wfRes.ok && wfRes.data) {
          setWorkflowStatus(wfRes.data);
        }
      }
    } catch (err: any) {
      console.warn("[AccessGovernanceManager] Falha ao carregar dados:", err);
      setErrorMsg("Não foi possível sincronizar governança com o GitHub.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGovernanceData();
  }, [orgLogin, repoName, mode]);

  // Carregar membros de um time ao expandir
  const handleToggleTeamMembers = async (teamSlug: string) => {
    if (expandedTeamSlug === teamSlug) {
      setExpandedTeamSlug(null);
      return;
    }
    setExpandedTeamSlug(teamSlug);
    setIsLoadingTeamMembers(true);
    try {
      const res = await API.getOrgTeamMembers(orgLogin, teamSlug);
      if (res.ok && res.data?.members) {
        setTeamMembersList(res.data.members);
      }
    } catch {
      setTeamMembersList([]);
    } finally {
      setIsLoadingTeamMembers(false);
    }
  };

  // Criar novo time na organização
  const handleCreateOrgTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setIsMutating(true);
    setErrorMsg(null);
    try {
      const res = await API.createOrgTeam({
        org: orgLogin,
        name: newTeamName.trim(),
        description: newTeamDesc.trim(),
        privacy: newTeamPrivacy,
      });
      if (res.ok) {
        showFeedback(
          res.data?.message || "Time criado com sucesso na organização!",
        );
        setNewTeamName("");
        setNewTeamDesc("");
        setShowCreateTeam(false);
        fetchGovernanceData();
      } else {
        setErrorMsg(res.data?.message || "Falha ao criar time na organização.");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Excluir time da organização
  const handleDeleteOrgTeam = async (teamSlug: string) => {
    if (
      !confirm(
        `Tem certeza de que deseja excluir o time @${orgLogin}/${teamSlug}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setIsMutating(true);
    try {
      const res = await API.deleteOrgTeam(orgLogin, teamSlug);
      if (res.ok) {
        showFeedback(`Time @${orgLogin}/${teamSlug} excluído.`);
        fetchGovernanceData();
      } else {
        setErrorMsg(res.data?.message || "Falha ao excluir time.");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Adicionar membro ao time
  const handleAddMemberToTeam = async (teamSlug: string) => {
    if (!addTeamMemberUsername.trim()) return;
    setIsMutating(true);
    try {
      const res = await API.addMemberToOrgTeam(
        orgLogin,
        teamSlug,
        addTeamMemberUsername.trim(),
      );
      if (res.ok) {
        showFeedback(
          `@${addTeamMemberUsername} adicionado ao time @${teamSlug}.`,
        );
        setAddTeamMemberUsername("");
        const refreshed = await API.getOrgTeamMembers(orgLogin, teamSlug);
        if (refreshed.ok && refreshed.data?.members) {
          setTeamMembersList(refreshed.data.members);
        }
      } else {
        setErrorMsg(res.data?.message || "Falha ao adicionar membro ao time.");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Remover membro do time
  const handleRemoveMemberFromTeam = async (
    teamSlug: string,
    username: string,
  ) => {
    setIsMutating(true);
    try {
      const res = await API.removeMemberFromOrgTeam(
        orgLogin,
        teamSlug,
        username,
      );
      if (res.ok) {
        showFeedback(`@${username} removido do time @${teamSlug}.`);
        setTeamMembersList((prev) =>
          prev.filter((m) => m.login.toLowerCase() !== username.toLowerCase()),
        );
      } else {
        setErrorMsg(res.data?.message || "Falha ao remover membro do time.");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Convidar membro para a organização
  const handleInviteOrgMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setIsMutating(true);
    setErrorMsg(null);
    try {
      const res = await API.inviteOrgMember({
        org: orgLogin,
        username: inviteUsername.trim(),
        role: inviteRole,
      });
      if (res.ok) {
        showFeedback(`Convite enviado com sucesso para @${inviteUsername}!`);
        setInviteUsername("");
        setShowInviteOrgMember(false);
        fetchGovernanceData();
      } else {
        setErrorMsg(
          res.data?.message || "Falha ao enviar convite para a organização.",
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Remover membro da organização
  const handleRemoveOrgMember = async (username: string) => {
    if (!confirm(`Deseja remover @${username} da organização ${orgLogin}?`))
      return;
    setIsMutating(true);
    try {
      const res = await API.removeOrgMember(orgLogin, username);
      if (res.ok) {
        showFeedback(`@${username} removido da organização.`);
        fetchGovernanceData();
      } else {
        setErrorMsg(
          res.data?.message || "Falha ao remover membro da organização.",
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsMutating(false);
    }
  };

  // Atribuir time ao repositório
  const handleAddTeamToRepo = async (team: OrganizationTeamInfo) => {
    const defaultPerm = (team.permission as any) || "push";
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.addTeamToRepo({
          org: orgLogin,
          teamSlug: team.slug,
          owner: orgLogin,
          repo: repoName,
          permission: defaultPerm,
        });
        if (res.ok) {
          showFeedback(`Time @${team.slug} associado ao repositório.`);
          fetchGovernanceData();
        } else {
          setErrorMsg(
            res.data?.message || "Falha ao associar time ao repositório.",
          );
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeTeams) {
      onChangeTeams([
        ...selectedTeams,
        {
          slug: team.slug,
          name: team.name,
          permission: defaultPerm,
          members_count: team.members_count,
        },
      ]);
    }
  };

  // Atualizar permissão de time no repositório
  const handleUpdateTeamPerm = async (teamSlug: string, permission: string) => {
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.addTeamToRepo({
          org: orgLogin,
          teamSlug,
          owner: orgLogin,
          repo: repoName,
          permission,
        });
        if (res.ok) {
          showFeedback(
            `Permissão do time @${teamSlug} atualizada para '${permission}'.`,
          );
          fetchGovernanceData();
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeTeams) {
      onChangeTeams(
        selectedTeams.map((t) =>
          t.slug === teamSlug ? { ...t, permission } : t,
        ),
      );
    }
  };

  // Remover time do repositório
  const handleRemoveTeamFromRepo = async (teamSlug: string) => {
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.removeTeamFromRepo({
          org: orgLogin,
          teamSlug,
          owner: orgLogin,
          repo: repoName,
        });
        if (res.ok) {
          showFeedback(`Time @${teamSlug} removido do repositório.`);
          fetchGovernanceData();
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeTeams) {
      onChangeTeams(selectedTeams.filter((t) => t.slug !== teamSlug));
    }
  };

  // Adicionar colaborador direto / Outside Collaborator
  const handleAddCollaborator = async (
    username: string,
    permission: string = "push",
  ) => {
    if (!username.trim()) return;
    const cleanUser = username.trim().replace(/^@/, "");
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.inviteCollaborator({
          username: cleanUser,
          permission: permission as any,
          repo: repoName,
        });
        if (res.ok) {
          showFeedback(
            `Colaborador @${cleanUser} convidado com permissão '${permission}'.`,
          );
          fetchGovernanceData();
        } else {
          setErrorMsg(res.data?.message || "Falha ao convidar colaborador.");
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeMembers) {
      onChangeMembers([
        ...selectedMembers,
        {
          username: cleanUser,
          name: cleanUser,
          avatar_url: `https://github.com/${cleanUser}.png`,
          permission,
        },
      ]);
    }
  };

  // Atualizar permissão de colaborador
  const handleUpdateCollaboratorPerm = async (
    username: string,
    permission: string,
  ) => {
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.updateCollaboratorClearance({
          username,
          permission,
          repo: repoName,
        });
        if (res.ok) {
          showFeedback(
            `Permissão de @${username} atualizada para '${permission}'.`,
          );
          fetchGovernanceData();
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeMembers) {
      onChangeMembers(
        selectedMembers.map((m) =>
          m.username === username ? { ...m, permission } : m,
        ),
      );
    }
  };

  // Remover colaborador do repositório
  const handleRemoveCollaborator = async (username: string) => {
    if (!confirm(`Remover acesso de @${username} a este repositório?`)) return;
    if (isLiveRepoMode && repoName) {
      setIsMutating(true);
      try {
        const res = await API.removeCollaborator(username, repoName);
        if (res.ok) {
          showFeedback(`Colaborador @${username} removido.`);
          fetchGovernanceData();
        }
      } catch (err: any) {
        setErrorMsg(err.message);
      } finally {
        setIsMutating(false);
      }
    } else if (onChangeMembers) {
      onChangeMembers(selectedMembers.filter((m) => m.username !== username));
    }
  };

  // Instalar workflow de GitHub Actions
  const handleInstallWorkflow = async () => {
    if (!repoName) return;
    setIsInstallingWorkflow(true);
    try {
      const res = await API.installGovernanceWorkflow(repoName);
      if (res.ok) {
        showFeedback(
          res.data?.message || "Workflow de governança instalado com sucesso!",
        );
        const updated = await API.getGovernanceWorkflow(repoName);
        if (updated.ok && updated.data) {
          setWorkflowStatus(updated.data);
        }
      } else {
        setErrorMsg("Falha ao instalar workflow de governança no repositório.");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsInstallingWorkflow(false);
    }
  };

  const getPermConfig = (permId: string) => {
    return (
      PERMISSION_OPTIONS.find((p) => p.id === permId) || PERMISSION_OPTIONS[2]
    );
  };

  // Listas correntes
  const currentRepoTeams = isFormMode
    ? selectedTeams
    : liveTeams.map((t) => ({
        slug: t.slug,
        name: t.name,
        permission: t.permission || "push",
        members_count: (t as any).members_count || 0,
      }));

  const currentRepoCollaborators = isFormMode
    ? selectedMembers
    : liveCollaborators.map((c) => ({
        username: c.login,
        name: c.role || c.login,
        avatar_url: c.avatar_url,
        permission: c.permission || "push",
        is_owner: c.is_owner,
        status: c.status,
      }));

  const assignedTeamSlugs = new Set(
    currentRepoTeams.map((t) => t.slug.toLowerCase()),
  );
  const availableTeamsForRepo = orgTeams.filter(
    (t) =>
      !assignedTeamSlugs.has(t.slug.toLowerCase()) &&
      (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.slug.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  return (
    <div
      className={`access-governance-manager ${compact ? "compact-layout" : ""}`}
    >
      {/* Abas Superiores com Badges */}
      <div className="access-gov-tabs">
        <div className="access-gov-tabs-left">
          {isOrgMode ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("teams");
                  setSearchQuery("");
                }}
                className={`access-gov-tab-btn ${activeTab === "teams" ? "active" : ""}`}
              >
                <Users size={14} />
                Times da Org ({orgTeams.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("members");
                  setSearchQuery("");
                }}
                className={`access-gov-tab-btn ${activeTab === "members" ? "active" : ""}`}
              >
                <UserCheck size={14} />
                Membros da Org ({orgMembers.length})
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("repo_access");
                  setSearchQuery("");
                }}
                className={`access-gov-tab-btn ${activeTab === "repo_access" ? "active" : ""}`}
              >
                <ShieldCheck size={14} />
                Permissões do Repositório (
                {currentRepoTeams.length + currentRepoCollaborators.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("teams");
                  setSearchQuery("");
                }}
                className={`access-gov-tab-btn ${activeTab === "teams" ? "active" : ""}`}
              >
                <Users size={14} />
                Times da Org ({orgTeams.length})
              </button>
              {repoName && (
                <button
                  type="button"
                  onClick={() => setActiveTab("actions")}
                  className={`access-gov-tab-btn ${activeTab === "actions" ? "active" : ""}`}
                >
                  <Play size={14} />
                  GitHub Actions Gatekeeper
                </button>
              )}
            </>
          )}
        </div>

        {isLoading && (
          <div className="access-gov-syncing">
            <Spinner size="sm" />
            <span>Sincronizando...</span>
          </div>
        )}
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="access-gov-error">
          <ShieldAlert size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            color: "#065f46",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle size={15} style={{ color: "#10b981", flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ABA 1: TIMES DA ORGANIZAÇÃO (Criação, Membros e Gestão) */}
      {activeTab === "teams" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span className="access-gov-section-title" style={{ margin: 0 }}>
              Times da Organização @{orgLogin}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCreateTeam(!showCreateTeam)}
              icon={<Plus size={13} />}
            >
              Novo Time
            </Button>
          </div>

          {/* Form para Criação de Time */}
          {showCreateTeam && (
            <form
              onSubmit={handleCreateOrgTeam}
              style={{
                background:
                  "var(--md-sys-color-surface-container-low, #f8fafc)",
                border: "1px solid var(--border-subtle, #e2e8f0)",
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-heading, #0f172a)",
                }}
              >
                Criar Novo Time no GitHub
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Nome do Time (ex: Engenharia, Frontend, QA)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  required
                  className="access-gov-search-input"
                  style={{ flex: 1 }}
                />
                <select
                  value={newTeamPrivacy}
                  onChange={(e) => setNewTeamPrivacy(e.target.value as any)}
                  className="access-gov-select"
                  style={{ width: "130px" }}
                >
                  <option value="closed">Visível (Closed)</option>
                  <option value="secret">Secreto (Secret)</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="Descrição opcional do time..."
                value={newTeamDesc}
                onChange={(e) => setNewTeamDesc(e.target.value)}
                className="access-gov-search-input"
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateTeam(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={isMutating || !newTeamName.trim()}
                >
                  {isMutating ? <Spinner size="sm" /> : "Criar Time na Org"}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de Times da Org com Membros Expansíveis */}
          {orgTeams.length > 0 ? (
            <div className="access-gov-list">
              {orgTeams.map((team) => {
                const isExpanded = expandedTeamSlug === team.slug;
                return (
                  <div
                    key={team.slug}
                    style={{
                      background: "var(--md-sys-color-surface, #ffffff)",
                      border: "1px solid var(--border-subtle, #e2e8f0)",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div className="access-gov-icon-box">
                          <Users size={14} />
                        </div>
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span className="access-gov-name">{team.name}</span>
                            <span
                              style={{
                                fontSize: "10.5px",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "rgba(99, 102, 241, 0.1)",
                                color: "#4f46e5",
                                fontWeight: 600,
                              }}
                            >
                              @{orgLogin}/{team.slug}
                            </span>
                          </div>
                          {team.description && (
                            <span
                              className="access-gov-sub"
                              style={{ display: "block", marginTop: "2px" }}
                            >
                              {team.description}
                            </span>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTeamMembers(team.slug)}
                          className="access-gov-tab-btn"
                          style={{ border: "1px solid #e2e8f0" }}
                        >
                          <UserCheck size={12} />
                          <span>Membros</span>
                          {isExpanded ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteOrgTeam(team.slug)}
                          disabled={isMutating}
                          className="access-gov-btn-delete"
                          title="Excluir time"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Membros do Time Expansíveis */}
                    {isExpanded && (
                      <div
                        style={{
                          borderTop: "1px solid var(--border-subtle, #e2e8f0)",
                          background:
                            "var(--md-sys-color-surface-container-lowest, #fcfdfe)",
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            marginBottom: "10px",
                          }}
                        >
                          <input
                            type="text"
                            placeholder="Adicionar membro ao time (@username)..."
                            value={addTeamMemberUsername}
                            onChange={(e) =>
                              setAddTeamMemberUsername(e.target.value)
                            }
                            className="access-gov-search-input"
                            style={{ flex: 1 }}
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAddMemberToTeam(team.slug)}
                            disabled={
                              isMutating || !addTeamMemberUsername.trim()
                            }
                          >
                            <Plus size={12} /> Adicionar
                          </Button>
                        </div>

                        {isLoadingTeamMembers ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "11px",
                              color: "#64748b",
                            }}
                          >
                            <Spinner size="sm" /> Carregando membros...
                          </div>
                        ) : teamMembersList.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "6px",
                            }}
                          >
                            {teamMembersList.map((m) => (
                              <div
                                key={m.login}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  padding: "3px 8px",
                                  borderRadius: "9999px",
                                  background: "rgba(2, 132, 199, 0.08)",
                                  border: "1px solid rgba(2, 132, 199, 0.25)",
                                  fontSize: "11px",
                                  color: "#0369a1",
                                }}
                              >
                                <img
                                  src={m.avatar_url}
                                  alt={m.login}
                                  style={{
                                    width: "16px",
                                    height: "16px",
                                    borderRadius: "9999px",
                                  }}
                                />
                                <span>@{m.login}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveMemberFromTeam(
                                      team.slug,
                                      m.login,
                                    )
                                  }
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    color: "#94a3b8",
                                    padding: "0 2px",
                                    display: "inline-flex",
                                  }}
                                  title="Remover do time"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#94a3b8",
                              fontStyle: "italic",
                            }}
                          >
                            Nenhum membro neste time ainda. Adicione membros
                            acima.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="access-gov-empty">
              Nenhum time criado nesta organização ainda. Use o botão "Novo
              Time" acima para organizar seus times de desenvolvimento.
            </div>
          )}
        </div>
      )}

      {/* ABA 2: MEMBROS DA ORGANIZAÇÃO & CONVITES */}
      {activeTab === "members" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span className="access-gov-section-title" style={{ margin: 0 }}>
              Membros Oficiais da Organização
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowInviteOrgMember(!showInviteOrgMember)}
              icon={<UserPlus size={13} />}
            >
              Convidar Membro
            </Button>
          </div>

          {/* Form para Convidar Membro para a Org */}
          {showInviteOrgMember && (
            <form
              onSubmit={handleInviteOrgMember}
              style={{
                background:
                  "var(--md-sys-color-surface-container-low, #f8fafc)",
                border: "1px solid var(--border-subtle, #e2e8f0)",
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--text-heading, #0f172a)",
                }}
              >
                Enviar Convite de Ingresso na Organização
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Nome de usuário do GitHub ou E-mail (@user ou user@email.com)"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  required
                  className="access-gov-search-input"
                  style={{ flex: 1 }}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="access-gov-select"
                  style={{ width: "160px" }}
                >
                  <option value="direct_member">Membro Regular</option>
                  <option value="admin">Owner / Admin</option>
                </select>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInviteOrgMember(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={isMutating || !inviteUsername.trim()}
                >
                  {isMutating ? <Spinner size="sm" /> : "Enviar Convite"}
                </Button>
              </div>
            </form>
          )}

          {/* Lista de Membros */}
          <div className="access-gov-list">
            {orgMembers.map((member) => (
              <div key={member.login} className="access-gov-row">
                <div className="access-gov-row-left">
                  <img
                    src={member.avatar_url}
                    alt={member.login}
                    className="access-gov-avatar"
                  />
                  <div className="access-gov-info">
                    <span className="access-gov-name">@{member.login}</span>
                    <span className="access-gov-sub">
                      {member.role === "admin"
                        ? "👑 Owner da Organização"
                        : "Membro Regular"}
                    </span>
                  </div>
                </div>

                <div className="access-gov-row-right">
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      fontWeight: 600,
                      background:
                        member.role === "admin"
                          ? "rgba(236, 72, 153, 0.12)"
                          : "rgba(2, 132, 199, 0.12)",
                      color: member.role === "admin" ? "#ec4899" : "#0284c7",
                    }}
                  >
                    {member.role === "admin" ? "Owner / Admin" : "Member"}
                  </span>

                  {member.role !== "admin" && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOrgMember(member.login)}
                      disabled={isMutating}
                      className="access-gov-btn-delete"
                      title="Remover membro da organização"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 3: ACESSO AO REPOSITÓRIO (Times & Colaboradores Diretos/Externos) */}
      {activeTab === "repo_access" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Seção de Times com Acesso ao Repositório */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span className="access-gov-section-title" style={{ margin: 0 }}>
                🛡️ Times com Acesso ao Repositório ({currentRepoTeams.length})
              </span>
            </div>

            {currentRepoTeams.length > 0 ? (
              <div className="access-gov-list">
                {currentRepoTeams.map((team) => {
                  const permCfg = getPermConfig(team.permission);
                  return (
                    <div key={team.slug} className="access-gov-row">
                      <div className="access-gov-row-left">
                        <div className="access-gov-icon-box">
                          <Users size={14} />
                        </div>
                        <div className="access-gov-info">
                          <span className="access-gov-name">{team.name}</span>
                          <span className="access-gov-sub">
                            @{orgLogin}/{team.slug}
                          </span>
                        </div>
                      </div>

                      <div className="access-gov-row-right">
                        <select
                          value={team.permission}
                          onChange={(e) =>
                            handleUpdateTeamPerm(team.slug, e.target.value)
                          }
                          disabled={isMutating}
                          style={{
                            color: permCfg.color,
                            backgroundColor: permCfg.bg,
                            borderColor: `${permCfg.color}40`,
                          }}
                          className="access-gov-select"
                        >
                          {PERMISSION_OPTIONS.map((opt) => (
                            <option
                              key={opt.id}
                              value={opt.id}
                              style={{
                                background: "#ffffff",
                                color: "#0f172a",
                              }}
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => handleRemoveTeamFromRepo(team.slug)}
                          disabled={isMutating}
                          className="access-gov-btn-delete"
                          title="Remover time do repositório"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="access-gov-empty">
                Nenhum time associado a este repositório. Atribua times da
                organização abaixo.
              </div>
            )}

            {/* Sugestões de Times para Adicionar */}
            {availableTeamsForRepo.length > 0 && (
              <div
                className="access-gov-search-section"
                style={{ marginTop: "10px" }}
              >
                <span className="access-gov-section-title">
                  Adicionar Time da Org ao Repositório
                </span>
                <div className="access-gov-suggest-list">
                  {availableTeamsForRepo.map((team) => (
                    <div key={team.slug} className="access-gov-suggest-item">
                      <div
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          paddingRight: "8px",
                        }}
                      >
                        <div className="access-gov-name">{team.name}</div>
                        <div className="access-gov-sub">
                          @{orgLogin}/{team.slug}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTeamToRepo(team)}
                        disabled={isMutating}
                        className="access-gov-suggest-btn"
                      >
                        <Plus size={12} /> Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Seção de Colaboradores Individuais / Outside Collaborators */}
          <div style={{ marginTop: "8px" }}>
            <span className="access-gov-section-title">
              👤 Colaboradores Individuais & Externos (
              {currentRepoCollaborators.length})
            </span>

            {currentRepoCollaborators.length > 0 ? (
              <div className="access-gov-list">
                {currentRepoCollaborators.map((c) => {
                  const permCfg = getPermConfig(c.permission);
                  return (
                    <div key={c.username} className="access-gov-row">
                      <div className="access-gov-row-left">
                        {c.avatar_url ? (
                          <img
                            src={c.avatar_url}
                            alt={c.username}
                            className="access-gov-avatar"
                          />
                        ) : (
                          <div className="access-gov-avatar-fallback">
                            {c.username.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="access-gov-info">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span className="access-gov-name">
                              @{c.username}
                            </span>
                            {c.is_owner && (
                              <span
                                style={{
                                  fontSize: "10px",
                                  background: "rgba(236,72,153,0.15)",
                                  color: "#ec4899",
                                  padding: "1px 5px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                }}
                              >
                                Owner
                              </span>
                            )}
                          </div>
                          {c.name && c.name !== c.username && (
                            <span className="access-gov-sub">{c.name}</span>
                          )}
                        </div>
                      </div>

                      <div className="access-gov-row-right">
                        {!c.is_owner ? (
                          <>
                            <select
                              value={c.permission}
                              onChange={(e) =>
                                handleUpdateCollaboratorPerm(
                                  c.username,
                                  e.target.value,
                                )
                              }
                              disabled={isMutating}
                              style={{
                                color: permCfg.color,
                                backgroundColor: permCfg.bg,
                                borderColor: `${permCfg.color}40`,
                              }}
                              className="access-gov-select"
                            >
                              {PERMISSION_OPTIONS.map((opt) => (
                                <option
                                  key={opt.id}
                                  value={opt.id}
                                  style={{
                                    background: "#ffffff",
                                    color: "#0f172a",
                                  }}
                                >
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveCollaborator(c.username)
                              }
                              disabled={isMutating}
                              className="access-gov-btn-delete"
                              title="Remover acesso do colaborador"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#64748b",
                              fontWeight: 500,
                            }}
                          >
                            Acesso Total
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="access-gov-empty">
                Nenhum colaborador individual adicionado diretamente.
              </div>
            )}

            {/* Campo de Convite Direto para o Repositório */}
            <div
              className="access-gov-search-section"
              style={{ marginTop: "10px" }}
            >
              <span className="access-gov-section-title">
                Convidar Colaborador Externo
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Nome de usuário do GitHub (@username)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="access-gov-search-input"
                  style={{ flex: 1 }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (searchQuery.trim()) {
                      handleAddCollaborator(searchQuery.trim(), "push");
                      setSearchQuery("");
                    }
                  }}
                  disabled={isMutating || !searchQuery.trim()}
                >
                  <Plus size={12} /> Convidar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: GITHUB ACTIONS GATEKEEPER */}
      {activeTab === "actions" && repoName && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div
            style={{
              background: "var(--md-sys-color-surface-container-low, #f8fafc)",
              border: "1px solid var(--border-subtle, #e2e8f0)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  background: workflowStatus?.installed
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(245, 158, 11, 0.15)",
                  color: workflowStatus?.installed ? "#10b981" : "#f59e0b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {workflowStatus?.installed ? (
                  <ShieldCheck size={20} />
                ) : (
                  <ShieldAlert size={20} />
                )}
              </div>
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontSize: "13.5px",
                    fontWeight: 600,
                    color: "var(--text-heading, #0f172a)",
                  }}
                >
                  GitHub Actions Governance Gatekeeper
                </h4>
                <p
                  style={{
                    margin: "2px 0 0",
                    fontSize: "11.5px",
                    color: "var(--text-muted, #64748b)",
                  }}
                >
                  {workflowStatus?.installed
                    ? "Workflow ativo em .github/workflows/governance-check.yml validando CODEOWNERS, Quorum e Secrets nos PRs."
                    : "Ainda não instalado. Proteja seus repositórios privados com validação automatizada de CI/CD."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                marginTop: "12px",
              }}
            >
              <Button
                variant={workflowStatus?.installed ? "secondary" : "primary"}
                size="sm"
                onClick={handleInstallWorkflow}
                disabled={isInstallingWorkflow}
                icon={
                  workflowStatus?.installed ? (
                    <CheckCircle size={13} />
                  ) : (
                    <Play size={13} />
                  )
                }
              >
                {isInstallingWorkflow
                  ? "Instalando..."
                  : workflowStatus?.installed
                    ? "Reinstalar / Atualizar Workflow"
                    : "Instalar Workflow de Governança no Repositório"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
