import React, { useState, useEffect } from "react";
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  CheckCircle,
  Play,
  X,
} from "lucide-react";
import { Spinner } from "../ui";
import { API } from "../../services/api";
import type {
  OrganizationTeamInfo,
  OrganizationMemberInfo,
  RepoTeamInfo,
  CollaboratorInfo,
  OrgTeamMemberInfo,
  GovernanceActionWorkflowStatus,
} from "../../types";
import {
  type SelectedGovernanceTeam,
  type SelectedGovernanceMember,
  type AccessGovernanceManagerProps,
  PERMISSION_OPTIONS,
} from "./governance-types";
import { GovernanceTeamsTab } from "./tabs/GovernanceTeamsTab";
import { GovernanceMembersTab } from "./tabs/GovernanceMembersTab";
import { GovernanceRepoAccessTab } from "./tabs/GovernanceRepoAccessTab";
import { GovernanceActionsTab } from "./tabs/GovernanceActionsTab";

export type {
  SelectedGovernanceTeam,
  SelectedGovernanceMember,
  AccessGovernanceManagerProps,
};

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
        setOrgTeams(teamsRes.data.teams as unknown as OrganizationTeamInfo[]);
      }
      if (membersRes.ok && membersRes.data?.members) {
        setOrgMembers(membersRes.data.members as unknown as OrganizationMemberInfo[]);
      }

      if (isLiveRepoMode && repoName) {
        const [repoTeamsRes, collabRes, wfRes] = await Promise.all([
          API.getRepoTeams(orgLogin, repoName),
          API.getGovernanceCollaborators(repoName),
          API.getGovernanceWorkflow(repoName),
        ]);
        if (repoTeamsRes.ok && repoTeamsRes.data?.teams) {
          setLiveTeams(repoTeamsRes.data.teams as unknown as RepoTeamInfo[]);
        }
        if (collabRes.ok && collabRes.data?.collaborators) {
          setLiveCollaborators(collabRes.data.collaborators as Parameters<typeof setLiveCollaborators>[0]);
        }
        if (wfRes.ok && wfRes.data) {
          setWorkflowStatus(wfRes.data);
        }
      }
    } catch (err: unknown) {
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
        setTeamMembersList(res.data.members as unknown as OrgTeamMemberInfo[]);
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
          setTeamMembersList(refreshed.data.members as unknown as OrgTeamMemberInfo[]);
        }
      } else {
        setErrorMsg(res.data?.message || "Falha ao adicionar membro ao time.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsMutating(false);
    }
  };

  // Atribuir time ao repositório
  const handleAddTeamToRepo = async (team: OrganizationTeamInfo) => {
    const defaultPerm = (team.permission as "pull" | "push" | "admin") || "push";
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
          permission: permission as "pull" | "push" | "admin",
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
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
        members_count: (t as { members_count?: number }).members_count || 0,
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
        <GovernanceTeamsTab
          orgLogin={orgLogin}
          showCreateTeam={showCreateTeam}
          setShowCreateTeam={setShowCreateTeam}
          newTeamName={newTeamName}
          setNewTeamName={setNewTeamName}
          newTeamPrivacy={newTeamPrivacy}
          setNewTeamPrivacy={setNewTeamPrivacy}
          newTeamDesc={newTeamDesc}
          setNewTeamDesc={setNewTeamDesc}
          handleCreateOrgTeam={handleCreateOrgTeam}
          orgTeams={orgTeams}
          expandedTeamSlug={expandedTeamSlug}
          handleToggleTeamMembers={handleToggleTeamMembers}
          handleDeleteOrgTeam={handleDeleteOrgTeam}
          addTeamMemberUsername={addTeamMemberUsername}
          setAddTeamMemberUsername={setAddTeamMemberUsername}
          handleAddMemberToTeam={handleAddMemberToTeam}
          handleRemoveMemberFromTeam={handleRemoveMemberFromTeam}
          isLoadingTeamMembers={isLoadingTeamMembers}
          teamMembersList={teamMembersList}
          isMutating={isMutating}
        />
      )}

      {/* ABA 2: MEMBROS DA ORGANIZAÇÃO & CONVITES */}
      {activeTab === "members" && (
        <GovernanceMembersTab
          showInviteOrgMember={showInviteOrgMember}
          setShowInviteOrgMember={setShowInviteOrgMember}
          inviteUsername={inviteUsername}
          setInviteUsername={setInviteUsername}
          inviteRole={inviteRole}
          setInviteRole={setInviteRole}
          handleInviteOrgMember={handleInviteOrgMember}
          orgMembers={orgMembers}
          handleRemoveOrgMember={handleRemoveOrgMember}
          isMutating={isMutating}
        />
      )}

      {/* ABA 3: ACESSO AO REPOSITÓRIO (Times & Colaboradores Diretos/Externos) */}
      {activeTab === "repo_access" && (
        <GovernanceRepoAccessTab
          currentRepoTeams={currentRepoTeams}
          orgLogin={orgLogin}
          getPermConfig={getPermConfig}
          handleUpdateTeamPerm={handleUpdateTeamPerm}
          handleRemoveTeamFromRepo={handleRemoveTeamFromRepo}
          availableTeamsForRepo={availableTeamsForRepo}
          handleAddTeamToRepo={handleAddTeamToRepo}
          currentRepoCollaborators={currentRepoCollaborators}
          handleUpdateCollaboratorPerm={handleUpdateCollaboratorPerm}
          handleRemoveCollaborator={handleRemoveCollaborator}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          handleAddCollaborator={handleAddCollaborator}
          isMutating={isMutating}
        />
      )}

      {/* ABA 4: GITHUB ACTIONS GATEKEEPER */}
      {activeTab === "actions" && repoName && (
        <GovernanceActionsTab
          workflowStatus={workflowStatus}
          handleInstallWorkflow={handleInstallWorkflow}
          isInstallingWorkflow={isInstallingWorkflow}
        />
      )}
    </div>
  );
};
