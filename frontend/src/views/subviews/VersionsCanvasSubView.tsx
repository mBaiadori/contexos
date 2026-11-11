import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import {
  PageContainer,
  Button,
  Input,
  Badge,
  AlertBanner,
} from "../../components/ui";
import { SafeSwitchModal } from "../../components/modals/SafeSwitchModal";
import { DraftsTrashModal } from "../../components/modals/DraftsTrashModal";
import {
  VersionTreeCanvas,
  cleanCommitTitle,
} from "./versions/VersionTreeCanvas";
import type { VersionNode, GitFileStatus, GitCommitInfo } from "../../types";

export interface VersionsCanvasSubViewProps {
  onNavigateToProposal?: (proposalId: number | string) => void;
  onOpenDiffModal?: (targetBranch?: string) => void;
}

export const VersionsCanvasSubView: React.FC<VersionsCanvasSubViewProps> = ({
  onNavigateToProposal,
  onOpenDiffModal,
}) => {
  const {
    activeRepo,
    versionGraph,
    refreshVersionGraph,
    isVersionGraphLoading,
    safeSwitch,
    createOrSwitchBranch,
    commitGit,
    refreshGitStatus,
    refreshPendingChanges,
  } = useWorkspace();

  const [search, setSearch] = useState("");
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitInfo | null>(
    null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(!versionGraph);

  // Safe switch guard modal
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [targetNodeToSwitch, setTargetNodeToSwitch] =
    useState<VersionNode | null>(null);
  const [targetCommitToSwitch, setTargetCommitToSwitch] =
    useState<GitCommitInfo | null>(null);
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFileStatus[]>([]);
  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);

  const loadGraph = useCallback(async () => {
    if (refreshVersionGraph) {
      try {
        await refreshVersionGraph();
      } finally {
        setIsInitialLoading(false);
      }
    }
  }, [refreshVersionGraph]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Auto-dismiss do alerta após 4.5 segundos
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  const nodes = versionGraph?.nodes || [];

  // Define seleção inicial
  useEffect(() => {
    if (nodes.length > 0 && !selectedNodeName) {
      const current = nodes.find((n) => n.isCurrent) || nodes[0];
      setSelectedNodeName(current.name);
    }
  }, [nodes, selectedNodeName]);

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return nodes;
    const q = search.toLowerCase();
    return nodes.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.proposal?.title.toLowerCase().includes(q) ||
        n.lastCommit?.message.toLowerCase().includes(q),
    );
  }, [nodes, search]);

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.name === selectedNodeName) || nodes[0] || null;
  }, [nodes, selectedNodeName]);

  const handleSelectNode = (node: VersionNode) => {
    setSelectedNodeName(node.name);
    setSelectedCommit(null);
    setIsDrawerOpen(true);
  };

  const handleSelectCommit = (commit: GitCommitInfo) => {
    setSelectedCommit(commit);
    setIsDrawerOpen(true);
  };

  // Salvar Marco Local
  const handleSaveLocalCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = commitMessage.trim();
    if (!msg || !commitGit) return;

    setIsCommitting(true);
    setFeedback(null);
    try {
      const res = await commitGit(msg);
      if (res && res.success) {
        setFeedback({
          type: "success",
          message: "Marco salvo no disco com sucesso.",
        });
        setCommitMessage("");
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res?.message || "Falha ao salvar marco.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Erro inesperado.",
      });
    } finally {
      setIsCommitting(false);
    }
  };

  // Alternância segura para Versão (Branch)
  const handleSwitchRequest = async (node: VersionNode) => {
    if (node.isCurrent) return;
    setIsSwitching(true);
    setFeedback(null);

    try {
      const checkRes = await safeSwitch({
        branch: node.name,
        action: "check",
      });

      if (
        checkRes.hasUncommitted &&
        checkRes.files &&
        checkRes.files.length > 0
      ) {
        setTargetNodeToSwitch(node);
        setTargetCommitToSwitch(null);
        setUncommittedFiles(checkRes.files);
        setSafeModalOpen(true);
        setIsSwitching(false);
        return;
      }

      const switchRes = await safeSwitch({
        branch: node.name,
        action: "switch",
      });

      if (switchRes.success) {
        setFeedback({
          type: "success",
          message:
            switchRes.message || `Alternado para a versão "${node.name}".`,
        });
        setSelectedNodeName(node.name);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Erro ao alternar de versão.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Erro ao alternar de versão.",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  // Alternância segura para Marco (Commit)
  const handleSwitchToCommit = async (commit: GitCommitInfo) => {
    setIsSwitching(true);
    setFeedback(null);
    try {
      const checkRes = await safeSwitch({
        commitHash: commit.hash,
        action: "check",
      });

      if (
        checkRes.hasUncommitted &&
        checkRes.files &&
        checkRes.files.length > 0
      ) {
        setTargetCommitToSwitch(commit);
        setTargetNodeToSwitch(null);
        setUncommittedFiles(checkRes.files);
        setSafeModalOpen(true);
        setIsSwitching(false);
        return;
      }

      const switchRes = await safeSwitch({
        commitHash: commit.hash,
        action: "switch",
      });

      if (switchRes.success) {
        setFeedback({
          type: "success",
          message:
            switchRes.message ||
            `Alternado para o marco "${commit.shortHash || commit.hash.slice(0, 7)}".`,
        });
        setSelectedCommit(commit);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Erro ao alternar para o marco.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Erro ao alternar para o marco.",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmCommitAndSwitch = async (msg: string) => {
    if ((!targetNodeToSwitch && !targetCommitToSwitch) || !commitGit) return;
    setIsSwitching(true);
    setFeedback(null);
    try {
      const commitRes = await commitGit(msg);
      if (!commitRes || !commitRes.success) {
        setFeedback({
          type: "error",
          message: commitRes?.message || "Falha ao gravar marco.",
        });
        setIsSwitching(false);
        return;
      }

      const payload = targetCommitToSwitch
        ? { commitHash: targetCommitToSwitch.hash, action: "switch" as const }
        : { branch: targetNodeToSwitch!.name, action: "switch" as const };

      const switchRes = await safeSwitch(payload);

      if (switchRes.success) {
        setSafeModalOpen(false);
        const targetLabel = targetCommitToSwitch
          ? `marco "${targetCommitToSwitch.shortHash || targetCommitToSwitch.hash.slice(0, 7)}"`
          : `versão "${targetNodeToSwitch!.name}"`;
        setFeedback({
          type: "success",
          message: `Marco salvo com sucesso e alternado para ${targetLabel}.`,
        });
        if (targetNodeToSwitch) setSelectedNodeName(targetNodeToSwitch.name);
        if (targetCommitToSwitch) setSelectedCommit(targetCommitToSwitch);
        setTargetNodeToSwitch(null);
        setTargetCommitToSwitch(null);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Falha ao alternar.",
        });
      }
    } catch (err) {
      setFeedback({
        type: "error",
        message: (err as Error).message || "Erro inesperado.",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmStash = async () => {
    if (!targetNodeToSwitch && !targetCommitToSwitch) return;
    setIsSwitching(true);
    try {
      const payload = targetCommitToSwitch
        ? { commitHash: targetCommitToSwitch.hash, action: "stash" as const }
        : { branch: targetNodeToSwitch!.name, action: "stash" as const };

      const res = await safeSwitch(payload);
      if (res.success) {
        setSafeModalOpen(false);
        const targetLabel = targetCommitToSwitch
          ? `marco "${targetCommitToSwitch.shortHash || targetCommitToSwitch.hash.slice(0, 7)}"`
          : `versão "${targetNodeToSwitch!.name}"`;
        setFeedback({
          type: "success",
          message:
            res.message ||
            `Alternado para ${targetLabel} com rascunhos guardados.`,
        });
        if (targetNodeToSwitch) setSelectedNodeName(targetNodeToSwitch.name);
        if (targetCommitToSwitch) setSelectedCommit(targetCommitToSwitch);
        setTargetNodeToSwitch(null);
        setTargetCommitToSwitch(null);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao guardar rascunhos.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!targetNodeToSwitch && !targetCommitToSwitch) return;
    setIsSwitching(true);
    try {
      const payload = targetCommitToSwitch
        ? { commitHash: targetCommitToSwitch.hash, action: "discard" as const }
        : { branch: targetNodeToSwitch!.name, action: "discard" as const };

      const res = await safeSwitch(payload);
      if (res.success) {
        setSafeModalOpen(false);
        const targetLabel = targetCommitToSwitch
          ? `marco "${targetCommitToSwitch.shortHash || targetCommitToSwitch.hash.slice(0, 7)}"`
          : `versão "${targetNodeToSwitch!.name}"`;
        setFeedback({
          type: "success",
          message:
            res.message ||
            `Alterações descartadas e alternado para ${targetLabel}.`,
        });
        if (targetNodeToSwitch) setSelectedNodeName(targetNodeToSwitch.name);
        if (targetCommitToSwitch) setSelectedCommit(targetCommitToSwitch);
        setTargetNodeToSwitch(null);
        setTargetCommitToSwitch(null);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao descartar alterações.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  // Criar nova versão a partir da selecionada
  const handleCreateNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newVersionName.trim().replace(/\s+/g, "-");
    if (!cleanName) return;

    const baseBranch = selectedNode?.name;

    setIsSwitching(true);
    setFeedback(null);
    try {
      const res = await createOrSwitchBranch(cleanName, baseBranch);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Nova versão "${cleanName}" criada a partir de "${baseBranch || "Principal"}".`,
        });
        setNewVersionName("");
        setIsCreatingNew(false);
        setSelectedNodeName(cleanName);
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res.message || "Erro ao criar nova versão.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  // Criar nova versão a partir de um commit selecionado
  const handleCreateNewVersionFromCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newVersionName.trim().replace(/\s+/g, "-");
    if (!cleanName || !selectedCommit) return;

    setIsSwitching(true);
    setFeedback(null);
    try {
      const res = await createOrSwitchBranch(cleanName, selectedCommit.hash);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Nova versão "${cleanName}" criada a partir do marco selecionado.`,
        });
        setNewVersionName("");
        setIsCreatingNew(false);
        setSelectedCommit(null);
        setSelectedNodeName(cleanName);
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message:
            res.message || "Erro ao criar nova versão a partir do marco.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <PageContainer id="versions-canvas-subview">
      {/* Top Bar Minimalista */}
      <div
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--border-color)",
          background: "var(--bg-surface)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          zIndex: 5,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-heading)",
            }}
          >
            Versões
          </h2>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {activeRepo?.name || "Repositório"}
          </span>

          {/* Tag de status da branch ativa no workspace */}
          {versionGraph?.currentBranch === "HEAD" ? (
            <Badge variant="warning" size="sm">
              ⚠️ HEAD Desacoplado
            </Badge>
          ) : versionGraph?.currentBranch ===
            (versionGraph?.defaultBranch || "main") ? (
            <Badge variant="outline" size="sm">
              ● Principal
            </Badge>
          ) : versionGraph?.currentBranch ? (
            <Badge variant="primary" size="sm">
              ●{" "}
              {nodes.find((n) => n.name === versionGraph.currentBranch)
                ?.displayName || versionGraph.currentBranch}
            </Badge>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <Input
            type="text"
            placeholder="Buscar versão..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "160px", height: "32px", fontSize: "12px" }}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadGraph()}
            disabled={isSwitching || isVersionGraphLoading}
            title="Recalcular e atualizar o grafo de ramificações"
          >
            {isVersionGraphLoading ? (
              <span
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "16px",
                    animation: "spin 1s linear infinite",
                  }}
                >
                  progress_activity
                </span>
                Mapeando...
              </span>
            ) : (
              "Atualizar"
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTrashModalOpen(true)}
            title="Abrir lixeira local de rascunhos e alterações descartadas"
            style={{ display: "flex", alignItems: "center", gap: "5px" }}
          >
            <span>🗑️</span>
            <span>Lixeira</span>
          </Button>

          {!isDrawerOpen && selectedNode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDrawerOpen(true)}
            >
              Ver Detalhes
            </Button>
          )}
        </div>
      </div>

      {feedback && (
        <div style={{ padding: "8px 20px 0 20px" }}>
          <AlertBanner
            type={feedback.type === "success" ? "success" : "error"}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        </div>
      )}

      {/* ÁREA PRINCIPAL: CANVAS LIGHT COM DRAWER LATERAL */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          height: "calc(100vh - 120px)",
          overflow: "hidden",
        }}
      >
        {/* O Canvas da Árvore de Versões */}
        <div style={{ flex: 1, height: "100%", position: "relative" }}>
          <VersionTreeCanvas
            nodes={filteredNodes}
            mainCommits={versionGraph?.mainCommits}
            selectedNodeName={selectedNodeName}
            onSelectNode={handleSelectNode}
            onSwitchNode={handleSwitchRequest}
            onSelectCommit={handleSelectCommit}
            onSwitchCommit={handleSwitchToCommit}
            isLoading={
              isVersionGraphLoading || (nodes.length === 0 && isInitialLoading)
            }
          />
        </div>

        {/* PAINEL LATERAL DESLIZANTE (DRAWER DE INFORMAÇÕES DA VERSÃO OU COMMIT) */}
        {isDrawerOpen && (selectedCommit || selectedNode) && (
          <div
            style={{
              width: "360px",
              height: "100%",
              background: "var(--bg-surface)",
              borderLeft: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              padding: "20px",
              gap: "16px",
              overflowY: "auto",
              boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.06)",
              zIndex: 10,
              flexShrink: 0,
            }}
          >
            {/* Header do Painel */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {selectedCommit
                    ? "Marco da Linha do Tempo"
                    : selectedNode?.isDefault
                      ? "Linha Principal"
                      : "Versão Selecionada"}
                </span>
                <h3
                  style={{
                    margin: "2px 0 0 0",
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "var(--text-heading)",
                  }}
                >
                  {selectedCommit
                    ? cleanCommitTitle(selectedCommit.message)
                    : selectedNode?.isDefault
                      ? "Linha Principal"
                      : selectedNode?.displayName || selectedNode?.name}
                </h3>
                {selectedNode && !selectedCommit && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      fontWeight: 400,
                    }}
                  >
                    {selectedNode.isDefault
                      ? `Branch Git: ${versionGraph?.defaultBranch || "main"}`
                      : selectedNode.displayName &&
                          selectedNode.displayName !== selectedNode.name
                        ? `ID Técnico: ${selectedNode.name}`
                        : null}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setSelectedCommit(null);
                }}
                title="Fechar painel"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px",
                }}
              >
                ✕
              </button>
            </div>

            {/* SE FOR UM COMMIT SELECIONADO */}
            {selectedCommit
              ? (() => {
                  const isLatestMainCommit = Boolean(
                    versionGraph?.mainCommits &&
                    versionGraph.mainCommits.length > 0 &&
                    versionGraph.mainCommits[0].hash === selectedCommit.hash,
                  );

                  return (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          alignItems: "center",
                        }}
                      >
                        <Badge variant="primary" size="sm">
                          Marco Histórico
                        </Badge>
                        {isLatestMainCommit && (
                          <Badge variant="success" size="sm">
                            Ponta da Linha Principal
                          </Badge>
                        )}
                      </div>

                      {/* BLOCO DE AÇÃO PRINCIPAL / RECOMENDADA */}
                      {isLatestMainCommit ? (
                        <div
                          style={{
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid #bfdbfe",
                            background: "#eff6ff",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <span style={{ fontSize: "14px" }}>📌</span>
                            <strong
                              style={{ fontSize: "12px", color: "#1e40af" }}
                            >
                              Último marco da Linha Principal
                            </strong>
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "11px",
                              color: "#1e3a8a",
                              lineHeight: "1.4",
                            }}
                          >
                            Você selecionou o ponto mais recente da Linha
                            Principal. Alterne diretamente para a branch para
                            continuar trabalhando com o histórico conectado.
                          </p>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isSwitching}
                            onClick={() => {
                              const defaultNode = nodes.find(
                                (n) => n.isDefault,
                              );
                              if (defaultNode) handleSwitchRequest(defaultNode);
                              else if (versionGraph?.defaultBranch) {
                                handleSwitchRequest({
                                  name: versionGraph.defaultBranch,
                                  isDefault: true,
                                } as VersionNode);
                              }
                            }}
                            style={{
                              width: "100%",
                              fontWeight: 700,
                              background: "#2563eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <span>⤺</span>
                            <span>Alternar para a Linha Principal</span>
                          </Button>

                          <button
                            type="button"
                            onClick={() => handleSwitchToCommit(selectedCommit)}
                            disabled={isSwitching}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "#64748b",
                              fontSize: "11px",
                              cursor: "pointer",
                              textDecoration: "underline",
                              padding: "2px",
                              textAlign: "center",
                            }}
                          >
                            Ou alternar apenas para este marco isolado (HEAD
                            desacoplado)
                          </button>
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={isSwitching}
                            onClick={() => handleSwitchToCommit(selectedCommit)}
                            style={{ width: "100%", fontWeight: 600 }}
                          >
                            {isSwitching
                              ? "Alternando..."
                              : `Alternar para este marco (${selectedCommit.shortHash || selectedCommit.hash.slice(0, 7)})`}
                          </Button>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                              lineHeight: "1.3",
                            }}
                          >
                            ℹ️ Alternar para um marco isolado permite
                            inspecionar o histórico com HEAD desacoplado.
                          </span>

                          {/* ATALHO SEGURO: VOLTAR PARA A PRINCIPAL */}
                          {versionGraph?.defaultBranch && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isSwitching}
                              onClick={() => {
                                const defaultNode = nodes.find(
                                  (n) => n.isDefault,
                                );
                                if (defaultNode)
                                  handleSwitchRequest(defaultNode);
                                else if (versionGraph.defaultBranch) {
                                  handleSwitchRequest({
                                    name: versionGraph.defaultBranch,
                                    isDefault: true,
                                  } as VersionNode);
                                }
                              }}
                              style={{
                                width: "100%",
                                fontWeight: 600,
                                borderColor: "#bfdbfe",
                                color: "#2563eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                              }}
                            >
                              <span>⤺</span>
                              <span>Voltar para a Linha Principal</span>
                            </Button>
                          )}

                          {/* Botão de retorno à visualização completa da versão */}
                          {selectedNode && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCommit(null)}
                              style={{
                                width: "100%",
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              ← Ver todos os marcos de{" "}
                              {selectedNode.displayName || selectedNode.name}
                            </Button>
                          )}
                        </div>
                      )}

                      {/* DETALHES DO MARCO */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          background: "var(--bg-main)",
                          border: "1px solid var(--border-color)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                              fontWeight: 600,
                              display: "block",
                              marginBottom: "4px",
                            }}
                          >
                            Mensagem:
                          </span>
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--text-heading)",
                              lineHeight: "1.4",
                            }}
                          >
                            {cleanCommitTitle(selectedCommit.message)}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "8px",
                            fontSize: "11px",
                          }}
                        >
                          <div>
                            <span style={{ color: "var(--text-secondary)" }}>
                              Autor:{" "}
                            </span>
                            <strong style={{ color: "var(--text-primary)" }}>
                              {selectedCommit.author}
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: "var(--text-secondary)" }}>
                              Hash:{" "}
                            </span>
                            <code
                              style={{
                                fontSize: "11px",
                                background: "rgba(0,0,0,0.05)",
                                padding: "1px 4px",
                                borderRadius: "3px",
                              }}
                            >
                              {selectedCommit.shortHash ||
                                selectedCommit.hash.slice(0, 7)}
                            </code>
                          </div>
                        </div>

                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>
                            Data:{" "}
                          </span>
                          <strong
                            style={{
                              fontSize: "11px",
                              color: "var(--text-primary)",
                            }}
                          >
                            {selectedCommit.date
                              ? new Date(selectedCommit.date).toLocaleString(
                                  "pt-BR",
                                  {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "Data não disponível"}
                          </strong>
                        </div>
                      </div>

                      {/* BLOCO DESTACADO: RAMIFICAR A PARTIR DESTE MARCO */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(37, 99, 235, 0.25)",
                          background: "rgba(37, 99, 235, 0.04)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "var(--text-heading)",
                            }}
                          >
                            Ramificar a partir deste marco
                          </span>
                        </div>

                        {!isCreatingNew ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingNew(true);
                              setNewVersionName(
                                `versao-${selectedCommit.hash.slice(0, 7)}`,
                              );
                            }}
                            style={{ width: "100%", fontWeight: 600 }}
                          >
                            + Criar Versão a Partir Deste Marco
                          </Button>
                        ) : (
                          <form
                            onSubmit={handleCreateNewVersionFromCommit}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              marginTop: "4px",
                            }}
                          >
                            <Input
                              type="text"
                              placeholder="Nome da nova versão..."
                              value={newVersionName}
                              onChange={(e) =>
                                setNewVersionName(e.target.value)
                              }
                              style={{
                                fontSize: "12px",
                                height: "30px",
                                width: "100%",
                              }}
                              autoFocus
                            />
                            <div style={{ display: "flex", gap: "6px" }}>
                              <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                disabled={!newVersionName.trim() || isSwitching}
                                style={{ flex: 1 }}
                              >
                                {isSwitching ? "Criando..." : "Criar versão"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsCreatingNew(false);
                                  setNewVersionName("");
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>

                      {/* LISTA COMPLETA DOS MARCOS DA MESMA VERSÃO PARA NAVEGAÇÃO DIRETA */}
                      {selectedNode?.commits &&
                        selectedNode.commits.length > 1 && (
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: "6px",
                              background: "var(--bg-main)",
                              border: "1px solid var(--border-color)",
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--text-heading)",
                              }}
                            >
                              Outros marcos desta versão (
                              {selectedNode.commits.length})
                            </span>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                maxHeight: "140px",
                                overflowY: "auto",
                              }}
                            >
                              {selectedNode.commits.map((c) => {
                                const isCurrentSelected =
                                  c.hash === selectedCommit.hash;
                                return (
                                  <div
                                    key={c.hash}
                                    onClick={() => setSelectedCommit(c)}
                                    style={{
                                      padding: "5px 8px",
                                      borderRadius: "4px",
                                      background: isCurrentSelected
                                        ? "#eff6ff"
                                        : "var(--bg-surface)",
                                      border: isCurrentSelected
                                        ? "1px solid #2563eb"
                                        : "1px solid var(--border-color)",
                                      cursor: "pointer",
                                      fontSize: "11px",
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      transition: "all 0.15s ease",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: isCurrentSelected
                                          ? 600
                                          : 400,
                                        color: isCurrentSelected
                                          ? "#1e40af"
                                          : "var(--text-primary)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        maxWidth: "180px",
                                      }}
                                    >
                                      {cleanCommitTitle(c.message)}
                                    </span>
                                    <span
                                      style={{
                                        color: "var(--text-secondary)",
                                        fontSize: "10px",
                                      }}
                                    >
                                      {c.shortHash}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                    </div>
                  );
                })()
              : selectedNode && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    }}
                  >
                    {/* Badges de Situação */}
                    <div
                      style={{
                        display: "flex",
                        gap: "6px",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      {selectedNode.isCurrent && (
                        <Badge variant="primary" size="sm">
                          ● Ativa no Workspace
                        </Badge>
                      )}
                      {selectedNode.isDefault && (
                        <Badge variant="outline" size="sm">
                          Versão Oficial
                        </Badge>
                      )}
                      {selectedNode.isMerged && (
                        <Badge variant="success" size="sm">
                          Integrada à Versão Oficial
                        </Badge>
                      )}
                      {!selectedNode.isDefault &&
                        !selectedNode.isMerged &&
                        selectedNode.type === "proposal" && (
                          <Badge variant="warning" size="sm">
                            Proposta em Revisão
                          </Badge>
                        )}
                      {!selectedNode.isDefault &&
                        !selectedNode.isMerged &&
                        selectedNode.type === "draft" && (
                          <Badge variant="outline" size="sm">
                            Rascunho Local
                          </Badge>
                        )}
                    </div>

                    {/* AÇÕES PRINCIPAIS (NO TOPO DO PAINEL) */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {!selectedNode.isCurrent ? (
                        <Button
                          variant="primary"
                          size="md"
                          disabled={isSwitching}
                          onClick={() => handleSwitchRequest(selectedNode)}
                          style={{
                            width: "100%",
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                          }}
                        >
                          <span>
                            Alternar para{" "}
                            {selectedNode.isDefault
                              ? "a Linha Principal"
                              : selectedNode.displayName || selectedNode.name}
                          </span>
                        </Button>
                      ) : (
                        <div
                          style={{
                            padding: "8px 12px",
                            borderRadius: "6px",
                            background: "rgba(16, 185, 129, 0.08)",
                            border: "1px solid rgba(16, 185, 129, 0.25)",
                            color: "#059669",
                            fontSize: "12px",
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span style={{ fontSize: "14px" }}>●</span>
                          <span>
                            Esta versão está ativa no seu workspace agora.
                          </span>
                        </div>
                      )}

                      {/* ATALHO SEGURO: VOLTAR PARA A PRINCIPAL */}
                      {versionGraph?.defaultBranch &&
                        selectedNode.name !== versionGraph.defaultBranch && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSwitching}
                            onClick={() => {
                              const defaultNode = nodes.find(
                                (n) => n.isDefault,
                              );
                              if (defaultNode) handleSwitchRequest(defaultNode);
                              else
                                handleSwitchRequest({
                                  name: versionGraph.defaultBranch,
                                  isDefault: true,
                                } as VersionNode);
                            }}
                            style={{
                              width: "100%",
                              fontWeight: 600,
                              borderColor: "#bfdbfe",
                              color: "#2563eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <span>⤺</span>
                            <span>Voltar para a Linha Principal</span>
                          </Button>
                        )}
                    </div>

                    {/* Informações da Versão */}
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "var(--bg-main)",
                        border: "1px solid var(--border-color)",
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          Base de Origem:{" "}
                        </span>
                        <strong>
                          {selectedNode.isDefault
                            ? "Raiz do repositório"
                            : selectedNode.parentDisplayName ||
                              selectedNode.parentBranch ||
                              `Versão Oficial (${versionGraph?.defaultBranch || "main"})`}
                        </strong>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ color: "var(--text-secondary)" }}>
                          Situação:{" "}
                        </span>
                        <strong>
                          {selectedNode.isDefault
                            ? "Versão Oficial do projeto"
                            : selectedNode.isMerged
                              ? "Integrada à Versão Oficial"
                              : selectedNode.type === "proposal"
                                ? "Proposta em revisão"
                                : "Rascunho local independente"}
                        </strong>
                      </div>
                      {selectedNode.isMerged && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ color: "var(--text-secondary)" }}>
                            Data de integração:{" "}
                          </span>
                          <strong style={{ color: "#16a34a" }}>
                            {selectedNode.mergedDate
                              ? new Date(
                                  selectedNode.mergedDate,
                                ).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Integrada à Versão Oficial"}
                          </strong>
                        </div>
                      )}
                      {selectedNode.lastCommit && (
                        <div
                          style={{
                            borderTop: "1px solid var(--border-color)",
                            paddingTop: "8px",
                            marginTop: "2px",
                          }}
                        >
                          <span
                            style={{
                              color: "var(--text-secondary)",
                              display: "block",
                              marginBottom: "2px",
                            }}
                          >
                            Último marco:
                          </span>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "var(--text-heading)",
                              lineHeight: "1.3",
                            }}
                          >
                            {cleanCommitTitle(selectedNode.lastCommit.message)}
                          </div>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                              marginTop: "2px",
                            }}
                          >
                            por {selectedNode.lastCommit.author}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* BOTÃO EXPLÍCITO: SALVAR EDIÇÕES NO DISCO ATUAL */}
                    {selectedNode.isCurrent && (
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "6px",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-main)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--text-heading)",
                          }}
                        >
                          Modificações no Disco Atual
                        </div>

                        {selectedNode.uncommittedFiles &&
                        selectedNode.uncommittedFiles.length > 0 ? (
                          <form
                            onSubmit={handleSaveLocalCommit}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{ fontSize: "11px", color: "#d97706" }}
                            >
                              {selectedNode.uncommittedFiles.length} arquivo(s)
                              modificado(s) não salvos:
                            </span>
                            <div
                              style={{
                                maxHeight: "70px",
                                overflowY: "auto",
                                fontSize: "11px",
                                fontFamily: "monospace",
                              }}
                            >
                              {selectedNode.uncommittedFiles.map((f, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: "1px 0",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  • {f.path}
                                </div>
                              ))}
                            </div>

                            <Input
                              type="text"
                              placeholder="Mensagem do marco (ex: ajustes de texto)"
                              value={commitMessage}
                              onChange={(e) => setCommitMessage(e.target.value)}
                              style={{ height: "30px", fontSize: "12px" }}
                            />

                            <Button
                              type="submit"
                              variant="primary"
                              size="sm"
                              disabled={!commitMessage.trim() || isCommitting}
                            >
                              {isCommitting
                                ? "Salvando..."
                                : "Salvar Marco no Disco"}
                            </Button>
                          </form>
                        ) : (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            Disco limpo. Nenhuma alteração pendente.
                          </span>
                        )}
                      </div>
                    )}

                    {/* LISTA DE MARCOS / COMMITS DA VERSÃO ("Clica commits no detalhe") */}
                    {selectedNode.commits &&
                      selectedNode.commits.length > 0 && (
                        <div
                          style={{
                            padding: "10px 12px",
                            borderRadius: "6px",
                            background: "var(--bg-main)",
                            border: "1px solid var(--border-color)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--text-heading)",
                              }}
                            >
                              Marcos desta Versão ({selectedNode.commits.length}
                              )
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#2563eb",
                                fontWeight: 500,
                              }}
                            >
                              Clique para inspecionar / ramificar
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              maxHeight: "220px",
                              overflowY: "auto",
                            }}
                          >
                            {selectedNode.commits.map((c) => (
                              <div
                                key={c.hash}
                                onClick={() => handleSelectCommit(c)}
                                style={{
                                  padding: "6px 8px",
                                  borderRadius: "4px",
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border-color)",
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.borderColor =
                                    "#2563eb")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.borderColor =
                                    "var(--border-color)")
                                }
                              >
                                <div
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    color: "var(--text-heading)",
                                  }}
                                >
                                  {cleanCommitTitle(c.message)}
                                </div>
                                <div
                                  style={{
                                    fontSize: "10px",
                                    color: "var(--text-secondary)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <span>{c.author}</span>
                                  <span>{c.shortHash}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* ÚLTIMO MARCO */}
                    {selectedNode.lastCommit &&
                      (!selectedNode.commits ||
                        selectedNode.commits.length === 0) && (
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <strong>Último marco:</strong>{" "}
                          {cleanCommitTitle(selectedNode.lastCommit.message)} (
                          {selectedNode.lastCommit.author})
                        </div>
                      )}

                    {/* AÇÕES DA VERSÃO */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "10px",
                        marginTop: "auto",
                      }}
                    >
                      {/* RAMIFICAR A PARTIR DESTA VERSÃO (DESTACADO) */}
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          border: "1px solid rgba(37, 99, 235, 0.25)",
                          background: "rgba(37, 99, 235, 0.04)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "var(--text-heading)",
                            }}
                          >
                            Ramificar esta versão
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            Origem:{" "}
                            <strong>
                              {selectedNode.isDefault
                                ? "Principal"
                                : selectedNode.name}
                            </strong>
                          </span>
                        </div>

                        {!isCreatingNew ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsCreatingNew(true);
                              setNewVersionName(
                                `${selectedNode.isDefault ? "nova-versao" : `${selectedNode.name}-derivada`}`,
                              );
                            }}
                            style={{
                              width: "100%",
                              fontWeight: 600,
                              borderColor: "#2563eb",
                              color: "#2563eb",
                            }}
                          >
                            + Criar Versão a Partir Desta
                          </Button>
                        ) : (
                          <form
                            onSubmit={handleCreateNewVersion}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              marginTop: "4px",
                            }}
                          >
                            <Input
                              type="text"
                              placeholder="Nome da nova versão..."
                              value={newVersionName}
                              onChange={(e) =>
                                setNewVersionName(e.target.value)
                              }
                              style={{
                                fontSize: "12px",
                                height: "30px",
                                width: "100%",
                              }}
                              autoFocus
                            />
                            <div style={{ display: "flex", gap: "6px" }}>
                              <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                disabled={!newVersionName.trim() || isSwitching}
                                style={{ flex: 1 }}
                              >
                                {isSwitching ? "Criando..." : "Criar versão"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setIsCreatingNew(false);
                                  setNewVersionName("");
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>

                      {selectedNode.proposal && onNavigateToProposal && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            onNavigateToProposal(selectedNode.proposal!.id)
                          }
                        >
                          Ver Proposta Completa
                        </Button>
                      )}

                      {!selectedNode.isDefault && onOpenDiffModal && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenDiffModal(selectedNode.name)}
                        >
                          Comparar com a Versão Oficial
                        </Button>
                      )}
                    </div>
                  </div>
                )}
          </div>
        )}
      </div>

      {/* Modal de Proteção na Alternância */}
      <SafeSwitchModal
        isOpen={safeModalOpen}
        onClose={() => {
          setSafeModalOpen(false);
          setTargetNodeToSwitch(null);
          setTargetCommitToSwitch(null);
        }}
        targetBranch={
          targetCommitToSwitch
            ? `marco ${targetCommitToSwitch.shortHash || targetCommitToSwitch.hash.slice(0, 7)}`
            : targetNodeToSwitch?.displayName || targetNodeToSwitch?.name || ""
        }
        currentBranch={
          nodes.find((n) => n.name === versionGraph?.currentBranch)
            ?.displayName ||
          versionGraph?.currentBranch ||
          "Versão Oficial"
        }
        uncommittedFiles={uncommittedFiles}
        onConfirmCommit={handleConfirmCommitAndSwitch}
        onConfirmStash={handleConfirmStash}
        onConfirmDiscard={handleConfirmDiscard}
        isProcessing={isSwitching}
      />

      {/* Modal da Lixeira Permanente de Rascunhos */}
      <DraftsTrashModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
      />
    </PageContainer>
  );
};

export default VersionsCanvasSubView;
