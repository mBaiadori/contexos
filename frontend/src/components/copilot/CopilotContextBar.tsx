import React from "react";
import type { TreeNode } from "../../types";
import { Button, Chip } from "../ui";

interface CopilotContextBarProps {
  referencedDocs: string[];
  isGlobalScope: boolean;
  tree: TreeNode[];
  onOpenContext: () => void;
  onRemoveDoc: (docPath: string) => void;
  onSetGlobalScope: (isGlobal: boolean) => void;
}

export const CopilotContextBar: React.FC<CopilotContextBarProps> = ({
  referencedDocs,
  isGlobalScope,
  tree,
  onOpenContext,
  onRemoveDoc,
  onSetGlobalScope,
}) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "5px",
        padding: "6px 12px",
        background: "var(--color-surface, #ffffff)",
        borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
        position: "relative",
      }}
    >
      {/* Context Attachment Clip Icon with Dynamic Status Color & Tooltip */}
      <button
        type="button"
        onClick={onOpenContext}
        style={{
          background: "none",
          border: "none",
          padding: "2px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          borderRadius: "4px",
          transition: "all 0.15s ease",
        }}
        title={
          referencedDocs.length > 0 && !isGlobalScope
            ? `Contexto Ativo: ${referencedDocs.length} ${
                referencedDocs.length === 1 ? "item" : "itens"
              } vinculado${
                referencedDocs.length === 1 ? "" : "s"
              } ao Copilot. Clique para gerenciar.`
            : "Nenhum contexto vinculado (Modo Global). Clique para anexar pastas ou arquivos."
        }
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: "16px",
            color:
              referencedDocs.length > 0 && !isGlobalScope
                ? "var(--color-primary, #2563eb)"
                : "var(--text-muted, #94a3b8)",
            transition: "color 0.15s ease",
          }}
        >
          attachment
        </span>
      </button>

      {/* Global Scope Mode Badge */}
      {isGlobalScope || referencedDocs.length === 0 ? (
        <></>
      ) : (
        /* Multi-Document & Folder Attached Chips */
        referencedDocs.map((docPath) => {
          const isDir = tree.some((n) => {
            const check = (node: TreeNode): boolean => {
              if (node.path === docPath)
                return (
                  node.type === "dir" ||
                  node.type === "directory" ||
                  Boolean(node.is_directory)
                );
              if (node.children) return node.children.some(check);
              return false;
            };
            return check(n);
          });
          const label = docPath.split("/").pop() || docPath;

          return (
            <Chip
              key={docPath}
              size="xs"
              variant="outlined"
              icon={
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "13px",
                    color: isDir
                      ? "#9333ea"
                      : "var(--color-primary, #2563eb)",
                  }}
                >
                  {isDir ? "folder" : "description"}
                </span>
              }
              onRemove={() => onRemoveDoc(docPath)}
              title={isDir ? `Pasta: ${docPath}` : `Arquivo: ${docPath}`}
              style={{ maxWidth: "180px" }}
            >
              {label}
              {isDir ? "/" : ""}
            </Chip>
          );
        })
      )}

      {/* Action: Open Advanced Context Selector Sidebar */}
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onOpenContext}
        icon={
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "13px" }}
          >
            folder_managed
          </span>
        }
        title="Abrir Seletor de Contexto no painel lateral"
      >
        {referencedDocs.length === 0 ? "Anexar Contexto" : "Gerenciar"}
      </Button>

      {/* Action: Switch to Global Scope Button if has references */}
      {referencedDocs.length > 0 && (
        <button
          type="button"
          onClick={() => onSetGlobalScope(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            padding: "2px 6px",
            borderRadius: "12px",
            background: "transparent",
            border: "none",
            color: "var(--text-muted, #64748b)",
            fontSize: "10px",
            cursor: "pointer",
            marginLeft: "auto",
          }}
          title="Remover todas as referências e usar Modo Global"
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "14px", color: "var(--danger-text)" }}
          >
            close
          </span>
        </button>
      )}
    </div>
  );
};
