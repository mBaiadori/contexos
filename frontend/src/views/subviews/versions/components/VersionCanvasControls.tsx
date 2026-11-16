import React from "react";
import { Button } from "../../../../components/ui";

interface VersionCanvasControlsProps {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  nodeSpacing: number;
  setNodeSpacing: (spacing: number) => void;
  expandedBranchNames: Set<string>;
  expandAll: () => void;
  collapseAll: () => void;
  centerOnActive: () => void;
}

export const VersionCanvasControls: React.FC<VersionCanvasControlsProps> = ({
  zoom,
  setZoom,
  nodeSpacing,
  setNodeSpacing,
  expandedBranchNames,
  expandAll,
  collapseAll,
  centerOnActive,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        right: "20px",
        bottom: "20px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "4px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
        zIndex: 10,
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setZoom((z) => Math.min(z * 1.15, 3.5))}
        title="Aumentar zoom (ou use Ctrl + Scroll)"
        style={{ width: "30px", height: "30px", padding: 0 }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "18px" }}
        >
          add
        </span>
      </Button>
      <span
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--text-secondary)",
          minWidth: "36px",
          textAlign: "center",
        }}
      >
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setZoom((z) => Math.max(z * 0.85, 0.4))}
        title="Diminuir zoom (ou use Ctrl + Scroll)"
        style={{ width: "30px", height: "30px", padding: 0 }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "18px" }}
        >
          remove
        </span>
      </Button>

      <div
        style={{
          width: "1px",
          height: "18px",
          background: "var(--border-color)",
        }}
      />

      {/* Controle Dinâmico da Distância entre Nós */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          padding: "0 4px",
        }}
        title={`Distância vertical entre nós: ${nodeSpacing}px`}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px", color: "var(--text-secondary)" }}
        >
          format_line_spacing
        </span>

        <input
          type="range"
          min="10"
          max="280"
          step="2"
          value={nodeSpacing}
          onChange={(e) => setNodeSpacing(Number(e.target.value))}
          style={{
            width: "55px",
            height: "4px",
            cursor: "pointer",
            accentColor: "#2563eb",
          }}
        />
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-secondary)",
            minWidth: "26px",
            fontWeight: 600,
          }}
        >
          {nodeSpacing}px
        </span>
      </div>

      <div
        style={{
          width: "1px",
          height: "18px",
          background: "var(--border-color)",
        }}
      />

      {/* Botão de Expandir / Recolher Todos os Commits das Branches */}
      <Button
        variant="ghost"
        size="sm"
        onClick={expandedBranchNames.size > 0 ? collapseAll : expandAll}
        title={
          expandedBranchNames.size > 0
            ? "Recolher commits de todas as branches"
            : "Mostrar commits de todas as branches"
        }
        style={{
          height: "30px",
          padding: "0 8px",
          fontSize: "11.5px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          color:
            expandedBranchNames.size > 0
              ? "#2563eb"
              : "var(--text-secondary)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          {expandedBranchNames.size > 0 ? "unfold_less" : "unfold_more"}
        </span>
        <span>
          {expandedBranchNames.size > 0 ? "Esconder todos" : "Mostrar todos"}
        </span>
      </Button>

      <div
        style={{
          width: "1px",
          height: "18px",
          background: "var(--border-color)",
        }}
      />

      <Button
        variant="ghost"
        size="sm"
        onClick={centerOnActive}
        title="Centralizar no commit ou branch ativo"
        style={{
          height: "30px",
          padding: "0 8px",
          fontSize: "12px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "16px" }}
        >
          center_focus_strong
        </span>
        <span>Focar</span>
      </Button>
    </div>
  );
};
