import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  Users,
  User,
  Search,
  X,
  RefreshCw,
  ExternalLink,
  Building2,
  Check,
  UserPlus,
} from 'lucide-react';
import { Modal, IconButton, Button, Spinner, AlertBanner } from '../ui';
import { API } from '../../services/api';
import type { CollaboratorInfo, RepoTeamInfo } from '../../types';

interface RepoGovernanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orgLogin: string;
  repoName: string;
}

interface OrgMemberInfo {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  role: string;
}

const PERMISSION_BADGES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  admin: {
    label: 'Administrador',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.28)',
  },
  maintain: {
    label: 'Mantenedor',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.28)',
  },
  push: {
    label: 'Escrita',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.28)',
  },
  write: {
    label: 'Escrita',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.28)',
  },
  triage: {
    label: 'Triagem',
    color: '#0d9488',
    bg: 'rgba(13, 148, 136, 0.12)',
    border: 'rgba(13, 148, 136, 0.28)',
  },
  pull: {
    label: 'Leitura',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.28)',
  },
  read: {
    label: 'Leitura',
    color: '#0284c7',
    bg: 'rgba(2, 132, 199, 0.12)',
    border: 'rgba(2, 132, 199, 0.28)',
  },
};

const getPermissionBadge = (perm: string = 'pull') => {
  const key = perm.toLowerCase();
  return (
    PERMISSION_BADGES[key] || {
      label: perm || 'Leitura',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(100, 116, 139, 0.28)',
    }
  );
};

export const RepoGovernanceModal: React.FC<RepoGovernanceModalProps> = ({
  isOpen,
  onClose,
  orgLogin,
  repoName,
}) => {
  const [activeTab, setActiveTab] = useState<'people' | 'org_members' | 'teams'>('people');
  const [searchQuery, setSearchQuery] = useState('');
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberInfo[]>([]);
  const [teams, setTeams] = useState<RepoTeamInfo[]>([]);
  const [memberPermissions, setMemberPermissions] = useState<Record<string, string>>({});
  const [invitingLogin, setInvitingLogin] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOrg = Boolean(orgLogin && orgLogin !== 'local' && orgLogin !== 'all');

  const loadData = async () => {
    if (!repoName) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [collabRes, teamsRes, membersRes] = await Promise.all([
        API.getGovernanceCollaborators(repoName),
        isOrg
          ? API.getRepoTeams(orgLogin, repoName)
          : Promise.resolve({ ok: true, data: { teams: [] } }),
        isOrg
          ? API.getOrgMembers(orgLogin)
          : Promise.resolve({ ok: true, data: { members: [] } }),
      ]);

      if (collabRes.ok && collabRes.data?.collaborators) {
        setCollaborators(collabRes.data.collaborators as any);
      } else {
        setCollaborators([]);
      }

      if (teamsRes.ok && teamsRes.data?.teams) {
        setTeams(teamsRes.data.teams);
      } else {
        setTeams([]);
      }

      if (membersRes.ok && membersRes.data?.members) {
        setOrgMembers(membersRes.data.members as any);
      } else {
        setOrgMembers([]);
      }
    } catch (err: any) {
      console.warn('[RepoGovernanceModal] Falha ao carregar acessos:', err);
      setErrorMsg('Não foi possível carregar a lista de acessos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFeedbackMsg(null);
      loadData();
    }
  }, [isOpen, repoName, orgLogin]);

  const handleInviteMember = async (username: string) => {
    const permission = memberPermissions[username] || 'push';
    setInvitingLogin(username);
    setFeedbackMsg(null);
    try {
      const res = await API.inviteCollaborator({
        username,
        permission,
        repo: repoName,
      });
      if (res.ok && (res.data?.success || !res.data?.error)) {
        setFeedbackMsg({
          type: 'success',
          text: `Convite enviado com sucesso para @${username} (Permissão: ${getPermissionBadge(permission).label})!`,
        });
        await loadData();
      } else {
        setFeedbackMsg({
          type: 'error',
          text: res.data?.error || res.data?.message || `Não foi possível convidar @${username}.`,
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || `Erro ao convidar @${username}.`,
      });
    } finally {
      setInvitingLogin(null);
    }
  };

  const filteredPeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return collaborators;
    return collaborators.filter(
      (c) =>
        c.login?.toLowerCase().includes(q) ||
        (c as any).name?.toLowerCase().includes(q) ||
        c.role_name?.toLowerCase().includes(q) ||
        c.permission?.toLowerCase().includes(q)
    );
  }, [collaborators, searchQuery]);

  const filteredOrgMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orgMembers;
    return orgMembers.filter(
      (m) =>
        m.login?.toLowerCase().includes(q) ||
        (m as any).name?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
    );
  }, [orgMembers, searchQuery]);

  const filteredTeams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.permission?.toLowerCase().includes(q)
    );
  }, [teams, searchQuery]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title="Governança & Acessos"
      subtitle={
        <>
          Permissões em{' '}
          <code
            style={{
              color: 'var(--md-sys-color-primary, #1a73e8)',
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            {orgLogin}/{repoName}
          </code>
        </>
      }
      icon={<Shield size={20} />}
      footer={
        <div className="repo-gov-footer">
          <span className="repo-gov-footer-total">
            Total:{' '}
            <strong>
              {activeTab === 'people'
                ? filteredPeople.length
                : activeTab === 'org_members'
                  ? filteredOrgMembers.length
                  : filteredTeams.length}
            </strong>{' '}
            {activeTab === 'people'
              ? 'pessoa(s)'
              : activeTab === 'org_members'
                ? 'membro(s) na organização'
                : 'time(s)'}
          </span>
          <Button variant="primary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="repo-gov-container">
        {feedbackMsg && (
          <div style={{ marginBottom: '10px' }}>
            <AlertBanner
              variant={feedbackMsg.type}
              title={feedbackMsg.text}
              onClose={() => setFeedbackMsg(null)}
            />
          </div>
        )}

        {/* Toolbar: Segmented Controls + Reload */}
        <div className="repo-gov-toolbar">
          <div className="repo-gov-segmented">
            <button
              type="button"
              className={`repo-gov-seg-btn ${activeTab === 'people' ? 'active' : ''}`}
              onClick={() => setActiveTab('people')}
            >
              <User size={14} />
              <span>Acesso Atual</span>
              <span className="repo-gov-counter">{collaborators.length}</span>
            </button>

            {isOrg && (
              <button
                type="button"
                className={`repo-gov-seg-btn ${activeTab === 'org_members' ? 'active' : ''}`}
                onClick={() => setActiveTab('org_members')}
                title="Listar todos os membros da organização para convidar para este repositório"
              >
                <Building2 size={14} />
                <span>Membros da Org</span>
                <span className="repo-gov-counter">{orgMembers.length}</span>
              </button>
            )}

            <button
              type="button"
              className={`repo-gov-seg-btn ${activeTab === 'teams' ? 'active' : ''}`}
              onClick={() => setActiveTab('teams')}
            >
              <Users size={14} />
              <span>Times</span>
              <span className="repo-gov-counter">{teams.length}</span>
            </button>
          </div>

          <IconButton
            size="sm"
            variant="ghost"
            tooltip="Recarregar acessos"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw
              size={14}
              style={{
                animation: isLoading ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </IconButton>
        </div>

        {/* Search Filter */}
        <div className="repo-gov-search-wrap">
          <Search size={14} className="repo-gov-search-icon" />
          <input
            type="text"
            className="repo-gov-search-input"
            placeholder={
              activeTab === 'people'
                ? 'Filtrar pessoas por nome ou @username...'
                : activeTab === 'org_members'
                  ? 'Filtrar membros da organização por @username...'
                  : 'Filtrar times por nome...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="repo-gov-search-clear"
              onClick={() => setSearchQuery('')}
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Content List */}
        <div className="repo-gov-list custom-scrollbar">
          {isLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
                gap: '10px',
                color: 'var(--md-sys-color-on-surface-variant, #5f6368)',
              }}
            >
              <Spinner size="md" />
              <span style={{ fontSize: '12px' }}>Consultando permissões de acesso...</span>
            </div>
          ) : errorMsg ? (
            <div
              style={{
                padding: '14px',
                borderRadius: '8px',
                background: 'var(--md-sys-color-error-container, #fce8e6)',
                color: 'var(--md-sys-color-on-error-container, #c5221f)',
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              {errorMsg}
            </div>
          ) : activeTab === 'people' ? (
            filteredPeople.length === 0 ? (
              <div className="repo-gov-empty">
                <User size={32} className="repo-gov-empty-icon" />
                <p style={{ margin: 0 }}>Nenhuma pessoa encontrada com acesso individual.</p>
                {isOrg && orgMembers.length > 0 && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => setActiveTab('org_members')}
                    style={{ marginTop: '8px' }}
                  >
                    Ver Membros da Org ({orgMembers.length})
                  </Button>
                )}
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSearchQuery('')}
                    style={{ marginTop: '4px' }}
                  >
                    Limpar busca
                  </Button>
                )}
              </div>
            ) : (
              filteredPeople.map((person) => {
                const badge = getPermissionBadge(person.permission);
                return (
                  <div key={`person-${person.login}`} className="repo-gov-card">
                    <div className="repo-gov-card-left">
                      {person.avatar_url ? (
                        <img
                          src={person.avatar_url}
                          alt={person.login}
                          className="repo-gov-avatar"
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div className="repo-gov-avatar-fallback">
                          {person.login?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="repo-gov-info">
                        <div className="repo-gov-name-row">
                          <span className="repo-gov-name">
                            {(person as any).name || person.login}
                          </span>
                          {person.is_owner && (
                            <span className="repo-gov-owner-badge">Proprietário</span>
                          )}
                        </div>
                        <span className="repo-gov-sub">@{person.login}</span>
                      </div>
                    </div>

                    <div className="repo-gov-card-right">
                      <span
                        className="repo-gov-perm-badge"
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                        }}
                      >
                        {badge.label}
                      </span>

                      {person.html_url && (
                        <a
                          href={person.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="repo-gov-external-link"
                          title="Ver perfil no GitHub"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : activeTab === 'org_members' ? (
            filteredOrgMembers.length === 0 ? (
              <div className="repo-gov-empty">
                <Building2 size={32} className="repo-gov-empty-icon" />
                <p style={{ margin: 0 }}>Nenhum membro da organização encontrado.</p>
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSearchQuery('')}
                    style={{ marginTop: '4px' }}
                  >
                    Limpar busca
                  </Button>
                )}
              </div>
            ) : (
              filteredOrgMembers.map((member) => {
                const existingCollab = collaborators.find(
                  (c) => c.login?.toLowerCase() === member.login?.toLowerCase()
                );
                const hasAccess = Boolean(existingCollab);
                const badge = hasAccess ? getPermissionBadge(existingCollab?.permission) : null;
                const selectedPerm = memberPermissions[member.login] || 'push';
                const isInviting = invitingLogin === member.login;

                return (
                  <div key={`org-member-${member.login}`} className="repo-gov-card">
                    <div className="repo-gov-card-left">
                      {member.avatar_url ? (
                        <img
                          src={member.avatar_url}
                          alt={member.login}
                          className="repo-gov-avatar"
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div className="repo-gov-avatar-fallback">
                          {member.login?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="repo-gov-info">
                        <div className="repo-gov-name-row">
                          <span className="repo-gov-name">
                            {(member as any).name || member.login}
                          </span>
                          <span
                            className="repo-gov-owner-badge"
                            style={{
                              background: 'var(--md-sys-color-surface-container-high, #e8eaed)',
                              color: 'var(--md-sys-color-on-surface-variant, #5f6368)',
                              borderColor: 'var(--md-sys-color-outline-variant, #dadce0)',
                            }}
                          >
                            {member.role === 'admin' ? 'Admin da Org' : 'Membro da Org'}
                          </span>
                        </div>
                        <span className="repo-gov-sub">@{member.login}</span>
                      </div>
                    </div>

                    <div className="repo-gov-card-right" style={{ gap: '8px' }}>
                      {hasAccess ? (
                        <span
                          className="repo-gov-perm-badge"
                          style={{
                            backgroundColor: badge?.bg,
                            color: badge?.color,
                            border: `1px solid ${badge?.border}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title={`Já possui acesso a este repositório como ${badge?.label}`}
                        >
                          <Check size={12} />
                          {badge?.label}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select
                            value={selectedPerm}
                            onChange={(e) =>
                              setMemberPermissions((prev) => ({
                                ...prev,
                                [member.login]: e.target.value,
                              }))
                            }
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '3px 6px',
                              borderRadius: '6px',
                              backgroundColor: 'var(--color-surface, #ffffff)',
                              border: '1px solid var(--color-outline-variant, #e2e8f0)',
                              color: 'var(--color-on-surface, #1e293b)',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            <option value="push">Escrita</option>
                            <option value="pull">Leitura</option>
                            <option value="admin">Admin</option>
                          </select>

                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => handleInviteMember(member.login)}
                            loading={isInviting}
                            disabled={Boolean(invitingLogin && !isInviting)}
                            style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px' }}
                          >
                            <UserPlus size={12} />
                            <span>Convidar</span>
                          </Button>
                        </div>
                      )}

                      {member.html_url && (
                        <a
                          href={member.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="repo-gov-external-link"
                          title="Ver perfil no GitHub"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : filteredTeams.length === 0 ? (
            <div className="repo-gov-empty">
              <Users size={32} className="repo-gov-empty-icon" />
              <p style={{ margin: 0 }}>Nenhum time vinculado a este repositório.</p>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setSearchQuery('')}
                  style={{ marginTop: '4px' }}
                >
                  Limpar busca
                </Button>
              )}
            </div>
          ) : (
            filteredTeams.map((team) => {
              const badge = getPermissionBadge(team.permission);
              return (
                <div key={`team-${team.id || team.slug}`} className="repo-gov-card">
                  <div className="repo-gov-card-left">
                    <div className="repo-gov-team-icon">
                      <Users size={16} />
                    </div>
                    <div className="repo-gov-info">
                      <div className="repo-gov-name-row">
                        <span className="repo-gov-name">{team.name}</span>
                        {(team as any).members_count !== undefined && (
                          <span
                            className="repo-gov-owner-badge"
                            style={{
                              background: 'var(--md-sys-color-surface-container-high, #e8eaed)',
                              color: 'var(--md-sys-color-on-surface-variant, #5f6368)',
                              borderColor: 'var(--md-sys-color-outline-variant, #dadce0)',
                            }}
                          >
                            {(team as any).members_count}{' '}
                            {(team as any).members_count === 1 ? 'membro' : 'membros'}
                          </span>
                        )}
                      </div>
                      {team.description && (
                        <span className="repo-gov-sub" style={{ maxWidth: '280px' }}>
                          {team.description}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="repo-gov-card-right">
                    <span
                      className="repo-gov-perm-badge"
                      style={{
                        backgroundColor: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
