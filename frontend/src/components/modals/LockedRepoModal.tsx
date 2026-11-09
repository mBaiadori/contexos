import React, { useState } from 'react';
import { Lock, X, Copy, Check, Users, AlertTriangle } from 'lucide-react';
import { Button, IconButton } from '../ui';
import type { Repo } from '../../types';

interface LockedRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  repo: Repo | null;
  orgName?: string;
  owners?: string[];
}

export const LockedRepoModal: React.FC<LockedRepoModalProps> = ({
  isOpen,
  onClose,
  repo,
  orgName,
}) => {
  const [copied, setCopied] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  if (!isOpen || !repo) return null;

  const repoDisplayName = repo.full_name || repo.name;
  const targetOrg = orgName || repo.owner || 'organização';

  const handleCopyRequest = () => {
    const text = `Olá! Gostaria de solicitar permissão de acesso ao repositório '${repoDisplayName}' na organização '${targetOrg}'.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSimulateRequest = () => {
    setRequestSent(true);
    setTimeout(() => setRequestSent(false), 4000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: 'var(--color-surface, #ffffff)',
          color: 'var(--color-on-surface, #1e293b)',
          borderRadius: '16px',
          border: '1px solid var(--color-outline-variant, #e2e8f0)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com Ícone de Cadeado */}
        <div
          style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--color-outline-variant, #e2e8f0)',
            backgroundColor: 'var(--color-surface-container-low, #f8fafc)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              <Lock size={22} />
            </div>
            <div>
              <h2
                style={{
                  margin: '0 0 4px',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--color-on-surface, #0f172a)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                Acesso Restrito
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    fontWeight: 600,
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                  }}
                >
                  Bloqueado
                </span>
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-on-surface-variant, #64748b)' }}>
                Repositório protegido por políticas de governança
              </p>
            </div>
          </div>
          <IconButton icon={<X size={18} />} aria-label="Fechar" onClick={onClose} variant="ghost" />
        </div>

        {/* Conteúdo */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-surface-container-low, #f8fafc)',
              border: '1px solid var(--color-outline-variant, #e2e8f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant, #64748b)', fontWeight: 600 }}>
              Repositório Alvo
            </span>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-on-surface, #0f172a)', fontFamily: 'monospace' }}>
              {repoDisplayName}
            </span>
            {repo.description && (
              <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant, #64748b)', marginTop: '2px' }}>
                {repo.description}
              </span>
            )}
          </div>

          <div style={{ fontSize: '13px', color: 'var(--color-on-surface, #334155)', lineHeight: 1.6 }}>
            Você não possui permissão de leitura ou acesso à equipe autorizada deste repositório na organização <strong>{targetOrg}</strong>.
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: '#b45309',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Como obter acesso:</strong> Solicite a um <strong>Owner</strong> ou <strong>Admin</strong> da organização a vinculação do seu usuário a uma <strong>Equipe (Team)</strong> com acesso ou a inclusão como <strong>Colaborador</strong>.
            </div>
          </div>

          {requestSent && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: '#059669',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: 500,
              }}
            >
              <Check size={16} />
              Solicitação de acesso enviada para os administradores da organização!
            </div>
          )}
        </div>

        {/* Rodapé / Ações */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid var(--color-outline-variant, #e2e8f0)',
            backgroundColor: 'var(--color-surface-container-low, #f8fafc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <Button
            variant="secondary"
            onClick={handleCopyRequest}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
            {copied ? 'Mensagem Copiada!' : 'Copiar Solicitação'}
          </Button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="primary"
              onClick={handleSimulateRequest}
              disabled={requestSent}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Users size={14} />
              {requestSent ? 'Solicitado' : 'Solicitar Acesso'}
            </Button>
            <Button variant="secondary" onClick={onClose} style={{ fontSize: '13px' }}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
