import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Send, Sparkles, AlertCircle, ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import { Button, FormField, Input, Textarea, Spinner } from "../ui";
import { DiffViewer } from "../common";
import { VisualMarkdownDiff } from "../editor/VisualMarkdownDiff";
import { API } from "../../services/api";
import { isPathHidden } from "../../utils/hidden-files";
import type { VersionNode, WorkspaceChange } from "../../types";

export interface CreatePublicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoName?: string;
  nodes?: VersionNode[];
  defaultBranch?: string;
  initialSourceBranch?: string;
  existingProposal?: {
    id: number | string;
    title?: string;
    description?: string;
    status?: string;
  };
  onCreated?: (pr: any) => void | Promise<void>;
}

export const CreatePublicationModal: React.FC<CreatePublicationModalProps> = ({
  isOpen,
  onClose,
  repoName,
  nodes = [],
  defaultBranch = "main",
  initialSourceBranch,
  existingProposal,
  onCreated,
}) => {
  const candidateNodes = useMemo(
    () =>
      nodes.filter(
        (n) =>
          !n.isDefault &&
          n.name !== defaultBranch &&
          !n.isMerged &&
          n.publicationStatus !== "open" &&
          n.proposal?.status !== "OPEN" &&
          (n.ahead > 0 || (n.uncommittedFiles && n.uncommittedFiles.length > 0)),
      ),
    [nodes, defaultBranch],
  );
  const isLockedSource = Boolean(initialSourceBranch && initialSourceBranch !== defaultBranch);

  const [sourceBranch, setSourceBranch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diffFiles, setDiffFiles] = useState<
    Array<{
      path: string;
      status: string;
      additions: number;
      deletions: number;
      diff: string;
      oldContent?: string;
      newContent?: string;
    }>
  >([]);
  const [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChange[]>([]);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const preferred =
        initialSourceBranch && initialSourceBranch !== defaultBranch
          ? initialSourceBranch
          : candidateNodes[0]?.name || "";
      setSourceBranch(preferred);
      const node = nodes.find((n) => n.name === preferred);
      const activeProp =
        node?.proposal?.status === "OPEN" ? node.proposal : existingProposal;
      setTitle(
        activeProp?.title ||
          (node?.displayName && node.displayName !== preferred ? node.displayName : ""),
      );
      setDescription(activeProp?.description || "");
      setErrorMsg(null);
      setExpandedFile(null);
    }
  }, [isOpen, initialSourceBranch, defaultBranch, candidateNodes, nodes, existingProposal]);

  useEffect(() => {
    if (!isOpen) {
      setDiffFiles([]);
      setWorkspaceChanges([]);
      return;
    }
    let cancelled = false;
    setIsLoadingDiff(true);
    const shouldCompare = Boolean(sourceBranch && sourceBranch !== defaultBranch);
    Promise.all([
      shouldCompare
        ? API.compareBranches(defaultBranch, sourceBranch, repoName)
        : Promise.resolve({ ok: true, data: { files: [] as any[] } }),
      API.getWorkspaceChanges(repoName).catch(() => ({ changes: [] as WorkspaceChange[] })),
    ])
      .then(([compareRes, wsRes]) => {
        if (cancelled) return;
        if (compareRes.ok && compareRes.data?.files) {
          setDiffFiles(compareRes.data.files.filter((f) => f?.path && !isPathHidden(f.path)));
        } else {
          setDiffFiles([]);
        }
        setWorkspaceChanges(
          (wsRes?.changes || []).filter((c) => c?.path && !isPathHidden(c.path)),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setDiffFiles([]);
          setWorkspaceChanges([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDiff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, sourceBranch, defaultBranch, repoName]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedNode = nodes.find((n) => n.name === sourceBranch);
  const activeProposal =
    selectedNode?.proposal?.status === "OPEN" ? selectedNode.proposal : existingProposal;
  const isUpdateMode = Boolean(activeProposal);
  const currentActiveBranch = nodes.find((n) => n.isCurrent)?.name;
  const isViewingCurrentBranch =
    !sourceBranch || !currentActiveBranch || sourceBranch === currentActiveBranch;
  const activeWsChanges = isViewingCurrentBranch ? workspaceChanges : [];
  const nodeUncommittedPaths = (selectedNode?.uncommittedFiles || [])
    .map((u) => (typeof u === "string" ? u : u?.path))
    .filter((p): p is string => Boolean(p) && !isPathHidden(p));
  const wsUncommittedPaths = activeWsChanges.map((c) => c.path);
  const uncommittedOnly = Array.from(new Set([...nodeUncommittedPaths, ...wsUncommittedPaths])).filter(
    (p) => !diffFiles.some((f) => f.path === p),
  );
  const totalChangedCount = diffFiles.length + uncommittedOnly.length;

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await API.generatePRSummaryAI(repoName);
      if (res.ok && res.data) {
        if (res.data.title && !title.trim()) setTitle(res.data.title);
        if (res.data.description) setDescription(res.data.description);
      }
    } catch {
      // ignore optional AI summary failure
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalChangedCount === 0) {
      setErrorMsg("Nenhuma alteração detectada para enviar.");
      return;
    }
    if (!title.trim()) {
      setErrorMsg("Informe um título para o pedido de publicação.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await API.createPR({
        title: title.trim(),
        description: description.trim(),
        sourceBranch: sourceBranch || undefined,
        targetProposalId: activeProposal?.id,
        squash: true,
        repo: repoName,
      });

      if (res.ok && res.data && !res.data.error) {
        if (onCreated) await onCreated(res.data);
        onClose();
      } else {
        setErrorMsg(
          res.data?.error ||
            res.data?.message ||
            "Não foi possível enviar o pedido de publicação.",
        );
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Falha de comunicação ao enviar publicação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(3px)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enviar para Publicação"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(92vw, 960px)",
          height: "100%",
          background: "var(--bg-surface, #ffffff)",
          borderLeft: "1px solid var(--border-color, #e2e8f0)",
          boxShadow: "-12px 0 36px rgba(15, 23, 42, 0.16)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "16px", fontWeight: 700, color: "var(--text-heading)" }}>
              <Send size={18} color="var(--color-primary, #2563eb)" />
              <span>{isUpdateMode ? "Atualizar Publicação" : "Enviar para Publicação"}</span>
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {isUpdateMode
                ? "Revise as alterações e atualize o pedido de publicação existente."
                : "Envie seu rascunho de versão para ser integrado na Versão Oficial."}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {errorMsg && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#dc2626",
              fontSize: "12.5px",
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {!isLockedSource && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
              Escolha o rascunho de versão para enviar
            </label>
            {candidateNodes.length === 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--bg-main, #f8fafc)",
                  border: "1px dashed var(--border-color, #cbd5e1)",
                  fontSize: "12.5px",
                  color: "var(--text-secondary)",
                }}
              >
                Nenhum rascunho com alterações pendentes encontrado. Crie um rascunho e salve um checkpoint no Editor primeiro.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  maxHeight: "150px",
                  overflowY: "auto",
                }}
              >
                {candidateNodes.map((n) => {
                  const isSelected = sourceBranch === n.name;
                  return (
                    <button
                      key={n.name}
                      type="button"
                      onClick={() => {
                        setSourceBranch(n.name);
                        if (n.displayName && !title.trim()) {
                          setTitle(n.displayName);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: `1px solid ${isSelected ? "var(--color-primary, #2563eb)" : "var(--border-color, #e2e8f0)"}`,
                        background: isSelected ? "rgba(37, 99, 235, 0.06)" : "var(--bg-surface, #ffffff)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)" }}>
                        {n.displayName || n.name}
                      </span>
                      <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                        {n.ahead} checkpoint{n.ahead === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <FormField label="Título da Publicação" required>
          <Input
            id="create-pub-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Atualiza guia de onboarding da equipe"
            autoFocus
          />
        </FormField>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
              Descrição das alterações (opcional)
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleGenerateSummary}
              disabled={isGenerating}
              icon={<Sparkles size={13} />}
            >
              {isGenerating ? "Gerando..." : "Sugerir resumo"}
            </Button>
          </div>
          <Textarea
            id="create-pub-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explique rapidamente o que mudou nesta versão..."
          />
        </div>

        {sourceBranch && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
                Alterações que serão enviadas ({totalChangedCount})
              </label>
              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Agrupadas em uma única entrega na Versão Oficial
              </span>
            </div>

            {isLoadingDiff ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
                <Spinner size="sm" />
                <span>Carregando alterações...</span>
              </div>
            ) : totalChangedCount === 0 ? (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "var(--bg-main, #f8fafc)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                Nenhuma diferença de arquivo detectada em relação à Versão Oficial.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {diffFiles.map((f) => {
                  const isExpanded = expandedFile === f.path;
                  const wsMatch = activeWsChanges.find((c) => c.path === f.path);
                  const effectiveOldContent = f.oldContent ?? wsMatch?.old_content;
                  const effectiveNewContent =
                    wsMatch?.new_content !== undefined ? wsMatch.new_content : f.newContent;
                  const hasVisualContent =
                    effectiveOldContent !== undefined || effectiveNewContent !== undefined;
                  const normalizedStatus = (f.status || "MODIFIED").toUpperCase();
                  const statusMeta =
                    normalizedStatus === "ADDED"
                      ? { label: "Novo", color: "#15803d", bg: "rgba(22, 163, 74, 0.12)" }
                      : normalizedStatus === "DELETED"
                        ? { label: "Excluído", color: "#b91c1c", bg: "rgba(220, 38, 38, 0.12)" }
                        : { label: "Modificado", color: "#1d4ed8", bg: "rgba(37, 99, 235, 0.1)" };
                  return (
                    <div
                      key={f.path}
                      style={{
                        flexShrink: 0,
                        border: "1px solid var(--border-color, #e2e8f0)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "var(--bg-surface, #ffffff)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFile(isExpanded ? null : f.path)}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                          padding: "11px 14px",
                          background: "var(--bg-main, #f8fafc)",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          cursor: "pointer",
                          fontSize: "13px",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <FileText size={14} style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              color: "var(--text-heading)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {f.path}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: "999px",
                              color: statusMeta.color,
                              background: statusMeta.bg,
                              flexShrink: 0,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", flexShrink: 0 }}>
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>+{f.additions}</span>
                          <span style={{ color: "#dc2626", fontWeight: 600 }}>-{f.deletions}</span>
                        </span>
                      </button>
                      {isExpanded && (
                        <div
                          style={{
                            borderTop: "1px solid var(--border-color, #e2e8f0)",
                            background: "var(--bg-surface, #ffffff)",
                            maxHeight: "400px",
                            overflowY: "auto",
                          }}
                        >
                          {hasVisualContent ? (
                            <VisualMarkdownDiff
                              oldContent={effectiveOldContent || ""}
                              newContent={effectiveNewContent || ""}
                              fileName={f.path}
                              oldTitle="Versão Oficial"
                              newTitle="Rascunho Atual"
                              hideHeader={true}
                              initialViewMode="split"
                            />
                          ) : (
                            <div style={{ padding: "8px" }}>
                              <DiffViewer diffText={f.diff || "Sem detalhes textuais."} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {uncommittedOnly.map((filePath) => {
                  const isExpanded = expandedFile === filePath;
                  const wsMatch = activeWsChanges.find((c) => c.path === filePath);
                  const hasVisualContent =
                    wsMatch &&
                    (wsMatch.old_content !== undefined || wsMatch.new_content !== undefined);
                  const rawType = (wsMatch?.type || "").toUpperCase();
                  const statusMeta =
                    rawType === "ADDED" || rawType === "UNTRACKED" || rawType === "CREATE" || (wsMatch && !wsMatch.old_content && wsMatch.new_content)
                      ? { label: "Novo", color: "#15803d", bg: "rgba(22, 163, 74, 0.12)" }
                      : rawType === "DELETED" || rawType === "DELETE" || (wsMatch && wsMatch.old_content && !wsMatch.new_content)
                        ? { label: "Excluído", color: "#b91c1c", bg: "rgba(220, 38, 38, 0.12)" }
                        : { label: "Modificado", color: "#1d4ed8", bg: "rgba(37, 99, 235, 0.1)" };
                  return (
                    <div
                      key={filePath}
                      style={{
                        flexShrink: 0,
                        border: "1px solid var(--border-color, #e2e8f0)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "var(--bg-surface, #ffffff)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFile(isExpanded ? null : filePath)}
                        style={{
                          width: "100%",
                          minHeight: "44px",
                          padding: "11px 14px",
                          background: "var(--bg-main, #f8fafc)",
                          border: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          cursor: "pointer",
                          fontSize: "13px",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <FileText size={14} style={{ flexShrink: 0, color: "var(--text-secondary)" }} />
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              color: "var(--text-heading)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {filePath}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: "999px",
                              color: statusMeta.color,
                              background: statusMeta.bg,
                              flexShrink: 0,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", flexShrink: 0 }}>
                          {wsMatch && (
                            <>
                              <span style={{ color: "#16a34a", fontWeight: 600 }}>+{wsMatch.additions}</span>
                              <span style={{ color: "#dc2626", fontWeight: 600 }}>-{wsMatch.deletions}</span>
                            </>
                          )}
                        </span>
                      </button>
                      {isExpanded && (
                        <div
                          style={{
                            borderTop: "1px solid var(--border-color, #e2e8f0)",
                            background: "var(--bg-surface, #ffffff)",
                            maxHeight: "400px",
                            overflowY: "auto",
                          }}
                        >
                          {hasVisualContent ? (
                            <VisualMarkdownDiff
                              oldContent={wsMatch.old_content || ""}
                              newContent={wsMatch.new_content || ""}
                              fileName={filePath}
                              oldTitle="Último Checkpoint / Oficial"
                              newTitle="Edição Local Atual"
                              hideHeader={true}
                              initialViewMode="split"
                            />
                          ) : (
                            <div style={{ padding: "8px" }}>
                              <DiffViewer diffText={wsMatch?.diff_text || "Sem detalhes textuais."} />
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
        )}
      </form>
        </div>

        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-color, #e2e8f0)",
            background: "var(--bg-surface, #ffffff)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            flexShrink: 0,
          }}
        >
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={isSubmitting || isLoadingDiff || !title.trim() || totalChangedCount === 0}
            icon={<Send size={14} />}
          >
            {isSubmitting
              ? isUpdateMode
                ? "Atualizando..."
                : "Enviando..."
              : isUpdateMode
                ? "Atualizar Publicação"
                : "Enviar Pedido de Publicação"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
