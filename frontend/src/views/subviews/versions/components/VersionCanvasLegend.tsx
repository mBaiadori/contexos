import React from "react";

export const VersionCanvasLegend: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        left: "20px",
        bottom: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "8px 12px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
        fontSize: "11px",
        color: "var(--text-secondary)",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#2563eb",
            flexShrink: 0,
          }}
        />
        <span>Versão Oficial</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#7c3aed",
            flexShrink: 0,
          }}
        />
        <span>Rascunho Local / Colega</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#d97706",
            flexShrink: 0,
          }}
        />
        <span>Em Publicação</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "#059669",
            flexShrink: 0,
          }}
        />
        <span>Publicada na Oficial ✓</span>
      </div>
    </div>
  );
};
