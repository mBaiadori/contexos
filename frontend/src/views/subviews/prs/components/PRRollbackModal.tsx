import React from "react";
import { Button, useBackdropClose } from "../../../../components/ui";
import type { PR } from "../../../../types";
import type { ActionLoadingState } from "../types";

interface PRRollbackModalProps {
  rollbackTarget: PR | null;
  onClose: () => void;
  handleRollback: () => void;
  actionLoading: ActionLoadingState | null;
}

export const PRRollbackModal: React.FC<PRRollbackModalProps> = ({
  rollbackTarget,
  onClose,
  handleRollback,
  actionLoading,
}) => {
  const backdropHandlers = useBackdropClose(onClose, !actionLoading);

  if (!rollbackTarget) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      {...backdropHandlers}
    >
      <div
        className="modal-container"
        style={{
          background: "var(--color-surface, #ffffff)",
          borderRadius: "12px",
          padding: "24px",
          width: "100%",
          maxWidth: "520px",
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
          border: "1px solid var(--color-border-subtle, #e2e8f0)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="ui-row ui-row--align-center ui-row--sm"
          style={{ marginBottom: "16px" }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: "28px",
              color: "var(--color-primary, #3b82f6)",
            }}
          >
            history
          </span>
          <h3
            style={{
              margin: 0,
              fontSize: "18px",
              color: "var(--color-text-primary, #0f172a)",
              fontWeight: 700,
            }}
          >
            Restaurar Versão (Rollback Seguro)
          </h3>
        </div>

        <p
          style={{
            fontSize: "14px",
            color: "var(--color-text-secondary, #334155)",
            lineHeight: "1.6",
            margin: "0 0 16px 0",
          }}
        >
          Você está prestes a restaurar o projeto para o estado da revisão:
          <br />
          <strong
            style={{
              color: "var(--color-text-primary, #0f172a)",
              display: "block",
              marginTop: "6px",
            }}
          >
            #{rollbackTarget.short_id || rollbackTarget.id} &bull;{" "}
            {rollbackTarget.title}
          </strong>
        </p>

        <div
          style={{
            background: "var(--color-surface-subtle, #f8fafc)",
            border: "1px solid var(--color-border-subtle, #e2e8f0)",
            borderRadius: "8px",
            padding: "12px 14px",
            fontSize: "13px",
            color: "var(--color-text-muted, #64748b)",
            lineHeight: "1.5",
            marginBottom: "20px",
          }}
        >
          <strong style={{ color: "var(--color-text-primary, #0f172a)" }}>
            💡 Como funciona a restauração segura:
          </strong>
          <div style={{ marginTop: "4px" }}>
            O estado desta versão será promovido como a nova versão ativa.{" "}
            <strong>
              Todo o histórico de revisões anteriores é preservado integralmente
            </strong>
            .
          </div>
        </div>

        <div
          className="ui-row ui-row--align-center ui-row--sm"
          style={{ justifyContent: "flex-end" }}
        >
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={actionLoading?.action === "rollback"}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleRollback}
            disabled={actionLoading?.action === "rollback"}
            isLoading={actionLoading?.action === "rollback"}
            icon={
              <span className="material-symbols-outlined icon-xs">
                restore
              </span>
            }
          >
            Confirmar Restauração
          </Button>
        </div>
      </div>
    </div>
  );
};
