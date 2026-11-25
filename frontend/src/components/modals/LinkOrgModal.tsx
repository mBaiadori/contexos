import React, { useState, useEffect } from "react";
import {
  Building2,
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Button, IconButton, Input, Spinner } from "../ui";
import { API } from "../../services/api";
import { useWorkspace } from "../../context/WorkspaceContext";

interface LinkOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinked: (org: { login: string; full_name?: string }) => void;
  onOpenCreate?: () => void;
}

export const LinkOrgModal: React.FC<LinkOrgModalProps> = ({
  isOpen,
  onClose,
  onLinked,
  onOpenCreate,
}) => {
  const { orgs: contextOrgs, loadOrgs } = useWorkspace();
  const [orgHandle, setOrgHandle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [availableOrgs, setAvailableOrgs] = useState<
    Array<{
      login: string;
      full_name?: string;
      avatar_url?: string;
      description?: string;
      role?: string;
    }>
  >([]);

  const fetchExistingOrgs = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await API.getOrgs();
      if (res.ok && res.data?.orgs) {
        setAvailableOrgs(res.data.orgs);
      } else if (contextOrgs) {
        setAvailableOrgs(contextOrgs);
      }
    } catch {
      if (contextOrgs) setAvailableOrgs(contextOrgs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setOrgHandle("");
      setSearchQuery("");
      setErrorMsg(null);
      setSuccessMsg(null);
      fetchExistingOrgs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLinkExisting = async (loginToLink: string) => {
    const clean = loginToLink.trim().toLowerCase().replace(/\s+/g, "-");
    if (!clean) return;

    setIsLinking(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await API.createOrg({ username: clean });
      if (res.ok && res.data?.success && res.data.org) {
        setSuccessMsg(`Organização '@${res.data.org.login}' vinculada com sucesso!`);
        await loadOrgs?.();
        setTimeout(() => {
          onLinked(res.data.org);
          onClose();
        }, 800);
      } else {
        setErrorMsg(res.data?.error || res.data?.message || "Não foi possível vincular a organização.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Erro de conexão ao vincular organização.");
    } finally {
      setIsLinking(false);
    }
  };

  const filteredOrgs = availableOrgs.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (o.login || "").toLowerCase().includes(q) ||
      (o.full_name || "").toLowerCase().includes(q) ||
      (o.description || "").toLowerCase().includes(q)
    );
  });

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
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "580px",
          maxHeight: "90vh",
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
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
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
                Vincular Organização Existente
              </h2>
              <span style={{ fontSize: "12px", color: "var(--color-on-surface-variant, #64748b)" }}>
                Selecione uma organização detectada ou digite o identificador
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchExistingOrgs}
              disabled={isLoading}
              style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
              Atualizar
            </Button>
            <IconButton size="sm" tooltip="Fechar" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            overflowY: "auto",
          }}
        >
          {errorMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid #ef4444",
                color: "#ef4444",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid #10b981",
                color: "#059669",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Seção 1: Vincular por identificador direto */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "10px",
              backgroundColor: "var(--color-surface-container-low, #f8fafc)",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-on-surface, #0f172a)" }}>
              Digitar Identificador da Organização no GitHub
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <Input
                placeholder="ex: minha-organizacao"
                value={orgHandle}
                onChange={(e) => setOrgHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && orgHandle.trim()) {
                    e.preventDefault();
                    handleLinkExisting(orgHandle);
                  }
                }}
                style={{ flex: 1 }}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={!orgHandle.trim() || isLinking}
                isLoading={isLinking}
                onClick={() => handleLinkExisting(orgHandle)}
              >
                Vincular
              </Button>
            </div>
          </div>

          {/* Seção 2: Lista de Organizações Detectadas */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-on-surface, #0f172a)" }}>
                Organizações Detectadas na sua Conta ({filteredOrgs.length})
              </span>
              {availableOrgs.length > 3 && (
                <div style={{ width: "180px" }}>
                  <Input
                    placeholder="Filtrar..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "12px" }}
                  />
                </div>
              )}
            </div>

            {isLoading ? (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--color-on-surface-variant, #64748b)" }}>
                <Spinner size="sm" /> Carregando organizações da sua conta...
              </div>
            ) : filteredOrgs.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  borderRadius: "8px",
                  backgroundColor: "var(--color-surface-container-low, #f8fafc)",
                  border: "1px dashed var(--color-outline-variant, #cbd5e1)",
                  fontSize: "13px",
                  color: "var(--color-on-surface-variant, #64748b)",
                }}
              >
                Nenhuma organização encontrada automaticamente. Digite o nome acima para vincular diretamente.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "240px",
                  overflowY: "auto",
                }}
              >
                {filteredOrgs.map((org) => (
                  <div
                    key={org.login}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "10px",
                      backgroundColor: "var(--color-surface-container-low, #f8fafc)",
                      border: "1px solid var(--color-outline-variant, #e2e8f0)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <img
                        src={org.avatar_url || `https://github.com/${encodeURIComponent(org.login)}.png`}
                        alt={org.login}
                        style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--color-on-surface, #0f172a)" }}>
                            {org.full_name || org.login}
                          </span>
                          <span style={{ fontSize: "11.5px", color: "var(--color-on-surface-variant, #64748b)" }}>
                            @{org.login}
                          </span>
                        </div>
                        {org.description && (
                          <span
                            style={{
                              fontSize: "11.5px",
                              color: "var(--color-on-surface-variant, #64748b)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {org.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleLinkExisting(org.login)}
                      disabled={isLinking}
                      style={{ whiteSpace: "nowrap", fontSize: "12px", padding: "4px 12px" }}
                    >
                      Vincular
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
          {onOpenCreate && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCreate();
              }}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-primary, #1a73e8)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: 0,
              }}
            >
              <Plus size={14} /> Precisa criar uma nova no GitHub?
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
