import React from "react";
import { ShieldCheck, ShieldAlert, CheckCircle, Play } from "lucide-react";
import { Button } from "../../ui";
import type { GovernanceActionWorkflowStatus } from "../../../types";

export interface GovernanceActionsTabProps {
  workflowStatus: GovernanceActionWorkflowStatus | null;
  handleInstallWorkflow: () => Promise<void>;
  isInstallingWorkflow: boolean;
}

export const GovernanceActionsTab: React.FC<GovernanceActionsTabProps> = ({
  workflowStatus,
  handleInstallWorkflow,
  isInstallingWorkflow,
}) => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div
        style={{
          background: "var(--md-sys-color-surface-container-low, #f8fafc)",
          border: "1px solid var(--border-subtle, #e2e8f0)",
          borderRadius: "12px",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "10px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: workflowStatus?.installed
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(245, 158, 11, 0.15)",
              color: workflowStatus?.installed ? "#10b981" : "#f59e0b",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {workflowStatus?.installed ? (
              <ShieldCheck size={20} />
            ) : (
              <ShieldAlert size={20} />
            )}
          </div>
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: "13.5px",
                fontWeight: 600,
                color: "var(--text-heading, #0f172a)",
              }}
            >
              GitHub Actions Governance Gatekeeper
            </h4>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "11.5px",
                color: "var(--text-muted, #64748b)",
              }}
            >
              {workflowStatus?.installed
                ? "Workflow ativo em .github/workflows/governance-check.yml validando CODEOWNERS, Quorum e Secrets nos PRs."
                : "Ainda não instalado. Proteja seus repositórios privados com validação automatizada de CI/CD."}
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            marginTop: "12px",
          }}
        >
          <Button
            variant={workflowStatus?.installed ? "secondary" : "primary"}
            size="sm"
            onClick={handleInstallWorkflow}
            disabled={isInstallingWorkflow}
            icon={
              workflowStatus?.installed ? (
                <CheckCircle size={13} />
              ) : (
                <Play size={13} />
              )
            }
          >
            {isInstallingWorkflow
              ? "Instalando..."
              : workflowStatus?.installed
                ? "Reinstalar / Atualizar Workflow"
                : "Instalar Workflow de Governança no Repositório"}
          </Button>
        </div>
      </div>
    </div>
  );
};
