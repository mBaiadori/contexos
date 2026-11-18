import React from "react";
import { AlertTriangle, Globe } from "lucide-react";
import { Modal, Button, FormField, Input } from "../../../../components/ui";
import { ENGINE_CATALOG_LANGUAGES } from "../types";
import type { SupportedLanguage } from "../../../../types";

interface LanguageModalsProps {
  languageChangeDialog: {
    isOpen: boolean;
    targetLang: string;
  };
  setLanguageChangeDialog: (val: { isOpen: boolean; targetLang: string }) => void;
  defaultLanguage: string;
  setDefaultLanguage: (val: string) => void;
  supportedLanguages: SupportedLanguage[];
  setSupportedLanguages: (val: SupportedLanguage[]) => void;
  isAddLanguageModalOpen: boolean;
  setIsAddLanguageModalOpen: (val: boolean) => void;
  languageSearchFilter: string;
  setLanguageSearchFilter: (val: string) => void;
  handleSaveLanguages: (overrides?: {
    defaultLanguage?: string;
    supportedLanguages?: SupportedLanguage[];
    translationEngine?: string;
  }) => void;
}

export const LanguageModals: React.FC<LanguageModalsProps> = ({
  languageChangeDialog,
  setLanguageChangeDialog,
  defaultLanguage,
  setDefaultLanguage,
  supportedLanguages,
  setSupportedLanguages,
  isAddLanguageModalOpen,
  setIsAddLanguageModalOpen,
  languageSearchFilter,
  setLanguageSearchFilter,
  handleSaveLanguages,
}) => {
  return (
    <>
      {/* Modal de Governança: Alerta de Alteração de Idioma Oficial */}
      <Modal
        isOpen={languageChangeDialog.isOpen}
        onClose={() =>
          setLanguageChangeDialog({ isOpen: false, targetLang: "" })
        }
        title="Alerta de Governança: Alteração de Idioma Oficial"
        icon={<AlertTriangle size={18} style={{ color: "#f59e0b" }} />}
        size="md"
        footer={
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
              width: "100%",
            }}
          >
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setLanguageChangeDialog({ isOpen: false, targetLang: "" })
              }
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const target = languageChangeDialog.targetLang;
                if (target) {
                  setDefaultLanguage(target);
                  handleSaveLanguages({ defaultLanguage: target });
                }
                setLanguageChangeDialog({ isOpen: false, targetLang: "" });
              }}
            >
              Confirmar Alteração de Idioma
            </Button>
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            fontSize: "13px",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "var(--color-on-surface, #1e293b)",
              lineHeight: "1.5",
            }}
          >
            Você está alterando o <strong>Idioma Oficial do Projeto</strong> de{" "}
            <span style={{ fontWeight: 700, color: "#0ea5e9" }}>
              {supportedLanguages.find((l) => l.code === defaultLanguage)
                ?.label || defaultLanguage}
            </span>{" "}
            para{" "}
            <span style={{ fontWeight: 700, color: "#10b981" }}>
              {supportedLanguages.find(
                (l) => l.code === languageChangeDialog.targetLang,
              )?.label || languageChangeDialog.targetLang}
            </span>
            .
          </p>

          <div
            style={{
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              color: "#92400e",
              fontSize: "12px",
              lineHeight: "1.4",
            }}
          >
            <strong>Impacto nos Documentos Existentes:</strong>
            <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
              <li>
                Os arquivos existentes na árvore principal passam a ser
                considerados a verdade oficial no novo idioma padrão.
              </li>
              <li>
                Traduções já geradas continuarão armazenadas e acessíveis na
                pasta oculta <code>.translations/</code>.
              </li>
              <li>
                Novas solicitações de tradução passarão a utilizar o novo idioma
                selecionado como origem.
              </li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Modal para Adicionar Idioma do Catálogo do Motor */}
      <Modal
        isOpen={isAddLanguageModalOpen}
        onClose={() => setIsAddLanguageModalOpen(false)}
        title="Adicionar Idioma ao Projeto"
        icon={<Globe size={18} style={{ color: "#0ea5e9" }} />}
        size="md"
        footer={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddLanguageModalOpen(false)}
          >
            Fechar
          </Button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <FormField label="Buscar idioma:">
            <Input
              placeholder="Digite o nome do idioma ou código (ex: Inglês, Espanhol, Alemão, ja, it...)"
              value={languageSearchFilter}
              onChange={(e) => setLanguageSearchFilter(e.target.value)}
              autoFocus
            />
          </FormField>

          {/* Grid de idiomas disponíveis no catálogo */}
          <div
            style={{
              maxHeight: "320px",
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              paddingRight: "4px",
            }}
          >
            {ENGINE_CATALOG_LANGUAGES.filter(
              (lang) =>
                !supportedLanguages.some(
                  (l) => l.code.toLowerCase() === lang.code.toLowerCase(),
                ) &&
                (lang.label
                  .toLowerCase()
                  .includes(languageSearchFilter.toLowerCase()) ||
                  lang.code
                    .toLowerCase()
                    .includes(languageSearchFilter.toLowerCase())),
            ).map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => {
                  const updated = [...supportedLanguages, lang];
                  setSupportedLanguages(updated);
                  setIsAddLanguageModalOpen(false);
                  handleSaveLanguages({ supportedLanguages: updated });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "9px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  background: "var(--color-surface, #ffffff)",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#0ea5e9";
                  e.currentTarget.style.background = "rgba(14, 165, 233, 0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor =
                    "var(--color-outline-variant, #e2e8f0)";
                  e.currentTarget.style.background =
                    "var(--color-surface, #ffffff)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>
                    {lang.flag}
                  </span>
                  <div style={{ minWidth: 0, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        color: "var(--color-on-surface, #1e293b)",
                      }}
                    >
                      {lang.label}
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color: "var(--color-outline, #64748b)",
                      }}
                    >
                      {lang.code.toUpperCase()}
                    </div>
                  </div>
                </div>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px", color: "#0ea5e9", flexShrink: 0 }}
                >
                  add_circle
                </span>
              </button>
            ))}
          </div>

          {ENGINE_CATALOG_LANGUAGES.filter(
            (lang) =>
              !supportedLanguages.some(
                (l) => l.code.toLowerCase() === lang.code.toLowerCase(),
              ) &&
              (lang.label
                .toLowerCase()
                .includes(languageSearchFilter.toLowerCase()) ||
                lang.code
                  .toLowerCase()
                  .includes(languageSearchFilter.toLowerCase())),
          ).length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px 16px",
                color: "var(--color-outline, #64748b)",
                fontSize: "12.5px",
              }}
            >
              Nenhum idioma pendente encontrado para a busca.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
