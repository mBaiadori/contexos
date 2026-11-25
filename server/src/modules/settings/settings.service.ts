import { loadConfig, saveConfig } from "../../config/storage.js";
import { validateUrlForSSRF } from "../../utils/ssrf-guard.js";

export class SettingsService {
  getSettings() {
    const cfg = loadConfig();
    return {
      settings: cfg.settings || {
        template_creator_prompt: "",
        global_system_prompt: "",
        auto_pr_on_save: false,
      },
      ai_settings: cfg.ai_settings || {},
    };
  }

  saveSettings(settingsData: any) {
    const cfg = loadConfig();
    cfg.settings = {
      ...cfg.settings,
      ...settingsData,
    };
    saveConfig(cfg);
    return {
      success: true,
      settings: cfg.settings,
    };
  }

  getAISettings() {
    const cfg = loadConfig();
    const ai = cfg.ai_settings || {
      provider: "gemini",
      model: "gemini-2.5-flash",
      api_key: process.env.GEMINI_API_KEY || "",
      custom_endpoint: "http://localhost:11434/v1",
    };

    return {
      provider: ai.provider,
      model: ai.model,
      active_model: ai.model,
      has_key: Boolean(ai.api_key || process.env.GEMINI_API_KEY),
      custom_endpoint: ai.custom_endpoint,
      default_provider:
        ai.default_provider ||
        (cfg.settings as any)?.default_provider ||
        "antigravity",
      antigravity_cli_path: (cfg.settings as any)?.antigravity_cli_path || "",
      claude_cli_path: (cfg.settings as any)?.claude_cli_path || "",
      agent_effort: (cfg.settings as any)?.agent_effort || "medium",
      agent_model: (cfg.settings as any)?.agent_model || "",
      claude_model: (cfg.settings as any)?.claude_model || "",
    };
  }

  saveAISettings(aiData: any) {
    const cfg = loadConfig();
    cfg.ai_settings = {
      ...cfg.ai_settings,
      ...aiData,
    };
    if (
      aiData.antigravity_cli_path !== undefined ||
      aiData.claude_cli_path !== undefined ||
      aiData.agent_effort !== undefined ||
      aiData.default_provider !== undefined ||
      aiData.agent_model !== undefined ||
      aiData.claude_model !== undefined
    ) {
      cfg.settings = {
        ...cfg.settings,
        antigravity_cli_path:
          aiData.antigravity_cli_path ??
          (cfg.settings as any)?.antigravity_cli_path,
        claude_cli_path:
          aiData.claude_cli_path ?? (cfg.settings as any)?.claude_cli_path,
        agent_effort:
          aiData.agent_effort ?? (cfg.settings as any)?.agent_effort,
        agent_model: aiData.agent_model ?? (cfg.settings as any)?.agent_model,
        claude_model: aiData.claude_model ?? (cfg.settings as any)?.claude_model,
        default_provider:
          aiData.default_provider ?? (cfg.settings as any)?.default_provider,
      };
    }
    saveConfig(cfg);
    return {
      success: true,
      ai_settings: this.getAISettings(),
    };
  }

  async getAvailableModels(params?: {
    provider?: string;
    api_key?: string;
    custom_endpoint?: string;
  }) {
    const cfg = loadConfig();
    const activeProvider = (
      params?.provider ||
      cfg.ai_settings?.provider ||
      "gemini"
    ).toLowerCase();
    const activeApiKey =
      params?.api_key ||
      cfg.ai_settings?.api_key ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      "";
    const endpoint =
      params?.custom_endpoint ||
      cfg.ai_settings?.custom_endpoint ||
      "http://localhost:11434/v1";

    if (params?.custom_endpoint) {
      const isLocal = activeProvider === "ollama" || activeProvider === "local";
      await validateUrlForSSRF(params.custom_endpoint, { allowLocalhost: isLocal });
    }

    // Static curated fallback models
    const fallbackMap: Record<
      string,
      Array<{ id: string; name: string; description?: string }>
    > = {
      gemini: [
        {
          id: "gemini-2.5-flash",
          name: "Gemini 2.5 Flash",
          description:
            "Modelo mais rápido e versátil com suporte a ferramentas",
        },
        {
          id: "gemini-2.5-pro",
          name: "Gemini 2.5 Pro",
          description: "Modelo avançado para raciocínio complexo e codificação",
        },
        {
          id: "gemini-1.5-flash",
          name: "Gemini 1.5 Flash",
          description: "Alta velocidade e eficiência de tokens",
        },
        {
          id: "gemini-1.5-pro",
          name: "Gemini 1.5 Pro",
          description: "Grande janela de contexto e raciocínio profundo",
        },
      ],
      openai: [
        {
          id: "gpt-4o",
          name: "GPT-4o",
          description: "Modelo multimodal topo de linha da OpenAI",
        },
        {
          id: "gpt-4o-mini",
          name: "GPT-4o Mini",
          description: "Modelo rápido e econômico",
        },
        {
          id: "o3-mini",
          name: "o3 Mini",
          description: "Modelo de raciocínio lógico avançado",
        },
        {
          id: "o1",
          name: "o1 Preview",
          description: "Raciocínio complexo para código e arquitetura",
        },
      ],
      anthropic: [
        {
          id: "claude-3-7-sonnet",
          name: "Claude 3.7 Sonnet",
          description: "Raciocínio híbrido e alta capacidade de código",
        },
        {
          id: "claude-3-5-sonnet-20241022",
          name: "Claude 3.5 Sonnet (Latest)",
          description: "Excelente para tarefas de desenvolvimento",
        },
        {
          id: "claude-3-5-haiku-20241022",
          name: "Claude 3.5 Haiku",
          description: "Ultrarrápido e econômico",
        },
      ],
      deepseek: [
        {
          id: "deepseek-chat",
          name: "DeepSeek V3 (Chat)",
          description: "Modelo de linguagem de uso geral de alta precisão",
        },
        {
          id: "deepseek-reasoner",
          name: "DeepSeek R1 (Reasoner)",
          description: "Modelo de raciocínio passo a passo",
        },
      ],
      ollama: [
        {
          id: "llama3.3",
          name: "Llama 3.3 70B",
          description: "Modelo aberto topo de linha da Meta",
        },
        {
          id: "llama3.2",
          name: "Llama 3.2",
          description: "Modelo local rápido",
        },
        {
          id: "qwen2.5-coder",
          name: "Qwen 2.5 Coder",
          description: "Especialista em programação",
        },
        {
          id: "deepseek-r1",
          name: "DeepSeek R1",
          description: "Raciocínio local",
        },
      ],
      local: [
        {
          id: "llama3.3",
          name: "Llama 3.3",
          description: "Modelo local Ollama",
        },
        {
          id: "llama3.2",
          name: "Llama 3.2",
          description: "Modelo local rápido",
        },
        {
          id: "qwen2.5-coder",
          name: "Qwen 2.5 Coder",
          description: "Especialista em código local",
        },
      ],
    };

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Consulta Dinâmica: Google Gemini API
    // ──────────────────────────────────────────────────────────────────────────
    if (activeProvider === "gemini") {
      const geminiKey =
        params?.api_key ||
        cfg.ai_settings?.api_key ||
        process.env.GEMINI_API_KEY ||
        "";
      if (geminiKey) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`;
          const res = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          });

          if (res.ok) {
            const data = (await res.json()) as {
              models?: Array<{
                name: string;
                displayName?: string;
                description?: string;
                supportedGenerationMethods?: string[];
              }>;
            };
            if (data.models && Array.isArray(data.models)) {
              // Filtrar apenas modelos que geram conteúdo
              const validModels = data.models
                .filter(
                  (m) =>
                    m.supportedGenerationMethods?.includes("generateContent") ||
                    m.name.includes("gemini"),
                )
                .map((m) => {
                  const cleanId = m.name.replace(/^models\//, "");
                  return {
                    id: cleanId,
                    name: m.displayName || cleanId,
                    description:
                      m.description || "Modelo oficial Google Gemini",
                  };
                });

              if (validModels.length > 0) {
                return {
                  provider: "gemini",
                  isDynamic: true,
                  models: validModels.map((m) => m.id),
                  detailedModels: validModels,
                  message: `Obtidos ${validModels.length} modelos dinamicamente via Google Gemini API.`,
                };
              }
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg =
              (errData as any)?.error?.message || `Status HTTP ${res.status}`;
            console.warn(
              `[SettingsService] Erro ao consultar modelos do Gemini: ${errMsg}`,
            );
          }
        } catch (err: any) {
          console.warn(
            `[SettingsService] Falha na requisição Gemini models: ${err.message || String(err)}`,
          );
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Consulta Dinâmica: OpenAI API
    // ──────────────────────────────────────────────────────────────────────────
    if (activeProvider === "openai") {
      const openaiKey =
        params?.api_key ||
        cfg.ai_settings?.api_key ||
        process.env.OPENAI_API_KEY ||
        "";
      if (openaiKey) {
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${openaiKey}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { data?: Array<{ id: string }> };
            if (data.data && Array.isArray(data.data)) {
              const chatModels = data.data
                .filter(
                  (m) =>
                    m.id.startsWith("gpt-") ||
                    m.id.startsWith("o1") ||
                    m.id.startsWith("o3") ||
                    m.id.startsWith("chatgpt"),
                )
                .map((m) => ({
                  id: m.id,
                  name: m.id,
                  description: "Modelo OpenAI Oficial",
                }))
                .sort((a, b) => a.id.localeCompare(b.id));

              if (chatModels.length > 0) {
                return {
                  provider: "openai",
                  isDynamic: true,
                  models: chatModels.map((m) => m.id),
                  detailedModels: chatModels,
                  message: `Obtidos ${chatModels.length} modelos via OpenAI API.`,
                };
              }
            }
          }
        } catch (err: any) {
          console.warn(
            `[SettingsService] Falha na consulta OpenAI models: ${err.message}`,
          );
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Consulta Dinâmica: Ollama / Local API
    // ──────────────────────────────────────────────────────────────────────────
    if (activeProvider === "ollama" || activeProvider === "local") {
      const baseUrl = (endpoint || "http://localhost:11434/v1").replace(
        /\/v1\/?$/,
        "",
      );
      try {
        const res = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            models?: Array<{ name: string }>;
          };
          if (
            data.models &&
            Array.isArray(data.models) &&
            data.models.length > 0
          ) {
            const localModels = data.models.map((m) => ({
              id: m.name,
              name: m.name,
              description: "Modelo Local Ollama",
            }));
            return {
              provider: activeProvider,
              isDynamic: true,
              models: localModels.map((m) => m.id),
              detailedModels: localModels,
              message: `Obtidos ${localModels.length} modelos locais do Ollama.`,
            };
          }
        }
      } catch {}
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Fallback: Retorna modelos curados e lista de provedores
    // ──────────────────────────────────────────────────────────────────────────
    const targetFallback = fallbackMap[activeProvider] || fallbackMap["gemini"];

    return {
      provider: activeProvider,
      isDynamic: false,
      models: targetFallback.map((m) => m.id),
      detailedModels: targetFallback,
      providers: [
        { id: "gemini", name: "Google Gemini", models: fallbackMap.gemini },
        { id: "openai", name: "OpenAI", models: fallbackMap.openai },
        {
          id: "anthropic",
          name: "Anthropic Claude",
          models: fallbackMap.anthropic,
        },
        { id: "deepseek", name: "DeepSeek API", models: fallbackMap.deepseek },
        { id: "ollama", name: "Ollama", models: fallbackMap.ollama },
      ],
      message: "Utilizando lista curada de modelos padrão.",
    };
  }
}

export const settingsService = new SettingsService();
