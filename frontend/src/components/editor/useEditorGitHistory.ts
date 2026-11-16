import { useState, useEffect, useCallback } from "react";
import { API } from "../../services/api";
import type { GitCommitInfo } from "../../types";

interface UseEditorGitHistoryOptions {
  filePath: string | null;
  isGitMode: boolean;
  setIsGitMode: (mode: boolean) => void;
  onChange: (content: string) => void;
  refreshPendingChanges: () => Promise<void>;
  refreshGitStatus: () => Promise<void>;
}

export function useEditorGitHistory({
  filePath,
  isGitMode,
  setIsGitMode,
  onChange,
  refreshPendingChanges,
  refreshGitStatus,
}: UseEditorGitHistoryOptions) {
  const [selectedCommit, setSelectedCommit] = useState<GitCommitInfo | null>(null);
  const [historicalContent, setHistoricalContent] = useState<string>("");
  const [blameData, setBlameData] = useState<any[]>([]);

  // Reset commit selection when switching file
  useEffect(() => {
    setSelectedCommit(null);
    setHistoricalContent("");
  }, [filePath]);

  // Load Blame info when entering Git / Audit Mode
  useEffect(() => {
    if (isGitMode && filePath) {
      API.getFileBlame(filePath)
        .then((res) => {
          if (res.ok && res.data?.blame) {
            setBlameData(res.data.blame);
          }
        })
        .catch(() => {});
    }
  }, [isGitMode, filePath]);

  // Load Historical Content when selecting a past commit
  useEffect(() => {
    if (!selectedCommit || !filePath) {
      setHistoricalContent("");
      return;
    }

    API.getFileVersion(filePath, selectedCommit.hash)
      .then((res) => {
        if (res.ok && res.data?.success) {
          setHistoricalContent(res.data.content);
        }
      })
      .catch((err) => {
        console.error("[NotionEditor] Erro ao carregar versão do commit:", err);
      });
  }, [selectedCommit, filePath]);

  const handleRestoreHistoricalVersion = useCallback(async () => {
    if (!historicalContent || !filePath) return;
    if (
      window.confirm(
        `Deseja restaurar o documento para a Versão #${selectedCommit?.shortHash || selectedCommit?.hash.slice(0, 7) || "selecionada"} (${selectedCommit?.message || ""})?`,
      )
    ) {
      onChange(historicalContent);
      setIsGitMode(false);
      setSelectedCommit(null);
      await API.saveProjectFile({
        path: filePath,
        content: historicalContent,
      });
      await refreshPendingChanges();
      await refreshGitStatus();
    }
  }, [
    historicalContent,
    filePath,
    selectedCommit,
    onChange,
    setIsGitMode,
    refreshPendingChanges,
    refreshGitStatus,
  ]);

  return {
    selectedCommit,
    setSelectedCommit,
    historicalContent,
    setHistoricalContent,
    blameData,
    handleRestoreHistoricalVersion,
  };
}
