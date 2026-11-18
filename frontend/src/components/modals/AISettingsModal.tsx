import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAI } from "../../context/AIContext";
import { API } from "../../services/api";
import { SelectDropdown, type SelectOption } from "../common/SelectDropdown";
import {
  Modal,
  Button,
  FormField,
  Input,
  Badge,
  AlertBanner,
} from "../ui";
import {
  RefreshCw,
  Edit2,
  Cpu,
  Terminal,
  KeyRound,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

type ConnectionTab = "cli" | "api";

interface DetectedProvider {
  id: string;
  name: string;
  description: string;
  mode: string;
  isAvailable: boolean;
  isAuthenticated: boolean;
  statusMessage?: string;
}

const CLI_OPTIONS = [
  {
    id: "antigravity",
    name: "Antigravity CLI",
    command: "agy",
    badge: "Testado",
    desc: "Usa o agente e harness do Antigravity instalados no computador.",
    installUrl: "https://antigravity.google",
    authHint: "Se já instalou, autentique no terminal antes de usar.",
  },
  {
    id: "claude-code",
    name: "Claude Code CLI",
    command: "claude",
    badge: "CLI",
    desc: "Usa o agente oficial Claude Code instalado no computador.",
    installUrl: "https://docs.anthropic.com/en/docs/claude-code/overview",
    authHint: "Execute `claude` no terminal para concluir o login.",
  },
];

const API_PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    desc: "Flash & Pro",
    needsKey: true,
    hasEndpoint: false,
    keyUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "openai",
    name: "OpenAI",
    desc: "GPT-4o & o-series",
    needsKey: true,
    hasEndpoint: false,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    desc: "Claude Sonnet & Opus",
    needsKey: true,
    hasEndpoint: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek API",
    desc: "DeepSeek Chat & R1",
    needsKey: true,
    hasEndpoint: false,
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "local",
    name: "Ollama Local",
    desc: "Offline & Sem Chave",
    needsKey: false,
    hasEndpoint: true,
    defaultEndpoint: "http://localhost:11434/v1",
    keyUrl: "https://ollama.com",
  },
];

interface DetailedModelItem {
  id: string;
  name: string;
  description?: string;
}

export const AISettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    aiSettings,
    saveAISettings,
    activeProviderId,
    setActiveProviderId,
  } = useAI();

  const [activeTab, setActiveTab] = useState<ConnectionTab>("cli");
  const [selectedHarness, setSelectedHarness] = useState<string>("antigravity");
  const [antigravityCliPath, setAntigravityCliPath] = useState("");
  const [claudeCliPath, setClaudeCliPath] = useState("");
  const [detectedProviders, setDetectedProviders] = useState<DetectedProvider[]>([]);
  const [isCheckingCli, setIsCheckingCli] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [modelsList, setModelsList] = useState<DetailedModelItem[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDynamicList, setIsDynamicList] = useState(false);
  const [isCustomModelInput, setIsCustomModelInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const checkCliProviders = useCallback(async () => {
    setIsCheckingCli(true);
    try {
      const res = await API.getAIProviders();
      if (res.ok && res.data?.providers) {
        setDetectedProviders(res.data.providers);
      }
    } catch (err) {
      console.warn("[AISettingsModal] Erro ao detectar CLIs:", err);
    } finally {
      setIsCheckingCli(false);
    }
  }, []);

  useEffect(() => {
    if (!isSettingsModalOpen) return;

    setStatusMessage(null);
    checkCliProviders();

    const currentHarness =
      activeProviderId || aiSettings?.default_provider || "antigravity";
    if (currentHarness === "direct-api") {
      setActiveTab("api");
    } else {
      setActiveTab("cli");
      setSelectedHarness(currentHarness);
    }

    if (aiSettings) {
      const activeProv =
        aiSettings.active_provider || aiSettings.provider || "gemini";
      setSelectedProvider(activeProv);
      setModel(
        aiSettings.active_model ||
          aiSettings.model ||
          (activeProv === "gemini" ? "gemini-2.5-flash" : "gpt-4o"),
      );
      setAntigravityCliPath(aiSettings.antigravity_cli_path || "");
      setClaudeCliPath(aiSettings.claude_cli_path || "");
      const prov = aiSettings.providers?.[activeProv];
      setEndpoint(prov?.custom_endpoint || aiSettings.custom_endpoint || "");
    }
  }, [aiSettings, activeProviderId, isSettingsModalOpen, checkCliProviders]);

  const fetchModelsForProvider = useCallback(
    async (provId: string, customKey?: string, customEp?: string) => {
      setIsLoadingModels(true);
      try {
        const res = await API.getAIModels({
          provider: provId,
          api_key: customKey || apiKey || undefined,
          custom_endpoint: customEp || endpoint || undefined,
        });

        if (res.ok && res.data) {
          let items: DetailedModelItem[] = [];
          if (res.data.detailedModels && res.data.detailedModels.length > 0) {
            items = res.data.detailedModels;
          } else if (res.data.models && res.data.models.length > 0) {
            items = res.data.models.map((m: any) =>
              typeof m === "string" ? { id: m, name: m } : m,
            );
          }

          if (items.length > 0) {
            setModelsList(items);
            setIsDynamicList(Boolean(res.data.isDynamic));
            const exists = items.some((m) => m.id === model);
            if (!exists && items[0]) {
              setModel(items[0].id);
            }
          }
        }
      } catch (err) {
        console.warn("[AISettingsModal] Erro ao buscar modelos:", err);
      } finally {
        setIsLoadingModels(false);
      }
    },
    [apiKey, endpoint, model],
  );

  useEffect(() => {
    if (isSettingsModalOpen && activeTab === "api") {
      fetchModelsForProvider(selectedProvider);
    }
  }, [selectedProvider, isSettingsModalOpen, activeTab]);

  const selectOptions: SelectOption[] = useMemo(() => {
    if (modelsList.length === 0) {
      return [
        { value: model, label: model, description: "Modelo ativo selecionado" },
      ];
    }

    return modelsList.map((m) => {
      let badge: string | undefined;
      let badgeType:
        | "primary"
        | "success"
        | "warning"
        | "neutral"
        | "info" = "primary";

      if (m.id.includes("pro")) {
        badge = "Pro";
        badgeType = "warning";
      } else if (m.id.includes("flash")) {
        badge = "Flash";
        badgeType = "success";
      } else if (m.id.includes("reason") || m.id.includes("r1")) {
        badge = "Reasoner";
        badgeType = "info";
      }

      return {
        value: m.id,
        label: m.name !== m.id ? m.name : m.id,
        description: m.description || m.id,
        icon: "smart_toy",
        badge,
        badgeType,
      };
    });
  }, [modelsList, model]);

  if (!isSettingsModalOpen) return null;

  const currentProviderConfig =
    API_PROVIDERS.find((p) => p.id === selectedProvider) || API_PROVIDERS[0];

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const targetDefaultProvider =
      activeTab === "cli" ? selectedHarness : "direct-api";

    const success = await saveAISettings(
      selectedProvider,
      model,
      apiKey || undefined,
      endpoint || undefined,
      {
        default_provider: targetDefaultProvider,
        antigravity_cli_path: antigravityCliPath || undefined,
        claude_cli_path: claudeCliPath || undefined,
      },
    );

    setIsSaving(false);
    if (success) {
      setActiveProviderId(targetDefaultProvider);
      setStatusMessage({
        text:
          activeTab === "cli"
            ? "Conexão com CLI ativada!"
            : "Chave de API e modelo salvos!",
        type: "success",
      });
      setTimeout(() => {
        closeSettingsModal();
      }, 600);
    } else {
      setStatusMessage({
        text: "Erro ao salvar configurações.",
        type: "error",
      });
    }
  };

  return (
    <div id="ai-settings-modal">
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={closeSettingsModal}
        size="lg"
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Cpu size={20} style={{ color: "#10b981" }} />
            <span>Conectar IA do Copilot</span>
          </div>
        }
        subtitle="Escolha uma CLI instalada no computador ou informe uma Chave de API"
        footer={
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              width: "100%",
            }}
          >
            <Button variant="secondary" size="sm" onClick={closeSettingsModal}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={isSaving}
            >
              Salvar & Ativar
            </Button>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Seletor de Modo: CLI vs API Key */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: 4,
              borderRadius: 10,
              background: "var(--md-sys-color-surface-container, #f1f5f9)",
              border: "1px solid var(--md-sys-color-outline-variant, #e2e8f0)",
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab("cli")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                background:
                  activeTab === "cli"
                    ? "var(--md-sys-color-surface, #ffffff)"
                    : "transparent",
                color:
                  activeTab === "cli"
                    ? "var(--md-sys-color-primary, #0f172a)"
                    : "var(--md-sys-color-on-surface-variant, #64748b)",
                boxShadow:
                  activeTab === "cli" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <Terminal size={15} />
              CLI Instalada (Harness)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("api")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 600,
                background:
                  activeTab === "api"
                    ? "var(--md-sys-color-surface, #ffffff)"
                    : "transparent",
                color:
                  activeTab === "api"
                    ? "var(--md-sys-color-primary, #0f172a)"
                    : "var(--md-sys-color-on-surface-variant, #64748b)",
                boxShadow:
                  activeTab === "api" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <KeyRound size={15} />
              Chave de API
            </button>
          </div>

          {activeTab === "cli" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--md-sys-color-on-surface-variant, #64748b)",
                  }}
                >
                  Conecte-se às CLIs instaladas para aproveitar agentes e harness dedicados.
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={checkCliProviders}
                  disabled={isCheckingCli}
                  leftIcon={
                    <RefreshCw
                      size={13}
                      className={isCheckingCli ? "spinning" : ""}
                    />
                  }
                >
                  {isCheckingCli ? "Verificando..." : "Verificar"}
                </Button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {CLI_OPTIONS.map((cli) => {
                  const detected = detectedProviders.find((p) => p.id === cli.id);
                  const isAvailable = detected?.isAvailable ?? false;
                  const isAuthenticated = detected?.isAuthenticated ?? false;
                  const isSelected = selectedHarness === cli.id;

                  return (
                    <div
                      key={cli.id}
                      onClick={() => setSelectedHarness(cli.id)}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: isSelected
                          ? "2px solid #10b981"
                          : "1px solid var(--md-sys-color-outline-variant, #cbd5e1)",
                        background: isSelected
                          ? "rgba(16, 185, 129, 0.06)"
                          : "var(--md-sys-color-surface, #ffffff)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong style={{ fontSize: "14px" }}>{cli.name}</strong>
                          <code
                            style={{
                              fontSize: "11px",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background:
                                "var(--md-sys-color-surface-container, #f1f5f9)",
                            }}
                          >
                            {cli.command}
                          </code>
                          <Badge
                            variant={cli.id === "antigravity" ? "success" : "neutral"}
                            size="sm"
                          >
                            {cli.badge}
                          </Badge>
                        </div>

                        {isCheckingCli ? (
                          <Badge variant="neutral" size="sm">
                            Verificando...
                          </Badge>
                        ) : isAvailable && isAuthenticated ? (
                          <Badge variant="success" size="sm">
                            <CheckCircle2 size={11} style={{ marginRight: 4 }} />
                            Pronta
                          </Badge>
                        ) : isAvailable ? (
                          <Badge variant="warning" size="sm">
                            <AlertTriangle size={11} style={{ marginRight: 4 }} />
                            Falta login
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            <XCircle size={11} style={{ marginRight: 4 }} />
                            Não encontrada
                          </Badge>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--md-sys-color-on-surface-variant, #64748b)",
                        }}
                      >
                        {cli.desc}
                      </span>

                      {!isCheckingCli && (!isAvailable || !isAuthenticated) && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            paddingTop: 4,
                            borderTop:
                              "1px dashed var(--md-sys-color-outline-variant, #e2e8f0)",
                            fontSize: "11.5px",
                          }}
                        >
                          <span style={{ color: "#64748b" }}>
                            {!isAvailable
                              ? detected?.statusMessage ||
                                `Comando "${cli.command}" não encontrado no computador.`
                              : detected?.statusMessage || cli.authHint}
                          </span>
                          <a
                            href={cli.installUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              color: "#059669",
                              fontWeight: 600,
                              textDecoration: "none",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Site oficial
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <details style={{ fontSize: "12px", color: "#64748b" }}>
                <summary style={{ cursor: "pointer", fontWeight: 500 }}>
                  Avançado: caminho personalizado do executável (opcional)
                </summary>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <FormField label="Caminho do agy:">
                    <Input
                      placeholder="Detecção automática"
                      value={antigravityCliPath}
                      onChange={(e) => setAntigravityCliPath(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Caminho do claude:">
                    <Input
                      placeholder="Detecção automática"
                      value={claudeCliPath}
                      onChange={(e) => setClaudeCliPath(e.target.value)}
                    />
                  </FormField>
                </div>
              </details>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Grade de Seleção de Provedor */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 10,
                }}
              >
                {API_PROVIDERS.map((p) => {
                  const provState = aiSettings?.providers?.[p.id];
                  const isConfigured = provState ? provState.configured : false;
                  const isSelected = selectedProvider === p.id;

                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProvider(p.id);
                        if (p.id === "local" && !endpoint)
                          setEndpoint(p.defaultEndpoint || "");
                      }}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: isSelected
                          ? "2px solid #10b981"
                          : "1px solid var(--md-sys-color-outline-variant, #dadce0)",
                        background: isSelected
                          ? "rgba(16, 185, 129, 0.08)"
                          : "var(--md-sys-color-surface, #ffffff)",
                        cursor: "pointer",
                        transition: "all 0.16s ease",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "13px",
                            color: isSelected ? "#059669" : "inherit",
                          }}
                        >
                          {p.name}
                        </strong>
                        <input
                          type="radio"
                          name="ai-provider-radio"
                          value={p.id}
                          checked={isSelected}
                          onChange={() => setSelectedProvider(p.id)}
                          style={{ accentColor: "#10b981" }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--md-sys-color-on-surface-variant, #5f6368)",
                          marginTop: 2,
                          display: "block",
                        }}
                      >
                        {p.desc}
                      </span>
                      <div style={{ marginTop: 6 }}>
                        <Badge
                          variant={isConfigured ? "success" : "neutral"}
                          size="sm"
                          hasDot
                        >
                          {isConfigured ? "Configurado" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Modelo de IA */}
              <FormField
                label="Modelo de IA:"
                helperText={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 2,
                    }}
                  >
                    <span>
                      {isDynamicList
                        ? "Modelos carregados dinamicamente da API"
                        : "Lista padrão de modelos"}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={
                          <RefreshCw
                            size={12}
                            className={isLoadingModels ? "spinning" : ""}
                          />
                        }
                        onClick={() => {
                          setStatusMessage(null);
                          fetchModelsForProvider(selectedProvider, apiKey, endpoint);
                        }}
                        disabled={isLoadingModels}
                      >
                        {isLoadingModels ? "Consultando..." : "Atualizar"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Edit2 size={12} />}
                        onClick={() => setIsCustomModelInput(!isCustomModelInput)}
                      >
                        {isCustomModelInput ? "Usar Lista" : "Digitar"}
                      </Button>
                    </div>
                  </div>
                }
              >
                {isCustomModelInput ? (
                  <Input
                    id="ai-model-select"
                    placeholder="Ex: gemini-2.5-flash, gpt-4o"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                ) : (
                  <SelectDropdown
                    id="ai-model-select"
                    value={model}
                    options={selectOptions}
                    onChange={(val) => setModel(val)}
                    placeholder="Selecione o modelo de IA..."
                    searchable={selectOptions.length > 5}
                    searchPlaceholder="Filtrar modelos..."
                    leadingIcon="smart_toy"
                  />
                )}
              </FormField>

              {currentProviderConfig.needsKey && (
                <FormField
                  label={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                      }}
                    >
                      <span>Chave de API ({currentProviderConfig.name}):</span>
                      <a
                        href={currentProviderConfig.keyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: "11px",
                          color: "#059669",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Gerar chave
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  }
                >
                  <Input
                    id="ai-api-key"
                    type="password"
                    placeholder="Cole sua chave de API aqui"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onBlur={() => {
                      if (apiKey.trim()) {
                        fetchModelsForProvider(selectedProvider, apiKey, endpoint);
                      }
                    }}
                  />
                </FormField>
              )}

              {currentProviderConfig.hasEndpoint && (
                <FormField label="Endpoint Customizado (Ollama / Local):">
                  <Input
                    id="ai-custom-endpoint"
                    placeholder="http://localhost:11434/v1"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    onBlur={() =>
                      fetchModelsForProvider(selectedProvider, apiKey, endpoint)
                    }
                  />
                </FormField>
              )}
            </div>
          )}

          {statusMessage && (
            <AlertBanner
              type={statusMessage.type === "success" ? "success" : "error"}
              message={statusMessage.text}
              onClose={() => setStatusMessage(null)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};
