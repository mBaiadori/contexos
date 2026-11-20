import React from "react";
import { ChevronLeft, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { Badge, Button } from "../../../../components/ui";

interface TemplateEditorTopBarProps {
  isEditMode: boolean;
  tplTemplateName: string;
  tplId: string;
  showConfigDrawer: boolean;
  tplSkillsCount: number;
  isSaving: boolean;
  onBack: () => void;
  onToggleConfigDrawer: () => void;
  onSaveTemplate: () => Promise<void> | void;
}

export const TemplateEditorTopBar: React.FC<TemplateEditorTopBarProps> = ({
  isEditMode,
  tplTemplateName,
  tplId,
  showConfigDrawer,
  tplSkillsCount,
  isSaving,
  onBack,
  onToggleConfigDrawer,
  onSaveTemplate,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 20px",
        borderBottom: "1px solid var(--color-outline-variant)",
        background: "var(--color-surface-container-low)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onBack}
          icon={<ChevronLeft size={14} />}
        >
          Voltar ao Catálogo
        </Button>

        <Badge variant="primary" size="md">
          {isEditMode ? "Modo Edição" : "Novo Template"}
        </Badge>

        <span
          style={{
            fontSize: "13px",
            color: "var(--color-outline)",
            fontFamily: "var(--font-mono, monospace)",
          }}
        >
          templates/{tplTemplateName || tplId || "novo-template"}.md
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Button
          variant={showConfigDrawer ? "primary" : "secondary"}
          size="sm"
          onClick={onToggleConfigDrawer}
          icon={<SlidersHorizontal size={14} />}
        >
          Propriedades
          {tplSkillsCount > 0 && (
            <span
              style={{
                marginLeft: "6px",
                padding: "1px 6px",
                borderRadius: "10px",
                fontSize: "10.5px",
                fontWeight: 700,
                background: showConfigDrawer
                  ? "rgba(255,255,255,0.25)"
                  : "var(--color-primary-container)",
                color: showConfigDrawer ? "#ffffff" : "var(--color-primary)",
              }}
            >
              {tplSkillsCount} {tplSkillsCount === 1 ? "skill" : "skills"}
            </span>
          )}
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onSaveTemplate}
          disabled={isSaving}
          icon={
            isSaving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )
          }
        >
          {isSaving ? "Salvando..." : "Salvar Template"}
        </Button>
      </div>
    </div>
  );
};
