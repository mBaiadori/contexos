import React from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Spinner, Button } from "../../ui";
import type { OrganizationMemberInfo } from "../../../types";

export interface GovernanceMembersTabProps {
  showInviteOrgMember: boolean;
  setShowInviteOrgMember: (show: boolean) => void;
  inviteUsername: string;
  setInviteUsername: (username: string) => void;
  inviteRole: "direct_member" | "admin";
  setInviteRole: (role: "direct_member" | "admin") => void;
  handleInviteOrgMember: (e: React.FormEvent) => Promise<void>;
  orgMembers: OrganizationMemberInfo[];
  handleRemoveOrgMember: (username: string) => Promise<void>;
  isMutating: boolean;
}

export const GovernanceMembersTab: React.FC<GovernanceMembersTabProps> = ({
  showInviteOrgMember,
  setShowInviteOrgMember,
  inviteUsername,
  setInviteUsername,
  inviteRole,
  setInviteRole,
  handleInviteOrgMember,
  orgMembers,
  handleRemoveOrgMember,
  isMutating,
}) => {
  return (
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
            background: "var(--md-sys-color-surface-container-low, #f8fafc)",
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
  );
};
