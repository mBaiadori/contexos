import React from "react";
import { Button, Badge, Card } from "../../../../components/ui";
import { VisualMarkdownDiff } from "../../../../components/editor/VisualMarkdownDiff";
import type { PR } from "../../../../types";
import type { PRFileDiffData } from "../types";

interface PRFileListProps {
  pr: PR;
  isOpen: boolean;
  prFiles: any[];
  collapsedFiles: Record<string, boolean>;
  toggleFileCollapse: (key: string) => void;
  handleExpandAllFiles: (prId: number | string, files: any[]) => void;
  handleCollapseAllFiles: (prId: number | string, files: any[]) => void;
  fileDiffsData: Record<string, PRFileDiffData>;
  fileDiffsCache: Record<string, string>;
  loadingDiffs: Record<string, boolean>;
  handleEditDocumentInPR: (pr: PR, path: string) => void;
}

export const PRFileList: React.FC<PRFileListProps> = ({
  pr,
  isOpen,
  prFiles,
  collapsedFiles,
  toggleFileCollapse,
  handleExpandAllFiles,
  handleCollapseAllFiles,
  fileDiffsData,
  fileDiffsCache,
  loadingDiffs,
  handleEditDocumentInPR,
}) => {
  return (
    <>
      {prFiles.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-text-primary, #0f172a)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                flexWrap: "wrap",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "16px",
                  color: "var(--md-sys-color-primary, #1a73e8)",
                }}
              >
                difference
              </span>
              <span>
                Documentos Alterados ({prFiles.length}):
              </span>
            </div>

            {prFiles.length > 1 && (
              <div className="ui-row ui-row--align-center ui-row--xs">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    handleExpandAllFiles(pr.id, prFiles)
                  }
                  icon={
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      unfold_more
                    </span>
                  }
                >
                  Expandir todos
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    handleCollapseAllFiles(pr.id, prFiles)
                  }
                  icon={
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      unfold_less
                    </span>
                  }
                >
                  Recolher todos
                </Button>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {prFiles.map((f: any, fIdx: number) => {
              const fileKey = `${pr.id}-${f.path || fIdx}`;
              const isFileCollapsed = collapsedFiles[fileKey] !== undefined ? collapsedFiles[fileKey] : true;
              const diffInfo = fileDiffsData[fileKey];
              const isRestricted =
                !!f.restricted || !!diffInfo?.restricted;
              const fileDiff =
                f.diff_text ||
                diffInfo?.diff ||
                fileDiffsCache[fileKey] ||
                "";
              const oldContent =
                diffInfo?.old_content || f.old_content || "";
              const newContent =
                diffInfo?.new_content || f.new_content || "";
              const isLoadingDiff = loadingDiffs[fileKey];

              return (
                <Card
                  key={fIdx}
                  variant="flat"
                  style={{
                    padding: 0,
                    overflow: "hidden",
                    border: isRestricted
                      ? "1px solid var(--color-warning-subtle, #fde68a)"
                      : "1px solid var(--color-border-subtle, #e2e8f0)",
                  }}
                >
                  <div
                    onClick={() => toggleFileCollapse(fileKey)}
                    style={{
                      padding: "8px 12px",
                      background: isRestricted
                        ? "var(--color-warning-subtle, #fefce8)"
                        : "var(--color-surface-subtle, #f8fafc)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontFamily: "var(--font-family-mono)",
                      flexWrap: "wrap",
                      gap: "8px",
                      cursor: "pointer",
                      userSelect: "none",
                      borderBottom: !isFileCollapsed
                        ? "1px solid var(--color-border-subtle, #e2e8f0)"
                        : "none",
                    }}
                  >
                    <div className="ui-row ui-row--align-center ui-row--xs">
                      <span
                        className="material-symbols-outlined icon-xs"
                        style={{
                          fontSize: "18px",
                          color:
                            "var(--color-text-muted, #64748b)",
                          transition: "transform 0.2s ease",
                          transform: isFileCollapsed
                            ? "rotate(-90deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        expand_more
                      </span>
                      <span
                        className="material-symbols-outlined icon-xs"
                        style={{
                          color: isRestricted
                            ? "var(--color-warning, #d97706)"
                            : "var(--md-sys-color-primary, #1a73e8)",
                        }}
                      >
                        {isRestricted ? "lock" : "description"}
                      </span>
                      <strong
                        style={{
                          color: isRestricted
                            ? "var(--color-warning, #92400e)"
                            : "inherit",
                        }}
                      >
                        {f.path}
                      </strong>
                      {isRestricted ? (
                        <Badge variant="warning" size="xs">
                          Restrito
                        </Badge>
                      ) : f.additions > 0 || f.deletions > 0 ? (
                        <>
                          <span
                            style={{
                              color:
                                "var(--color-success, #16a34a)",
                              fontWeight: 600,
                            }}
                          >
                            +{f.additions || 0}
                          </span>
                          <span
                            style={{
                              color:
                                "var(--color-danger, #dc2626)",
                              fontWeight: 600,
                            }}
                          >
                            -{f.deletions || 0}
                          </span>
                        </>
                      ) : null}
                    </div>

                    <div
                      className="ui-row ui-row--align-center ui-row--xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isOpen && !isRestricted && (
                        <Button
                          type="button"
                          size="xs"
                          variant="tonal"
                          onClick={() =>
                            handleEditDocumentInPR(pr, f.path)
                          }
                          title={`Abrir e editar "${f.path}" diretamente na branch deste PR (${pr.branch})`}
                          icon={
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "14px" }}
                            >
                              edit_note
                            </span>
                          }
                        >
                          Editar Documento
                        </Button>
                      )}
                    </div>
                  </div>

                  {!isFileCollapsed && (
                    <>
                      {isRestricted ? (
                        <div
                          style={{
                            padding: "16px 20px",
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            background:
                              "var(--md-sys-color-surface-container-low, #f8f9fa)",
                            color:
                              "var(--color-text-secondary, #64748b)",
                            fontSize: "13px",
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: "22px",
                              color:
                                "var(--color-warning, #f59e0b)",
                            }}
                          >
                            lock
                          </span>
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                color:
                                  "var(--color-text-primary, #0f172a)",
                              }}
                            >
                              Documento Restrito Criptografado
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                marginTop: "2px",
                              }}
                            >
                              Você não possui credenciais de
                              departamento ou nível de acesso
                              suficiente para inspecionar o
                              conteúdo ou as diferenças deste
                              documento.
                            </div>
                          </div>
                        </div>
                      ) : isLoadingDiff ? (
                        <div
                          style={{
                            padding: "14px",
                            textAlign: "center",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          Carregando diferenças da versão...
                        </div>
                      ) : oldContent || newContent ? (
                        <div
                          style={{
                            maxHeight: "380px",
                            overflowY: "auto",
                          }}
                        >
                          <VisualMarkdownDiff
                            oldContent={oldContent}
                            newContent={newContent}
                            fileName={f.path}
                            hideHeader={true}
                          />
                        </div>
                      ) : (
                        fileDiff && (
                          <pre
                            style={{
                              margin: 0,
                              padding: "10px 12px",
                              fontSize: "11.5px",
                              background: "#0d1117",
                              color: "#f8fafc",
                              overflowX: "auto",
                              fontFamily:
                                "var(--font-family-mono)",
                            }}
                          >
                            {fileDiff}
                          </pre>
                        )
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* When all modified files in PR are system files */}
      {prFiles.length === 0 && rawFiles.length > 0 && (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "8px",
            background: "var(--color-surface-subtle, #f8fafc)",
            border:
              "1px dashed var(--color-border-subtle, #cbd5e1)",
            fontSize: "12.5px",
            color: "var(--color-text-muted, #64748b)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "18px", color: "var(--color-text-muted)" }}
          >
            settings
          </span>
          <span>
            Esta revisão contém apenas {rawFiles.length} arquivo(s) de sistema ou
            configuração interna (não visíveis nesta listagem).
          </span>
        </div>
      )}
    </>
  );
};
