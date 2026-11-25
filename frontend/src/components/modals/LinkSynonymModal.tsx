import React, { useState, useEffect, useMemo } from "react";
import { Check } from "lucide-react";
import { Modal, FormField, Input, Button } from "../ui";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { DictionaryTerm } from "../../types";

interface LinkSynonymModalProps {
  isOpen: boolean;
  onClose: () => void;
  synonymText?: string;
  onSynonymLinked?: (term: DictionaryTerm, synonym: string) => void;
}

export const LinkSynonymModal: React.FC<LinkSynonymModalProps> = ({
  isOpen,
  onClose,
  synonymText = "",
  onSynonymLinked,
}) => {
  const { dictionaryTerms, addDictionarySynonym, projectMetaOptions, projectConfig } = useWorkspace();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTerm, setSelectedTerm] = useState<DictionaryTerm | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = useMemo(() => {
    return projectMetaOptions?.categories || projectConfig?.categories || [];
  }, [projectMetaOptions, projectConfig]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setSelectedTerm(null);
      setError("");
    }
  }, [isOpen]);

  const filteredTerms = useMemo(() => {
    if (!searchTerm.trim()) return dictionaryTerms.slice(0, 15);
    const q = searchTerm.toLowerCase();
    return dictionaryTerms.filter(
      (t) =>
        (t.term || "").toLowerCase().includes(q) ||
        (t.codename || t.code_name || "").toLowerCase().includes(q) ||
        (t.domain || "").toLowerCase().includes(q),
    );
  }, [dictionaryTerms, searchTerm]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTerm) {
      setError("Selecione um termo do dicionário para vincular o sinônimo.");
      return;
    }
    const cleanSyn = (synonymText || "").trim();
    if (!cleanSyn) {
      setError("O texto do sinônimo está vazio.");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const res = await addDictionarySynonym(
        selectedTerm.id || selectedTerm.codename,
        cleanSyn,
      );
      if (res.success) {
        onSynonymLinked?.(selectedTerm, cleanSyn);
        onClose();
      } else {
        setError(res.error || "Erro ao vincular sinônimo.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  const getCategoryColor = (domain?: string) => {
    if (!domain) return "#64748b";
    const found = (categories as Array<{ name?: string; label?: string; color?: string }>).find(
      (c) =>
        (c.name || "").toLowerCase() === domain.toLowerCase() ||
        (c.label || "").toLowerCase() === domain.toLowerCase(),
    );
    return found?.color || "#3b82f6";
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Vincular Texto como Sinônimo"
      size="md"
    >
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 6,
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            padding: "10px 14px",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--color-outline, #64748b)" }}>
            Texto selecionado no documento:
          </span>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--color-primary, #1a73e8)",
              marginTop: 2,
            }}
          >
            "{synonymText}"
          </div>
        </div>

        <FormField label="Escolha o Termo Canônico de Destino" required>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar termo ou codename..."
              autoFocus
            />
          </div>

          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              borderRadius: 8,
              padding: 4,
            }}
          >
            {filteredTerms.length === 0 ? (
              <div style={{ padding: 12, textAlign: "center", color: "#64748b", fontSize: 13 }}>
                Nenhum termo encontrado.
              </div>
            ) : (
              filteredTerms.map((t) => {
                const isSelected = selectedTerm?.id === t.id || selectedTerm?.codename === t.codename;
                const catColor = getCategoryColor(t.domain);
                return (
                  <div
                    key={t.id || t.codename}
                    onClick={() => setSelectedTerm(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      backgroundColor: isSelected ? "rgba(26, 115, 232, 0.1)" : "transparent",
                      border: isSelected ? "1px solid #1a73e8" : "1px solid transparent",
                      marginBottom: 2,
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-on-surface, #1e293b)" }}>
                        {t.term}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", display: "flex", gap: 6, marginTop: 2 }}>
                        <code>{t.codename}</code>
                        {t.domain && (
                          <span style={{ color: catColor, fontWeight: 500 }}>
                            • {t.domain}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="#1a73e8" />}
                  </div>
                );
              })
            )}
          </div>
        </FormField>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            paddingTop: 8,
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
          }}
        >
          <Button variant="secondary" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={isSaving || !selectedTerm}>
            {isSaving ? "Vinculando..." : "Vincular Sinônimo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
