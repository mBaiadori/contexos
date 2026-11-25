import React from "react";
import { Check, Sparkles } from "lucide-react";
import { Button, FormField, Input, Modal, Spinner, Textarea } from "../../../../components/ui";
import { DDD_CATEGORIES } from "../types";

interface TermModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingIndex: number | null;
  inputTerm: string;
  setInputTerm: (val: string) => void;
  inputCodename: string;
  setInputCodename: (val: string) => void;
  inputDomain: string;
  setInputDomain: (val: string) => void;
  inputCategory: string;
  setInputCategory: (val: string) => void;
  inputContext: string;
  setInputContext: (val: string) => void;
  inputSynonyms: string;
  setInputSynonyms: (val: string) => void;
  inputDefinition: string;
  setInputDefinition: (val: string) => void;
  formError: string;
  isSaving: boolean;
  categories: Array<{ name: string; label?: string; color?: string }>;
  onSaveTerm: () => void;
}

export const TermModal: React.FC<TermModalProps> = ({
  isOpen,
  onClose,
  editingIndex,
  inputTerm,
  setInputTerm,
  inputCodename,
  setInputCodename,
  inputDomain,
  setInputDomain,
  inputCategory,
  setInputCategory,
  inputContext,
  setInputContext,
  inputSynonyms,
  setInputSynonyms,
  inputDefinition,
  setInputDefinition,
  formError,
  isSaving,
  categories,
  onSaveTerm,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingIndex !== null ? "Editar Termo" : "Novo Termo do Dicionário"}
      subtitle="Defina o significado inequívoco e associe o identificador oficial para código e IA"
      icon={<Sparkles size={18} />}
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSaveTerm}
            disabled={!inputTerm.trim() || isSaving}
            icon={isSaving ? <Spinner size="sm" /> : <Check size={14} />}
          >
            {isSaving ? "Salvando..." : "Salvar Termo"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSaveTerm();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "14px" }}
      >
        {formError && (
          <div
            style={{
              color: "#ef4444",
              fontSize: "12.5px",
              padding: "8px 12px",
              background: "rgba(239, 68, 68, 0.1)",
              borderRadius: "6px",
              border: "1px solid rgba(239, 68, 68, 0.25)",
            }}
          >
            {formError}
          </div>
        )}
        <FormField
          label="Nome do Termo / Conceito"
          required
          helperText="ex: Chave de Idempotência, Bounded Context ou Lead Time"
        >
          <Input
            id="dict-input-term"
            placeholder="ex: Chave de Idempotência"
            value={inputTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const val = e.target.value;
              setInputTerm(val);
              if (editingIndex === null || !inputCodename) {
                setInputCodename(
                  val
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[\s-]+/g, "_")
                    .replace(/[^A-Z0-9_]/g, "")
                );
              }
            }}
            autoFocus
          />
        </FormField>

        <FormField
          label="Code Name Oficial (Identificador)"
          required
          helperText="Identificador único usado em entidades, APIs, constantes e prompts (letras, números e _)."
        >
          <Input
            id="dict-input-codename"
            placeholder="ex: IDEMPOTENCY_KEY ou BOUNDED_CONTEXT"
            value={inputCodename}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputCodename(e.target.value)}
          />
        </FormField>

        {/* Domínio (Categorias do Projeto com Cores Dinâmicas) */}
        <FormField
          label="Domínio de Negócio (do Projeto)"
          required
          helperText="Selecione o domínio/categoria correspondente configurado no projeto."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
            {categories.map((cat) => {
              const isSelected = inputDomain.toLowerCase() === (cat.name || "").toLowerCase();
              const color = cat.color || "#3b82f6";
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setInputDomain(cat.name)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    borderRadius: 16,
                    border: `1.5px solid ${isSelected ? color : "var(--color-outline-variant, #e2e8f0)"}`,
                    backgroundColor: isSelected ? `${color}18` : "#ffffff",
                    color: isSelected ? color : "var(--color-on-surface, #334155)",
                    fontSize: 11.5,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
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

        {/* Classificação Conceitual DDD */}
        <FormField
          label="Classificação Arquitetural (DDD)"
          helperText="Padrão conceitual no domínio da aplicação."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 2 }}>
            {DDD_CATEGORIES.map((cat) => {
              const isSelected = inputCategory.toLowerCase() === cat.id.toLowerCase();
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setInputCategory(cat.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 8px",
                    borderRadius: 5,
                    border: `1px solid ${isSelected ? cat.color : "var(--color-outline-variant, #e2e8f0)"}`,
                    backgroundColor: isSelected ? `${cat.color}18` : "var(--color-surface, #ffffff)",
                    color: isSelected ? cat.color : "var(--color-on-surface-variant, #475569)",
                    fontSize: 11,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title={cat.desc}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </FormField>

        {/* Contexto Delimitado */}
        <FormField
          label="Contexto Delimitado / Escopo de Uso"
          helperText="Contexto ou módulo onde este termo é empregado (ex: faturamento, dispensação, autenticação)."
        >
          <Input
            id="dict-input-context"
            placeholder="ex: faturamento, dispensação, prescrição"
            value={inputContext}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputContext(e.target.value)}
          />
        </FormField>

        {/* Sinônimos & Aliases */}
        <FormField
          label="Sinônimos / Aliases (separados por vírgula)"
          helperText="Termos alternativos e variações textuais que referenciam este mesmo conceito."
        >
          <Input
            id="dict-input-synonyms"
            placeholder="ex: Idempotency Key, Chave Única"
            value={inputSynonyms}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputSynonyms(e.target.value)}
          />
        </FormField>

        {/* Definição */}
        <FormField
          label="Definição / Significado Inequívoco"
          required
          helperText="Explicação clara do significado exato do conceito no domínio da aplicação."
        >
          <Textarea
            id="dict-input-definition"
            rows={3}
            placeholder="Descreva o significado exato no contexto da arquitetura e negócio..."
            value={inputDefinition}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputDefinition(e.target.value)}
          />
        </FormField>
      </form>
    </Modal>
  );
};
