import React from "react";
import { Save } from "lucide-react";
import { PageHeader, Badge, Button } from "../../../../components/ui";

interface SettingsHeaderProps {
  activeRepoName?: string;
  handleSaveAllSettings: () => void;
  isSavingAll: boolean;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  activeRepoName,
  handleSaveAllSettings,
  isSavingAll,
}) => {
  return (
    <PageHeader
      title="Configurações"
      badge={
        <Badge variant="primary" size="sm">
          {activeRepoName || "local"}
        </Badge>
      }
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button
            id="btn-save-top-all-settings"
            variant="primary"
            size="sm"
            leftIcon={<Save size={13} />}
            onClick={handleSaveAllSettings}
            disabled={isSavingAll}
          >
            {isSavingAll ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      }
    />
  );
};
