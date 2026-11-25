import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { useCopilotStore } from '../../stores/copilotStore';
import { ragService } from '../../services/ragService';
import type { RagSearchResult, RagStats } from '../../services/ragService';
import { useWorkspace } from '../../context/WorkspaceContext';
import { sanitizeHtml } from '../../utils/sanitize';

export const RagSearchModal: React.FC = () => {
  const isRagModalOpen = useCopilotStore((s) => s.isRagModalOpen);
  const closeRagModal = useCopilotStore((s) => s.closeRagModal);
  const ragReferences = useCopilotStore((s) => s.ragReferences);
  const addRagReference = useCopilotStore((s) => s.addRagReference);
  const removeRagReference = useCopilotStore((s) => s.removeRagReference);
  const isAutoRagEnabled = useCopilotStore((s) => s.isAutoRagEnabled);
  const toggleAutoRag = useCopilotStore((s) => s.toggleAutoRag);

  const { activeRepo, loadFile } = useWorkspace();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RagSearchResult[]>([]);
  const [stats, setStats] = useState<RagStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega estatísticas ao abrir o modal
  useEffect(() => {
    if (isRagModalOpen) {
      loadStats();
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isRagModalOpen, activeRepo?.name]);

  // Debounce na busca para digitação suave (300ms)
  useEffect(() => {
    if (!isRagModalOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      performSearch(trimmed);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, isRagModalOpen]);

  const loadStats = async () => {
    const s = await ragService.getStats(activeRepo?.name || 'local');
    setStats(s);
  };

  const performSearch = async (searchTerm: string) => {
    try {
      const res = await ragService.search(searchTerm, activeRepo?.name || 'local', 12);
      setResults(res);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const s = await ragService.reindex(activeRepo?.name || 'local');
      setStats(s);
      if (query.trim()) {
        performSearch(query.trim());
      }
    } finally {
      setIsReindexing(false);
    }
  };

  if (!isRagModalOpen) return null;

  return (
    <aside
      className="ai-copilot-prompt-sidebar ui-sidebar-drawer"
      style={{ width: '420px', maxWidth: '50vw' }}
    >
      {/* Header */}
      <div className="ui-sidebar-drawer__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: '18px',
              color: '#2563eb',
              padding: '5px',
              borderRadius: '7px',
              background: 'rgba(37, 99, 235, 0.1)',
              flexShrink: 0,
            }}
          >
            manage_search
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>
              Busca RAG no Workspace
            </h3>
            <p className="ui-text-muted" style={{ margin: '1px 0 0 0', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {stats
                ? `${stats.totalDocuments} docs • ${stats.totalChunks} seções indexadas`
                : 'Pesquise regras, schemas e trechos do projeto'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleReindex}
            disabled={isReindexing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              borderRadius: '7px',
              border: '1px solid rgba(15, 23, 42, 0.1)',
              background: '#ffffff',
              color: '#334155',
              fontSize: '11px',
              fontWeight: 500,
              cursor: isReindexing ? 'wait' : 'pointer',
            }}
            title="Recarregar índice dos arquivos do disco"
          >
            <span className={`material-symbols-outlined ${isReindexing ? 'spin' : ''}`} style={{ fontSize: '13px' }}>
              sync
            </span>
            <span>{isReindexing ? 'Indexando...' : 'Reindexar'}</span>
          </button>

          <button
            className="btn-icon"
            type="button"
            onClick={closeRagModal}
            title="Fechar busca RAG"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>
      </div>

      {/* Search Bar & Auto-RAG Controls */}
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(15, 23, 42, 0.06)',
          background: '#ffffff',
          flexShrink: 0,
        }}
      >
          {/* Neutral Clean Input Bar without nested blue-on-blue outline */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '10px',
              border: isInputFocused ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              boxShadow: isInputFocused ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '18px',
                color: isInputFocused ? '#2563eb' : '#64748b',
                flexShrink: 0,
              }}
            >
              search
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="Digite termos para buscar (ex: sipoc, política de cancelamento, schema do usuário)..."
              style={{
                border: 'none',
                outline: 'none',
                boxShadow: 'none',
                width: '100%',
                fontSize: '13px',
                color: '#0f172a',
                background: 'transparent',
                fontWeight: 500,
                padding: '2px 0',
              }}
            />
            {isLoading && (
              <span className="material-symbols-outlined spin" style={{ fontSize: '16px', color: '#2563eb' }}>
                sync
              </span>
            )}
            {query && !isLoading && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                  inputRef.current?.focus();
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  close
                </span>
              </button>
            )}
          </div>

          {/* Sub-bar: Hint & Auto-RAG Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '10px',
              padding: '0 2px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              Dica: Anexe seções ao chat para que a IA foque apenas nos trechos relevantes.
            </span>
            <button
              type="button"
              onClick={toggleAutoRag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                borderRadius: '12px',
                border: isAutoRagEnabled ? '1px solid #10b981' : '1px solid #cbd5e1',
                background: isAutoRagEnabled ? 'rgba(16, 185, 129, 0.1)' : '#f8fafc',
                color: isAutoRagEnabled ? '#059669' : '#64748b',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                {isAutoRagEnabled ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>Modo Auto-RAG no Chat {isAutoRagEnabled ? '(Ativo)' : '(Desativado)'}</span>
            </button>
          </div>
        </div>

        {/* Results List Container - Fixed height flex with smooth scrolling */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#ffffff',
            minHeight: 0,
          }}
        >
          {query.trim() && results.length === 0 && !isLoading && (
            <div
              style={{
                margin: 'auto 0',
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#94a3b8', marginBottom: '8px' }}>
                search_off
              </span>
              <div style={{ fontWeight: 600, color: '#334155' }}>Nenhum trecho correspondente para "{query}".</div>
              <div style={{ fontSize: '11.5px', marginTop: '4px', color: '#94a3b8' }}>
                Tente outros termos ou clique em <b>Reindexar</b> para atualizar os arquivos.
              </div>
            </div>
          )}

          {!query.trim() && (
            <div
              style={{
                margin: 'auto 0',
                textAlign: 'center',
                padding: '40px 20px',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#3b82f6', marginBottom: '8px' }}>
                find_in_page
              </span>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>Pesquisa Semântica Local</div>
              <div style={{ fontSize: '12px', marginTop: '4px', color: '#64748b', maxWidth: '420px', margin: '6px auto 0' }}>
                Digite qualquer palavra-chave acima para buscar fragmentos e regras em todos os markdowns e schemas do workspace.
              </div>
            </div>
          )}

          {results.map((res) => {
            const isAttached = ragReferences.some((r) => r.id === res.chunkId);
            return (
              <div
                key={res.chunkId}
                style={{
                  borderRadius: '12px',
                  border: isAttached ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
                  background: isAttached ? 'rgba(59, 130, 246, 0.03)' : '#ffffff',
                  padding: '12px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                {/* Card Top: File, Section & Relevance */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#64748b' }}>
                      description
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {res.relativePath}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>•</span>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: '#475569',
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {res.sectionTitle}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        background: res.relevancePercent >= 75 ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                        color: res.relevancePercent >= 75 ? '#059669' : '#2563eb',
                      }}
                    >
                      {res.relevancePercent}% Match
                    </span>
                  </div>
                </div>

                {/* Snippet Preview (Markdown) */}
                <div
                  className="rag-snippet-markdown"
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    fontSize: '12px',
                    color: '#334155',
                    maxHeight: '180px',
                    overflowY: 'auto',
                    lineHeight: '1.5',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(marked.parse(res.snippet, { breaks: true, gfm: true }) as string),
                  }}
                />

                {/* Actions Bottom */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
                  <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                    Linhas {res.lineStart} a {res.lineEnd}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        loadFile(res.relativePath);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#334155',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      title="Abrir este arquivo diretamente no editor"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                        open_in_new
                      </span>
                      <span>Ver no Editor</span>
                    </button>

                    {isAttached ? (
                      <button
                        type="button"
                        onClick={() => removeRagReference(res.chunkId)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#dc2626',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                          remove_circle
                        </span>
                        <span>Desanexar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          addRagReference({
                            id: res.chunkId,
                            relativePath: res.relativePath,
                            sectionTitle: res.sectionTitle,
                            snippet: res.snippet,
                            score: res.score,
                          })
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #3b82f6',
                          background: '#2563eb',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                          attachment
                        </span>
                        <span>Anexar ao Chat</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
    </aside>
  );
};
