import React from "react";
import { Globe, Zap, Sparkles } from "lucide-react";
import { Card, CardHeader, CardContent, Stack, Divider, Badge } from "../../../../components/ui";
import type { SupportedLanguage } from "../../../../types";

interface LanguagesSectionProps {
  defaultLanguage: string;
  setDefaultLanguage: (val: string) => void;
  supportedLanguages: SupportedLanguage[];
  setSupportedLanguages: (val: SupportedLanguage[]) => void;
  translationEngine: string;
  setTranslationEngine: (val: string) => void;
  docMetadataListLength: number;
  setLanguageChangeDialog: (val: { isOpen: boolean; targetLang: string }) => void;
  setIsAddLanguageModalOpen: (val: boolean) => void;
  setLanguageSearchFilter: (val: string) => void;
  handleSaveLanguages: (overrides?: {
    defaultLanguage?: string;
    supportedLanguages?: SupportedLanguage[];
    translationEngine?: string;
  }) => void;
}

export const LanguagesSection: React.FC<LanguagesSectionProps> = ({
  defaultLanguage,
  setDefaultLanguage,
  supportedLanguages,
  setSupportedLanguages,
  translationEngine,
  setTranslationEngine,
  docMetadataListLength,
  setLanguageChangeDialog,
  setIsAddLanguageModalOpen,
  setLanguageSearchFilter,
  handleSaveLanguages,
}) => {
  return (
    <section id="languages-governance" style={{ scrollMarginTop: "72px" }}>
      <Card variant="elevated">
        <CardHeader
          title={
            <div className="ui-row ui-row--align-center ui-row--sm">
              <Globe size={17} style={{ color: "#0ea5e9" }} />
              <span>Idiomas do Projeto</span>
            </div>
          }
          subtitle="Configure o idioma oficial do projeto, os idiomas disponíveis para tradução sob demanda e o motor de tradução."
          actions={
            <Badge variant="primary">
              OFICIAL: {defaultLanguage.toUpperCase()}
            </Badge>
          }
        />

        <CardContent>
          <Stack gap="lg">
            {/* Idiomas Habilitados & Seleção do Idioma Oficial */}
            <Stack gap="xs">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span className="ui-text-subtitle ui-text-bold">
                    Idiomas Habilitados no Projeto
                  </span>
                  <div className="ui-text-body-sm ui-text-muted">
                    Idiomas disponíveis para a documentação e traduções sob demanda. Clique em um idioma para defini-lo como oficial.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "6px",
                }}
              >
                {supportedLanguages.map((lang) => {
                  const isDefault =
                    lang.code.toLowerCase() === defaultLanguage.toLowerCase();

                  return (
                    <div
                      key={lang.code}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isDefault) return;
                        if (docMetadataListLength > 0) {
                          setLanguageChangeDialog({
                            isOpen: true,
                            targetLang: lang.code,
                          });
                        } else {
                          setDefaultLanguage(lang.code);
                          handleSaveLanguages({ defaultLanguage: lang.code });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (isDefault) return;
                          if (docMetadataListLength > 0) {
                            setLanguageChangeDialog({
                              isOpen: true,
                              targetLang: lang.code,
                            });
                          } else {
                            setDefaultLanguage(lang.code);
                            handleSaveLanguages({ defaultLanguage: lang.code });
                          }
                        }
                      }}
                      title={
                        isDefault
                          ? `${lang.label} é o idioma oficial do projeto`
                          : `Clique para definir ${lang.label} como o idioma oficial do projeto`
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 12px",
                        borderRadius: "20px",
                        border: isDefault
                          ? "1.5px solid #0ea5e9"
                          : "1px solid var(--color-outline-variant, #cbd5e1)",
                        background: isDefault
                          ? "rgba(14, 165, 233, 0.08)"
                          : "var(--color-surface-container-low, #f8fafc)",
                        color: "var(--color-on-surface, #1e293b)",
                        fontSize: "12.5px",
                        fontWeight: 500,
                        cursor: isDefault ? "default" : "pointer",
                        userSelect: "none",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontSize: "15px" }}>{lang.flag}</span>
                      <span>
                        {lang.label} ({lang.code.toUpperCase()})
                      </span>

                      {isDefault ? (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "4px",
                            background: "#0ea5e9",
                            color: "#ffffff",
                            fontWeight: 600,
                          }}
                        >
                          OFICIAL
                        </span>
                      ) : (
                        <button
                          type="button"
                          title={`Desabilitar e remover ${lang.label} do projeto`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = supportedLanguages.filter(
                              (l) =>
                                l.code.toLowerCase() !== lang.code.toLowerCase(),
                            );
                            setSupportedLanguages(updated);
                            let nextDefault = defaultLanguage;
                            if (
                              defaultLanguage.toLowerCase() ===
                                lang.code.toLowerCase() &&
                              updated.length > 0
                            ) {
                              nextDefault = updated[0].code;
                              setDefaultLanguage(nextDefault);
                            }
                            handleSaveLanguages({
                              defaultLanguage: nextDefault,
                              supportedLanguages: updated,
                            });
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            padding: "2px",
                            cursor: "pointer",
                            color: "var(--color-outline, #64748b)",
                            borderRadius: "50%",
                            transition: "color 0.15s ease",
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "15px" }}
                          >
                            close
                          </span>
                        </button>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  id="btn-add-language-inline"
                  onClick={() => {
                    setLanguageSearchFilter("");
                    setIsAddLanguageModalOpen(true);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "20px",
                    border: "1.5px dashed var(--primary, #0ea5e9)",
                    background: "rgba(14, 165, 233, 0.05)",
                    color: "var(--primary, #0ea5e9)",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    add
                  </span>
                  <span>Adicionar Idioma</span>
                </button>
              </div>
            </Stack>

            <Divider />

            {/* Motor de Tradução Padrão */}
            <Stack gap="xs">
              <div>
                <span className="ui-text-subtitle ui-text-bold">
                  Motor de Tradução Padrão
                </span>
                <div className="ui-text-body-sm ui-text-muted">
                  Escolha o motor utilizado por padrão ao solicitar traduções sob demanda.
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginTop: "6px",
                }}
              >
                <div
                  onClick={() => {
                    setTranslationEngine("lightweight-local");
                    handleSaveLanguages({ translationEngine: "lightweight-local" });
                  }}
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border:
                      translationEngine === "lightweight-local"
                        ? "2px solid #0ea5e9"
                        : "1px solid var(--color-outline-variant, #e2e8f0)",
                    background:
                      translationEngine === "lightweight-local"
                        ? "rgba(14, 165, 233, 0.08)"
                        : "var(--color-surface, #ffffff)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <Zap size={16} style={{ color: "#0ea5e9" }} />
                    <strong style={{ fontSize: "13px" }}>
                      Motor Leve de Servidor
                    </strong>
                  </div>
                  <p
                    style={{
                      fontSize: "11.5px",
                      color: "var(--color-outline, #64748b)",
                      margin: 0,
                    }}
                  >
                    Execução rápida no servidor. Não consome tokens de IA e mantém diagramas e frontmatter preservados.
                  </p>
                </div>

                <div
                  onClick={() => {
                    setTranslationEngine("ai-contextual");
                    handleSaveLanguages({ translationEngine: "ai-contextual" });
                  }}
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border:
                      translationEngine === "ai-contextual"
                        ? "2px solid #8b5cf6"
                        : "1px solid var(--color-outline-variant, #e2e8f0)",
                    background:
                      translationEngine === "ai-contextual"
                        ? "rgba(139, 92, 246, 0.08)"
                        : "var(--color-surface, #ffffff)",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <Sparkles size={16} style={{ color: "#8b5cf6" }} />
                    <strong style={{ fontSize: "13px" }}>
                      IA Contextual & Semântica (LLM)
                    </strong>
                  </div>
                  <p
                    style={{
                      fontSize: "11.5px",
                      color: "var(--color-outline, #64748b)",
                      margin: 0,
                    }}
                  >
                    Tradução adaptada ao contexto do projeto com alinhamento terminológico fino do Dicionário.
                  </p>
                </div>
              </div>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </section>
  );
};
