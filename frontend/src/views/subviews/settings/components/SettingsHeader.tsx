import React from "react";
import { PageHeader, Badge } from "../../../../components/ui";

interface SettingsHeaderProps {
  activeRepoName?: string;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  activeRepoName,
}) => {
  return (
    <PageHeader
      title="Configurações"
      badge={
        <Badge variant="primary" size="sm">
          {activeRepoName || "local"}
        </Badge>
      }
    />
  );
};
