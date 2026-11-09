import React from "react";
import { BookOpen, Plus } from "lucide-react";
import { Button, EmptyState } from "../../../../components/ui";
import { STARTER_TEMPLATES } from "../types";

interface WikiEmptyStateProps {
  onStartNewEntry: () => void;
  onInstallStarter: (starter: (typeof STARTER_TEMPLATES)[0]) => void;
}

export const WikiEmptyState: React.FC<WikiEmptyStateProps> = ({
  onStartNewEntry,
  onInstallStarter,
}) => {
  return (
    <div style={{ maxWidth: "600px", margin: "60px auto", textAlign: "center" }}>
      <EmptyState
        icon={<BookOpen size={48} />}
        title="Wiki & Memória Contínua"
        description="Esta base armazena o conhecimento vivo de arquitetura, invariantes e ADRs sincronizadas diretamente na base do projeto sob .spec-memory/."
        actionLabel="Criar Primeira Nota"
        onAction={onStartNewEntry}
      />

      <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap", marginTop: "24px" }}>
        {STARTER_TEMPLATES.map((starter, i) => (
          <Button
            key={i}
            variant="secondary"
            size="sm"
            onClick={() => onInstallStarter(starter)}
            icon={<Plus size={13} />}
          >
            Adicionar {starter.title.split(":")[0]}
          </Button>
        ))}
      </div>
    </div>
  );
};
