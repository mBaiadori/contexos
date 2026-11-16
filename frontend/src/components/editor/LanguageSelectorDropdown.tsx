import React, { useState, useEffect, useRef } from "react";
import { API } from "../../services/api";
import type {
  SupportedLanguage,
  DocumentTranslationItem,
} from "../../types";

interface LanguageSelectorDropdownProps {
  filePath: string;
  activeLanguage: string;
  onSelectLanguage: (lang: string) => void;
  onTranslationCreated?: (lang: string, content: string) => void;
}

export const LanguageSelectorDropdown: React.FC<
  LanguageSelectorDropdownProps
> = ({ filePath, activeLanguage, onSelectLanguage, onTranslationCreated }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [deletingLang, setDeletingLang] = useState<string | null>(null);
  const [defaultLanguage, setDefaultLanguage] = useState("pt-BR");
  const [supportedLanguages, setSupportedLanguages] = useState<
    SupportedLanguage[]
  >([]);
  const [translations, setTranslations] = useState<DocumentTranslationItem[]>(
    [],
  );
  const [selectedEngineId] = useState<string>("lightweight-local");
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Carregar lista de traduções do arquivo ativo
  const loadTranslations = async () => {
    if (!filePath) return;
    try {
      const res = await API.listTranslations(filePath);
      if (res.ok && res.data) {
        setDefaultLanguage(res.data.defaultLanguage || "pt-BR");
        setSupportedLanguages(res.data.supportedLanguages || []);
        setTranslations(res.data.translations || []);
      }
    } catch (err) {
      console.warn("[LanguageSelector] Erro ao buscar traduções:", err);
    }
  };

  useEffect(() => {
    loadTranslations();
  }, [filePath]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const activeLangObj = supportedLanguages.find(
    (l) =>
      l.code.toLowerCase() ===
      (activeLanguage || defaultLanguage).toLowerCase(),
  ) || {
    code: activeLanguage || defaultLanguage,
    label: activeLanguage || defaultLanguage,
    flag: "🌐",
  };

  const isMain =
    (activeLanguage || defaultLanguage).toLowerCase() ===
    defaultLanguage.toLowerCase();

  const handleTranslate = async (targetLang: string) => {
    setIsTranslating(true);
    setTranslatingLang(targetLang);
    setErrorToast(null);
    try {
      const res = await API.translateDocument({
        path: filePath,
        targetLang,
        engineId: selectedEngineId,
      });

      if (res.ok && res.data) {
        await loadTranslations();
        if (onTranslationCreated) {
          onTranslationCreated(targetLang, res.data.content);
        } else {
          onSelectLanguage(targetLang);
        }
        setIsOpen(false);
      } else {
        setErrorToast(
          (res.data as any)?.error || "Erro ao solicitar tradução.",
        );
      }
    } catch (err: any) {
      setErrorToast(err?.message || "Falha na comunicação com o servidor.");
    } finally {
      setIsTranslating(false);
      setTranslatingLang(null);
    }
  };

  const handleDeleteTranslation = async (targetLang: string) => {
    if (!filePath || !targetLang) return;
    setDeletingLang(targetLang);
    setErrorToast(null);
    try {
      const res = await API.deleteTranslation({
        path: filePath,
        lang: targetLang,
      });
      if (res.ok) {
        await loadTranslations();
        if (activeLanguage.toLowerCase() === targetLang.toLowerCase()) {
          onSelectLanguage(defaultLanguage);
        }
      } else {
        setErrorToast(
          (res.data as any)?.error || "Erro ao remover arquivo de tradução.",
        );
      }
    } catch (err: any) {
      setErrorToast(err?.message || "Falha ao remover tradução.");
    } finally {
      setDeletingLang(null);
    }
  };

  // Idiomas que ainda não possuem tradução gerada
  const untranslatedLanguages = supportedLanguages.filter(
    (lang) =>
      lang.code.toLowerCase() !== defaultLanguage.toLowerCase() &&
      !translations.some(
        (t) => t.lang.toLowerCase() === lang.code.toLowerCase(),
      ),
  );

  return (
    <div
      ref={containerRef}
      className="language-selector-dropdown-wrapper"
      style={{ position: "relative", display: "inline-block", zIndex: 12 }}
    >
      <button
        type="button"
        className={`btn-language-selector ${!isMain ? "is-translated-mode" : ""}`}
        onClick={() => {
          if (!isOpen) loadTranslations();
          setIsOpen(!isOpen);
        }}
        title={`Idioma atual: ${activeLangObj.label} ${isMain ? "(Documento Oficial)" : "(Versão Traduzida)"}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 10px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 600,
          border: isMain
            ? "1px solid var(--color-outline-variant, #cbd5e1)"
            : "1px solid rgba(16, 185, 129, 0.4)",
          background: isMain
            ? "var(--color-surface-container-low, #f8fafc)"
            : "rgba(16, 185, 129, 0.1)",
          color: isMain ? "var(--color-on-surface, #1e293b)" : "#059669",
          cursor: "pointer",
          transition: "all 0.15s ease",
        }}
      >
        <span style={{ fontSize: "14px" }}>{activeLangObj.flag}</span>
        <span>{activeLangObj.code.toUpperCase()}</span>

        <span
          className="material-symbols-outlined"
          style={{
            fontSize: "15px",
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          expand_more
        </span>
      </button>

      {isOpen && (
        <div
          className="language-menu-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            width: "320px",
            background: "var(--color-surface, #ffffff)",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
            borderRadius: "8px",
            boxShadow:
              "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {errorToast && (
            <div
              style={{
                padding: "6px 8px",
                borderRadius: "4px",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#dc2626",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px" }}
              >
                error
              </span>
              <span>{errorToast}</span>
            </div>
          )}

          {/* Idioma Oficial */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-outline, #64748b)",
                fontWeight: 600,
              }}
            >
              Oficial
            </span>
            <button
              type="button"
              onClick={() => {
                onSelectLanguage(defaultLanguage);
                setIsOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                borderRadius: "6px",
                border: isMain
                  ? "1.5px solid var(--primary, #2563eb)"
                  : "1px solid var(--color-outline-variant, #e2e8f0)",
                background: isMain ? "rgba(37, 99, 235, 0.08)" : "transparent",
                color: "var(--color-on-surface, #1e293b)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span style={{ fontSize: "16px" }}>
                  {supportedLanguages.find((l) => l.code === defaultLanguage)
                    ?.flag || "🇧🇷"}
                </span>
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 600 }}>
                    {supportedLanguages.find((l) => l.code === defaultLanguage)
                      ?.label || defaultLanguage}
                  </div>
                  <div
                    style={{
                      fontSize: "10.5px",
                      color: "var(--color-outline, #64748b)",
                    }}
                  >
                    {filePath}
                  </div>
                </div>
              </div>
              {isMain && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px", color: "var(--primary, #2563eb)" }}
                >
                  check
                </span>
              )}
            </button>
          </div>

          {/* Traduções Existentes */}
          {translations.filter((t) => !t.isMain).length > 0 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--color-outline, #64748b)",
                  fontWeight: 600,
                }}
              >
                Traduções
              </span>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                {translations
                  .filter((t) => !t.isMain)
                  .map((t) => {
                    const isCurrent =
                      activeLanguage.toLowerCase() === t.lang.toLowerCase();
                    return (
                      <button
                        key={t.lang}
                        type="button"
                        onClick={() => {
                          onSelectLanguage(t.lang);
                          setIsOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: isCurrent
                            ? "1.5px solid #10b981"
                            : "1px solid var(--color-outline-variant, #e2e8f0)",
                          background: isCurrent
                            ? "rgba(16, 185, 129, 0.08)"
                            : "transparent",
                          color: "var(--color-on-surface, #1e293b)",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={{ fontSize: "16px" }}>{t.langFlag}</span>
                          <div>
                            <div
                              style={{ fontSize: "12.5px", fontWeight: 600 }}
                            >
                              {t.langLabel}
                            </div>
                            <div
                              style={{
                                fontSize: "10.5px",
                                color: t.isOutdated ? "#d97706" : "#059669",
                              }}
                            >
                              {t.isOutdated
                                ? "⚠️ Desatualizado do oficial"
                                : "✓ Atualizado"}
                            </div>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <button
                            type="button"
                            title={`Traduzir ${t.langLabel} a partir do documento oficial`}
                            disabled={isTranslating || deletingLang === t.lang}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTranslate(t.lang);
                            }}
                            style={{
                              display: "inline-flex",
                              height: "22px",
                              alignItems: "center",
                              gap: "2px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              border: t.isOutdated
                                ? "1px solid rgba(217, 119, 6, 0.4)"
                                : "1px solid rgba(37, 99, 235, 0.3)",
                              background: t.isOutdated
                                ? "rgba(217, 119, 6, 0.1)"
                                : "rgba(37, 99, 235, 0.08)",
                              color: t.isOutdated ? "#b45309" : "#2563eb",
                              fontSize: "10.5px",
                              fontWeight: 600,
                              cursor:
                                isTranslating || deletingLang === t.lang
                                  ? "not-allowed"
                                  : "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: "13px",
                                animation:
                                  translatingLang === t.lang
                                    ? "spin 1s linear infinite"
                                    : "none",
                              }}
                            >
                              autorenew
                            </span>
                          </button>

                          <button
                            type="button"
                            title={`Remover tradução de ${t.langLabel}`}
                            disabled={isTranslating || deletingLang === t.lang}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteTranslation(t.lang);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "22px",
                              height: "22px",
                              padding: 0,
                              borderRadius: "4px",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              background: "rgba(239, 68, 68, 0.08)",
                              color: "#dc2626",
                              cursor:
                                isTranslating || deletingLang === t.lang
                                  ? "not-allowed"
                                  : "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{
                                fontSize: "14px",
                                animation:
                                  deletingLang === t.lang
                                    ? "spin 1s linear infinite"
                                    : "none",
                              }}
                            >
                              {deletingLang === t.lang
                                ? "progress_activity"
                                : "delete_outline"}
                            </span>
                          </button>

                          {isCurrent && (
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "16px", color: "#10b981" }}
                              title="Idioma ativo"
                            >
                              check
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Seção Criar Nova Tradução Sob Demanda */}
          {untranslatedLanguages.length > 0 && (
            <div
              style={{
                borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
                paddingTop: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--color-outline, #64748b)",
                    fontWeight: 600,
                  }}
                >
                  Criar Tradução
                </span>
              </div>

              {/* Lista de Idiomas Disponíveis para Traduzir */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "4px",
                }}
              >
                {untranslatedLanguages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    disabled={isTranslating}
                    onClick={() => handleTranslate(lang.code)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border:
                        "1px dashed var(--color-outline-variant, #cbd5e1)",
                      background: "var(--color-surface-container-low, #f8fafc)",
                      color: "var(--color-on-surface, #1e293b)",
                      fontSize: "11.5px",
                      cursor: isTranslating ? "not-allowed" : "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span>{lang.flag}</span>
                    <span
                      style={{
                        flex: 1,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      + {lang.label.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>

              {isTranslating && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "6px",
                    fontSize: "11.5px",
                    color: "var(--primary, #2563eb)",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      animation: "spin 1s linear infinite",
                      fontSize: "16px",
                    }}
                  >
                    progress_activity
                  </span>
                  <span>Traduzindo documento...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
