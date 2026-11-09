import {
  Building2,
  ExternalLink,
  User as UserIcon,
  Trash2,
  LogIn,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  KeyRound,
  Monitor,
  CloudDownload,
} from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/common/LanguageSwitcher";
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  FormField,
  IconButton,
  Input,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { API } from "../services/api";
import type { UpdaterStatusEvent } from "../services/api/client";
import type { User } from "../types";

interface AuthViewProps {
  onLoginSuccess: () => void;
}

type AuthMode = "initial" | "device_pairing" | "org_onboarding";

interface DeviceCodeData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const { t } = useTranslation(["auth", "common", "repos"]);
  const {
    accounts,
    switchAccount,
    removeAccount,
    refreshAuth,
    loginLocal,
    version,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("initial");
  const [isLoading, setIsLoading] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "error" | "info" | "success";
  } | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdaterStatusEvent | null>(null);

  // Device Flow State (RFC 8628)
  const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string>("");
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Onboarding da Organização
  const [createdUser, setCreatedUser] = useState<User | null>(null);
  const [orgName, setOrgName] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [orgWebFlowUrl, setOrgWebFlowUrl] = useState<string | null>(null);

  // Limpeza de timers de polling ao desmontar e monitoramento de atualizações
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (bridge?.onUpdaterStatus) {
      const unsub = bridge.onUpdaterStatus((data) => {
        setUpdateInfo(data);
      });
      bridge.checkForUpdates?.().catch(() => {});
      return () => {
        unsub();
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
        }
      };
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  /**
   * Dispara o Device Authorization Grant (RFC 8628)
   */
  const handleStartDeviceFlow = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    setCopiedCode(false);

    try {
      const res = await API.requestDeviceCode();
      if (!res.ok || !res.data.success || !res.data.device_code) {
        setStatusMessage({
          text: res.data?.error || t("auth:statusServerError"),
          type: "error",
        });
        setIsLoading(false);
        return;
      }

      const data: DeviceCodeData = {
        device_code: res.data.device_code,
        user_code: res.data.user_code || "",
        verification_uri:
          res.data.verification_uri || "https://github.com/login/device",
        expires_in: res.data.expires_in || 900,
        interval: res.data.interval || 5,
      };

      setDeviceData(data);
      setMode("device_pairing");
      setPollingStatus(
        t(
          "auth:waitingAuthorization",
          "Aguardando confirmação no navegador...",
        ),
      );

      // Tenta copiar código para clipboard imediatamente
      if (data.user_code) {
        try {
          await navigator.clipboard.writeText(data.user_code);
          setCopiedCode(true);
        } catch {}
      }

      // Inicia polling com o intervalo fornecido pelo provedor
      startPolling(data.device_code, data.interval);
    } catch (err: any) {
      setStatusMessage({
        text: err.message || t("auth:statusServerError"),
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Executa o Polling silencioso da RFC 8628
   */
  const startPolling = (deviceCode: string, initialInterval: number) => {
    stopPolling();
    let currentInterval = Math.max(initialInterval || 5, 5) * 1000;

    const poll = async () => {
      try {
        const res = await API.pollDeviceToken(deviceCode);
        if (!res.ok) return;

        const data = res.data;

        if (data.status === "pending") {
          setPollingStatus(
            t(
              "auth:waitingAuthorization",
              "Aguardando confirmação no navegador...",
            ),
          );
        } else if (data.status === "slow_down") {
          stopPolling();
          currentInterval = ((data.interval || 10) + 2) * 1000;
          pollTimerRef.current = setInterval(poll, currentInterval);
        } else if (data.status === "expired") {
          stopPolling();
          setStatusMessage({
            text:
              data.error || "O código expirou. Por favor, inicie novamente.",
            type: "error",
          });
          setMode("initial");
        } else if (data.status === "denied") {
          stopPolling();
          setStatusMessage({
            text: data.error || "Autorização cancelada.",
            type: "error",
          });
          setMode("initial");
        } else if (data.status === "success") {
          stopPolling();
          await refreshAuth();

          const orgs = Array.isArray(data.orgs) ? data.orgs : [];
          if (orgs.length > 0) {
            setStatusMessage({
              text: t("auth:statusSuccess"),
              type: "success",
            });
            onLoginSuccess();
          } else {
            setCreatedUser(data.user || null);
            setMode("org_onboarding");
          }
        }
      } catch (err) {
        console.error("[DeviceFlow] Erro no polling:", err);
      }
    };

    pollTimerRef.current = setInterval(poll, currentInterval);
  };

  /**
   * Copia o código e abre o navegador
   */
  const handleCopyAndOpenBrowser = async () => {
    if (!deviceData) return;
    try {
      await navigator.clipboard.writeText(deviceData.user_code);
      setCopiedCode(true);
    } catch {}
    window.open(deviceData.verification_uri, "_blank", "noopener,noreferrer");
  };

  /**
   * Criação simplificada da Organização no onboarding
   */
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = orgName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleanName) return;

    setIsCreatingOrg(true);
    setStatusMessage(null);
    setOrgWebFlowUrl(null);

    try {
      const res = await API.createOrg({
        username: cleanName,
        full_name: orgName.trim(),
      });

      if (res.ok && res.data?.success) {
        await refreshAuth();
        if (res.data?.requires_web_flow && res.data?.web_url) {
          setOrgWebFlowUrl(res.data.web_url);
        } else {
          onLoginSuccess();
        }
      } else {
        if (res.data?.requires_web_flow && res.data?.web_url) {
          setOrgWebFlowUrl(res.data.web_url);
        } else {
          setStatusMessage({
            text:
              res.data?.error ||
              res.data?.message ||
              "Erro ao registrar organização",
            type: "error",
          });
        }
      }
    } catch (err: any) {
      setStatusMessage({
        text: err.message || "Erro de conexão ao criar organização",
        type: "error",
      });
    } finally {
      setIsCreatingOrg(false);
    }
  };

  /**
   * Seleção de Conta Salva
   */
  const handleSelectAccount = async (accountId: string) => {
    setSwitchingAccountId(accountId);
    setStatusMessage(null);
    try {
      const res = await switchAccount(accountId);
      if (res.success) {
        onLoginSuccess();
      } else {
        setStatusMessage({
          text: res.error || t("auth:statusDefaultError"),
          type: "error",
        });
      }
    } catch {
      setStatusMessage({ text: t("auth:statusServerError"), type: "error" });
    } finally {
      setSwitchingAccountId(null);
    }
  };

  /**
   * Acesso Rápido: Modo Local (Offline)
   */
  const handleLocalLogin = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const res = await loginLocal();
      if (res.success) {
        onLoginSuccess();
      } else {
        setStatusMessage({
          text:
            (res as { error?: string })?.error ||
            "Erro ao entrar no modo local.",
          type: "error",
        });
      }
    } catch {
      setStatusMessage({
        text: "Erro de conexão ao iniciar no modo local.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="view-auth"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        padding: "24px 16px",
        boxSizing: "border-box",
        background:
          "radial-gradient(ellipse at top, var(--color-surface-container-high) 0%, var(--color-surface) 75%)",
        position: "relative",
        overflowY: "auto",
      }}
    >
      {/* Botão de Idioma Superior Direito */}
      <div
        style={{ position: "absolute", top: "16px", right: "20px", zIndex: 10 }}
      >
        <LanguageSwitcher />
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Cabeçalho de Identidade */}
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <img
            src="/logo.png"
            alt="Contexos"
            style={{
              height: "48px",
              width: "auto",
              objectFit: "contain",
              marginBottom: "4px",
            }}
          />

          <p
            style={{
              margin: 0,
              fontSize: "13.5px",
              color: "var(--color-on-surface-variant)",
              lineHeight: 1.45,
            }}
          >
            {mode === "org_onboarding"
              ? "Vamos criar o espaço da sua organização para centralizar projetos e especificações com o time."
              : "Acesso corporativo integrado para membros do time."}
          </p>
        </div>

        {/* Card Principal */}
        <Card
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            borderRadius: "16px",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
          }}
        >
          <CardContent
            style={{
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {statusMessage && (
              <AlertBanner
                variant={statusMessage.type}
                title={statusMessage.text}
                onClose={() => setStatusMessage(null)}
              />
            )}

            {/* MODO INICIAL: BOTÃO "CONECTAR COM A EMPRESA" */}
            {mode === "initial" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {/* Botão Principal Hero */}
                <Button
                  id="btn-connect-company"
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isLoading}
                  onClick={handleStartDeviceFlow}
                  style={{
                    padding: "16px 20px",
                    fontSize: "15.5px",
                    fontWeight: 700,
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    boxShadow:
                      "0 4px 14px 0 rgba(var(--color-primary-rgb, 59, 130, 246), 0.39)",
                  }}
                >
                  <Building2 size={20} />
                  <span>Conectar com a Empresa</span>
                  <ArrowRight size={18} style={{ marginLeft: "auto" }} />
                </Button>

                {/* Seção de Acessos Rápidos (Contas Salvas e Modo Local) */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    marginTop: "6px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      margin: "2px 0",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: "1px",
                        backgroundColor:
                          "var(--color-outline-variant, #e2e8f0)",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "var(--color-on-surface-variant, #64748b)",
                      }}
                    >
                      Acessos Rápidos
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: "1px",
                        backgroundColor:
                          "var(--color-outline-variant, #e2e8f0)",
                      }}
                    />
                  </div>

                  {/* Contas Salvas no Cofre (se houver) */}
                  {accounts.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      {accounts.map((acc) => (
                        <div
                          key={acc.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            backgroundColor:
                              "var(--color-surface-container-low)",
                            border: "1px solid var(--color-outline-variant)",
                            borderRadius: "10px",
                            transition: "all 0.15s ease",
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
                            {acc.user?.avatar_url ? (
                              <img
                                src={acc.user.avatar_url}
                                alt={acc.user.login}
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  backgroundColor:
                                    "var(--color-primary-container)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--color-primary)",
                                }}
                              >
                                <UserIcon size={16} />
                              </div>
                            )}
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  color: "var(--color-on-surface)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {acc.user?.name || acc.user?.login}
                              </div>
                              <span
                                style={{
                                  fontSize: "11px",
                                  color: "var(--color-on-surface-variant)",
                                }}
                              >
                                @{acc.user?.login}
                              </span>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={
                                isLoading || Boolean(switchingAccountId)
                              }
                              loading={switchingAccountId === acc.id}
                              onClick={() => handleSelectAccount(acc.id)}
                              leftIcon={<LogIn size={13} />}
                            >
                              Entrar
                            </Button>
                            <IconButton
                              size="sm"
                              tooltip="Remover"
                              disabled={
                                isLoading || Boolean(switchingAccountId)
                              }
                              onClick={() => removeAccount(acc.id)}
                            >
                              <Trash2
                                size={14}
                                style={{ color: "var(--color-error)" }}
                              />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acesso Rápido: Modo Local (Offline) */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      backgroundColor:
                        "var(--color-surface-container-low, rgba(0,0,0,0.02))",
                      border:
                        "1px dashed var(--color-outline-variant, #cbd5e1)",
                      borderRadius: "10px",
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
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          backgroundColor:
                            "var(--color-surface-container-high, #e2e8f0)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--color-on-surface-variant, #475569)",
                        }}
                      >
                        <Monitor size={16} />
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-on-surface)",
                          }}
                        >
                          Modo Local (Offline)
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--color-on-surface-variant)",
                          }}
                        >
                          Trabalhe sem conexão corporativa
                        </div>
                      </div>
                    </div>

                    <Button
                      id="btn-quick-local-login"
                      variant="ghost"
                      size="sm"
                      disabled={isLoading || Boolean(switchingAccountId)}
                      onClick={handleLocalLogin}
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      Iniciar
                    </Button>
                  </div>
                </div>

                {/* Atalho discreto para Login Administrativo / PAT */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: "4px",
                  }}
                >
                  <button
                    type="button"
                    id="btn-goto-admin-login"
                    onClick={() => navigate("/login/admin")}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "6px 10px",
                      fontSize: "12px",
                      color: "var(--color-outline, #64748b)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      borderRadius: "6px",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color =
                        "var(--color-primary, #3b82f6)";
                      e.currentTarget.style.backgroundColor =
                        "var(--color-surface-container, rgba(0,0,0,0.04))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color =
                        "var(--color-outline, #64748b)";
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <KeyRound size={13} />
                    <span>Acessar via Personal Access Token (Admin)</span>
                  </button>
                </div>
              </div>
            )}

            {/* MODO PAREAMENTO (DEVICE FLOW RFC 8628) */}
            {mode === "device_pairing" && deviceData && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-primary)",
                      textTransform: "uppercase",
                    }}
                  >
                    Código de Conexão
                  </span>
                  <div
                    style={{
                      margin: "8px auto",
                      padding: "12px 24px",
                      background: "var(--color-surface-container-high)",
                      border: "2px dashed var(--color-primary)",
                      borderRadius: "12px",
                      fontSize: "28px",
                      fontWeight: 800,
                      letterSpacing: "0.15em",
                      fontFamily: "monospace",
                      color: "var(--color-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span>{deviceData.user_code}</span>
                    <IconButton
                      size="sm"
                      tooltip={copiedCode ? "Copiado!" : "Copiar Código"}
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          deviceData.user_code,
                        );
                        setCopiedCode(true);
                      }}
                    >
                      {copiedCode ? (
                        <Check
                          size={18}
                          style={{ color: "var(--color-primary)" }}
                        />
                      ) : (
                        <Copy size={18} />
                      )}
                    </IconButton>
                  </div>
                  {copiedCode && (
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: "var(--color-primary)",
                        fontWeight: 600,
                      }}
                    >
                      ✓ Código copiado para a área de transferência!
                    </span>
                  )}
                </div>

                {/* Botão de Abrir Navegador */}
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleCopyAndOpenBrowser}
                  style={{
                    padding: "14px",
                    fontWeight: 700,
                    borderRadius: "10px",
                  }}
                >
                  <ExternalLink size={18} />
                  <span>Copiar Código e Abrir Navegador</span>
                </Button>

                {/* Instruções */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "14px",
                    borderRadius: "10px",
                    background: "var(--color-surface-container-low)",
                    border: "1px solid var(--color-outline-variant)",
                    fontSize: "12.5px",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "var(--color-primary)",
                        color: "var(--color-on-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      1
                    </div>
                    <span>
                      Cole o código <strong>{deviceData.user_code}</strong> na
                      página que se abriu.
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "var(--color-primary)",
                        color: "var(--color-on-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      2
                    </div>
                    <span>
                      Após autorizar, o aplicativo entrará{" "}
                      <strong>automaticamente</strong>!
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background:
                      "rgba(var(--color-primary-rgb, 59, 130, 246), 0.08)",
                    color: "var(--color-primary)",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <Loader2 size={14} className="animate-spin" />
                  <span>
                    {pollingStatus || "Aguardando confirmação no navegador..."}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      stopPolling();
                      setMode("initial");
                    }}
                    style={{ color: "var(--color-outline)" }}
                  >
                    Voltar
                  </Button>
                </div>
              </div>
            )}

            {/* MODO ONBOARDING DA ORGANIZAÇÃO */}
            {mode === "org_onboarding" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    borderRadius: "10px",
                    background: "var(--color-surface-container-low)",
                    border: "1px solid var(--color-outline-variant)",
                  }}
                >
                  {createdUser?.avatar_url && (
                    <img
                      src={createdUser.avatar_url}
                      alt={createdUser.login}
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                      }}
                    />
                  )}
                  <div>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "var(--color-on-surface)",
                      }}
                    >
                      Olá, {createdUser?.name || createdUser?.login}!
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-on-surface-variant)",
                      }}
                    >
                      Autenticado com sucesso. Vamos configurar seu time.
                    </div>
                  </div>
                </div>

                {orgWebFlowUrl ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                      padding: "16px",
                      borderRadius: "12px",
                      background: "var(--color-primary-container)",
                      border: "1px solid var(--color-primary)",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        color: "var(--color-on-surface)",
                        lineHeight: 1.4,
                      }}
                    >
                      Para criar uma nova organização corporativa oficial,
                      conclua o passo simples na página do provedor:
                    </p>
                    <a
                      href={orgWebFlowUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "12px 16px",
                        borderRadius: "8px",
                        backgroundColor: "var(--color-primary)",
                        color: "var(--color-on-primary)",
                        textDecoration: "none",
                        fontWeight: 700,
                        fontSize: "13.5px",
                      }}
                    >
                      <ExternalLink size={16} />
                      <span>Concluir Criação no GitHub</span>
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      onClick={async () => {
                        await refreshAuth();
                        onLoginSuccess();
                      }}
                    >
                      Já criei a organização, avançar
                    </Button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleCreateOrg}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    }}
                  >
                    <FormField
                      label="Nome da Empresa ou Time"
                      helperText="Este nome identificará o repositório central de especificações e governança."
                      required
                    >
                      <Input
                        id="org-name-input"
                        placeholder="ex: minha-empresa"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        autoFocus
                      />
                    </FormField>

                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      type="submit"
                      loading={isCreatingOrg}
                      disabled={!orgName.trim()}
                    >
                      <Building2 size={16} />
                      <span>Criar Espaço da Empresa</span>
                    </Button>

                    <Button
                      size="sm"
                      type="button"
                      onClick={() => onLoginSuccess()}
                      style={{
                        color: "var(--color-outline)",
                        fontSize: "12px",
                      }}
                    >
                      Continuar no espaço individual por enquanto
                    </Button>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rodapé com Versão do App e Notificação de Atualização */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "4px 0",
            fontSize: "12px",
            color: "var(--color-on-surface-variant, #64748b)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Contexos Desktop</span>
            <span style={{ opacity: 0.5 }}>•</span>
            <span>v{version || "1.0.7"}</span>
          </div>

          {/* Banner de Atualização Disponível se houver */}
          {updateInfo?.status === "available-manual" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                borderRadius: "8px",
                background: "rgba(37, 99, 235, 0.1)",
                border: "1px solid rgba(37, 99, 235, 0.3)",
                color: "var(--color-primary, #3b82f6)",
                fontSize: "11.5px",
                fontWeight: 600,
              }}
            >
              <CloudDownload size={14} />
              <span>
                Nova versão{" "}
                {updateInfo.version ? `v${updateInfo.version} ` : ""}disponível
              </span>
              {updateInfo.downloadUrl && (
                <button
                  type="button"
                  onClick={() =>
                    window.desktopBridge?.openExternal?.(
                      updateInfo.downloadUrl!,
                    )
                  }
                  style={{
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "3px 8px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: "pointer",
                    marginLeft: "4px",
                  }}
                >
                  Baixar
                </button>
              )}
            </div>
          )}

          {updateInfo?.status === "downloaded" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#10b981",
                fontSize: "11.5px",
                fontWeight: 600,
              }}
            >
              <CloudDownload size={14} />
              <span>Atualização pronta para instalação</span>
              <button
                type="button"
                onClick={() => window.desktopBridge?.quitAndInstallUpdate?.()}
                style={{
                  background: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginLeft: "4px",
                }}
              >
                Reiniciar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
