import React from "react";

export interface DocLinkItem {
  path?: string;
  filePath?: string;
  title?: string;
  name?: string;
  categories?: string;
  hash?: string;
  [key: string]: unknown;
}

export interface DocLinksMenuProps {
  consumers: Array<DocLinkItem | string>;
  dependencies: Array<DocLinkItem | string>;
  showConsumers: boolean;
  setShowConsumers: (show: boolean) => void;
  showDeps: boolean;
  setShowDeps: (show: boolean) => void;
  onNavigateFile: (path: string) => void;
  onOpenAddLinkModal: (type: "dependency" | "consumer") => void;
  onRemoveLink?: (targetPath: string, type: "dependency" | "consumer") => void;
  onCloseOtherPickers?: () => void;
}

export const DocLinksMenu: React.FC<DocLinksMenuProps> = ({
  consumers,
  dependencies,
  showConsumers,
  setShowConsumers,
  showDeps,
  setShowDeps,
  onNavigateFile,
  onOpenAddLinkModal,
  onRemoveLink,
}) => {
  return (
    <>
      <div
        style={{
          width: "1px",
          height: "16px",
          background: "var(--color-outline-variant, #e2e8f0)",
          margin: "0 2px",
        }}
      />

      {/* Consumers (Backlinks) */}
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: showConsumers
              ? "var(--primary, #2563eb)"
              : "var(--color-outline-variant, #e2e8f0)",
            background: showConsumers
              ? "var(--color-primary-container, #eff6ff)"
              : "transparent",
            overflow: "hidden",
            transition: "all 0.15s ease",
          }}
        >
          <button
            id="btn-doc-consumers"
            type="button"
            className={`btn-icon-action ${showConsumers ? "active" : ""}`}
            onClick={() => {
              setShowConsumers(!showConsumers);
            }}
            style={{
              height: "28px",
              width: "auto",
              padding: "0 6px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: showConsumers
                ? "var(--primary, #2563eb)"
                : "var(--color-outline, #64748b)",
            }}
            title="Documentos que referenciam este (Dependentes / Backlinks)"
          >
            <span
              className="material-symbols-outlined icon-xs"
              style={{ fontSize: "16px", color: "blue" }}
            >
              call_received
            </span>
            <span
              style={{
                fontWeight: 600,
                fontSize: "11px",
                lineHeight: 1,
                color: "blue",
              }}
            >
              {consumers.length}
            </span>
          </button>
          <button
            id="btn-add-consumer"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAddLinkModal("consumer");
            }}
            style={{
              height: "28px",
              padding: "0 5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderLeft: "1px solid var(--color-outline-variant, #e2e8f0)",
              background: "transparent",
              cursor: "pointer",
              color: "blue",
              transition: "background 0.15s ease",
            }}
            title="Adicionar documento dependente (+)"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px" }}
            >
              add
            </span>
          </button>
        </div>

        {showConsumers && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
              padding: "8px",
              minWidth: "260px",
              maxWidth: "320px",
              zIndex: 100,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "4px",
              }}
            >
              <strong
                style={{
                  fontSize: "11px",
                  color: "var(--color-on-surface, #0f172a)",
                }}
              >
                Dependentes:
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                  {consumers.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowConsumers(false);
                    onOpenAddLinkModal("consumer");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                    border: "none",
                    background: "var(--color-primary-container, #eff6ff)",
                    color: "var(--primary, #2563eb)",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Adicionar documento dependente"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                    add
                  </span>
                  Adicionar
                </button>
              </div>
            </div>
            {consumers.length === 0 ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-outline, #64748b)",
                  padding: "8px 4px",
                  textAlign: "center",
                }}
              >
                Nenhum outro documento aponta para este.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                {consumers.map((c, i: number) => {
                  const item = typeof c === "string" ? { path: c } : c;
                  return (
                  <div
                    key={i}
                    onClick={() => {
                      onNavigateFile(item.path || "");
                      setShowConsumers(false);
                    }}
                    style={{
                      padding: "6px 8px",
                      cursor: "pointer",
                      borderRadius: "5px",
                      fontSize: "11.5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "background 0.15s",
                    }}
                    className="dropdown-item-hover"
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        className="material-symbols-outlined icon-xs"
                        style={{ color: "#64748b" }}
                      >
                        description
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title || item.path || ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      {item.categories && (
                        <span
                          style={{
                            fontSize: "9.5px",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            background: "rgba(0,0,0,0.06)",
                            color: "#64748b",
                            flexShrink: 0,
                          }}
                        >
                          {item.categories}
                        </span>
                      )}
                      {onRemoveLink && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetPath = item.path || item.filePath || "";
                            if (targetPath) {
                              onRemoveLink(targetPath, "dependency");
                            }
                          }}
                          title="Remover link"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            borderRadius: "4px",
                            padding: "2px",
                            cursor: "pointer",
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                            close
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dependencies */}
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: "6px",
            border: "1px solid",
            borderColor: showDeps
              ? "var(--primary, #2563eb)"
              : "var(--color-outline-variant, #e2e8f0)",
            background: showDeps
              ? "var(--color-primary-container, #eff6ff)"
              : "transparent",
            overflow: "hidden",
            transition: "all 0.15s ease",
          }}
        >
          <button
            id="btn-doc-dependencies"
            type="button"
            className={`btn-icon-action ${showDeps ? "active" : ""}`}
            onClick={() => {
              setShowDeps(!showDeps);
            }}
            style={{
              height: "28px",
              width: "auto",
              padding: "0 6px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: showDeps
                ? "var(--primary, #2563eb)"
                : "var(--color-outline, #64748b)",
            }}
            title="Links e documentos referenciados por este arquivo"
          >
            <span
              className="material-symbols-outlined icon-xs"
              style={{ fontSize: "16px", color: "green" }}
            >
              call_made
            </span>
            <span
              style={{
                fontWeight: 600,
                fontSize: "11px",
                lineHeight: 1,
                color: "green",
              }}
            >
              {dependencies.length}
            </span>
          </button>
          <button
            id="btn-add-dependency"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenAddLinkModal("dependency");
            }}
            style={{
              height: "28px",
              padding: "0 5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderLeft: "1px solid var(--color-outline-variant, #e2e8f0)",
              background: "transparent",
              cursor: "pointer",
              color: "green",
              transition: "background 0.15s ease",
            }}
            title="Adicionar documento referenciado (+)"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "15px" }}
            >
              add
            </span>
          </button>
        </div>

        {showDeps && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              background: "var(--color-surface, #ffffff)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              borderRadius: "8px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
              padding: "8px",
              minWidth: "260px",
              maxWidth: "320px",
              zIndex: 100,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "4px",
              }}
            >
              <strong
                style={{
                  fontSize: "11px",
                  color: "var(--color-on-surface, #0f172a)",
                }}
              >
                Referenciados:
              </strong>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                  {dependencies.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeps(false);
                    onOpenAddLinkModal("dependency");
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "2px",
                    border: "none",
                    background: "rgba(16, 185, 129, 0.12)",
                    color: "#059669",
                    borderRadius: "4px",
                    padding: "2px 6px",
                    fontSize: "10px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title="Adicionar documento referenciado"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "12px" }}>
                    add
                  </span>
                  Adicionar
                </button>
              </div>
            </div>
            {dependencies.length === 0 ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-outline, #64748b)",
                  padding: "8px 4px",
                  textAlign: "center",
                }}
              >
                Nenhum link ou dependência referenciada.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                {dependencies.map((d, i: number) => {
                  const item = typeof d === "string" ? { path: d } : d;
                  return (
                  <div
                    key={i}
                    onClick={() => {
                      onNavigateFile(item.path || item.filePath || "");
                      setShowDeps(false);
                    }}
                    style={{
                      padding: "6px 8px",
                      cursor: "pointer",
                      borderRadius: "5px",
                      fontSize: "11.5px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      transition: "background 0.15s",
                    }}
                    className="dropdown-item-hover"
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        className="material-symbols-outlined icon-xs"
                        style={{ color: item.hash ? "#2563eb" : "#64748b" }}
                      >
                        {item.hash ? "share_location" : "description"}
                      </span>
                      <span
                        style={{
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title || item.path || ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      {item.categories && (
                        <span
                          style={{
                            fontSize: "9.5px",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            background: "rgba(0,0,0,0.06)",
                            color: "#64748b",
                            flexShrink: 0,
                          }}
                        >
                          {item.categories}
                        </span>
                      )}
                      {onRemoveLink && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetPath = item.path || item.filePath || "";
                            if (targetPath) {
                              onRemoveLink(targetPath, "dependency");
                            }
                          }}
                          title="Remover link"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "none",
                            background: "transparent",
                            color: "#94a3b8",
                            borderRadius: "4px",
                            padding: "2px",
                            cursor: "pointer",
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                            close
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
