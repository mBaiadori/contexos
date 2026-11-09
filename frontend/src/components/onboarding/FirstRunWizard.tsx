import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Bot,
  FolderPlus,
  Building2,
  Plus,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  Check,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { Button, Input, FormField, Badge, Spinner } from "../ui";
import { API } from "../../services/api";
import { CreateOrgModal } from "../modals/CreateOrgModal";
import { LinkOrgModal } from "../modals/LinkOrgModal";
import { useWorkspace } from "../../context/WorkspaceContext";

interface FirstRunWizardProps {
  isOpen: boolean;
  onComplete: (repoName: string) => void;
  onCancel?: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({
  isOpen,
  onComplete,
  onCancel,
}) => {
  const { selectOrg } = useWorkspace();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: License
  const [licenseKey, setLicenseKey] = useState("");
  const [isTrial, setIsTrial] = useState(true);
  const [isActivatingLicense, setIsActivatingLicense] = useState(false);
  const [licenseSuccess, setLicenseSuccess] = useState(false);

  // Step 2: AI Provider & Key
  const [aiProvider, setAiProvider] = useState<
    "gemini" | "openai" | "anthropic" | "ollama"
  >("gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Step 3: Organização & Workspace
  const [orgs, setOrgs] = useState<
    Array<{
      login: string;
      full_name?: string;
      avatar_url?: string;
      description?: string;
    }>
  >([]);
  const [selectedOrgLogin, setSelectedOrgLogin] = useState<string>("");
  const [isLoadingOrgs, setIsLoadingOrgs] = useState<boolean>(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] =
    useState<boolean>(false);
  const [isLinkOrgModalOpen, setIsLinkOrgModalOpen] =
    useState<boolean>(false);
  const [createDemo, setCreateDemo] = useState(true);
  const [workspaceName, setWorkspaceName] = useState("context-os-demo");

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Carrega organizações do GitHub / local
  useEffect(() => {
    if (isOpen) {
      setIsLoadingOrgs(true);
      API.getOrgs()
        .then((res) => {
          if (res.ok && res.data?.orgs && res.data.orgs.length > 0) {
            setOrgs(res.data.orgs);
            setSelectedOrgLogin(res.data.orgs[0].login);
          } else {
            const fallbackOrg = {
              login: "principal",
              full_name: "Organização Principal",
            };
            setOrgs([fallbackOrg]);
            setSelectedOrgLogin("principal");
          }
        })
        .catch(() => {
          const fallbackOrg = {
            login: "principal",
            full_name: "Organização Principal",
          };
          setOrgs([fallbackOrg]);
          setSelectedOrgLogin("principal");
        })
        .finally(() => {
          setIsLoadingOrgs(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAi = async () => {
    if (!aiApiKey.trim() && aiProvider !== "ollama") {
      setAiTestResult({
        success: false,
        message: "Insira sua chave de API para testar.",
      });
      return;
    }

    setIsTestingAi(true);
    setAiTestResult(null);

    try {
      const res = await API.getAIModels({
        provider: aiProvider,
        api_key: aiApiKey.trim(),
      });

      if (res.ok && res.data?.models && res.data.models.length > 0) {
        setAiTestResult({
          success: true,
          message: `Conexão bem-sucedida! ${res.data.models.length} modelos disponíveis encontrados.`,
        });
        if (!aiModel && res.data.models[0]) {
          setAiModel(res.data.models[0]);
        }
      } else {
        setAiTestResult({
          success: false,
          message:
            res.data?.error ||
            "Não foi possível validar a chave com o provedor.",
        });
      }
    } catch {
      setAiTestResult({
        success: false,
        message: "Erro ao conectar ao servidor de validação.",
      });
    } finally {
      setIsTestingAi(false);
    }
  };

  const handleNextStep = async () => {
    if (currentStep === 1) {
      if (licenseKey.trim() && !isTrial) {
        setIsActivatingLicense(true);
        try {
          const res = await API.activateLicense(licenseKey.trim());
          if (res.ok && res.data?.success) {
            setLicenseSuccess(true);
          }
        } catch {
          // Permite avançar em modo carência
        } finally {
          setIsActivatingLicense(false);
        }
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const handleFinishOnboarding = async () => {
    setIsSubmitting(true);
    try {
      if (selectedOrgLogin) {
        await selectOrg(selectedOrgLogin);
      }
      const res = await API.completeOnboarding({
        license_key: licenseKey.trim() || undefined,
        ai_provider: aiProvider,
        ai_model: aiModel,
        ai_api_key: aiApiKey.trim() || undefined,
        create_demo_workspace: createDemo,
        workspace_name: workspaceName.trim() || "context-os-demo",
      });

      const activeRepo =
        res.data?.active_repo || workspaceName || "context-os-demo";
      onComplete(activeRepo);
    } catch (err) {
      console.error("Erro ao finalizar onboarding:", err);
      onComplete("context-os-demo");
    } finally {
      setIsSubmitting(false);
    }
  };

  const providerLinks: Record<
    string,
    { url: string; label: string; defaultModel: string }
  > = {
    gemini: {
      url: "https://aistudio.google.com/app/apikey",
      label: "Obter Chave no Google AI Studio (Grátis)",
      defaultModel: "gemini-2.5-flash",
    },
    openai: {
      url: "https://platform.openai.com/api-keys",
      label: "Obter Chave na OpenAI Platform",
      defaultModel: "gpt-4o-mini",
    },
    anthropic: {
      url: "https://console.anthropic.com/settings/keys",
      label: "Obter Chave no Console Anthropic",
      defaultModel: "claude-3-7-sonnet-20250219",
    },
    ollama: {
      url: "https://ollama.com",
      label: "Download do Ollama (Local/Offline)",
      defaultModel: "llama3:latest",
    },
  };

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
    >
      <div
        style={{
          width: "100%",
          maxWidth: "700px",
          backgroundColor: "var(--color-surface, #ffffff)",
          color: "var(--color-on-surface, #1e293b)",
          borderRadius: "16px",
          border: "1px solid var(--color-outline-variant, #e2e8f0)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "fadeIn 0.25s ease-out",
        }}
      >
        {/* Header com Stepper */}
        <div
          style={{
            padding: "24px 32px 18px",
            borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background:
                    "linear-gradient(135deg, var(--color-primary, #1a73e8) 0%, #6366f1 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(26, 115, 232, 0.25)",
                }}
              >
                <Sparkles size={22} />
              </div>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                >
                  Configuração Inicial do Contexos
                </h2>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--color-on-surface-variant, #64748b)",
                  }}
                >
                  Assistente de primeiros passos para uso imediato
                </span>
              </div>
            </div>
            <Badge variant="neutral">Passo {currentStep} de 4</Badge>
          </div>

          {/* Stepper Visual */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {[
              { step: 1, label: "Licença", icon: KeyRound },
              { step: 2, label: "Inteligência Artificial", icon: Bot },
              { step: 3, label: "Workspace", icon: FolderPlus },
              { step: 4, label: "Pronto", icon: CheckCircle2 },
            ].map(({ step, label, icon: Icon }) => {
              const isDone = currentStep > step;
              const isActive = currentStep === step;
              return (
                <div
                  key={step}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    gap: "6px",
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      backgroundColor: isDone
                        ? "#10b981"
                        : isActive
                          ? "var(--color-primary, #1a73e8)"
                          : "var(--color-surface-container-high, #e2e8f0)",
                      color:
                        isDone || isActive
                          ? "#ffffff"
                          : "var(--color-on-surface-variant, #64748b)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s",
                    }}
                  >
                    {isDone ? <Check size={14} /> : <Icon size={14} />}
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: isActive ? 600 : 500,
                      color: isActive
                        ? "var(--color-on-surface, #0f172a)"
                        : "var(--color-on-surface-variant, #64748b)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                  {step < 4 && (
                    <div
                      style={{
                        flex: 1,
                        height: "2px",
                        backgroundColor: isDone
                          ? "#10b981"
                          : "var(--color-outline-variant, #e2e8f0)",
                        margin: "0 4px",
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conteúdo do Passo */}
        <div
          style={{
            padding: "28px 32px",
            minHeight: "340px",
            overflowY: "auto",
          }}
        >
          {/* PASSO 1: Licença */}
          {currentStep === 1 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div>
                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                >
                  Ativação de Licença ou Modo Avaliação
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "var(--color-on-surface-variant, #64748b)",
                    lineHeight: 1.5,
                  }}
                >
                  Insira sua chave de licença comercial do Contexos ou utilize
                  o modo gratuito de avaliação com todos os recursos
                  habilitados.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "10px",
                }}
              >
                <div
                  onClick={() => setIsTrial(true)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: isTrial
                      ? "2px solid var(--color-primary, #1a73e8)"
                      : "1px solid var(--color-outline-variant, #e2e8f0)",
                    backgroundColor: isTrial
                      ? "var(--color-primary-container, #e8f0fe)"
                      : "var(--color-surface-container-low, #f8fafc)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: isTrial
                          ? "var(--color-primary, #1a73e8)"
                          : "var(--color-on-surface, #0f172a)",
                      }}
                    >
                      Modo Avaliação
                    </span>
                    {isTrial && <Badge variant="primary">Selecionado</Badge>}
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-on-surface-variant, #64748b)",
                    }}
                  >
                    Acesso imediato para teste sem necessidade de cartão ou
                    chave.
                  </span>
                </div>

                <div
                  onClick={() => setIsTrial(false)}
                  style={{
                    padding: "16px",
                    borderRadius: "12px",
                    border: !isTrial
                      ? "2px solid var(--color-primary, #1a73e8)"
                      : "1px solid var(--color-outline-variant, #e2e8f0)",
                    backgroundColor: !isTrial
                      ? "var(--color-primary-container, #e8f0fe)"
                      : "var(--color-surface-container-low, #f8fafc)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "14px",
                        color: !isTrial
                          ? "var(--color-primary, #1a73e8)"
                          : "var(--color-on-surface, #0f172a)",
                      }}
                    >
                      Tenho uma Licença Pro
                    </span>
                    {!isTrial && <Badge variant="primary">Selecionado</Badge>}
                  </div>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-on-surface-variant, #64748b)",
                    }}
                  >
                    Ativar chave comercial definitiva com suporte prioritário.
                  </span>
                </div>
              </div>

              {!isTrial && (
                <FormField label="Chave de Licença (Ex: CTX-XXXX-XXXX-XXXX)">
                  <Input
                    placeholder="Cole sua chave aqui..."
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value)}
                  />
                </FormField>
              )}

              {licenseSuccess && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    color: "#059669",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 500,
                  }}
                >
                  <ShieldCheck size={18} />
                  <span>Licença validada e vinculada a este dispositivo.</span>
                </div>
              )}
            </div>
          )}

          {/* PASSO 2: Inteligência Artificial */}
          {currentStep === 2 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div>
                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                >
                  Configuração do Provedor de IA
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "var(--color-on-surface-variant, #64748b)",
                    lineHeight: 1.5,
                  }}
                >
                  O Contexos se conecta diretamente aos provedores de ponta.
                  Sua chave fica salva exclusivamente na sua máquina de forma
                  criptografada.
                </p>
              </div>

              {/* Seletor de Provedor */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "10px",
                }}
              >
                {[
                  { id: "gemini", label: "Google Gemini", sub: "Recomendado" },
                  { id: "openai", label: "OpenAI (GPT)", sub: "GPT-4o" },
                  { id: "anthropic", label: "Anthropic", sub: "Claude 3.7" },
                  { id: "ollama", label: "Ollama", sub: "Local / Offline" },
                ].map((p) => {
                  const isSelected = aiProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setAiProvider(p.id as any);
                        setAiModel(providerLinks[p.id]?.defaultModel || "");
                        setAiTestResult(null);
                      }}
                      style={{
                        padding: "12px 10px",
                        borderRadius: "10px",
                        border: isSelected
                          ? "2px solid var(--color-primary, #1a73e8)"
                          : "1px solid var(--color-outline-variant, #e2e8f0)",
                        backgroundColor: isSelected
                          ? "var(--color-primary-container, #e8f0fe)"
                          : "var(--color-surface-container-low, #f8fafc)",
                        color: isSelected
                          ? "var(--color-primary, #1a73e8)"
                          : "var(--color-on-surface, #0f172a)",
                        cursor: "pointer",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "4px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "13px" }}>
                        {p.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: isSelected
                            ? "var(--color-primary, #1a73e8)"
                            : "var(--color-on-surface-variant, #64748b)",
                          fontWeight: isSelected ? 500 : 400,
                        }}
                      >
                        {p.sub}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Campo de Chave de API */}
              {aiProvider !== "ollama" ? (
                <FormField
                  label={`Chave de API do ${aiProvider.toUpperCase()}`}
                  helperText={
                    <a
                      href={providerLinks[aiProvider]?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-primary, #1a73e8)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      {providerLinks[aiProvider]?.label}{" "}
                      <ExternalLink size={12} />
                    </a>
                  }
                >
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Input
                      type="password"
                      placeholder={`Cole sua API Key do ${aiProvider}...`}
                      value={aiApiKey}
                      onChange={(e) => {
                        setAiApiKey(e.target.value);
                        setAiTestResult(null);
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="secondary"
                      onClick={handleTestAi}
                      disabled={isTestingAi || !aiApiKey.trim()}
                      style={{
                        whiteSpace: "nowrap",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {isTestingAi ? (
                        <Spinner size="sm" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Testar
                    </Button>
                  </div>
                </FormField>
              ) : (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "8px",
                    backgroundColor:
                      "var(--color-surface-container-low, #f8fafc)",
                    border: "1px solid var(--color-outline-variant, #e2e8f0)",
                    fontSize: "13px",
                    color: "var(--color-on-surface-variant, #64748b)",
                  }}
                >
                  O Ollama roda localmente em{" "}
                  <code>http://localhost:11434</code>. Certifique-se de que o
                  aplicativo Ollama está em execução no seu computador.
                </div>
              )}

              {/* Resultado do Teste de Conexão */}
              {aiTestResult && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    backgroundColor: aiTestResult.success
                      ? "rgba(16, 185, 129, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${aiTestResult.success ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                    color: aiTestResult.success ? "#059669" : "#dc2626",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 500,
                  }}
                >
                  {aiTestResult.success ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <span>{aiTestResult.message}</span>
                </div>
              )}
            </div>
          )}

          {/* PASSO 3: Organização & Workspace */}
          {currentStep === 3 && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "20px" }}
            >
              <div>
                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                >
                  Organização & Workspace
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "var(--color-on-surface-variant, #64748b)",
                    lineHeight: 1.5,
                  }}
                >
                  Selecione a Organização que atuará como root dos seus
                  repositórios e projetos, ou crie uma nova organização.
                </p>
              </div>

              {/* Seletor de Organização */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-on-surface, #0f172a)",
                    }}
                  >
                    Organização Principal
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setIsLinkOrgModalOpen(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-primary, #1a73e8)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 6px",
                      }}
                    >
                      <Link2 size={13} /> Vincular
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCreateOrgModalOpen(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--color-on-surface-variant, #64748b)",
                        fontSize: "12px",
                        fontWeight: 500,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "2px 6px",
                      }}
                    >
                      <Plus size={13} /> Criar no GitHub
                    </button>
                  </div>
                </div>

                {isLoadingOrgs ? (
                  <div
                    style={{
                      padding: "20px",
                      textAlign: "center",
                      color: "var(--color-on-surface-variant, #64748b)",
                    }}
                  >
                    <Spinner size="sm" /> Carregando organizações...
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {orgs.map((org) => {
                      const isSelected = selectedOrgLogin === org.login;
                      return (
                        <div
                          key={org.login}
                          onClick={() => setSelectedOrgLogin(org.login)}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "10px",
                            border: isSelected
                              ? "2px solid var(--color-primary, #1a73e8)"
                              : "1px solid var(--color-outline-variant, #e2e8f0)",
                            backgroundColor: isSelected
                              ? "var(--color-primary-container, #e8f0fe)"
                              : "var(--color-surface-container-low, #f8fafc)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {org.avatar_url ? (
                            <img
                              src={org.avatar_url}
                              alt={org.login}
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "6px",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "28px",
                                height: "28px",
                                borderRadius: "6px",
                                backgroundColor: isSelected
                                  ? "var(--color-primary, #1a73e8)"
                                  : "#e2e8f0",
                                color: isSelected ? "#ffffff" : "#64748b",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <Building2 size={16} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "13px",
                                color: isSelected
                                  ? "var(--color-primary, #1a73e8)"
                                  : "var(--color-on-surface, #0f172a)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {org.full_name || org.login}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color:
                                  "var(--color-on-surface-variant, #64748b)",
                              }}
                            >
                              @{org.login}
                            </div>
                          </div>
                          {isSelected && <Badge variant="primary">Ativa</Badge>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Estrutura do Workspace Inicial */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginTop: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-on-surface, #0f172a)",
                  }}
                >
                  Repositório Inicial na Organização
                </span>

                <div
                  onClick={() => setCreateDemo(true)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: createDemo
                      ? "2px solid var(--color-primary, #1a73e8)"
                      : "1px solid var(--color-outline-variant, #e2e8f0)",
                    backgroundColor: createDemo
                      ? "var(--color-primary-container, #e8f0fe)"
                      : "var(--color-surface-container-low, #f8fafc)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "8px",
                      backgroundColor: "rgba(26, 115, 232, 0.15)",
                      color: "var(--color-primary, #1a73e8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Sparkles size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "2px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "13px",
                          color: createDemo
                            ? "var(--color-primary, #1a73e8)"
                            : "var(--color-on-surface, #0f172a)",
                        }}
                      >
                        Criar Repositório Demo de Especificações (Recomendado)
                      </span>
                      {createDemo && (
                        <Badge variant="primary">Recomendado</Badge>
                      )}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        color: "var(--color-on-surface-variant, #64748b)",
                        lineHeight: 1.4,
                      }}
                    >
                      Gera regras canônicas de governança, templates e árvore de
                      documentos estruturada.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setCreateDemo(false)}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    border: !createDemo
                      ? "2px solid var(--color-primary, #1a73e8)"
                      : "1px solid var(--color-outline-variant, #e2e8f0)",
                    backgroundColor: !createDemo
                      ? "var(--color-primary-container, #e8f0fe)"
                      : "var(--color-surface-container-low, #f8fafc)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: "34px",
                      height: "34px",
                      borderRadius: "8px",
                      backgroundColor:
                        "var(--color-surface-container-high, #e2e8f0)",
                      color: "var(--color-on-surface-variant, #64748b)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <FolderPlus size={18} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "2px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "13px",
                          color: !createDemo
                            ? "var(--color-primary, #1a73e8)"
                            : "var(--color-on-surface, #0f172a)",
                        }}
                      >
                        Criar Repositório Vazio com Nome Personalizado
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "12px",
                        color: "var(--color-on-surface-variant, #64748b)",
                        lineHeight: 1.4,
                      }}
                    >
                      Inicia uma pasta limpa pronta para receber novos arquivos.
                    </p>
                  </div>
                </div>

                {!createDemo && (
                  <FormField label="Nome do Repositório">
                    <Input
                      placeholder="meu-novo-projeto"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                    />
                  </FormField>
                )}
              </div>
            </div>
          )}

          {/* PASSO 4: Pronto */}
          {currentStep === 4 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                padding: "16px 0",
              }}
            >
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  marginBottom: "20px",
                  boxShadow: "0 8px 24px rgba(16, 185, 129, 0.25)",
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: "20px",
                  fontWeight: 600,
                  color: "var(--color-on-surface, #0f172a)",
                }}
              >
                Tudo Pronto para o Primeiro Uso!
              </h3>
              <p
                style={{
                  margin: "0 0 24px",
                  fontSize: "14px",
                  color: "var(--color-on-surface-variant, #64748b)",
                  maxWidth: "440px",
                  lineHeight: 1.5,
                }}
              >
                Organização <strong>{selectedOrgLogin}</strong> configurada. O
                Repositório{" "}
                <strong>{workspaceName || "context-os-demo"}</strong> está
                pronto para ser explorado.
              </p>

              <div
                style={{
                  width: "100%",
                  maxWidth: "440px",
                  padding: "16px",
                  borderRadius: "12px",
                  backgroundColor:
                    "var(--color-surface-container-low, #f8fafc)",
                  border: "1px solid var(--color-outline-variant, #e2e8f0)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  textAlign: "left",
                  fontSize: "13px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#059669",
                    fontWeight: 500,
                  }}
                >
                  <Check size={16} />{" "}
                  <span>Licença / Modo Avaliação Ativo</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#059669",
                    fontWeight: 500,
                  }}
                >
                  <Check size={16} />{" "}
                  <span>
                    Provedor de IA ({aiProvider.toUpperCase()}) Configurado
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    color: "#059669",
                    fontWeight: 500,
                  }}
                >
                  <Check size={16} />{" "}
                  <span>
                    Organização @{selectedOrgLogin} e Repositório Inicial
                    Vinculados
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer com Botões de Navegação */}
        <div
          style={{
            padding: "16px 32px",
            borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {currentStep > 1 && currentStep < 4 ? (
            <Button
              variant="secondary"
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <ArrowLeft size={16} /> Voltar
            </Button>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "10px" }}>
            {onCancel && currentStep < 4 && (
              <Button variant="ghost" onClick={onCancel}>
                Pular Configuração
              </Button>
            )}

            {currentStep < 4 ? (
              <Button
                variant="primary"
                onClick={handleNextStep}
                disabled={isActivatingLicense}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                Próximo <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleFinishOnboarding}
                disabled={isSubmitting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  backgroundColor: "#10b981",
                  borderColor: "#10b981",
                }}
              >
                {isSubmitting ? <Spinner size="sm" /> : <Sparkles size={16} />}
                Iniciar Contexos
              </Button>
            )}
          </div>
        </div>
      </div>

      <LinkOrgModal
        isOpen={isLinkOrgModalOpen}
        onClose={() => setIsLinkOrgModalOpen(false)}
        onLinked={(newOrg) => {
          setOrgs((prev) => {
            const exists = prev.some((o) => o.login === newOrg.login);
            if (exists) return prev;
            return [newOrg, ...prev];
          });
          setSelectedOrgLogin(newOrg.login);
          setIsLinkOrgModalOpen(false);
        }}
        onOpenCreate={() => {
          setIsLinkOrgModalOpen(false);
          setIsCreateOrgModalOpen(true);
        }}
      />

      <CreateOrgModal
        isOpen={isCreateOrgModalOpen}
        onClose={() => setIsCreateOrgModalOpen(false)}
        onOpenLinkModal={() => {
          setIsCreateOrgModalOpen(false);
          setIsLinkOrgModalOpen(true);
        }}
      />
    </div>
  );
};
