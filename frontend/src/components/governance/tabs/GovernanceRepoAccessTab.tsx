import React from "react";
import { Users, Trash2, Plus } from "lucide-react";
import { Button } from "../../ui";
import {
  PERMISSION_OPTIONS,
  type PermissionOption,
  type SelectedGovernanceTeam,
  type SelectedGovernanceMember,
} from "../governance-types";
import type { OrganizationTeamInfo } from "../../../types";

export interface GovernanceRepoAccessTabProps {
  currentRepoTeams: SelectedGovernanceTeam[];
  orgLogin: string;
  getPermConfig: (perm: string) => PermissionOption;
  handleUpdateTeamPerm: (slug: string, perm: string) => void;
  handleRemoveTeamFromRepo: (slug: string) => void;
  availableTeamsForRepo: OrganizationTeamInfo[];
  handleAddTeamToRepo: (team: OrganizationTeamInfo) => void;
  currentRepoCollaborators: SelectedGovernanceMember[];
  handleUpdateCollaboratorPerm: (username: string, perm: string) => void;
  handleRemoveCollaborator: (username: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleAddCollaborator: (username: string, perm: string) => void;
  isMutating: boolean;
}

export const GovernanceRepoAccessTab: React.FC<GovernanceRepoAccessTabProps> = ({
  currentRepoTeams,
  orgLogin,
  getPermConfig,
  handleUpdateTeamPerm,
  handleRemoveTeamFromRepo,
  availableTeamsForRepo,
  handleAddTeamToRepo,
  currentRepoCollaborators,
  handleUpdateCollaboratorPerm,
  handleRemoveCollaborator,
  searchQuery,
  setSearchQuery,
  handleAddCollaborator,
  isMutating,
}) => {
  return (
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
  );
};
