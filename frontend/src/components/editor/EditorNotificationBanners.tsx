import React from "react";
import { TranslationBanner } from "./TranslationBanner";
import type { SupportedLanguage } from "../../types";
import type { FragmentStatusInfo } from "./notion-editor-engine";

interface EditorNotificationBannersProps {
  isPREditing: boolean;
  prId: string | null;
  onNavigateToReviews: () => void;
  isTemplateMode: boolean;
  activeLanguage: string;
  defaultLanguage: string;
  supportedLanguages: SupportedLanguage[];
  isTranslationOutdated: boolean;
  onSyncToMain: () => void;
  onBackToMain: () => void;
  onUpdateFromMain: () => void;
  isSyncingToMain: boolean;
  isUpdatingFromMain: boolean;
  hasMergeConflict: boolean;
  onOpenConflictModal: () => void;
  fragmentAlert: FragmentStatusInfo | null;
  onDismissFragmentAlert: () => void;
  onCopyOriginalFragment: (text: string) => void;
}

export const EditorNotificationBanners: React.FC<EditorNotificationBannersProps> = ({
  isPREditing,
  prId,
  onNavigateToReviews,
  isTemplateMode,
  activeLanguage,
  defaultLanguage,
  supportedLanguages,
  isTranslationOutdated,
  onSyncToMain,
  onBackToMain,
  onUpdateFromMain,
  isSyncingToMain,
  isUpdatingFromMain,
  hasMergeConflict,
  onOpenConflictModal,
  fragmentAlert,
  onDismissFragmentAlert,
  onCopyOriginalFragment,
}) => {
  return (
    <>
      {/* Collaborative PR Editing Banner */}
      {isPREditing && (
        <div
          style={{
            margin: "12px 24px 0",
            padding: "10px 16px",
            borderRadius: "var(--radius-md, 8px)",
            background: "var(--md-sys-color-primary-container, #e0f2fe)",
            border: "1px solid var(--md-sys-color-primary, #0284c7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--md-sys-color-on-primary-container, #0369a1)",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="material-symbols-outlined"
              style={{
                color: "var(--md-sys-color-primary, #0284c7)",
                fontSize: "22px",
              }}
            >
              rate_review
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px" }}>
                Modo de Edição na Proposta #{prId}
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--md-sys-color-on-surface-variant, #334155)",
                }}
              >
                As alterações são gravadas na branch da proposta. O seu
                workspace e branch ativa permanecem intactos.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="ui-btn ui-btn--tonal ui-btn--sm"
              onClick={onNavigateToReviews}
              style={{
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                arrow_back
              </span>
              Voltar para Revisões
            </button>
          </div>
        </div>
      )}

      {/* Translation Mode Banner */}
      {!isTemplateMode &&
        activeLanguage.toLowerCase() !== defaultLanguage.toLowerCase() && (
          <TranslationBanner
            currentLanguage={activeLanguage}
            defaultLanguage={defaultLanguage}
            supportedLanguages={supportedLanguages}
            isOutdated={isTranslationOutdated}
            onSyncToMain={onSyncToMain}
            onBackToMain={onBackToMain}
            onUpdateFromMain={onUpdateFromMain}
            isSyncing={isSyncingToMain}
            isUpdating={isUpdatingFromMain}
          />
        )}

      {/* Merge Conflict Banner */}
      {hasMergeConflict && (
        <div
          style={{
            margin: "12px 24px 0",
            padding: "12px 16px",
            borderRadius: "var(--radius-md, 8px)",
            background: "rgba(234, 179, 8, 0.12)",
            border: "1px solid rgba(234, 179, 8, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "var(--color-on-surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              className="material-symbols-outlined"
              style={{ color: "#eab308", fontSize: "22px" }}
            >
              merge_type
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px" }}>
                Conflito de Merge Detectado
              </div>
              <div
                style={{ fontSize: "12px", color: "var(--color-outline)" }}
              >
                Este documento possui alterações conflitantes entre sua versão
                local e o repositório Git.
              </div>
            </div>
          </div>
          <button
            onClick={onOpenConflictModal}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              background: "#eab308",
              color: "#000",
              fontWeight: 600,
              fontSize: "12px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "16px" }}
            >
              splitscreen
            </span>
            Resolver Conflito Visualmente
          </button>
        </div>
      )}

      {/* Fragment Not Found / Snippet Alert Banner */}
      {fragmentAlert && fragmentAlert.type === "not_found" && (
        <div
          className="fragment-not-found-banner"
          id="fragment-not-found-alert"
        >
          <div className="fragment-alert-header">
            <div className="fragment-alert-title-row">
              <span className="material-symbols-outlined fragment-alert-icon">
                link_off
              </span>
              <span className="fragment-alert-title">
                Trecho referenciado não encontrado
              </span>
            </div>
            <button
              className="fragment-alert-close-btn"
              title="Dispensar alerta"
              onClick={onDismissFragmentAlert}
            >
              <span className="material-symbols-outlined icon-xs">close</span>
            </button>
          </div>
          <p className="fragment-alert-description">
            O link apontava para um trecho específico que foi substancialmente
            modificado ou excluído deste documento.
          </p>
          <div className="fragment-alert-original-box">
            <div className="fragment-alert-box-label">
              <span>Texto que estava lá originalmente:</span>
              <button
                type="button"
                className="btn-copy-original-fragment"
                title="Copiar texto original para a área de transferência"
                onClick={() => {
                  onCopyOriginalFragment(fragmentAlert.exact || "");
                }}
              >
                <span className="material-symbols-outlined icon-xs">
                  content_copy
                </span>
                Copiar texto
              </button>
            </div>
            <div className="fragment-alert-box-quote">
              {fragmentAlert.prefix && (
                <span className="fragment-quote-context">
                  ...{fragmentAlert.prefix}{" "}
                </span>
              )}
              <span className="fragment-quote-exact">
                {fragmentAlert.exact}
              </span>
              {fragmentAlert.suffix && (
                <span className="fragment-quote-context">
                  {" "}
                  {fragmentAlert.suffix}...
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
