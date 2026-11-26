import React from "react";
import { Drawer } from "../../../../components/ui";
import type { SkillItem } from "../../../../types";

interface SkillDetailDrawerProps {
  selectedSkill: SkillItem | null;
  onClose: () => void;
}

export const SkillDetailDrawer: React.FC<SkillDetailDrawerProps> = ({
  selectedSkill,
  onClose,
}) => {
  if (!selectedSkill) return null;

  return (
    <Drawer
      isOpen={Boolean(selectedSkill)}
      onClose={onClose}
      title={selectedSkill.title || selectedSkill.name}
      subtitle={
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
          }}
        >
          id: {selectedSkill.id} • v{selectedSkill.version}
        </span>
      }
    >
      <div>
          <h4
            style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              color: "var(--text-muted)",
              marginBottom: "6px",
            }}
          >
            Descrição
          </h4>
          <p
            style={{
              fontSize: "13px",
              lineHeight: "1.5",
              margin: "0 0 16px 0",
            }}
          >
            {selectedSkill.description}
          </p>
          {selectedSkill.content && (
            <div>
              <h4
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: "8px",
                }}
              >
                Instruções do Agente (SKILL.md)
              </h4>
              <pre
                style={{
                  fontSize: "11.5px",
                  lineHeight: "1.45",
                  fontFamily: "var(--font-mono, monospace)",
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--color-surface-container-low, #f8f9fa)",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  whiteSpace: "pre-wrap",
                  overflowX: "auto",
                  maxHeight: "300px",
                }}
              >
                {selectedSkill.content}
              </pre>
            </div>
          )}
      </div>
    </Drawer>
  );
};
