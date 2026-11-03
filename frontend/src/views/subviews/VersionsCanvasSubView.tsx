import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { PageContainer, Button, Input, Badge, AlertBanner } from "../../components/ui";
import { SafeSwitchModal } from "../../components/modals/SafeSwitchModal";
import { VersionTreeCanvas, cleanCommitTitle } from "./versions/VersionTreeCanvas";
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
    safeSwitch,
    createOrSwitchBranch,
    commitGit,
    popStash,
    dropStash,
    clearStash,
    refreshGitStatus,
    refreshPendingChanges,
  } = useWorkspace();

  const [search, setSearch] = useState("");
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitInfo | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(true);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isProcessingStash, setIsProcessingStash] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Safe switch guard modal
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [targetNodeToSwitch, setTargetNodeToSwitch] = useState<VersionNode | null>(null);
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFileStatus[]>([]);

  const loadGraph = useCallback(async () => {
    if (refreshVersionGraph) {
      await refreshVersionGraph();
    }
  }, [refreshVersionGraph]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

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
        setFeedback({ type: "success", message: "Marco salvo no disco com sucesso." });
        setCommitMessage("");
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res?.message || "Falha ao salvar marco." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro inesperado." });
    } finally {
      setIsCommitting(false);
    }
  };

  // Alternância segura
  const handleSwitchRequest = async (node: VersionNode) => {
    if (node.isCurrent) return;
    setIsSwitching(true);
    setFeedback(null);

    try {
      const checkRes = await safeSwitch({
        branch: node.name,
        action: "check",
      });

      if (checkRes.hasUncommitted && checkRes.files && checkRes.files.length > 0) {
        setTargetNodeToSwitch(node);
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
          message: switchRes.message || `Alternado para a versão "${node.name}".`,
        });
        setSelectedNodeName(node.name);
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: switchRes.error || "Erro ao alternar de versão.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro ao alternar de versão." });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmCommitAndSwitch = async (msg: string) => {
    if (!targetNodeToSwitch || !commitGit) return;
    setIsSwitching(true);
    setFeedback(null);
    try {
      const commitRes = await commitGit(msg);
      if (!commitRes || !commitRes.success) {
        setFeedback({ type: "error", message: commitRes?.message || "Falha ao gravar marco." });
        setIsSwitching(false);
        return;
      }

      const switchRes = await safeSwitch({
        branch: targetNodeToSwitch.name,
        action: "switch",
      });

      if (switchRes.success) {
        setSafeModalOpen(false);
        setFeedback({
          type: "success",
          message: `Marco salvo com sucesso e alternado para "${targetNodeToSwitch.name}".`,
        });
        setSelectedNodeName(targetNodeToSwitch.name);
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: switchRes.error || "Falha ao alternar de versão." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro inesperado." });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmStash = async () => {
    if (!targetNodeToSwitch) return;
    setIsSwitching(true);
    try {
      const res = await safeSwitch({
        branch: targetNodeToSwitch.name,
        action: "stash",
      });
      if (res.success) {
        setSafeModalOpen(false);
        setFeedback({
          type: "success",
          message: res.message || `Alternado para "${targetNodeToSwitch.name}" com rascunhos guardados.`,
        });
        setSelectedNodeName(targetNodeToSwitch.name);
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res.error || "Falha ao guardar rascunhos." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleConfirmDiscard = async () => {
    if (!targetNodeToSwitch) return;
    setIsSwitching(true);
    try {
      const res = await safeSwitch({
        branch: targetNodeToSwitch.name,
        action: "discard",
      });
      if (res.success) {
        setSafeModalOpen(false);
        setFeedback({
          type: "success",
          message: res.message || `Alterações descartadas e alternado para "${targetNodeToSwitch.name}".`,
        });
        setSelectedNodeName(targetNodeToSwitch.name);
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res.error || "Falha ao descartar alterações." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleRestoreStash = async (stashId?: string) => {
    if (!popStash) return;
    setIsProcessingStash(true);
    setFeedback(null);
    try {
      const res = await popStash(stashId);
      if (res.success) {
        setFeedback({ type: "success", message: "Rascunhos restaurados no disco." });
        if (refreshGitStatus) await refreshGitStatus();
        if (refreshPendingChanges) await refreshPendingChanges();
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res.message || "Erro ao restaurar rascunhos." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro inesperado ao restaurar." });
    } finally {
      setIsProcessingStash(false);
    }
  };

  const handleDropStash = async (stashId?: string) => {
    if (!dropStash) return;
    setIsProcessingStash(true);
    setFeedback(null);
    try {
      const res = await dropStash(stashId);
      if (res.success) {
        setFeedback({ type: "success", message: "Rascunho descartado com sucesso." });
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res.message || "Erro ao descartar rascunho." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsProcessingStash(false);
    }
  };

  const handleClearAllStashes = async () => {
    if (!clearStash) return;
    setIsProcessingStash(true);
    setFeedback(null);
    try {
      const res = await clearStash();
      if (res && res.success) {
        setFeedback({ type: "success", message: "Todos os rascunhos guardados no stash foram limpos." });
        if (refreshGitStatus) await refreshGitStatus();
        await loadGraph();
      } else {
        setFeedback({ type: "error", message: res?.message || "Falha ao limpar stashes." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Erro inesperado." });
    } finally {
      setIsProcessingStash(false);
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
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
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
          message: res.message || "Erro ao criar nova versão a partir do marco.",
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
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
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-heading)" }}>
            Versões
          </h2>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {activeRepo?.name || "Repositório"} · Árvore de ramificações
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Input
            type="text"
            placeholder="Buscar galho..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "180px", height: "32px", fontSize: "12px" }}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadGraph()}
            disabled={isSwitching}
          >
            Atualizar
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", fontWeight: 600 }}>
                  {selectedCommit ? "Marco" : "Versão Selecionada"}
                </span>
                <h3 style={{ margin: "2px 0 0 0", fontSize: "17px", fontWeight: 700, color: "var(--text-heading)" }}>
                  {selectedCommit
                    ? cleanCommitTitle(selectedCommit.message)
                    : selectedNode?.isDefault
                      ? "Início (Base)"
                      : selectedNode?.name}
                </h3>
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

            {/* SE FOR UM COMMIT DA LINHA PRINCIPAL SELECIONADO */}
            {selectedCommit ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", gap: "6px" }}>
                  <Badge variant="primary" size="sm">Marco</Badge>
                </div>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "6px",
                    background: "var(--bg-main)",
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    lineHeight: "1.4",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "4px", color: "var(--text-heading)" }}>Título:</div>
                  <div>{cleanCommitTitle(selectedCommit.message)}</div>
                </div>

                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    background: "var(--bg-main)",
                    fontSize: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>Data: </span>
                    <strong>
                      {selectedCommit.date
                        ? new Date(selectedCommit.date).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Data não disponível"}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>Autor: </span>
                    <strong>{selectedCommit.author}</strong>
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
                    marginTop: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-heading)" }}>
                      Ramificar a partir deste marco
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)" }}>
                    Crie uma nova versão independente iniciando exatamente neste ponto da história.
                  </p>

                  {!isCreatingNew ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setIsCreatingNew(true);
                        setNewVersionName(`galho-${selectedCommit.hash.slice(0, 7)}`);
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
                        onChange={(e) => setNewVersionName(e.target.value)}
                        style={{ fontSize: "12px", height: "30px", width: "100%" }}
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
                          {isSwitching ? "Criando..." : "Criar galho"}
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
              </div>
            ) : selectedNode && (
              <>
            {/* Badges de Situação */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {selectedNode.isCurrent && (
                <Badge variant="primary" size="sm">Ativa</Badge>
              )}
              {selectedNode.isDefault && (
                <Badge variant="outline" size="sm">Base do Projeto</Badge>
              )}
              {selectedNode.isMerged && (
                <Badge variant="success" size="sm">Mergeada na Base</Badge>
              )}
              {!selectedNode.isDefault && !selectedNode.isMerged && selectedNode.type === "proposal" && (
                <Badge variant="warning" size="sm">Em Revisão</Badge>
              )}
              {!selectedNode.isDefault && !selectedNode.isMerged && selectedNode.type === "draft" && (
                <Badge variant="outline" size="sm">Rascunho Local</Badge>
              )}
            </div>

            {/* Origem e Destino do Galho */}
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "6px",
                background: "var(--bg-main)",
                fontSize: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Origem: </span>
                <strong>{selectedNode.parentBranch ? `Bifurcada de "${selectedNode.parentBranch}"` : "Raiz da Principal"}</strong>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Destino: </span>
                <strong>
                  {selectedNode.isDefault
                    ? "Versão em vigor"
                    : selectedNode.isMerged
                      ? "Unida de volta à Principal"
                      : "Galho ativo e independente"}
                </strong>
              </div>
              {selectedNode.isMerged && (
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Data do merge: </span>
                  <strong style={{ color: "#16a34a" }}>
                    {selectedNode.mergedDate
                      ? new Date(selectedNode.mergedDate).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Incorporada à Principal"}
                  </strong>
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
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
                  Modificações no Disco Atual
                </div>

                {selectedNode.uncommittedFiles && selectedNode.uncommittedFiles.length > 0 ? (
                  <form onSubmit={handleSaveLocalCommit} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11px", color: "#d97706" }}>
                      {selectedNode.uncommittedFiles.length} arquivo(s) modificado(s) não salvos:
                    </span>
                    <div style={{ maxHeight: "70px", overflowY: "auto", fontSize: "11px", fontFamily: "monospace" }}>
                      {selectedNode.uncommittedFiles.map((f, i) => (
                        <div key={i} style={{ padding: "1px 0", color: "var(--text-secondary)" }}>
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
                      {isCommitting ? "Salvando..." : "Salvar Marco no Disco"}
                    </Button>
                  </form>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Disco limpo. Nenhuma alteração pendente.
                  </span>
                )}
              </div>
            )}

            {/* GAVETA DE RASCUNHOS (STASHES) */}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}>
                  Rascunhos Guardados (Stash)
                </span>
                {versionGraph?.stashes && versionGraph.stashes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllStashes}
                    disabled={isProcessingStash}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#ef4444",
                      fontSize: "10px",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Limpar todos
                  </button>
                )}
              </div>

              {selectedNode.hasStash && selectedNode.stashes && selectedNode.stashes.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ margin: 0, fontSize: "11px", color: "var(--text-secondary)" }}>
                    Alterações guardadas temporariamente nesta versão:
                  </p>

                  {selectedNode.stashes.map((st, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "8px",
                        borderRadius: "4px",
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-color)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ fontSize: "11px", fontWeight: 600 }}>
                        {st.message || `Rascunho #${idx + 1}`}
                      </div>

                      <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                        A restauração aplica os arquivos guardados no disco da versão atual.
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={isProcessingStash}
                          onClick={() => handleRestoreStash(st.id)}
                        >
                          Restaurar rascunho
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isProcessingStash}
                          onClick={() => handleDropStash(st.id)}
                        >
                          Descartar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  Nenhum rascunho guardado nesta versão.
                </span>
              )}
            </div>

            {/* ÚLTIMO MARCO */}
            {selectedNode.lastCommit && (
              <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                <strong>Último marco:</strong> {cleanCommitTitle(selectedNode.lastCommit.message)} ({selectedNode.lastCommit.author})
              </div>
            )}

            {/* AÇÕES DA VERSÃO */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "auto" }}>
              {!selectedNode.isCurrent ? (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isSwitching}
                  onClick={() => handleSwitchRequest(selectedNode)}
                >
                  {isSwitching ? "Alternando..." : "Alternar para esta versão"}
                </Button>
              ) : (
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", textAlign: "center" }}>
                  Versão ativa no momento.
                </div>
              )}

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-heading)" }}>
                    Ramificar esta versão
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                    Origem: <strong>{selectedNode.isDefault ? "Principal" : selectedNode.name}</strong>
                  </span>
                </div>

                {!isCreatingNew ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsCreatingNew(true);
                      setNewVersionName(`${selectedNode.isDefault ? "nova-versao" : `${selectedNode.name}-derivada`}`);
                    }}
                    style={{ width: "100%", fontWeight: 600, borderColor: "#2563eb", color: "#2563eb" }}
                  >
                    + Criar Galho a Partir Desta
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
                      placeholder="Nome do novo galho..."
                      value={newVersionName}
                      onChange={(e) => setNewVersionName(e.target.value)}
                      style={{ fontSize: "12px", height: "30px", width: "100%" }}
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
                        {isSwitching ? "Criando..." : "Criar galho"}
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
                  onClick={() => onNavigateToProposal(selectedNode.proposal!.id)}
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
                  Comparar com a Principal
                </Button>
              )}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* Modal de Proteção na Alternância */}
      <SafeSwitchModal
        isOpen={safeModalOpen}
        onClose={() => setSafeModalOpen(false)}
        targetBranch={targetNodeToSwitch?.name || ""}
        currentBranch={versionGraph?.currentBranch || "main"}
        uncommittedFiles={uncommittedFiles}
        onConfirmCommit={handleConfirmCommitAndSwitch}
        onConfirmStash={handleConfirmStash}
        onConfirmDiscard={handleConfirmDiscard}
        isProcessing={isSwitching}
      />
    </PageContainer>
  );
};

export default VersionsCanvasSubView;
