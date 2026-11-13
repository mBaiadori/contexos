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
  onMerge: (sourceBranch: string) => void | Promise<void>;
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
  onMerge,
  isProcessing = false,
}) => {
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [isConfirmingMerge, setIsConfirmingMerge] = useState(false);

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
    await onCreateBranch(clean, commit.hash);
    setNewBranchName("");
    setIsCreatingBranch(false);
  };

  const handleMergeConfirm = async () => {
    if (!targetBranchName) return;
    setIsConfirmingMerge(false);
    await onMerge(targetBranchName);
  };

  const displayName = isSelectedMain
    ? "Principal"
    : nodeObj?.displayName ||
      targetBranchName ||
      commit.shortHash ||
      commit.hash.slice(0, 7);

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
              ? "Versão Principal"
              : isSelectedBranch
                ? "Detalhes da Versão"
                : "Detalhes do Marco"}
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
                ★ Principal
              </span>
            ) : isSelectedBranch ? (
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
            Mensagem do Marco
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
            {commit.message || "Sem mensagem"}
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
              {commit.author || "Git"}
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
              }}
            >
              {isProcessing ? "Alternando..." : `Alternar para esta versão`}
            </Button>
          )}

          {/* Opção de Mesclar (Merge) se for uma branch não mesclada diferente da atual */}
          {isSelectedBranch &&
            targetBranchName &&
            !nodeObj?.isMerged &&
            targetBranchName !== currentBranch && (
              <div>
                {!isConfirmingMerge ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => setIsConfirmingMerge(true)}
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
                      call_merge
                    </span>
                    <span>Mesclar na versão atual</span>
                  </Button>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      background: "rgba(220, 38, 38, 0.05)",
                      border: "1px solid rgba(220, 38, 38, 0.2)",
                      padding: "8px",
                      borderRadius: "6px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#dc2626",
                      }}
                    >
                      Deseja mesclar "{targetBranchName}" em "{currentBranch}"?
                    </span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsConfirmingMerge(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleMergeConfirm}
                        disabled={isProcessing}
                        style={{ background: "#dc2626", color: "#ffffff" }}
                      >
                        Confirmar Merge
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Ação: Nova branch a partir deste marco */}
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
              <span>Criar nova versão a partir daqui</span>
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
                Nome da nova versão (branch):
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
