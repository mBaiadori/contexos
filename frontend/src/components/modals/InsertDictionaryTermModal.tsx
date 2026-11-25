import React, { useState, useEffect, useMemo, useRef } from "react";
import { BookOpen, Plus } from "lucide-react";
import { Modal, Button, SearchInput } from "../ui";
import { useWorkspace } from "../../context/WorkspaceContext";

interface InsertDictionaryTermModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTerm: (termName: string) => void;
  onOpenCreateNewTerm?: () => void;
}

export const InsertDictionaryTermModal: React.FC<InsertDictionaryTermModalProps> = ({
  isOpen,
  onClose,
  onSelectTerm,
  onOpenCreateNewTerm,
}) => {
  const { dictionaryTerms, projectMetaOptions, projectConfig } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const cats = projectMetaOptions?.categories || projectConfig?.categories || [];
    return cats.length > 0 ? cats : [{ name: "geral", label: "Geral", color: "#3b82f6" }];
  }, [projectMetaOptions, projectConfig]);

  const getDomainColor = (domainName?: string) => {
    if (!domainName) return "#64748b";
    const cat = (categories as Array<{ name?: string; label?: string; color?: string }>).find(
      (c) =>
        (c.name || "").toLowerCase() === domainName.toLowerCase() ||
        (c.label || "").toLowerCase() === domainName.toLowerCase()
    );
    return cat?.color || "#3b82f6";
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredTerms = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return dictionaryTerms || [];

    return (dictionaryTerms || []).filter((t) => {
      const syns = Array.isArray(t.synonyms) ? t.synonyms : [];
      const aliases = Array.isArray(t.aliases) ? t.aliases : [];
      const allSyns = [...syns, ...aliases].join(" ").toLowerCase();

      return (
        t.term.toLowerCase().includes(q) ||
        (t.codename && t.codename.toLowerCase().includes(q)) ||
        (t.code_name && t.code_name.toLowerCase().includes(q)) ||
        (t.domain && t.domain.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.definition && t.definition.toLowerCase().includes(q)) ||
        allSyns.includes(q)
      );
    });
  }, [dictionaryTerms, searchQuery]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredTerms.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filteredTerms.length > 0) {
      e.preventDefault();
      const chosen = filteredTerms[selectedIndex] || filteredTerms[0];
      if (chosen) {
        onSelectTerm(chosen.term);
        onClose();
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Dicionário Ubíquo • Inserir Conceito"
      size="lg"
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ fontSize: "12px", color: "var(--color-on-surface-variant, #64748b)" }}>
            Use as setas <kbd style={{ padding: "1px 5px", background: "var(--color-surface-container, #f1f5f9)", borderRadius: "4px", border: "1px solid var(--color-outline-variant, #e2e8f0)" }}>↑</kbd> <kbd style={{ padding: "1px 5px", background: "var(--color-surface-container, #f1f5f9)", borderRadius: "4px", border: "1px solid var(--color-outline-variant, #e2e8f0)" }}>↓</kbd> e <kbd style={{ padding: "1px 5px", background: "var(--color-surface-container, #f1f5f9)", borderRadius: "4px", border: "1px solid var(--color-outline-variant, #e2e8f0)" }}>Enter</kbd> para inserir
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {onOpenCreateNewTerm && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenCreateNewTerm();
                }}
                icon={<Plus size={14} />}
              >
                Criar Novo Termo
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} onKeyDown={handleKeyDown}>
        <SearchInput
          id="insert-dict-search"
          placeholder="Buscar termo, codename, sinônimo ou domínio..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
          autoFocus
        />

        <div
          ref={listRef}
          style={{
            maxHeight: "380px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            paddingRight: "4px",
          }}
        >
          {filteredTerms.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "36px 16px",
                color: "var(--color-on-surface-variant, #64748b)",
                background: "var(--color-surface-container, #f8fafc)",
                borderRadius: "8px",
                border: "1px dashed var(--color-outline-variant, #e2e8f0)",
              }}
            >
              <BookOpen size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
              <p style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: 500 }}>
                Nenhum termo encontrado para "<strong>{searchQuery}</strong>"
              </p>
              {onOpenCreateNewTerm && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onOpenCreateNewTerm();
                  }}
                  icon={<Plus size={14} />}
                >
                  Cadastrar "{searchQuery}" no Dicionário
                </Button>
              )}
            </div>
          ) : (
            filteredTerms.map((t, idx) => {
              const isSelected = idx === selectedIndex;
              const domColor = getDomainColor(t.domain);
              const syns = Array.isArray(t.synonyms) ? t.synonyms : t.aliases || [];

              return (
                <div
                  key={t.id || t.term || idx}
                  onClick={() => {
                    onSelectTerm(t.term);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: `1px solid ${isSelected ? "var(--color-primary, #1a73e8)" : "var(--color-outline-variant, #e2e8f0)"}`,
                    background: isSelected ? "var(--color-surface-container-high, #f0f7ff)" : "var(--color-surface, #ffffff)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-on-surface, #0f172a)" }}>
                        {t.term}
                      </span>
                      {(t.codename || t.code_name) && (
                        <code
                          style={{
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "var(--color-surface-container, #f1f5f9)",
                            color: "var(--color-on-surface, #334155)",
                            fontFamily: "monospace",
                            border: "1px solid var(--color-outline-variant, #e2e8f0)",
                          }}
                        >
                          {t.codename || t.code_name}
                        </code>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {t.category && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: "10px",
                            background: "rgba(37, 99, 235, 0.08)",
                            color: "#2563eb",
                            border: "1px solid rgba(37, 99, 235, 0.2)",
                          }}
                        >
                          {t.category}
                        </span>
                      )}
                      {t.domain && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: "10px",
                            background: `${domColor}15`,
                            color: domColor,
                            border: `1px solid ${domColor}35`,
                          }}
                        >
                          {t.domain}
                        </span>
                      )}
                    </div>
                  </div>

                  {t.definition && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        lineHeight: "1.4",
                        color: "var(--color-on-surface-variant, #475569)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {t.definition}
                    </p>
                  )}

                  {syns.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", marginTop: "2px" }}>
                      <span style={{ fontSize: "10.5px", color: "var(--color-on-surface-variant, #94a3b8)", fontWeight: 500 }}>
                        Sinônimos:
                      </span>
                      {syns.slice(0, 4).map((s, sIdx) => (
                        <span
                          key={sIdx}
                          style={{
                            fontSize: "10.5px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "var(--color-surface-container, #f1f5f9)",
                            color: "var(--color-on-surface-variant, #64748b)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                      {syns.length > 4 && (
                        <span style={{ fontSize: "10px", color: "var(--color-on-surface-variant, #94a3b8)" }}>
                          +{syns.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
