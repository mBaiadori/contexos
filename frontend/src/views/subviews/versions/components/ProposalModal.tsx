import React from "react";
import { FolderGit2, Trash2, Send, CheckCircle, ChevronRight } from "lucide-react";
import { Modal, Row, Button, Badge, FormField, Input, Textarea } from "../../../../components/ui";
import { DiffViewer } from "../../../../components/common";
import { VisualMarkdownDiff } from "../../../../components/editor/VisualMarkdownDiff";
import { useAI } from "../../../../context/AIContext";
import type { DraftItem } from "../types";
import type { Repo } from "../../../../types";

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalTargetRepo: string;
  setModalTargetRepo: (val: string) => void;
  repos: Repo[] | null;
  activeRepo: Repo | null;
  repoEditsCounts: Record<string, number>;
  modalDraftFiles: DraftItem[];
  expandedDraftFiles: Record<string, boolean>;
  loadingDraftDiffs: Record<string, boolean>;
  getDraftDiffInfo: (path: string, repoName?: string) => {
    diffText: string;
    additions: number;
    deletions: number;
    type?: string;
    oldContent?: string;
    newContent?: string;
  };
  toggleDraftFile: (path: string, repoName?: string) => void;
  handleDiscard: (path: string, repoName?: string) => void;
  handleDiscardAll: (repo?: string) => void;
  handleCreateProposal: (repo?: string) => void;
  handleGenerateSummaryAI: (repo?: string) => void;
  isGeneratingAI: boolean;
  isCreatingPR: boolean;
  prTitle: string;
  setPrTitle: (val: string) => void;
  prDescription: string;
  setPrDescription: (val: string) => void;
}

export const ProposalModal: React.FC<ProposalModalProps> = ({
  isOpen,
  onClose,
  modalTargetRepo,
  setModalTargetRepo,
  repos,
  activeRepo,
  repoEditsCounts,
  modalDraftFiles,
  expandedDraftFiles,
  loadingDraftDiffs,
  getDraftDiffInfo,
  toggleDraftFile,
  handleDiscard,
  handleDiscardAll,
  handleCreateProposal,
  handleGenerateSummaryAI,
  isGeneratingAI,
  isCreatingPR,
  prTitle,
  setPrTitle,
  prDescription,
  setPrDescription,
}) => {
  const { aiSettings, openSettingsModal } = useAI();
  const isAIConfigured = Boolean(
    aiSettings?.has_key ||
    aiSettings?.provider === "local" ||
    aiSettings?.provider === "ollama"
  );

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "22px", color: "var(--color-primary, #2563eb)" }}
          >
            alt_route
          </span>
          <span>Proposta de Nova Versão & Edições</span>
        </div>
      }
      subtitle="Escolha o repositório para revisar as alterações pendentes e enviar para aprovação."
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {modalDraftFiles.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDiscardAll(modalTargetRepo)}
              icon={<Trash2 size={14} />}
            >
              Descartar Todas ({modalDraftFiles.length})
            </Button>
          ) : (
            <div />
          )}

          <Row gap="sm">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Cancelar
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={modalDraftFiles.length === 0 || isCreatingPR || !prTitle.trim()}
              isLoading={isCreatingPR}
              onClick={() => handleCreateProposal(modalTargetRepo)}
              icon={<Send size={14} />}
            >
              {isCreatingPR ? "Enviando..." : "Submeter Proposta"}
            </Button>
          </Row>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Repo Selector within Modal */}
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "10px",
            background: "var(--md-sys-color-surface-container-low, #f8fafc)",
            border: "1px solid var(--md-sys-color-outline-variant, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FolderGit2 size={18} color="var(--md-sys-color-primary, #1a73e8)" />
            <div>
              <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                Repositório da Proposta
              </span>
              <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {modalTargetRepo}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)" }}>Alternar:</span>
            <select
              value={modalTargetRepo}
              onChange={(e) => {
                setModalTargetRepo(e.target.value);
                setPrTitle("");
                setPrDescription("");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                border: "1px solid var(--color-border-subtle, #cbd5e1)",
                fontSize: "12.5px",
                fontWeight: 600,
                background: "var(--color-surface, #ffffff)",
                color: "var(--color-text-primary, #0f172a)",
                cursor: "pointer",
              }}
            >
              {(repos && repos.length > 0 ? repos : [{ name: activeRepo?.name || "local" }]).map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} ({repoEditsCounts[r.name] || 0} alterações)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List of files modified in this repo */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <strong style={{ fontSize: "13.5px", color: "var(--color-text-primary)" }}>
              Arquivos alterados em {modalTargetRepo} ({modalDraftFiles.length})
            </strong>
            {modalDraftFiles.length > 0 && (
              <span className="ui-text-muted" style={{ fontSize: "12px" }}>
                Clique no arquivo para expandir a comparação
              </span>
            )}
          </div>

          {modalDraftFiles.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                borderRadius: "8px",
                background: "var(--color-surface-subtle, #f8fafc)",
                border: "1px dashed var(--color-border-subtle, #cbd5e1)",
              }}
            >
              <CheckCircle size={28} color="var(--color-success, #16a34a)" style={{ margin: "0 auto 8px auto" }} />
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                Nenhum arquivo modificado neste repositório.
              </div>
              <div className="ui-text-muted" style={{ fontSize: "12px", marginTop: "4px" }}>
                Edite ou crie arquivos no editor e salve (Ctrl+S) para incluir nesta proposta.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                maxHeight: "260px",
                overflowY: "auto",
                border: "1px solid var(--color-border-subtle, #e2e8f0)",
                borderRadius: "8px",
                padding: "6px",
              }}
            >
              {modalDraftFiles.map((file) => {
                const fileKey = `${file.repoName}:${file.path}`;
                const isExpanded = !!expandedDraftFiles[fileKey];
                const { diffText } = getDraftDiffInfo(file.path, file.repoName);
                const isLoading = !!loadingDraftDiffs[fileKey];

                return (
                  <div
                    key={fileKey}
                    style={{
                      borderRadius: "6px",
                      border: "1px solid var(--color-border-subtle, #e2e8f0)",
                      background: isExpanded ? "var(--color-surface-subtle, #f8fafc)" : "var(--color-surface, #ffffff)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                      }}
                      onClick={() => toggleDraftFile(file.path, file.repoName)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                        <ChevronRight
                          size={15}
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "none",
                            transition: "transform 0.15s ease",
                            color: "var(--color-text-muted)",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--font-family-mono)",
                            fontWeight: 600,
                            color: "var(--color-text-primary)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {file.path}
                        </span>
                        <Badge
                          variant={
                            file.status === "M"
                              ? "warning"
                              : file.status === "A" || file.status === "??"
                                ? "success"
                                : "danger"
                          }
                          size="sm"
                        >
                          {file.status === "??" ? "NOVO" : file.status === "M" ? "MODIFICADO" : "REMOVIDO"}
                        </Badge>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <Button
                          type="button"
                          size="xs"
                          variant="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiscard(file.path, file.repoName);
                          }}
                          title="Descartar este arquivo"
                        >
                          Descartar
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ borderTop: "1px solid var(--color-border-subtle, #e2e8f0)", background: "var(--color-surface, #ffffff)" }}>
                        {(file.old_content || file.new_content) ? (
                          <VisualMarkdownDiff
                            oldContent={file.old_content || ""}
                            newContent={file.new_content || ""}
                            fileName={file.path}
                            oldTitle="Versão Base"
                            newTitle="Nova Versão"
                            hideHeader={true}
                          />
                        ) : (
                          <div style={{ padding: "8px" }}>
                            <DiffViewer diffText={diffText} isLoading={isLoading} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Proposal Form Inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
              Detalhes da Proposta
            </strong>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {!isAIConfigured && (
                <button
                  type="button"
                  onClick={openSettingsModal}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "11px",
                    fontWeight: 500,
                    color: "var(--color-primary, #2563eb)",
                    background: "var(--color-primary-container-low, rgba(37, 99, 235, 0.08))",
                    border: "1px solid var(--color-primary-container, rgba(37, 99, 235, 0.2))",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                  title="Configurar IA nas configurações"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                    smart_toy
                  </span>
                  <span>Configurar IA</span>
                </button>
              )}

              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={() => handleGenerateSummaryAI(modalTargetRepo)}
                disabled={isGeneratingAI || modalDraftFiles.length === 0}
                icon={
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "14px",
                      animation: isGeneratingAI ? "spin 1s linear infinite" : "none",
                    }}
                  >
                    {isGeneratingAI
                      ? "progress_activity"
                      : isAIConfigured
                      ? "auto_fix_high"
                      : "difference"}
                  </span>
                }
                title={
                  isAIConfigured
                    ? "Analisar alterações e sugerir nome e descrição em linguagem natural com IA"
                    : "Gerar resumo estruturado das alterações"
                }
              >
                {isGeneratingAI
                  ? "Gerando..."
                  : isAIConfigured
                  ? "Sugerir com IA"
                  : "Gerar Resumo"}
              </Button>
            </div>
          </div>

          <FormField
            label="Nome da Proposta de Versão"
            required
            helperText="Este nome identificará suas alterações na esteira de revisão e na Árvore de Versões"
          >
            <Input
              placeholder="Ex: Atualização dos termos e documentações canônicas"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              disabled={isCreatingPR}
            />
          </FormField>

          <FormField
            label="Descrição & Justificativa"
            helperText="Opcional: contexto adicional para os aprovadores"
          >
            <Textarea
              rows={3}
              placeholder="Explique detalhadamente as mudanças e o motivo desta versão..."
              value={prDescription}
              onChange={(e) => setPrDescription(e.target.value)}
              disabled={isCreatingPR}
            />
          </FormField>
        </div>
      </div>
    </Modal>
  );
};
