import React, { useState } from "react";
import type { GitGraphCommit, VersionNode } from "../../../../types";
import { Button, Input } from "../../../../components/ui";

export interface CommitPanelProps {
  commit: GitGraphCommit | null;
  targetBranchName?: string | null;
  currentBranch: string;
  defaultBranch?: string;
  isDetached?: boolean;
  headHash?: string;
  nodes?: VersionNode[];
  onClose: () => void;
  onSwitch: (target: {
    branch?: string;
    commitHash?: string;
  }) => void | Promise<void>;
  onCreateBranch: (name: string, fromHash: string) => void | Promise<void>;
  onCompare?: (branchName: string) => void;
  onPublish?: (branchName: string) => void;
  onDeleteBranch?: (branchName: string) => void | Promise<void>;
  isProcessing?: boolean;
}

export const CommitPanel: React.FC<CommitPanelProps> = ({
  commit,
  targetBranchName,
  currentBranch,
  defaultBranch = "main",
  isDetached = false,
  headHash,
  nodes = [],
  onClose,
  onSwitch,
  onCreateBranch,
  onCompare,
  onPublish,
  onDeleteBranch,
  isProcessing = false,
}) => {
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!commit) return null;

  // Informações do nó selecionado
  const nodeObj = targetBranchName
    ? nodes.find((n) => n.name === targetBranchName)
    : null;

  const isSelectedBranch = Boolean(
    targetBranchName && targetBranchName !== defaultBranch,
  );
  const isSelectedMain =
    targetBranchName === defaultBranch ||
    (!targetBranchName && Boolean(commit.isMainLineage));

  // Verifica se o nó selecionado é o atualmente ativo no workspace
  const isCurrentActive = isSelectedMain
    ? !isDetached &&
      currentBranch === defaultBranch &&
      (commit.isHead || commit.hash === headHash)
    : isSelectedBranch
      ? !isDetached && currentBranch === targetBranchName
      : isDetached && Boolean(headHash) && commit.hash === headHash;

  const handleCreateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBranchName.trim().replace(/\s+/g, "-");
    if (!clean) return;
    const baseRef = isSelectedMain
      ? defaultBranch
      : targetBranchName
        ? targetBranchName
        : commit.hash;
    await onCreateBranch(clean, baseRef);
    setNewBranchName("");
    setIsCreatingBranch(false);
  };

  const displayName = isSelectedMain
    ? "Versão Oficial"
    : nodeObj?.displayName ||
      targetBranchName ||
      commit.shortHash ||
      commit.hash.slice(0, 7);

  const isRejected =
    !nodeObj?.isMerged &&
    (nodeObj?.publicationStatus === "rejected" ||
      nodeObj?.proposal?.status === "CLOSED" ||
      nodeObj?.proposal?.status === "REJECTED");

  const statusLabel = isSelectedMain
    ? null
    : nodeObj?.publicationStatus === "published" || nodeObj?.isMerged
      ? { text: "Publicada ✓", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" }
      : isRejected
        ? { text: "Publicação Rejeitada", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" }
        : nodeObj?.publicationStatus === "open"
          ? { text: "Em Publicação", color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" }
          : nodeObj?.publicationStatus === "remote_only"
            ? { text: "De Colega (Na Nuvem)", color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" }
            : nodeObj?.hasRemote
              ? { text: "Sincronizada na Nuvem", color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" }
              : { text: "Rascunho Local", color: "#d97706", bg: "#fffbeb", border: "#fde68a" };

  return (
    <div
      id="commit-details-panel"
      style={{
        width: "380px",
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-color)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.05)",
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border-color)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "8px",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-secondary)",
            }}
          >
            {isSelectedMain
              ? "Versão Oficial"
              : isSelectedBranch
                ? "Rascunho de Versão"
                : "Checkpoint"}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "4px",
              flexWrap: "wrap",
            }}
          >
            {isSelectedMain ? (
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "#1d4ed8",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                }}
              >
                ★ Versão Oficial
              </span>
            ) : isSelectedBranch ? (
              <>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 700,
                    color: nodeObj?.isMerged ? "#15803d" : "#7e22ce",
                    background: nodeObj?.isMerged ? "#f0fdf4" : "#faf5ff",
                    border: `1px solid ${
                      nodeObj?.isMerged ? "#bbf7d0" : "#e9d5ff"
                    }`,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                  }}
                >
                  {displayName}
                  {nodeObj?.isMerged ? " ✓" : ""}
                </span>
                {statusLabel && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: statusLabel.color,
                      background: statusLabel.bg,
                      border: `1px solid ${statusLabel.border}`,
                      padding: "2px 8px",
                      borderRadius: "9999px",
                    }}
                  >
                    {statusLabel.text}
                  </span>
                )}
              </>
            ) : null}

            <code
              style={{
                fontFamily: "monospace",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-secondary)",
                background: "var(--bg-main)",
                padding: "2px 6px",
                borderRadius: "4px",
                border: "1px solid var(--border-color)",
              }}
            >
              {commit.shortHash || commit.hash.slice(0, 7)}
            </code>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          title="Fechar painel"
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--text-secondary)",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px" }}
          >
            close
          </span>
        </button>
      </div>

      {/* Conteúdo */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          flex: 1,
        }}
      >
        {/* Mensagem do Commit */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Descrição do Checkpoint
          </label>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--text-heading)",
              lineHeight: 1.45,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "var(--bg-main)",
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
            }}
          >
            {commit.message || "Sem descrição"}
          </div>
        </div>

        {/* Metadados: Autor e Data */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            background: "var(--bg-main)",
            padding: "10px 12px",
            borderRadius: "6px",
            border: "1px solid var(--border-color)",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                display: "block",
              }}
            >
              Autor
            </span>
            <strong style={{ fontSize: "12px", color: "var(--text-heading)" }}>
              {commit.author || "Sistema"}
            </strong>
          </div>
          <div>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                display: "block",
              }}
            >
              Data
            </span>
            <strong style={{ fontSize: "12px", color: "var(--text-heading)" }}>
              {commit.date
                ? new Date(commit.date).toLocaleDateString("pt-BR")
                : "—"}
            </strong>
          </div>
        </div>

        {/* Seção de Ações: Apenas as ações do nó selecionado */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginTop: "auto",
            paddingTop: "16px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          {/* Status ativo se já estiver neste nó */}
          {isCurrentActive ? (
            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-success, #16a34a)",
                textAlign: "center",
                padding: "4px 0",
              }}
            >
              ✓ Versão atual ativa no workspace
            </div>
          ) : (
            /* Botão Único de Alternar para o nó selecionado */
            <Button
              variant="primary"
              size="sm"
              disabled={isProcessing}
              onClick={() => {
                if (isSelectedBranch && targetBranchName) {
                  onSwitch({ branch: targetBranchName });
                } else if (isSelectedMain) {
                  onSwitch({ branch: defaultBranch });
                } else {
                  onSwitch({ commitHash: commit.hash });
                }
              }}
              style={{
                width: "100%",
                fontWeight: 600,
                background: isSelectedMain ? "#2563eb" : undefined,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px", flexShrink: 0 }}
              >
                sync_alt
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {isProcessing
                  ? "Alternando..."
                  : isSelectedBranch
                    ? `Trabalhar em "${displayName}"`
                    : isSelectedMain
                      ? "Voltar para Versão Oficial"
                      : "Visualizar este checkpoint"}
              </span>
            </Button>
          )}

          {/* Comparar com a Versão Oficial */}
          {isSelectedBranch && targetBranchName && onCompare && (
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => onCompare(targetBranchName)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                compare_arrows
              </span>
              <span>Comparar com Versão Oficial</span>
            </Button>
          )}

          {/* Enviar para Publicação (PR) */}
          {isSelectedBranch &&
            targetBranchName &&
            !nodeObj?.isMerged &&
            onPublish && (
              <Button
                variant="secondary"
                size="sm"
                disabled={isProcessing}
                onClick={() => onPublish(targetBranchName)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                  publish
                </span>
                <span>
                  {nodeObj?.publicationStatus === "open" || nodeObj?.proposal?.status === "OPEN"
                    ? "Atualizar Publicação"
                    : isRejected
                      ? "Reenviar para Publicação"
                      : "Enviar para Publicação"}
                </span>
              </Button>
            )}

          {isRejected && nodeObj?.proposal?.rejection_reason && (
            <div
              style={{
                fontSize: "11.5px",
                color: "#991b1b",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "8px 10px",
                lineHeight: 1.4,
              }}
            >
              <strong>Motivo da rejeição:</strong> {nodeObj.proposal.rejection_reason}
            </div>
          )}

          {isSelectedBranch &&
            targetBranchName &&
            !isSelectedMain &&
            !nodeObj?.isMerged &&
            onDeleteBranch && (
              confirmDelete ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                  }}
                >
                  <span style={{ fontSize: "11.5px", color: "#991b1b", flex: 1 }}>
                    {nodeObj?.publicationStatus === "open" || nodeObj?.proposal?.status === "OPEN"
                      ? "Excluir rascunho e encerrar publicação?"
                      : nodeObj?.hasRemote
                        ? "Excluir rascunho local e remoto?"
                        : "Excluir rascunho local?"}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isProcessing}
                    onClick={async () => {
                      setConfirmDelete(false);
                      await onDeleteBranch(targetBranchName);
                    }}
                  >
                    Excluir
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    width: "100%",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                    delete_outline
                  </span>
                  <span>Excluir Rascunho</span>
                </Button>
              )
            )}

          {/* Ação: Novo rascunho a partir deste checkpoint */}
          {!isCreatingBranch ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              onClick={() => setIsCreatingBranch(true)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                add
              </span>
              <span>Criar novo rascunho a partir daqui</span>
            </Button>
          ) : (
            <form
              onSubmit={handleCreateBranchSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "var(--bg-main)",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
              }}
            >
              <label
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--text-heading)",
                }}
              >
                Nome do novo rascunho de versão:
              </label>
              <Input
                type="text"
                placeholder="ex: ajuste-layout ou minha-versao"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                autoFocus
                style={{ height: "32px", fontSize: "12px" }}
              />
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  justifyContent: "flex-end",
                }}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingBranch(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!newBranchName.trim() || isProcessing}
                >
                  Criar e alternar
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
