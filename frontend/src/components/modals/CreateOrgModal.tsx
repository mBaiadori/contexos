import React from "react";
import { Building2, X, ExternalLink, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button, IconButton, useBackdropClose } from "../ui";

interface CreateOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLinkModal?: () => void;
}

export const CreateOrgModal: React.FC<CreateOrgModalProps> = ({
  isOpen,
  onClose,
  onOpenLinkModal,
}) => {
  const backdropHandlers = useBackdropClose(onClose);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        boxSizing: "border-box",
      }}
      {...backdropHandlers}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #1e293b)",
          borderRadius: "16px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #1a73e8 0%, #6366f1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
              }}
            >
              <Building2 size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 600, color: "var(--color-on-surface, #0f172a)" }}>
                Criar Organização no GitHub
              </h2>
              <span style={{ fontSize: "12px", color: "var(--color-on-surface-variant, #64748b)" }}>
                Fluxo oficial de criação de organização gratuita no GitHub
              </span>
            </div>
          </div>

          <IconButton size="sm" tooltip="Fechar" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        {/* Content */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              backgroundColor: "rgba(26, 115, 232, 0.06)",
              border: "1px solid rgba(26, 115, 232, 0.18)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-primary, #1a73e8)", fontWeight: 600, fontSize: "13.5px" }}>
              <ShieldCheck size={18} />
              <span>Plano GitHub Free for Organizations</span>
            </div>
            <p style={{ margin: 0, fontSize: "12.5px", color: "var(--color-on-surface, #334155)", lineHeight: 1.5 }}>
              O GitHub exige que a criação inicial de novas organizações seja realizada diretamente na sua interface web oficial para aceite de Termos de Serviço e definição do plano (o plano <strong>Free</strong> é 100% gratuito e ilimitado para repositórios públicos e privados).
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px", color: "var(--color-on-surface-variant, #64748b)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>Clique no botão abaixo para abrir a página de criação no GitHub.</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>Defina o nome da sua organização e selecione o plano <strong>Free</strong>.</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0, marginTop: "2px" }} />
              <span>Após criar, volte aqui e clique em <strong>Vincular Organização</strong> para importá-la imediatamente.</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
            <a
              href="https://github.com/account/organizations/new"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "8px",
                backgroundColor: "var(--color-primary, #1a73e8)",
                color: "#ffffff",
                fontSize: "13.5px",
                fontWeight: 600,
                textDecoration: "none",
                flex: 1,
                boxShadow: "0 2px 6px rgba(26, 115, 232, 0.3)",
              }}
            >
              <span>Abrir Criador no GitHub</span>
              <ExternalLink size={15} />
            </a>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {onOpenLinkModal && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenLinkModal();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-primary, #1a73e8)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: 0,
              }}
            >
              <span>Já criou? Vincular agora</span>
              <ArrowRight size={14} />
            </button>
          )}

          <Button variant="ghost" size="sm" onClick={onClose} style={{ marginLeft: "auto" }}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
};
