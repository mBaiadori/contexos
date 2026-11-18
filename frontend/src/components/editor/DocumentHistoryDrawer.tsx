import React, { useState, useEffect } from "react";
import type { GitCommitInfo, DocumentMetadataItem } from "../../types";
import { API } from "../../services/api";

interface DocumentHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string;
  selectedCommitHash: string | null;
  onSelectCommit: (commit: GitCommitInfo | null) => void;
  documentMeta?: DocumentMetadataItem | null;
}

export const DocumentHistoryDrawer: React.FC<DocumentHistoryDrawerProps> = ({
  isOpen,
  onClose,
  filePath,
  selectedCommitHash,
  onSelectCommit,
  documentMeta,
}) => {
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && filePath) {
      loadHistory();
    }
  }, [isOpen, filePath]);

  const loadHistory = async () => {
    if (!filePath) return;
    setIsLoading(true);
    try {
      const res = await API.getFileGitHistory(filePath, 30);
      if (res.ok && res.data?.commits) {
        setCommits(res.data.commits);
      } else {
        setCommits([]);
      }
    } catch (err) {
      console.error(
        "[DocumentHistoryDrawer] Erro ao carregar histórico do arquivo:",
        err,
      );
      setCommits([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const approvers = documentMeta?.approvers || [];
  const status = documentMeta?.status || "-";

  return (
    <aside
      className="document-history-drawer"
      style={{
        width: "320px",
        flexShrink: 0,
        position: "relative",
        borderLeft: "1px solid var(--border-color, #e2e8f0)",
        background: "var(--bg-surface, #ffffff)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        boxShadow: "-2px 0 8px rgba(0,0,0,0.03)",
        zIndex: 50,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border-color, #e2e8f0)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--bg-surface-secondary, #f8fafc)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary, #3b82f6)", fontSize: "20px" }}
          >
            history_edu
          </span>
          <div>
            <strong
              style={{
                fontSize: "13.5px",
                color: "var(--text-heading, #0f172a)",
              }}
            >
              Linha do Tempo de Versões
            </strong>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted, #64748b)",
                display: "block",
              }}
            >
              Evolução e auditoria do documento
            </span>
          </div>
        </div>
        <button
          type="button"
          className="btn-close"
          aria-label="Fechar gaveta de histórico"
          onClick={onClose}
        >
          <span className="material-symbols-outlined icon-sm">close</span>
        </button>
      </div>

      {/* Governance & Metadata Card */}
      {documentMeta && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            background: "var(--bg-surface, #ffffff)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "6px",
            }}
          >
            <span
              style={{
                fontSize: "11.5px",
                fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              Status de Governança:
            </span>
            <span
              className={`badge ${status === "approved" ? "badge-success" : "badge-neutral"}`}
              style={{ fontSize: "10.5px" }}
            >
              {status.toUpperCase()}
            </span>
          </div>
          {approvers.length > 0 ? (
            <div style={{ fontSize: "11.5px", color: "var(--text-normal)" }}>
              <span style={{ color: "var(--text-muted)" }}>Aprovadores: </span>
              <strong>{approvers.join(", ")}</strong>
            </div>
          ) : (
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-dim)",
                fontStyle: "italic",
              }}
            >
              Nenhum aprovador formal atribuído.
            </div>
          )}
        </div>
      )}

      {/* Timeline List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {/* Working Copy (Rascunho) Item */}
        <div
          onClick={() => onSelectCommit(null)}
          style={{
            border:
              selectedCommitHash === null
                ? "2px solid var(--primary, #3b82f6)"
                : "1px solid var(--border-color, #e2e8f0)",
            borderRadius: "8px",
            padding: "10px 12px",
            background:
              selectedCommitHash === null
                ? "#eff6ff"
                : "var(--bg-surface, #ffffff)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "4px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="pill-dot primary">
                <span className="dot"></span>{" "}
                <strong>Rascunho Atual (Em Edição)</strong>
              </span>
            </div>
            {selectedCommitHash === null && (
              <span
                className="badge badge-primary-subtle"
                style={{ fontSize: "10px" }}
              >
                Ativo
              </span>
            )}
          </div>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "11.5px",
              color: "var(--text-muted)",
            }}
          >
            Estado atual no editor com suas alterações em tempo real
          </p>
        </div>

        <div
          style={{
            fontSize: "11.5px",
            fontWeight: 600,
            color: "var(--text-dim)",
            margin: "8px 0 4px 0",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Versões Registradas ({commits.length})
        </div>

        {isLoading ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "12px",
            }}
          >
            <span
              className="material-symbols-outlined icon-sm"
              style={{
                animation: "spin 1s linear infinite",
                marginBottom: "6px",
              }}
            >
              progress_activity
            </span>
            <div>Carregando histórico...</div>
          </div>
        ) : commits.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "12px",
            }}
          >
            Nenhuma versão histórica registrada para este documento.
          </div>
        ) : (
          commits.map((commit) => {
            const isSelected = selectedCommitHash === commit.hash;

            return (
              <div
                key={commit.hash}
                onClick={() => onSelectCommit(commit)}
                style={{
                  border: isSelected
                    ? "2px solid var(--primary, #3b82f6)"
                    : "1px solid var(--border-color, #e2e8f0)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  background: isSelected
                    ? "#eff6ff"
                    : "var(--bg-surface, #ffffff)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    className="badge badge-neutral"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10.5px",
                      fontWeight: 600,
                    }}
                  >
                    #{commit.shortHash || commit.hash.slice(0, 7)}
                  </span>
                  <span
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    {commit.date}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "var(--text-heading, #0f172a)",
                    margin: "3px 0",
                    lineHeight: "1.3",
                  }}
                >
                  {commit.message}
                </div>

                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    marginTop: "4px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "13px" }}
                  >
                    person
                  </span>
                  <span>{commit.author}</span>
                  {isSelected && (
                    <span
                      className="badge badge-primary-subtle"
                      style={{ marginLeft: "auto", fontSize: "10px" }}
                    >
                      Comparando
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border-color, #e2e8f0)",
          background: "var(--bg-surface-secondary, #f8fafc)",
          fontSize: "11px",
          color: "var(--text-dim)",
          textAlign: "center",
        }}
      >
        Clique em uma versão anterior para comparar visualmente com o rascunho
        atual.
      </div>
    </aside>
  );
};
