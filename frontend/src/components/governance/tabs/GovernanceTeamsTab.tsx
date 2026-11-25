import React from "react";
import { Users, Plus, Trash2, UserCheck, ChevronDown, ChevronUp, X } from "lucide-react";
import { Spinner, Button } from "../../ui";
import type { OrganizationTeamInfo, OrgTeamMemberInfo } from "../../../types";

export interface GovernanceTeamsTabProps {
  orgLogin: string;
  showCreateTeam: boolean;
  setShowCreateTeam: (show: boolean) => void;
  newTeamName: string;
  setNewTeamName: (name: string) => void;
  newTeamPrivacy: "closed" | "secret";
  setNewTeamPrivacy: (privacy: "closed" | "secret") => void;
  newTeamDesc: string;
  setNewTeamDesc: (desc: string) => void;
  handleCreateOrgTeam: (e: React.FormEvent) => Promise<void>;
  orgTeams: OrganizationTeamInfo[];
  expandedTeamSlug: string | null;
  handleToggleTeamMembers: (slug: string) => void;
  handleDeleteOrgTeam: (slug: string) => void;
  addTeamMemberUsername: string;
  setAddTeamMemberUsername: (username: string) => void;
  handleAddMemberToTeam: (slug: string) => void;
  handleRemoveMemberFromTeam: (teamSlug: string, username: string) => void;
  isLoadingTeamMembers: boolean;
  teamMembersList: OrgTeamMemberInfo[];
  isMutating: boolean;
}

export const GovernanceTeamsTab: React.FC<GovernanceTeamsTabProps> = ({
  orgLogin,
  showCreateTeam,
  setShowCreateTeam,
  newTeamName,
  setNewTeamName,
  newTeamPrivacy,
  setNewTeamPrivacy,
  newTeamDesc,
  setNewTeamDesc,
  handleCreateOrgTeam,
  orgTeams,
  expandedTeamSlug,
  handleToggleTeamMembers,
  handleDeleteOrgTeam,
  addTeamMemberUsername,
  setAddTeamMemberUsername,
  handleAddMemberToTeam,
  handleRemoveMemberFromTeam,
  isLoadingTeamMembers,
  teamMembersList,
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
              onChange={(e) => setNewTeamPrivacy(e.target.value as "closed" | "secret")}
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
                        disabled={isMutating || !addTeamMemberUsername.trim()}
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
                                handleRemoveMemberFromTeam(team.slug, m.login)
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
                        Nenhum membro neste time ainda. Adicione membros acima.
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
          Nenhum time criado nesta organização ainda. Use o botão "Novo Time"
          acima para organizar seus times de desenvolvimento.
        </div>
      )}
    </div>
  );
};
