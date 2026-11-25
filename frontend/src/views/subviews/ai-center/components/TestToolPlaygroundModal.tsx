import React from "react";
import type { ToolItem } from "../../../../types";

interface TestToolPlaygroundModalProps {
  testingTool: ToolItem | null;
  onClose: () => void;
  toolArgsInput: string;
  setToolArgsInput: (val: string) => void;
  handleExecuteToolTest: () => Promise<void>;
  isExecutingTool: boolean;
  toolTestResult: Record<string, unknown> | null;
}

export const TestToolPlaygroundModal: React.FC<TestToolPlaygroundModalProps> = ({
  testingTool,
  onClose,
  toolArgsInput,
  setToolArgsInput,
  handleExecuteToolTest,
  isExecutingTool,
  toolTestResult,
}) => {
  if (!testingTool) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          background: "var(--color-surface, #fff)",
          borderRadius: "12px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          padding: "20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 700,
              fontFamily: "monospace",
              color: "var(--color-primary, #1a73e8)",
            }}
          >
            Playground: {testingTool.name}
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p
          style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
          }}
        >
          {testingTool.description}
        </p>

        <div style={{ marginBottom: "12px" }}>
          <label
            style={{
              fontSize: "11px",
              fontWeight: 600,
              display: "block",
              marginBottom: "4px",
            }}
          >
            Argumentos de Entrada (JSON):
          </label>
          <textarea
            rows={4}
            value={toolArgsInput}
            onChange={(e) => setToolArgsInput(e.target.value)}
            style={{
              width: "100%",
              fontSize: "12px",
              fontFamily: "monospace",
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              background: "var(--color-surface-container-low, #f8f9fa)",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleExecuteToolTest}
            disabled={isExecutingTool}
          >
            {isExecutingTool ? "Executando..." : "Executar Tool Agora"}
          </button>
        </div>

        {toolTestResult && (
          <div>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 600,
                display: "block",
                marginBottom: "4px",
              }}
            >
              Resultado do Servidor:
            </label>
            <pre
              style={{
                fontSize: "11.5px",
                fontFamily: "monospace",
                padding: "10px",
                borderRadius: "6px",
                background: "var(--color-surface-container-lowest, #f1f5f9)",
                border: "1px solid var(--color-outline-variant, #cbd5e1)",
                maxHeight: "200px",
                overflowY: "auto",
                margin: 0,
              }}
            >
              {JSON.stringify(toolTestResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
