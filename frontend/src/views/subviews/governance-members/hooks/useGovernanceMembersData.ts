import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../../../context/AuthContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import type { CollaboratorInfo, OrganizationTeamInfo } from "../../../../types";
import type { GovernanceTab } from "../types";

export function useGovernanceMembersData() {
  const { user } = useAuth();
  const { activeRepo, activeOrg } = useWorkspace();

  // Active Tab
  const [activeTab, setActiveTab] = useState<GovernanceTab>("members");

  // Collaborators State
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [isLoadingCollabs, setIsLoadingCollabs] = useState<boolean>(false);
  const [githubAuthError, setGithubAuthError] = useState<string | null>(null);

  // Teams State (GitHub Free for Organizations)
  const [teams, setTeams] = useState<OrganizationTeamInfo[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamPrivacy, setNewTeamPrivacy] = useState<"closed" | "secret">("closed");

  // Branch Protection & Quorum State
  const [branchProtection, setBranchProtection] = useState<{
    enabled: boolean;
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
    enforce_admins?: boolean;
    allow_force_pushes?: boolean;
  } | null>(null);
  const [isApplyingProtection, setIsApplyingProtection] = useState(false);
  const [protectionFeedback, setProtectionFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [quorumRules, setQuorumRules] = useState<{
    min_approvals_default: number;
  }>({
    min_approvals_default: 1,
  });
  const [isSavingQuorum, setIsSavingQuorum] = useState(false);

  // GitHub Actions Governance Workflow State
  const [workflowStatus, setWorkflowStatus] = useState<{
    installed: boolean;
    path: string;
    content?: string;
  } | null>(null);
  const [isInstallingWorkflow, setIsInstallingWorkflow] = useState(false);
  const [workflowFeedback, setWorkflowFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Modals State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [invitePermission, setInvitePermission] = useState<string>("push");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [editingCollab, setEditingCollab] = useState<CollaboratorInfo | null>(null);
  const [editPermission, setEditPermission] = useState<string>("push");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editFeedback, setEditFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const orgLogin =
    activeOrg?.login ||
    (typeof activeRepo?.owner === "string"
      ? activeRepo.owner
      : (activeRepo?.owner as { login?: string } | undefined)?.login) ||
    user?.login ||
    "";
  const repoName = activeRepo?.name || "";

  const isAdmin = Boolean(
    activeRepo?.permissions?.admin ??
    (activeRepo?.is_owner ||
      activeRepo?.is_local ||
      (user?.login &&
        collaborators.some(
          (c) =>
            c.login === user.login && (c.is_owner || c.permission === "admin")
        )) ||
      false)
  );

  const isSoloMode = collaborators.length <= 1;

  // Carregar Colaboradores
  const fetchCollaborators = useCallback(async () => {
    if (!repoName) return;
    setIsLoadingCollabs(true);
    setGithubAuthError(null);
    try {
      const res = await API.getGovernanceCollaborators(repoName);
      if (res.ok && res.data?.collaborators) {
        setCollaborators(res.data.collaborators as Parameters<typeof setCollaborators>[0]);
      }
      if (res.data?.githubAuthError) {
        setGithubAuthError(res.data.githubAuthError);
      }
    } catch (err: unknown) {
      console.error("Erro ao carregar colaboradores:", err);
      setGithubAuthError(err instanceof Error ? err.message : "Erro ao conectar com o GitHub.");
    } finally {
      setIsLoadingCollabs(false);
    }
  }, [repoName]);

  // Carregar Equipes da Organização
  const fetchTeams = useCallback(async () => {
    if (!orgLogin) return;
    setIsLoadingTeams(true);
    try {
      const res = await API.getOrgTeams(orgLogin);
      if (res.ok && res.data?.teams) {
        setTeams(res.data.teams);
      }
    } catch (err) {
      console.error("Erro ao carregar equipes da org:", err);
    } finally {
      setIsLoadingTeams(false);
    }
  }, [orgLogin]);

  // Carregar Status de Branch Protection
  const fetchProtection = useCallback(async () => {
    if (!repoName) return;
    try {
      const res = await API.getBranchProtection(repoName);
      if (res.ok && res.data) {
        setBranchProtection(res.data);
      }
    } catch (err) {
      console.warn("Branch protection status unavailable:", err);
    }
  }, [repoName]);

  // Carregar Status do GitHub Actions Workflow
  const fetchWorkflowStatus = useCallback(async () => {
    if (!repoName) return;
    try {
      const res = await API.getGovernanceWorkflow(repoName);
      if (res.ok && res.data) {
        setWorkflowStatus(res.data);
      }
    } catch (err) {
      console.warn("Workflow status unavailable:", err);
    }
  }, [repoName]);

  // Carregar Quorum Rules
  const fetchQuorum = useCallback(async () => {
    if (!repoName) return;
    try {
      const res = await API.getQuorumRules(repoName);
      if (res.ok && res.data?.rules) {
        setQuorumRules({
          min_approvals_default: res.data.rules.min_approvals_default ?? 1,
        });
      }
    } catch (err) {
      console.warn("Quorum unavailable:", err);
    }
  }, [repoName]);

  useEffect(() => {
    fetchCollaborators();
    fetchTeams();
    fetchProtection();
    fetchWorkflowStatus();
    fetchQuorum();
  }, [
    fetchCollaborators,
    fetchTeams,
    fetchProtection,
    fetchWorkflowStatus,
    fetchQuorum,
  ]);

  // Salvar Quorum
  const handleSaveQuorum = async (minApprovals: number) => {
    setIsSavingQuorum(true);
    try {
      await API.updateQuorumRules({
        repo: repoName,
        rules: { min_approvals_default: minApprovals },
      });
      setQuorumRules({ min_approvals_default: minApprovals });
    } catch (err) {
      console.error("Erro ao salvar quórum:", err);
    } finally {
      setIsSavingQuorum(false);
    }
  };

  // Ativar Proteção de Branch
  const handleApplyProtection = async () => {
    setIsApplyingProtection(true);
    setProtectionFeedback(null);
    try {
      const res = await API.applyBranchProtection({
        repo: repoName,
        min_approvals: Math.max(1, quorumRules.min_approvals_default || 1),
        enforce_admins: false,
        dismiss_stale_reviews: true,
      });
      if (res.ok && res.data?.success) {
        setProtectionFeedback({
          type: "success",
          message: "Regras de proteção da branch 'main' aplicadas com sucesso no GitHub!",
        });
        await fetchProtection();
      } else {
        throw new Error(res.data?.error || "Falha ao aplicar proteção.");
      }
    } catch (err: unknown) {
      setProtectionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao aplicar proteção de branch no GitHub.",
      });
    } finally {
      setIsApplyingProtection(false);
    }
  };

  // Instalar Actions Workflow
  const handleInstallWorkflow = async () => {
    setIsInstallingWorkflow(true);
    setWorkflowFeedback(null);
    try {
      const res = await API.installGovernanceWorkflow(repoName);
      if (res.ok && res.data?.success) {
        setWorkflowFeedback({
          type: "success",
          message: "Workflow de Governança instalado em .github/workflows/governance-check.yml com sucesso!",
        });
        await fetchWorkflowStatus();
      } else {
        throw new Error("Falha ao instalar workflow.");
      }
    } catch (err: unknown) {
      setWorkflowFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao instalar workflow do GitHub Actions.",
      });
    } finally {
      setIsInstallingWorkflow(false);
    }
  };

  // Convidar Colaborador
  const handleSendInvite = async () => {
    if (!inviteUsername.trim() || !repoName) return;
    setIsInviting(true);
    setInviteFeedback(null);
    try {
      const res = await API.inviteCollaborator({
        repo: repoName,
        username: inviteUsername.trim(),
        permission: invitePermission,
      });
      if (res.ok && res.data?.success) {
        setInviteFeedback({
          type: "success",
          message: `Convite enviado para @${inviteUsername} com permissão ${invitePermission.toUpperCase()}!`,
        });
        setInviteUsername("");
        await fetchCollaborators();
        setTimeout(() => {
          setIsInviteModalOpen(false);
          setInviteFeedback(null);
        }, 1500);
      } else {
        throw new Error(res.data?.error || "Erro ao enviar convite.");
      }
    } catch (err: unknown) {
      setInviteFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao enviar convite.",
      });
    } finally {
      setIsInviting(false);
    }
  };

  // Editar Permissão
  const handleSaveEditCollab = async () => {
    if (!editingCollab || !repoName) return;
    setIsSavingEdit(true);
    setEditFeedback(null);
    try {
      const res = await API.updateCollaboratorClearance({
        repo: repoName,
        username: editingCollab.login,
        permission: editPermission,
      });
      if (res.ok && res.data?.success) {
        setEditFeedback({
          type: "success",
          message: `Permissão de @${editingCollab.login} atualizada para ${editPermission.toUpperCase()}!`,
        });
        await fetchCollaborators();
        setTimeout(() => {
          setEditingCollab(null);
          setEditFeedback(null);
        }, 1200);
      } else {
        throw new Error("Erro ao atualizar permissão.");
      }
    } catch (err: unknown) {
      setEditFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao atualizar permissão.",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Remover Colaborador
  const handleRemoveCollaborator = async (username: string) => {
    if (!window.confirm(`Tem certeza que deseja remover @${username} deste repositório?`)) {
      return;
    }
    try {
      await API.removeCollaborator(username, repoName);
      await fetchCollaborators();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao remover colaborador.");
    }
  };

  // Criar Equipe
  const handleCreateTeam = async () => {
    if (!newTeamName.trim() || !orgLogin) return;
    try {
      const res = await API.createOrgTeam({
        org: orgLogin,
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
        privacy: newTeamPrivacy,
      });
      if (res.ok && res.data?.success) {
        setIsCreateTeamModalOpen(false);
        setNewTeamName("");
        setNewTeamDesc("");
        await fetchTeams();
      } else {
        throw new Error(res.data?.message || "Falha ao criar equipe.");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao criar equipe.");
    }
  };

  // Excluir Equipe
  const handleDeleteTeam = async (teamSlug: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a equipe "${teamSlug}" da organização?`)) {
      return;
    }
    try {
      await API.deleteOrgTeam(orgLogin, teamSlug);
      await fetchTeams();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir equipe.");
    }
  };

  return {
    user,
    activeRepo,
    activeOrg,
    orgLogin,
    repoName,
    isAdmin,
    isSoloMode,
    activeTab,
    setActiveTab,
    collaborators,
    isLoadingCollabs,
    githubAuthError,
    fetchCollaborators,
    teams,
    isLoadingTeams,
    isCreateTeamModalOpen,
    setIsCreateTeamModalOpen,
    newTeamName,
    setNewTeamName,
    newTeamDesc,
    setNewTeamDesc,
    newTeamPrivacy,
    setNewTeamPrivacy,
    handleCreateTeam,
    handleDeleteTeam,
    branchProtection,
    isApplyingProtection,
    protectionFeedback,
    handleApplyProtection,
    quorumRules,
    isSavingQuorum,
    handleSaveQuorum,
    workflowStatus,
    isInstallingWorkflow,
    workflowFeedback,
    handleInstallWorkflow,
    isInviteModalOpen,
    setIsInviteModalOpen,
    inviteUsername,
    setInviteUsername,
    invitePermission,
    setInvitePermission,
    isInviting,
    inviteFeedback,
    handleSendInvite,
    editingCollab,
    setEditingCollab,
    editPermission,
    setEditPermission,
    isSavingEdit,
    editFeedback,
    handleSaveEditCollab,
    handleRemoveCollaborator,
  };
}
