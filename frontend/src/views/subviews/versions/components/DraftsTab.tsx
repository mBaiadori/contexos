import React from "react";
import { Trash2 } from "lucide-react";
import {
  Card,
  Row,
  Button,
  Badge,
  FormField,
  Input,
  Textarea,
} from "../../../../components/ui";
import { DiffViewer } from "../../../../components/common";
import { VisualMarkdownDiff } from "../../../../components/editor/VisualMarkdownDiff";
import { useAI } from "../../../../context/AIContext";
import type { DraftItem } from "../types";

interface DraftsTabProps {
  allDraftFiles: DraftItem[];
  selectedRepoFilter: string;
  handleDiscardAll: () => void;
  toggleAllDraftFiles: () => void;
  expandedDraftFiles: Record<string, boolean>;
  toggleDraftFile: (path: string, repoName?: string) => void;
  getDraftDiffInfo: (
    path: string,
    repoName?: string,
  ) => {
    diffText: string;
    additions: number;
    deletions: number;
    type?: string;
    oldContent?: string;
    newContent?: string;
  };
  loadingDraftDiffs: Record<string, boolean>;
  handleOpenFileClick: (path: string) => void;
  handleDiscard: (path: string, repoName?: string) => void;
  handleCreateProposal: () => void;
  handleGenerateSummaryAI: () => void;
  isGeneratingAI: boolean;
  isClean: boolean;
  prTitle: string;
  setPrTitle: (val: string) => void;
  prDescription: string;
  setPrDescription: (val: string) => void;
  isCreatingPR: boolean;
}

export const DraftsTab: React.FC<DraftsTabProps> = ({
  allDraftFiles,
  selectedRepoFilter,
  handleDiscardAll,
  toggleAllDraftFiles,
  expandedDraftFiles,
  toggleDraftFile,
  getDraftDiffInfo,
  loadingDraftDiffs,
  handleOpenFileClick,
  handleDiscard,
  handleCreateProposal,
  handleGenerateSummaryAI,
  isGeneratingAI,
  isClean,
  prTitle,
  setPrTitle,
  prDescription,
  setPrDescription,
  isCreatingPR,
}) => {
  const { aiSettings, openSettingsModal } = useAI();
  const isAIConfigured = Boolean(
    aiSettings?.has_key ||
    aiSettings?.provider === "local" ||
    aiSettings?.provider === "ollama"
  );

  return (
    <div className="ui-stack ui-stack--lg">
      {/* Changed Files List */}
      <Card variant="elevated" padding="none">
        <div
          className="ui-card__header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 18px",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <div className="ui-row ui-row--align-center ui-row--xs">
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "20px",
                color: "var(--color-primary, #3b82f6)",
              }}
            >
              edit_note
            </span>
            <strong
              style={{
                fontSize: "14px",
                color: "var(--color-text-primary, #0f172a)",
              }}
            >
              Meus Documentos em Edição Local ({allDraftFiles.length})
            </strong>
            {selectedRepoFilter !== "all" && (
              <Badge variant="neutral" size="sm">
                {selectedRepoFilter}
              </Badge>
            )}
          </div>

          <div className="ui-row ui-row--align-center ui-row--xs">
            {allDraftFiles.length > 0 && (
              <>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => handleDiscardAll()}
                  style={{ color: "var(--color-danger, #dc2626)" }}
                  title="Descartar todas as alterações"
                  icon={<Trash2 size={13} />}
                >
                  Descartar Todas
                </Button>

                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={toggleAllDraftFiles}
                  icon={
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "16px" }}
                    >
                      {allDraftFiles.every(
                        (f) => !!expandedDraftFiles[`${f.repoName}:${f.path}`],
                      )
                        ? "unfold_less"
                        : "unfold_more"}
                    </span>
                  }
                >
                  {allDraftFiles.every(
                    (f) => !!expandedDraftFiles[`${f.repoName}:${f.path}`],
                  )
                    ? "Recolher Todos"
                    : "Expandir Todos"}
                </Button>
              </>
            )}
          </div>
        </div>

        {allDraftFiles.length === 0 ? (
          <div
            className="ui-empty-state"
            style={{ padding: "40px", textAlign: "center" }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "36px",
                color: "var(--color-success, #16a34a)",
                display: "block",
                marginBottom: "8px",
              }}
            >
              check_circle
            </span>
            <strong
              style={{
                display: "block",
                fontSize: "14px",
                color: "var(--color-text-primary)",
              }}
            >
              Nenhuma alteração pendente detectada
            </strong>
            <span
              className="ui-text-muted"
              style={{ fontSize: "13px", marginTop: "4px", display: "block" }}
            >
              Todos os seus documentos estão consolidados e sincronizados com o
              repositório.
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {allDraftFiles.map((file, idx) => {
              if (!file?.path) return null;
              const fileKey = `${file.repoName}:${file.path}`;
              const isExpanded = !!expandedDraftFiles[fileKey];
              const { diffText, additions, deletions, oldContent, newContent } =
                getDraftDiffInfo(file.path, file.repoName);
              const isLoadingDiff = !!loadingDraftDiffs[fileKey];

              return (
                <div
                  key={fileKey || idx}
                  style={{
                    borderBottom:
                      "1px solid var(--color-border-subtle, #e2e8f0)",
                    background: isExpanded
                      ? "var(--color-surface-subtle, #f8fafc)"
                      : "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 20px",
                      cursor: "pointer",
                      userSelect: "none",
                      background: isExpanded
                        ? "var(--color-primary-subtle, #f1f5f9)"
                        : "transparent",
                      transition: "background 0.15s ease",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div
                      onClick={() => toggleDraftFile(file.path, file.repoName)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        minWidth: 0,
                        flex: 1,
                        paddingRight: "16px",
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "20px",
                          color: isExpanded
                            ? "var(--color-primary, #1a73e8)"
                            : "var(--color-text-muted, #94a3b8)",
                          transition: "transform 0.2s ease",
                          transform: isExpanded
                            ? "rotate(90deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        chevron_right
                      </span>

                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "20px",
                          color:
                            file.status === "M"
                              ? "var(--color-warning, #d97706)"
                              : file.status === "A" || file.status === "??"
                                ? "var(--color-success, #16a34a)"
                                : file.status === "D"
                                  ? "var(--color-danger, #dc2626)"
                                  : "var(--color-text-muted, #64748b)",
                        }}
                      >
                        {file.status === "D"
                          ? "delete_outline"
                          : file.status === "A" || file.status === "??"
                            ? "note_add"
                            : "description"}
                      </span>

                      <span
                        style={{
                          fontFamily: "var(--font-family-mono)",
                          fontSize: "13px",
                          fontWeight: isExpanded ? 600 : 500,
                          color: "var(--color-text-primary, #0f172a)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={file.path}
                      >
                        {file.path}
                      </span>

                      {selectedRepoFilter === "all" && file.repoName && (
                        <Badge variant="neutral" size="sm">
                          {file.repoName}
                        </Badge>
                      )}

                      <Badge
                        variant={
                          file.status === "M"
                            ? "warning"
                            : file.status === "A" || file.status === "??"
                              ? "success"
                              : file.status === "D"
                                ? "danger"
                                : "neutral"
                        }
                        size="sm"
                      >
                        {file.status === "??"
                          ? "NOVO"
                          : file.status === "M"
                            ? "ALTERADO"
                            : file.status === "A"
                              ? "ADICIONADO"
                              : file.status === "D"
                                ? "REMOVIDO"
                                : file.status}
                      </Badge>
                    </div>

                    <div
                      className="ui-row ui-row--align-center ui-row--sm"
                      style={{ flexShrink: 0 }}
                    >
                      {(additions > 0 || deletions > 0) && (
                        <div
                          className="ui-row ui-row--xs"
                          style={{
                            fontFamily: "var(--font-family-mono)",
                            fontSize: "12px",
                            marginRight: "8px",
                          }}
                        >
                          {additions > 0 && (
                            <span
                              style={{
                                color: "var(--color-success, #16a34a)",
                                fontWeight: 600,
                              }}
                            >
                              +{additions}
                            </span>
                          )}
                          {deletions > 0 && (
                            <span
                              style={{
                                color: "var(--color-danger, #dc2626)",
                                fontWeight: 600,
                              }}
                            >
                              -{deletions}
                            </span>
                          )}
                        </div>
                      )}

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenFileClick(file.path);
                        }}
                        title="Abrir este documento no editor"
                        icon={
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "15px" }}
                          >
                            open_in_new
                          </span>
                        }
                      >
                        Abrir Documento
                      </Button>

                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          toggleDraftFile(file.path, file.repoName)
                        }
                      >
                        {isExpanded ? "Ocultar mudanças" : "Ver mudanças"}
                      </Button>

                      <Button
                        type="button"
                        size="xs"
                        variant="danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDiscard(file.path, file.repoName);
                        }}
                        title="Descartar modificações deste documento"
                      >
                        Descartar
                      </Button>
                    </div>
                  </div>

                  {/* Accordion Diff View */}
                  {isExpanded && (
                    <div
                      style={{
                        background: "var(--color-surface, #ffffff)",
                        borderTop:
                          "1px solid var(--color-border-subtle, #e2e8f0)",
                      }}
                    >
                      {isLoadingDiff ? (
                        <div
                          style={{
                            padding: "24px",
                            textAlign: "center",
                            color: "var(--color-text-muted)",
                            fontSize: "13px",
                          }}
                        >
                          Carregando diferenças da versão...
                        </div>
                      ) : oldContent ||
                        newContent ||
                        file.old_content ||
                        file.new_content ? (
                        <VisualMarkdownDiff
                          oldContent={oldContent || file.old_content || ""}
                          newContent={newContent || file.new_content || ""}
                          fileName={file.path}
                          oldTitle="Versão Base"
                          newTitle="Rascunho Atual"
                          hideHeader={true}
                        />
                      ) : (
                        <div style={{ padding: "12px 16px" }}>
                          <DiffViewer
                            diffText={diffText}
                            isLoading={isLoadingDiff}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Version Milestone Proposal Form */}
      <Card variant="elevated" className="ui-card--p-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateProposal();
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <Row
            justify="between"
            align="center"
            style={{ width: "100%", marginBottom: "4px" }}
          >
            <div className="ui-row ui-row--align-center ui-row--xs">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "20px",
                  color: "var(--color-primary, #1a73e8)",
                }}
              >
                alt_route
              </span>
              <h3 className="ui-card__title" style={{ margin: 0 }}>
                Propor Atualização de Versão
              </h3>
              {selectedRepoFilter !== "all" && (
                <Badge variant="primary" size="sm">
                  {selectedRepoFilter}
                </Badge>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {!isAIConfigured && (
                <button
                  type="button"
                  onClick={openSettingsModal}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11.5px",
                    fontWeight: 500,
                    color: "var(--color-primary, #2563eb)",
                    background: "var(--color-primary-container-low, rgba(37, 99, 235, 0.08))",
                    border: "1px solid var(--color-primary-container, rgba(37, 99, 235, 0.2))",
                    cursor: "pointer",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    transition: "all 0.15s ease",
                  }}
                  title="Clique para configurar IA (Gemini, OpenAI, Claude ou Ollama)"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                    smart_toy
                  </span>
                  <span>Configurar IA</span>
                </button>
              )}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleGenerateSummaryAI()}
                disabled={isGeneratingAI || isClean}
                icon={
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "15px",
                      animation: isGeneratingAI
                        ? "spin 1s linear infinite"
                        : "none",
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
                  ? "Gerando resumo..."
                  : isAIConfigured
                  ? "Sugerir com IA"
                  : "Gerar Resumo"}
              </Button>
            </div>
          </Row>

          {isClean && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                background: "var(--color-surface-container-low, #f8fafc)",
                border: "1px dashed var(--color-outline-variant, #cbd5e1)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "12.5px",
                color: "var(--color-on-surface-variant, #64748b)",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "18px",
                  color: "var(--color-primary, #2563eb)",
                  flexShrink: 0,
                }}
              >
                info
              </span>
              <span>
                Nenhum arquivo modificado detectado no momento. Edite ou crie
                documentos no editor e salve suas alterações (Ctrl+S) para
                propor uma nova versão.
              </span>
            </div>
          )}

          <FormField
            label="Nome da Proposta de Versão"
            required
            helperText="Este nome identificará suas alterações na esteira de revisão e na Árvore de Versões"
          >
            <Input
              id="draft-pr-title"
              placeholder="Ex: Atualização das regras de governança e termos"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              disabled={isCreatingPR}
            />
          </FormField>

          <FormField label="Descrição & Justificativa">
            <Textarea
              id="draft-pr-description"
              rows={3}
              placeholder="Detalhe os motivos das alterações, impactos e itens adicionados..."
              value={prDescription}
              onChange={(e) => setPrDescription(e.target.value)}
              disabled={isCreatingPR}
            />
          </FormField>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "4px",
            }}
          >
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isCreatingPR}
              isLoading={isCreatingPR}
              icon={
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "18px" }}
                >
                  call_split
                </span>
              }
            >
              {isCreatingPR ? "Criando Proposta..." : "Propor Alteração"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
