import React, { useState, useEffect } from "react";
import { useWorkspace } from "../../../context/WorkspaceContext";
import { VersionGraphRenderer } from "../../git/VersionGraphRenderer";
import { SafeSwitchModal } from "../SafeSwitchModal";
import { AlertBanner, Button, Input } from "../../ui";
import type { VersionNode, GitFileStatus } from "../../../types";

export interface GitBranchesTabProps {
  currentBranch: string;
  newBranchName: string;
  onNewBranchNameChange: (val: string) => void;
  onCreateBranch: (e: React.FormEvent) => void;
}

export const GitBranchesTab: React.FC<GitBranchesTabProps> = ({
  currentBranch: _currentBranch,
  newBranchName,
  onNewBranchNameChange,
  onCreateBranch,
}) => {
  const { versionGraph, refreshVersionGraph, safeSwitch } = useWorkspace();
  const [isSwitching, setIsSwitching] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Safe switch guard modal
  const [safeModalOpen, setSafeModalOpen] = useState(false);
  const [targetNodeToSwitch, setTargetNodeToSwitch] = useState<VersionNode | null>(null);
  const [uncommittedFiles, setUncommittedFiles] = useState<GitFileStatus[]>([]);

  useEffect(() => {
    if (refreshVersionGraph) {
      refreshVersionGraph();
    }
  }, [refreshVersionGraph]);

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
        if (refreshVersionGraph) await refreshVersionGraph();
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
        if (refreshVersionGraph) await refreshVersionGraph();
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
        if (refreshVersionGraph) await refreshVersionGraph();
      } else {
        setFeedback({ type: "error", message: res.error || "Falha ao descartar alterações." });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setIsSwitching(false);
    }
  };

  const nodes = versionGraph?.nodes || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {feedback && (
        <AlertBanner
          type={feedback.type === "success" ? "success" : "error"}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* Formulário de Nova Versão */}
      <form
        onSubmit={onCreateBranch}
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "14px 16px",
          background: "var(--bg-surface)",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1 }}>
          <Input
            type="text"
            placeholder="Nova versão (ex: revisao-politica ou especificacao-v2)"
            value={newBranchName}
            onChange={(e) => onNewBranchNameChange(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!newBranchName.trim()}
        >
          Criar Nova Versão
        </Button>
      </form>

      {/* Grafo Visual das Versões */}
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "16px",
          background: "var(--bg-surface)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
          Linha do Tempo de Versões
        </h4>

        <div style={{ maxHeight: "380px", overflowY: "auto", paddingRight: "4px" }}>
          <VersionGraphRenderer
            nodes={nodes}
            onSwitchNode={handleSwitchRequest}
            isSwitching={isSwitching}
          />
        </div>
      </div>

      <SafeSwitchModal
        isOpen={safeModalOpen}
        onClose={() => setSafeModalOpen(false)}
        targetBranch={targetNodeToSwitch?.name || ""}
        currentBranch={versionGraph?.currentBranch || "main"}
        uncommittedFiles={uncommittedFiles}
        onConfirmStash={handleConfirmStash}
        onConfirmDiscard={handleConfirmDiscard}
        isProcessing={isSwitching}
      />
    </div>
  );
};
