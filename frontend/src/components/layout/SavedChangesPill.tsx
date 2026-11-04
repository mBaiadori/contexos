import React, { useState, useRef, useEffect } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { SavedChangesDropdown } from "./SavedChangesDropdown";

export const SavedChangesPill: React.FC = () => {
  const { versionGraph } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const stashes = versionGraph?.stashes || [];
  const stashCount = stashes.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  if (stashCount === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <button
        id="saved-changes-pill-btn"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={`${stashCount} rascunho(s) guardado(s) para navegação. Clique para inspecionar ou restaurar.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          fontWeight: 500,
          padding: "3px 10px",
          borderRadius: "9999px",
          backgroundColor: "rgba(245, 158, 11, 0.12)",
          color: "#d97706",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          cursor: "pointer",
          transition: "all 0.15s ease",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "12px", lineHeight: 1 }}>📦</span>
        <span>
          Alterações guardadas
          {stashCount > 1 && ` (${stashCount})`}
        </span>
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: "#f59e0b",
          }}
        />
      </button>

      <SavedChangesDropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
};

