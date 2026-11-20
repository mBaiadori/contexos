import React from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Badge, Button } from "../../../../components/ui";

interface TemplatesHeaderProps {
  templatesCount: number;
  onRefresh: () => void;
  onOpenCreate: () => void;
}

export const TemplatesHeader: React.FC<TemplatesHeaderProps> = ({
  templatesCount,
  onRefresh,
  onOpenCreate,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "20px",
        flexWrap: "wrap",
        gap: "16px",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--color-on-surface)",
              letterSpacing: "-0.02em",
            }}
          >
            Gerenciador de Templates
          </h1>
          <Badge variant="primary" size="md">
            {templatesCount} {templatesCount === 1 ? "modelo" : "modelos"}
          </Badge>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Button
          id="btn-refresh-templates"
          variant="secondary"
          size="md"
          onClick={onRefresh}
          icon={<RefreshCw size={15} />}
        >
          Sincronizar
        </Button>

        <Button
          id="btn-open-new-template"
          variant="primary"
          size="md"
          onClick={onOpenCreate}
          icon={<Plus size={16} />}
        >
          Novo Template
        </Button>
      </div>
    </div>
  );
};
