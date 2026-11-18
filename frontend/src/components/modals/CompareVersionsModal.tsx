import React, { useEffect, useState } from "react";
import { GitCompare } from "lucide-react";
import { Modal, Button, Badge, Spinner } from "../ui";
import { DiffViewer } from "../common";
import { API } from "../../services/api";
import type { VersionNode } from "../../types";

export interface CompareVersionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoName?: string;
  nodes: VersionNode[];
  defaultBranch?: string;
  initialHeadBranch?: string;
}

export const CompareVersionsModal: React.FC<CompareVersionsModalProps> = ({
  isOpen,
  onClose,
  repoName,
  nodes,
  defaultBranch = "main",
  initialHeadBranch,
}) => {
  const [baseBranch, setBaseBranch] = useState(defaultBranch);
  const [headBranch, setHeadBranch] = useState(initialHeadBranch || "");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<{
    commits: Array<{ hash: string; shortHash: string; author: string; date: string; message: string }>;
    files: Array<{ path: string; status: string; additions: number; deletions: number; diff: string }>;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBaseBranch(defaultBranch);
      const fallbackHead =
        initialHeadBranch && initialHeadBranch !== defaultBranch
          ? initialHeadBranch
          : nodes.find((n) => !n.isDefault)?.name || defaultBranch;
      setHeadBranch(fallbackHead);
    }
  }, [isOpen, defaultBranch, initialHeadBranch, nodes]);

  useEffect(() => {
    if (!isOpen || !baseBranch || !headBranch) return;
    if (baseBranch === headBranch) {
      setData({ commits: [], files: [] });
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);
    API.compareBranches(baseBranch, headBranch, repoName)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) {
          setData({
            commits: res.data.commits || [],
            files: res.data.files || [],
          });
        } else {
          setErrorMsg((res.data as any)?.error || "Não foi possível comparar estas versões.");
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg(err?.message || "Erro ao comparar versões.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, baseBranch, headBranch, repoName]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <GitCompare size={18} color="var(--color-primary, #2563eb)" />
          <span>Comparar Versões</span>
        </span>
      }
      subtitle="Veja todos os arquivos e checkpoints diferentes entre duas versões."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "var(--bg-main, #f8fafc)",
            border: "1px solid var(--border-color, #e2e8f0)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
              VERSÃO BASE (REFERÊNCIA)
            </label>
            <select
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              style={{
                height: "34px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                padding: "0 8px",
                fontSize: "12.5px",
                background: "var(--bg-surface, #ffffff)",
              }}
            >
              {nodes.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.isDefault ? "Versão Oficial" : n.displayName || n.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>
              VERSÃO COMPARADA
            </label>
            <select
              value={headBranch}
              onChange={(e) => setHeadBranch(e.target.value)}
              style={{
                height: "34px",
                borderRadius: "6px",
                border: "1px solid var(--border-color, #cbd5e1)",
                padding: "0 8px",
                fontSize: "12.5px",
                background: "var(--bg-surface, #ffffff)",
              }}
            >
              {nodes.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.isDefault ? "Versão Oficial" : n.displayName || n.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px", gap: "8px" }}>
            <Spinner size="sm" />
            <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Comparando alterações...</span>
          </div>
        ) : errorMsg ? (
          <div style={{ color: "#dc2626", fontSize: "13px", padding: "12px" }}>{errorMsg}</div>
        ) : baseBranch === headBranch ? (
          <div style={{ color: "var(--text-secondary)", fontSize: "13px", padding: "16px", textAlign: "center" }}>
            Selecione duas versões diferentes para comparar.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "58vh", overflowY: "auto" }}>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Badge variant="info" size="sm">
                {data?.commits.length || 0} checkpoint(s)
              </Badge>
              <Badge variant="neutral" size="sm">
                {data?.files.length || 0} arquivo(s) alterado(s)
              </Badge>
            </div>

            {data?.files.length === 0 ? (
              <div style={{ color: "var(--text-secondary)", fontSize: "13px", padding: "16px", textAlign: "center" }}>
                Nenhuma diferença encontrada entre estas duas versões.
              </div>
            ) : (
              data?.files.map((f) => (
                <div
                  key={f.path}
                  style={{
                    border: "1px solid var(--border-color, #e2e8f0)",
                    borderRadius: "8px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--bg-main, #f8fafc)",
                      borderBottom: "1px solid var(--border-color, #e2e8f0)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "12px",
                    }}
                  >
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{f.path}</span>
                    <span style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
                      <span style={{ color: "#16a34a" }}>+{f.additions}</span>
                      <span style={{ color: "#dc2626" }}>-{f.deletions}</span>
                    </span>
                  </div>
                  <div style={{ padding: "8px" }}>
                    <DiffViewer diffText={f.diff || "Sem detalhes textuais."} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
