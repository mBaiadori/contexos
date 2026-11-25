import React, { useState, useEffect } from "react";
import {
  Modal,
  FormField,
  Input,
  Textarea,
  Button,
} from "../ui";
import { useWorkspace } from "../../context/WorkspaceContext";
import type { DictionaryTerm } from "../../types";

interface AddDictionaryTermModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTerm?: string;
  onTermCreated?: (term: DictionaryTerm) => void;
}

export const AddDictionaryTermModal: React.FC<AddDictionaryTermModalProps> = ({
  isOpen,
  onClose,
  initialTerm = "",
  onTermCreated,
}) => {
  const { projectMetaOptions, projectConfig, addDictionaryTerm } = useWorkspace();

  const [term, setTerm] = useState("");
  const [codename, setCodename] = useState("");
  const [domain, setDomain] = useState("geral");
  const [definition, setDefinition] = useState("");
  const [synonymsText, setSynonymsText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const categories = React.useMemo(() => {
    const cats =
      projectMetaOptions?.categories ||
      projectConfig?.categories ||
      [];
    return cats.length > 0 ? cats : [{ name: "geral", color: "#3b82f6" }];
  }, [projectMetaOptions, projectConfig]);

  useEffect(() => {
    if (isOpen) {
      const cleanInitial = (initialTerm || "").trim();
      setTerm(cleanInitial);
      const generatedCodename = cleanInitial
        .toUpperCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^A-Z0-9_]/g, "");
      setCodename(generatedCodename);
      setDomain(categories[0]?.name || "geral");
      setDefinition("");
      setSynonymsText("");
      setError("");
    }
  }, [isOpen, initialTerm, categories]);

  const handleTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTerm(val);
    if (!codename || codename === term.toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "")) {
      setCodename(
        val
          .toUpperCase()
          .replace(/[\s-]+/g, "_")
          .replace(/[^A-Z0-9_]/g, ""),
      );
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) {
      setError("O nome do termo é obrigatório.");
      return;
    }
    if (!definition.trim()) {
      setError("A definição do termo é obrigatória para manter a clareza conceitual.");
      return;
    }

    const finalCodename =
      codename.trim() ||
      term
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_")
        .replace(/[^A-Z0-9_]/g, "");

    const syns = synonymsText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== term.trim().toLowerCase());

    const newTermItem: DictionaryTerm = {
      term: term.trim(),
      codename: finalCodename,
      domain: domain.trim(),
      definition: definition.trim(),
      synonyms: Array.from(new Set(syns)),
    };

    setIsSaving(true);
    setError("");

    try {
      const res = await addDictionaryTerm(newTermItem);
      if (res.success) {
        onTermCreated?.(newTermItem);
        onClose();
      } else {
        setError(res.error || "Falha ao salvar o novo termo.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar ao Dicionário Ubíquo"
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Term */}
          <FormField label="Termo Principal" required>
            <Input
              value={term}
              onChange={handleTermChange}
              placeholder="Ex: Apresentação"
              autoFocus
            />
          </FormField>

          {/* Codename */}
          <FormField label="Codinome Técnico (CODENAME)">
            <Input
              value={codename}
              onChange={(e) => setCodename(e.target.value.toUpperCase())}
              placeholder="Ex: APRESENTACAO"
              style={{ fontFamily: "monospace" }}
            />
          </FormField>
        </div>

        {/* Domain Selection with Dynamic Categories from .project.config.json */}
        <FormField label="Domínio / Categoria (do Projeto)" required>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
            {categories.map((cat: { name: string; label?: string; color?: string }) => {
              const isSelected = domain.toLowerCase() === (cat.name || "").toLowerCase();
              const color = cat.color || "#3b82f6";
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setDomain(cat.name)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: `1.5px solid ${isSelected ? color : "var(--color-outline-variant, #e2e8f0)"}`,
                    backgroundColor: isSelected ? `${color}18` : "#ffffff",
                    color: isSelected ? color : "var(--color-on-surface, #334155)",
                    fontSize: 12.5,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: color,
                    }}
                  />
                  <span>{cat.label || cat.name}</span>
                </button>
              );
            })}
          </div>
        </FormField>

        {/* Definition */}
        <FormField label="Definição / Conceito Ubíquo" required>
          <Textarea
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="Explique o que este termo representa dentro do domínio e das regras do produto..."
            rows={4}
          />
        </FormField>

        {/* Synonyms */}
        <FormField label="Sinônimos e Variações (separados por vírgula)">
          <Input
            value={synonymsText}
            onChange={(e) => setSynonymsText(e.target.value)}
            placeholder="Ex: Apresentação do Medicamento, Embalagem, Presentation"
          />
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
          <Button variant="primary" type="submit" disabled={isSaving}>
            {isSaving ? "Cadastrando..." : "Cadastrar Termo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
