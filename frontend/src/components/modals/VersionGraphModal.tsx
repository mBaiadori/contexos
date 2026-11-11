import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Modal, Button, Input, AlertBanner } from "../ui";
import { useWorkspace } from "../../context/WorkspaceContext";
import { VersionGraphRenderer } from "../git/VersionGraphRenderer";
import { SafeSwitchModal } from "./SafeSwitchModal";
import type { VersionNode, GitFileStatus } from "../../types";

export interface VersionGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToProposal?: (proposalId: number | string) => void;
  onOpenDiffModal?: (targetBranch?: string) => void;
}

export const VersionGraphModal: React.FC<VersionGraphModalProps> = ({
  isOpen,
  onClose,
  onNavigateToProposal,
  onOpenDiffModal,
}) => {
  const {
    activeRepo,
    versionGraph,
    refreshVersionGraph,
    safeSwitch,
    createOrSwitchBranch,
  } = useWorkspace();

  const [search, setSearch] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [isSwitching, setIsSwitching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Safe switch guard modal state
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [targetNodeToSwitch, setTargetNodeToSwitch] = useState<VersionNode | null>(null);
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFileStatus[]>([]);

  const loadGraph = useCallback(async () => {
    if (refreshVersionGraph) {
      await refreshVersionGraph();
    }
  }, [refreshVersionGraph]);

  useEffect(() => {
    if (isOpen) {
      loadGraph();
      setFeedback(null);
      setIsCreatingNew(false);
      setNewVersionName("");
    }
  }, [isOpen, loadGraph]);

  const nodes = versionGraph?.nodes || [];

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

  // Manipulador de alternância de versão
  const handleSwitchRequest = async (node: VersionNode) => {
    if (node.isCurrent) return;
    setIsSwitching(true);
    setFeedback(null);

    try {
      // 1. Checa se o workspace está limpo
      const checkRes = await safeSwitch({
        branch: node.name,
        action: "check",
      });

      if (checkRes.hasUncommitted && checkRes.files && checkRes.files.length > 0) {
        // Abre o SafeSwitchModal
        setTargetNodeToSwitch(node);
        setUncommittedFiles(checkRes.files);
        setSafeModalOpen(true);
        setIsSwitching(false);
        return;
      }

      // Se estiver limpo, troca diretamente
      const switchRes = await safeSwitch({
        branch: node.name,
        action: "switch",
      });

      if (switchRes.success) {
        setFeedback({
          type: "success",
          message: switchRes.message || `Alternado para a versão "${node.name}".`,
        });
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
        message: (err as Error).message || "Erro inesperado ao alternar de versão.",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  // Confirmação de Safe Switch: Stash
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
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao guardar rascunhos e alternar.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  // Confirmação de Safe Switch: Discard
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
        await loadGraph();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Falha ao descartar e alternar.",
        });
      }
    } catch (err) {
      setFeedback({ type: "error", message: (err as Error).message });
    } finally {
      setIsSwitching(false);
    }
  };

  // Criar nova versão
  const handleCreateNewVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newVersionName.trim().replace(/\s+/g, "-");
    if (!cleanName) return;

    setIsSwitching(true);
    setFeedback(null);
    try {
      const res = await createOrSwitchBranch(cleanName);
      if (res.success) {
        setFeedback({
          type: "success",
          message: `Nova versão "${cleanName}" criada e ativada.`,
        });
        setNewVersionName("");
        setIsCreatingNew(false);
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

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        size="lg"
        title="Versões do Repositório"
        subtitle={`Gerencie a Versão Oficial, rascunhos e propostas em análise para o projeto ${activeRepo?.name || ""}.`}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
            <Button variant="outline" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Feedback Banner */}
          {feedback && (
            <AlertBanner
              type={feedback.type === "success" ? "success" : "error"}
              message={feedback.message}
              onClose={() => setFeedback(null)}
            />
          )}

          {/* Barra Superior: Busca & Nova Versão */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: "200px" }}>
              <Input
                type="text"
                placeholder="Buscar versão por nome ou proposta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Button
              variant={isCreatingNew ? "outline" : "primary"}
              size="sm"
              onClick={() => setIsCreatingNew(!isCreatingNew)}
            >
              {isCreatingNew ? "Cancelar" : "+ Nova Versão"}
            </Button>
          </div>

          {/* Mini formulário de criação inline */}
          {isCreatingNew && (
            <form
              onSubmit={handleCreateNewVersion}
              style={{
                display: "flex",
                gap: "8px",
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-surface)",
                alignItems: "center",
              }}
            >
              <div style={{ flex: 1 }}>
                <Input
                  type="text"
                  placeholder="Nome da nova versão (ex: ajuste-contrato-v2)"
                  value={newVersionName}
                  onChange={(e) => setNewVersionName(e.target.value)}
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!newVersionName.trim() || isSwitching}
              >
                Criar e Entrar
              </Button>
            </form>
          )}

          {/* O Grafo Visual de Versões */}
          <div
            style={{
              maxHeight: "55vh",
              overflowY: "auto",
              paddingRight: "4px",
            }}
          >
            <VersionGraphRenderer
              nodes={filteredNodes}
              onSwitchNode={handleSwitchRequest}
              isSwitching={isSwitching}
              onEditProposal={(proposalId) => {
                onClose();
                onNavigateToProposal?.(proposalId);
              }}
              onCompareWithMain={(_node) => {
                onClose();
                onOpenDiffModal?.(_node.name);
              }}
              onNewVersionFrom={(_node) => {
                setIsCreatingNew(true);
                setNewVersionName(`${_node.name}-derivada`);
              }}
            />
          </div>
        </div>
      </Modal>

      {/* Modal de Proteção na Alternância */}
      <SafeSwitchModal
        isOpen={safeModalOpen}
        onClose={() => setSafeModalOpen(false)}
        targetBranch={targetNodeToSwitch?.displayName || targetNodeToSwitch?.name || ""}
        currentBranch={
          nodes.find((n) => n.name === versionGraph?.currentBranch)?.displayName ||
          versionGraph?.currentBranch ||
          "Versão Oficial"
        }
        uncommittedFiles={uncommittedFiles}
        onConfirmStash={handleConfirmStash}
        onConfirmDiscard={handleConfirmDiscard}
        isProcessing={isSwitching}
      />
    </>
  );
};

