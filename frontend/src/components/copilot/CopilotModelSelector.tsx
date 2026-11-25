import React, { useState, useRef, useEffect } from "react";

export interface ModelItem {
  id: string;
  name: string;
  badge?: string;
}

export interface DetectedProviderInfo {
  id: string;
  name: string;
  isAvailable: boolean;
  isAuthenticated: boolean;
  statusMessage?: string;
  models?: ModelItem[];
}

interface ProviderGroup {
  provider: string;
  providerName: string;
  icon: string;
  models: ModelItem[];
}

interface CopilotModelSelectorProps {
  activeModel: string;
  activeProvider: string;
  activeProviderId: string;
  agentModel?: string;
  claudeModel?: string;
  agentEffort?: "low" | "medium" | "high";
  detectedProviders?: DetectedProviderInfo[];
  isApiConfigured?: boolean;
  onSelectModel: (provider: string, modelId: string) => void;
  onSelectProvider: (providerId: string) => void;
  onSelectCliModel: (
    providerId: "antigravity" | "claude-code",
    modelId: string,
  ) => void;
  onSelectEffort?: (effort: "low" | "medium" | "high") => void;
  onOpenSettings: () => void;
}

const DEFAULT_API_MODELS_BY_PROVIDER: ProviderGroup[] = [
  {
    provider: "gemini",
    providerName: "Google Gemini",
    icon: "smart_toy",
    models: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Recomendado" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "Raciocínio" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", badge: "Super Rápido" },
    ],
  },
  {
    provider: "anthropic",
    providerName: "Anthropic Claude",
    icon: "auto_awesome",
    models: [
      { id: "claude-3-7-sonnet", name: "Claude 3.7 Sonnet", badge: "Híbrido" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", badge: "Código" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", badge: "Rápido" },
    ],
  },
  {
    provider: "openai",
    providerName: "OpenAI",
    icon: "psychology",
    models: [
      { id: "gpt-4o", name: "GPT-4o", badge: "Multimodal" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", badge: "Econômico" },
      { id: "o3-mini", name: "o3 Mini", badge: "Raciocínio" },
    ],
  },
  {
    provider: "ollama",
    providerName: "Ollama Local",
    icon: "terminal",
    models: [
      { id: "llama3.3", name: "Llama 3.3 70B", badge: "Local" },
      { id: "qwen2.5-coder", name: "Qwen 2.5 Coder", badge: "Código" },
      { id: "deepseek-r1", name: "DeepSeek R1", badge: "Local R1" },
    ],
  },
];

const FALLBACK_AGY_MODELS: ModelItem[] = [
  { id: "gemini-4-neon-medium", name: "Gemini 4 Neon", badge: "Medium" },
  { id: "gemini-4-carbon-medium", name: "Gemini 4 Carbon", badge: "Medium" },
  { id: "gemini-4-argon-medium", name: "Gemini 4 Argon", badge: "Medium" },
  { id: "gemini-4-hydrogen-medium", name: "Gemini 4 Hydrogen", badge: "Medium" },
  { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash", badge: "Medium" },
  { id: "claude-opus-5-5-medium", name: "Claude Opus 5.5", badge: "Medium" },
  { id: "claude-sonnet-5-5-medium", name: "Claude Sonnet 5.5", badge: "Medium" },
  { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B", badge: "Medium" },
];

const FALLBACK_CLAUDE_CLI_MODELS: ModelItem[] = [
  { id: "sonnet", name: "Claude Sonnet", badge: "Padrão" },
  { id: "opus", name: "Claude Opus", badge: "Avançado" },
  { id: "haiku", name: "Claude Haiku", badge: "Rápido" },
];

export const CopilotModelSelector: React.FC<CopilotModelSelectorProps> = ({
  activeModel,
  activeProvider,
  activeProviderId,
  agentModel,
  claudeModel,
  agentEffort = "medium",
  detectedProviders = [],
  isApiConfigured = false,
  onSelectModel,
  onSelectProvider,
  onSelectCliModel,
  onSelectEffort,
  onOpenSettings,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const agyInfo = detectedProviders.find((p) => p.id === "antigravity");
  const claudeInfo = detectedProviders.find((p) => p.id === "claude-code");

  const agyModels =
    agyInfo?.models && agyInfo.models.length > 0
      ? agyInfo.models
      : FALLBACK_AGY_MODELS;
  const claudeModels =
    claudeInfo?.models && claudeInfo.models.length > 0
      ? claudeInfo.models
      : FALLBACK_CLAUDE_CLI_MODELS;

  const isCliMode =
    activeProviderId === "antigravity" || activeProviderId === "claude-code";

  // Resolve human-readable label for the trigger pill
  const getTriggerLabel = (): { prefix: string; label: string } => {
    if (activeProviderId === "antigravity") {
      const found = agyModels.find((m) => m.id === agentModel);
      const label = found
        ? `${found.name}${found.badge ? ` ${found.badge}` : ""}`
        : agentModel || "Modelo padrão";
      return { prefix: "agy", label };
    }
    if (activeProviderId === "claude-code") {
      const found = claudeModels.find((m) => m.id === claudeModel);
      const label = found ? found.name : claudeModel || "Claude (Padrão)";
      return { prefix: "claude", label };
    }
    return { prefix: activeProvider.toUpperCase(), label: activeModel };
  };

  const trigger = getTriggerLabel();

  const connectorOptions = [
    {
      id: "antigravity",
      label: "Antigravity CLI",
      cmd: "agy",
      ready: Boolean(agyInfo?.isAvailable && agyInfo?.isAuthenticated),
    },
    {
      id: "claude-code",
      label: "Claude Code CLI",
      cmd: "claude",
      ready: Boolean(claudeInfo?.isAvailable && claudeInfo?.isAuthenticated),
    },
    {
      id: "direct-api",
      label: "API Direta",
      cmd: "api",
      ready: isApiConfigured,
    },
  ];

  const renderModelRow = (
    item: ModelItem,
    isSelected: boolean,
    onClick: () => void,
  ) => (
    <button
      key={item.id}
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
        padding: "6px 8px",
        borderRadius: "7px",
        border: "none",
        background: isSelected
          ? "rgba(37, 99, 235, 0.08)"
          : "transparent",
        color: isSelected
          ? "var(--color-primary, #2563eb)"
          : "var(--color-on-surface, #1e293b)",
        cursor: "pointer",
        fontSize: "12px",
        textAlign: "left",
        width: "100%",
        transition: "background 0.12s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontWeight: isSelected ? 600 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.name}
        </span>
        {item.badge && (
          <span
            style={{
              fontSize: "9.5px",
              padding: "1px 6px",
              borderRadius: "999px",
              background: isSelected
                ? "rgba(37, 99, 235, 0.12)"
                : "var(--color-surface-container, #f1f5f9)",
              color: isSelected
                ? "var(--color-primary, #2563eb)"
                : "var(--color-on-surface-variant, #64748b)",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            {item.badge}
          </span>
        )}
      </div>
      {isSelected && (
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: "15px",
            color: "var(--color-primary, #2563eb)",
            flexShrink: 0,
          }}
        >
          check
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={dropdownRef}
      className="ai-copilot-agent-wrapper"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        minWidth: 0,
        flex: "0 1 auto",
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Unified Connector + Model Trigger (integrated lightweight chat style) */}
      <button
        className="ai-copilot-agent-btn"
        type="button"
        title="Clique para trocar o conector (CLI / API) ou o modelo de IA"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          height: "26px",
          padding: "2px 8px",
          borderRadius: "8px",
          background: isOpen
            ? "var(--color-surface-container-high, #e2e8f0)"
            : "transparent",
          color: "var(--color-on-surface-variant, #475569)",
          border: "none",
          cursor: "pointer",
          fontSize: "11.5px",
          fontWeight: 500,
          transition: "background 0.15s ease, color 0.15s ease",
          maxWidth: "190px",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: "9px",
            fontWeight: 700,
            textTransform: "uppercase",
            padding: "1px 4px",
            borderRadius: "4px",
            background: isCliMode
              ? "rgba(16, 185, 129, 0.12)"
              : "rgba(37, 99, 235, 0.1)",
            color: isCliMode
              ? "#059669"
              : "var(--color-primary, #2563eb)",
            flexShrink: 0,
          }}
        >
          {trigger.prefix}
        </span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {trigger.label}
        </span>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: "14px",
            opacity: 0.7,
            transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(180deg)" : "none",
            flexShrink: 0,
          }}
        >
          expand_more
        </span>
      </button>

      {/* Unified Connector + Model Popover (opens upward from chat input) */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: 0,
            zIndex: 1100,
            width: "285px",
            maxWidth: "calc(100vw - 40px)",
            background: "var(--color-surface, #ffffff)",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.1)",
            padding: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxHeight: "420px",
            overflowY: "auto",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* 1. Connector Switcher */}
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--text-muted, #94a3b8)",
                padding: "0 4px",
              }}
            >
              Conector
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "3px",
                background: "var(--color-surface-container, #f1f5f9)",
                padding: "3px",
                borderRadius: "9px",
              }}
            >
              {connectorOptions.map((c) => {
                const isSelected = activeProviderId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectProvider(c.id)}
                    title={c.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "5px",
                      padding: "5px 6px",
                      borderRadius: "7px",
                      border: "none",
                      background: isSelected ? "#ffffff" : "transparent",
                      boxShadow: isSelected
                        ? "0 1px 2px rgba(15, 23, 42, 0.08)"
                        : "none",
                      color: isSelected
                        ? "var(--color-on-surface, #0f172a)"
                        : "var(--color-on-surface-variant, #64748b)",
                      fontSize: "11px",
                      fontWeight: isSelected ? 600 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: c.ready ? "#22c55e" : "#f59e0b",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ whiteSpace: "nowrap" }}>{c.cmd}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Models for the active connector */}
          <div
            style={{
              borderTop: "1px solid rgba(15, 23, 42, 0.06)",
              paddingTop: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                color: "var(--text-muted, #94a3b8)",
                padding: "0 4px 4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                {activeProviderId === "antigravity"
                  ? "Modelos Antigravity (agy)"
                  : activeProviderId === "claude-code"
                    ? "Modelos Claude Code"
                    : "Modelos API Direta"}
              </span>
            </div>

            {activeProviderId === "antigravity" && (
              <>
                {agyModels.map((m) =>
                  renderModelRow(m, agentModel === m.id, () => {
                    onSelectCliModel("antigravity", m.id);
                    setIsOpen(false);
                  }),
                )}

                {onSelectEffort && (
                  <div
                    style={{
                      marginTop: "6px",
                      paddingTop: "8px",
                      borderTop: "1px solid rgba(15, 23, 42, 0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "6px",
                      paddingLeft: "4px",
                      paddingRight: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        color: "var(--text-muted, #64748b)",
                      }}
                    >
                      Effort
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: "2px",
                        background: "var(--color-surface-container, #f1f5f9)",
                        padding: "2px",
                        borderRadius: "7px",
                      }}
                    >
                      {(["low", "medium", "high"] as const).map((eff) => {
                        const active = agentEffort === eff;
                        return (
                          <button
                            key={eff}
                            type="button"
                            onClick={() => onSelectEffort(eff)}
                            style={{
                              padding: "2px 8px",
                              borderRadius: "5px",
                              border: "none",
                              background: active ? "#ffffff" : "transparent",
                              boxShadow: active
                                ? "0 1px 2px rgba(15, 23, 42, 0.08)"
                                : "none",
                              color: active
                                ? "var(--color-primary, #2563eb)"
                                : "var(--text-muted, #64748b)",
                              fontSize: "10.5px",
                              fontWeight: active ? 600 : 500,
                              cursor: "pointer",
                              textTransform: "capitalize",
                              transition: "all 0.12s ease",
                            }}
                          >
                            {eff}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeProviderId === "claude-code" &&
              claudeModels.map((m) =>
                renderModelRow(
                  m,
                  (claudeModel || "sonnet") === m.id,
                  () => {
                    onSelectCliModel("claude-code", m.id);
                    setIsOpen(false);
                  },
                ),
              )}

            {activeProviderId === "direct-api" &&
              DEFAULT_API_MODELS_BY_PROVIDER.map((grp) => (
                <div
                  key={grp.provider}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                    marginTop: "4px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "var(--text-muted, #94a3b8)",
                      padding: "2px 8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "12px" }}
                    >
                      {grp.icon}
                    </span>
                    {grp.providerName}
                  </div>
                  {grp.models.map((m) =>
                    renderModelRow(m, activeModel === m.id, () => {
                      onSelectModel(grp.provider, m.id);
                      setIsOpen(false);
                    }),
                  )}
                </div>
              ))}
          </div>

          {/* 3. Footer Settings */}
          <div
            style={{
              borderTop: "1px solid rgba(15, 23, 42, 0.06)",
              paddingTop: "6px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "6px 8px",
                borderRadius: "7px",
                border: "none",
                background: "transparent",
                color: "var(--color-primary, #2563eb)",
                fontSize: "11.5px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px" }}
              >
                settings
              </span>
              Configurar Chaves & Caminhos
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
