import React from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useAuth } from "../../context/AuthContext";
import { Button, Badge } from "../ui";
import {
  Sparkles,
  User,
  Shield,
  CloudDownload,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
} from "lucide-react";
import { OrgSelectorDropdown } from "./OrgSelectorDropdown";
import { InvitationsModal } from "../modals/InvitationsModal";
import { HeaderVersionPill } from "./HeaderVersionPill";
import { useUpdaterStore } from "../../stores/updaterStore";

interface TopHeaderProps {
  onOpenDiffModal: () => void;
  onToggleCopilot: () => void;
  onOpenGitModal?: () => void;
  onOpenVersionGraph?: () => void;
  onNavigateToEdits?: (tab?: "drafts") => void;
}

export const TopHeader: React.FC<TopHeaderProps> = React.memo(
  ({
    onToggleCopilot,
    onOpenVersionGraph = () => {},
  }) => {
    const {
      activeRepo,
      activeOrg,
      effectivePermission,
      isLoadingPermission,
      hasRemoteUpdates,
      syncGit,
      checkRemoteUpdates,
      pendingInvitations,
      isLoadingInvitations,
      acceptInvitation,
      declineInvitation,
      refreshInvitations,
    } = useWorkspace();
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isInvitationsOpen, setIsInvitationsOpen] = React.useState(false);

    const [avatarError, setAvatarError] = React.useState(false);
    const [isSyncingRemote, setIsSyncingRemote] = React.useState(false);
    const [syncError, setSyncError] = React.useState<string | null>(null);
    const [isCheckingUpdates, setIsCheckingUpdates] = React.useState(false);

    React.useEffect(() => {
      const repoName = activeRepo?.name;
      if (!repoName || repoName === "local" || repoName === "default" || repoName === "_default") {
        return;
      }
      const interval = setInterval(() => {
        checkRemoteUpdates(repoName, true);
      }, 3_600_000);
      return () => clearInterval(interval);
    }, [activeRepo?.name, checkRemoteUpdates]);

    const handleManualCheckUpdates = React.useCallback(async () => {
      if (!activeRepo?.name || isCheckingUpdates) return;
      setIsCheckingUpdates(true);
      try {
        await checkRemoteUpdates(activeRepo.name, true);
      } finally {
        setIsCheckingUpdates(false);
      }
    }, [activeRepo?.name, checkRemoteUpdates, isCheckingUpdates]);
    const [isHoveringUpdateBadge, setIsHoveringUpdateBadge] = React.useState(false);
    const updateInfo = useUpdaterStore((s) => s.updateInfo);
    const applyUpdate = useUpdaterStore((s) => s.applyUpdate);
    const initUpdater = useUpdaterStore((s) => s.init);

    React.useEffect(() => {
      initUpdater();
    }, [initUpdater]);

    return (
      <header className="dashboard-navbar" style={{ position: "relative", zIndex: 200 }}>
        <div className="dash-brand">
          {user?.avatar_url && !avatarError ? (
            <img
              id="dash-user-avatar"
              src={user.avatar_url}
              alt={user.name || user.login || "Usuário"}
              title={user.name || user.login || "Usuário"}
              loading="eager"
              decoding="async"
              onError={() => setAvatarError(true)}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                objectFit: "cover",
                flexShrink: 0,
                display: "block",
              }}
            />
          ) : (
            <div
              id="dash-user-avatar"
              title={user?.name || user?.login || "Usuário"}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                backgroundColor: "var(--color-primary-container, #d2e3fc)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-primary, #1a73e8)",
                flexShrink: 0,
              }}
            >
              <User size={15} />
            </div>
          )}
          {isLoadingPermission || !effectivePermission ? (
            <div
              id="dash-user-perm-skeleton"
              title="Carregando permissões do GitHub..."
              style={{
                display: "inline-flex",
                alignItems: "center",
                width: "84px",
                height: "20px",
                borderRadius: "10px",
                backgroundColor:
                  "var(--md-sys-color-surface-container-high, #e8eaed)",
                opacity: 0.7,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ) : (
            <span
              id="dash-user-perm-badge"
              title={`Seu papel: ${effectivePermission.roleName}${
                effectivePermission.repoPermission === "admin"
                  ? " • Nível: Administração"
                  : effectivePermission.repoPermission === "maintain"
                    ? " • Nível: Coordenação"
                    : effectivePermission.repoPermission === "push"
                      ? " • Nível: Escrita"
                      : effectivePermission.repoPermission === "triage"
                        ? " • Nível: Triagem"
                        : " • Nível: Leitura"
              }${effectivePermission.isOutsideCollaborator ? " • Colaborador Externo" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "10px",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
                backgroundColor:
                  effectivePermission.isOrgOwner ||
                  effectivePermission.allowedActions.canAdmin
                    ? "rgba(236, 72, 153, 0.12)"
                    : effectivePermission.allowedActions.canMaintain
                      ? "rgba(139, 92, 246, 0.12)"
                      : effectivePermission.allowedActions.canWrite
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(2, 132, 199, 0.12)",
                color:
                  effectivePermission.isOrgOwner ||
                  effectivePermission.allowedActions.canAdmin
                    ? "#ec4899"
                    : effectivePermission.allowedActions.canMaintain
                      ? "#8b5cf6"
                      : effectivePermission.allowedActions.canWrite
                        ? "#10b981"
                        : "#0284c7",
                border: `1px solid ${
                  effectivePermission.isOrgOwner ||
                  effectivePermission.allowedActions.canAdmin
                    ? "rgba(236, 72, 153, 0.3)"
                    : effectivePermission.allowedActions.canMaintain
                      ? "rgba(139, 92, 246, 0.3)"
                      : effectivePermission.allowedActions.canWrite
                        ? "rgba(16, 185, 129, 0.3)"
                        : "rgba(2, 132, 199, 0.3)"
                }`,
              }}
            >
              <Shield size={11} />
              {effectivePermission.roleName}
            </span>
          )}
          <OrgSelectorDropdown />
        </div>

        {/* Centro absoluto da barra de navegação: SOMENTE o nome do repositório e atualização remota */}
        <div
          className="dash-header-center"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            pointerEvents: "auto",
            maxWidth: "calc(100% - 460px)",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <h1
            id="dash-repo-title"
            style={{
              margin: 0,
              fontSize: "17px",
              fontWeight: 700,
              color: "var(--text-heading)",
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {activeRepo?.name ||
              (activeOrg
                ? activeOrg.full_name || activeOrg.login
                : "Visão Geral")}
          </h1>

          <HeaderVersionPill onClick={onOpenVersionGraph} />

          {activeRepo?.name &&
            activeRepo.name !== "local" &&
            activeRepo.name !== "default" &&
            activeRepo.name !== "_default" && (
              <button
                id="dash-repo-check-updates-btn"
                type="button"
                onClick={handleManualCheckUpdates}
                disabled={isCheckingUpdates}
                title="Verificar atualizações remotas"
                aria-label="Verificar atualizações remotas"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  padding: 0,
                  borderRadius: "6px",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary, #64748b)",
                  opacity: isCheckingUpdates ? 0.8 : 0.55,
                  cursor: isCheckingUpdates ? "default" : "pointer",
                  transition: "opacity 0.15s ease, background-color 0.15s ease",
                }}
              >
                <RefreshCw
                  size={13}
                  style={
                    isCheckingUpdates
                      ? { animation: "spin 0.9s linear infinite" }
                      : undefined
                  }
                />
              </button>
            )}

          {hasRemoteUpdates && (
            <button
              id="dash-repo-remote-update-badge"
              type="button"
              disabled={isSyncingRemote}
              onClick={async () => {
                if (isSyncingRemote) return;
                setIsSyncingRemote(true);
                setSyncError(null);
                try {
                  const res = await syncGit();
                  if (res && !res.success) {
                    setSyncError(res.message || "Falha ao atualizar repositório.");
                  }
                } catch (err) {
                  setSyncError((err as Error)?.message || "Erro ao sincronizar.");
                } finally {
                  setIsSyncingRemote(false);
                }
              }}
              onMouseEnter={() => setIsHoveringUpdateBadge(true)}
              onMouseLeave={() => setIsHoveringUpdateBadge(false)}
              title={
                syncError
                  ? `Erro na última tentativa: ${syncError}`
                  : "Existem atualizações na nuvem. Clique para atualizar."
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: "10px",
                backgroundColor: syncError
                  ? "rgba(220, 38, 38, 0.12)"
                  : isHoveringUpdateBadge && !isSyncingRemote
                    ? "rgba(37, 99, 235, 0.22)"
                    : "rgba(37, 99, 235, 0.12)",
                color: syncError
                  ? "#dc2626"
                  : "var(--color-primary, #2563eb)",
                border: `1px solid ${
                  syncError
                    ? "rgba(220, 38, 38, 0.35)"
                    : isHoveringUpdateBadge && !isSyncingRemote
                      ? "rgba(37, 99, 235, 0.5)"
                      : "rgba(37, 99, 235, 0.3)"
                }`,
                cursor: isSyncingRemote ? "wait" : "pointer",
                opacity: isSyncingRemote ? 0.85 : 1,
                transform:
                  isHoveringUpdateBadge && !isSyncingRemote
                    ? "translateY(-1px)"
                    : "translateY(0)",
                boxShadow:
                  isHoveringUpdateBadge && !isSyncingRemote
                    ? "0 2px 8px rgba(37, 99, 235, 0.18)"
                    : "none",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                whiteSpace: "nowrap",
              }}
            >
              {isSyncingRemote ? (
                <Loader2
                  size={13}
                  style={{ animation: "spin 0.9s linear infinite" }}
                />
              ) : (
                <CloudDownload size={13} />
              )}
              {isSyncingRemote
                ? "Atualizando..."
                : syncError
                  ? "Erro ao atualizar (tentar de novo)"
                  : "Atualização disponível"}
            </button>
          )}
        </div>

        <div
          className="dash-nav-right"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: "36px",
          }}
        >
          {updateInfo?.status === "available-manual" && (
            <Button
              id="btn-download-update"
              variant="primary"
              size="sm"
              leftIcon={<CloudDownload size={15} />}
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
                borderColor: "#1d4ed8",
                animation: "pulse 2s infinite",
              }}
              onClick={applyUpdate}
              title="Clique para atualizar e reiniciar o Contexos automaticamente"
            >
              Instalar Atualização {updateInfo.version ? `(v${updateInfo.version})` : ""}
            </Button>
          )}

          {updateInfo?.status === "updating" && (
            <Button
              id="btn-updating"
              variant="secondary"
              size="sm"
              disabled
              leftIcon={<Loader2 size={15} className="animate-spin" />}
              style={{
                backgroundColor: "#475569",
                color: "#ffffff",
                borderColor: "#334155",
              }}
            >
              Atualizando Contexos...
            </Button>
          )}

          {updateInfo?.status === "downloaded" && (
            <Button
              id="btn-apply-update"
              variant="primary"
              size="sm"
              leftIcon={<CloudDownload size={15} />}
              style={{
                backgroundColor: "#10b981",
                color: "#ffffff",
                borderColor: "#059669",
                animation: "pulse 2s infinite",
              }}
              onClick={applyUpdate}
              title="Clique para reiniciar e aplicar a nova versão"
            >
              Reiniciar para Atualizar {updateInfo.version ? `(v${updateInfo.version})` : ""}
            </Button>
          )}

          {updateInfo?.status === "available" && (
            <Badge variant="info">
              Baixando v{updateInfo.version || ""}
              {updateInfo.percent !== undefined ? ` (${updateInfo.percent}%)` : ""}
            </Badge>
          )}

          {pendingInvitations && pendingInvitations.total > 0 && (
            <Button
              id="btn-top-invitations"
              variant="subtle"
              size="sm"
              leftIcon={<Mail size={14} color="#d97706" />}
              onClick={() => setIsInvitationsOpen(true)}
              title={`${pendingInvitations.total} convite(s) pendente(s) no GitHub`}
              style={{
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                color: "#d97706",
                borderColor: "rgba(245, 158, 11, 0.35)",
                fontWeight: 600,
                fontSize: "12px",
              }}
            >
              Convites ({pendingInvitations.total})
            </Button>
          )}

          <Button
            id="btn-global-ai-copilot"
            variant="primary"
            size="sm"
            leftIcon={<Sparkles size={15} />}
            onClick={onToggleCopilot}
            title="Abrir Nexos em Qualquer Tela"
            style={{
              height: "32px",
              borderRadius: "10px",
              padding: "0 14px",
              gap: "6px",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.01em",
              color: "#ffffff",
              border: "1.5px solid transparent",
              outline: "none",
              backgroundImage:
                "linear-gradient(120deg, #059669 0%, #10b981 35%, #0891b2 70%, #2563eb 100%), linear-gradient(120deg, #6ee7b7 0%, #34d399 35%, #22d3ee 70%, #60a5fa 100%)",
              backgroundOrigin: "border-box",
              backgroundClip: "padding-box, border-box",
              boxShadow: "0 2px 12px -2px rgba(16, 185, 129, 0.4)",
              transition: "all 0.2s ease",
            }}
          >
            Nexos
          </Button>

          <Button
            id="btn-global-logout"
            variant="ghost"
            size="sm"
            leftIcon={<LogOut size={15} />}
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
            title="Desconectar da plataforma"
            style={{
              color: "var(--md-sys-color-on-surface-variant, #64748b)",
              fontWeight: 500,
            }}
          />
        </div>

        <InvitationsModal
          isOpen={isInvitationsOpen}
          onClose={() => setIsInvitationsOpen(false)}
          invitations={pendingInvitations}
          isLoading={isLoadingInvitations}
          onAccept={acceptInvitation}
          onDecline={declineInvitation}
          onRefresh={refreshInvitations}
        />
      </header>
    );
  },
);

TopHeader.displayName = "TopHeader";
