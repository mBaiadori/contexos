import React, { useState, useRef, useEffect, useCallback } from "react";
import { marked } from "marked";
import { sanitizeHtml } from "../../utils/sanitize";
import { useAI } from "../../context/AIContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { SkillsHubModal } from "../modals/SkillsHubModal";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { RagSearchModal } from "./RagSearchModal";
import { useCopilotStore } from "../../stores/copilotStore";
import { API } from "../../services/api";
import { Button, IconButton } from "../ui";
import { CopilotModelSelector } from "./CopilotModelSelector";
import { CopilotContextBar } from "./CopilotContextBar";
import { CopilotPromptsSection } from "./CopilotPromptsSection";
import { CopilotSkillsBar } from "./CopilotSkillsBar";

interface AICopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPrompt?: () => void;
  onOpenHistory?: () => void;
  onOpenRaw?: () => void;
  onOpenContext?: () => void;
  onOpenSkills?: () => void;
  onApplyContent?: (content: string) => void;
}

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  isOpen,
  onClose,
  onOpenPrompt = () => {},
  onOpenHistory = () => {},
  onOpenRaw = () => {},
  onOpenContext = () => {},
  onOpenSkills = () => {},
  onApplyContent,
}) => {
  const {
    messages,
    isThinking,
    sendMessage,
    stopGeneration,
    templatePrompt,
    templateTitle,
    isTemplatePromptEnabled,
    toggleTemplatePrompt,
    docPrompt,
    isDocPromptEnabled,
    toggleDocPrompt,
    activeSkillIds,
    templateSkills,
    setActiveSkillId,
    setActiveSkillIds,
    toggleSkill,
    removeActiveSkill,
    isSkillsModalOpen,
    openSkillsModal,
    closeSkillsModal,
    isRawMode,
    setIsRawMode,
    activeProviderId,
    setActiveProviderId,
    pendingApproval,
    approveAction,
    rejectAction,
    aiSettings,
    openSettingsModal,
    quickSetModel,
    newChatSession,
    referencedDocs,
    isGlobalScope,
    removeReferencedDoc,
    setIsGlobalScope,
  } = useAI();
  const { activeRepo, setFileContent, tree } = useWorkspace();
  const [inputText, setInputText] = useState("");
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [inspectorFlash, setInspectorFlash] = useState<string | null>(null);

  // Skills state
  const [availableSkills, setAvailableSkills] = useState<any[]>([]);

  // Live Thinking Step & Timer
  const thinkingStep = useCopilotStore((s) => s.thinkingStep);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // RAG Hooks
  const ragReferences = useCopilotStore((s) => s.ragReferences);
  const openRagModal = useCopilotStore((s) => s.openRagModal);
  const removeRagReference = useCopilotStore((s) => s.removeRagReference);
  const isAutoRagEnabled = useCopilotStore((s) => s.isAutoRagEnabled);

  useEffect(() => {
    let interval: any;
    if (isThinking) {
      setElapsedSeconds(0);
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isThinking]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };



  // Load available skills from Hub & Project
  const loadSkills = useCallback(async () => {
    try {
      const [hubRes, projRes] = await Promise.all([
        API.getSkillsHub(),
        API.getSkillsProject(activeRepo?.name),
      ]);
      const hub = hubRes.ok && hubRes.data?.skills ? hubRes.data.skills : [];
      const proj =
        projRes.ok && projRes.data?.installed_skills
          ? projRes.data.installed_skills
          : [];

      const map = new Map<string, any>();
      for (const s of hub) {
        map.set(s.id, s);
      }
      for (const s of proj) {
        map.set(s.id, { ...map.get(s.id), ...s, isInstalled: true });
      }
      setAvailableSkills(Array.from(map.values()));
    } catch (err) {
      console.warn("[AICopilotPanel] Erro ao carregar skills:", err);
    }
  }, [activeRepo?.name]);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
    }
  }, [isOpen, loadSkills]);

  // Scroll state
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const isUserScrolledUp = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll on new messages or thinking state change, keeping scroll at latest position
  useEffect(() => {
    if (!isUserScrolledUp.current) {
      const timer = setTimeout(() => {
        scrollToBottom("smooth");
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [messages, isThinking, scrollToBottom]);

  // Initial scroll to bottom on panel open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        scrollToBottom("auto");
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, scrollToBottom]);

  const handleContainerScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isUp = distanceToBottom > 80;
    isUserScrolledUp.current = isUp;
    setShowScrollBottomBtn(isUp);
  };

  // Adjust textarea height dynamically up to 50% of the chat height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = Math.max(160, Math.floor(window.innerHeight * 0.45));
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = Math.min(Math.max(scrollHeight, 44), maxHeight);
      textareaRef.current.style.height = `${targetHeight}px`;
    }
  }, [inputText]);

  // --- DOM Element & Section Picker (Dev / Target Mode Inspector) ---
  const markInspectableBlocks = useCallback(() => {
    const containers = document.querySelectorAll(
      "main, .dash-views-container, .dash-subview, #workbench-content, #editor-container, .notion-editor-surface, .wiki-article, .dictionary-view, .doc-editor-container",
    );

    const selector =
      "h1, h2, h3, h4, h5, h6, table, pre, code, blockquote, p, .notion-block, .dash-card, .spec-card, .card, .dict-term-card, .dict-term-row, article section, li";

    containers.forEach((container) => {
      if (
        container.closest("#global-ai-pane") ||
        container.closest(".workbench-ai-pane") ||
        container.closest(".ai-copilot-prompt-sidebar")
      ) {
        return;
      }

      const elements = container.querySelectorAll(selector);
      elements.forEach((el) => {
        if (
          el.closest("#global-ai-pane") ||
          el.closest(".workbench-ai-pane") ||
          el.closest(".ai-copilot-prompt-sidebar") ||
          el.closest(".pane-resizer") ||
          el.closest("#ai-settings-modal") ||
          el.closest("nav") ||
          el.closest(".sidebar") ||
          el.closest(".dash-header") ||
          el.closest("#top-header")
        ) {
          return;
        }

        if (
          el.tagName === "P" &&
          (el.closest("blockquote") ||
            el.closest("table") ||
            el.closest(".notion-block") ||
            el.closest(".dict-term-card"))
        ) {
          return;
        }

        const text = el.textContent?.trim();
        if (!text || text.length < 2) return;

        const tag = el.tagName.toUpperCase();
        let tagLabel = "Bloco";
        if (tag.startsWith("H")) tagLabel = "Título";
        else if (tag === "TABLE") tagLabel = "Tabela";
        else if (tag === "PRE" || tag === "CODE") tagLabel = "Código";
        else if (tag === "BLOCKQUOTE") tagLabel = "Citação";
        else if (tag === "P") tagLabel = "Parágrafo";
        else if (tag === "LI") tagLabel = "Item";
        else if (
          el.classList.contains("dict-term-card") ||
          el.classList.contains("dict-term-row")
        )
          tagLabel = "Termo";
        else if (
          el.classList.contains("card") ||
          el.classList.contains("dash-card")
        )
          tagLabel = "Card";

        el.classList.add("ai-inspectable-block");
        el.setAttribute("data-ai-block-tag", tagLabel);
      });
    });
  }, []);

  const cleanseAndExtractText = (el: HTMLElement): string => {
    const tag = el.tagName.toUpperCase();

    if (tag === "TABLE" || el.querySelector("table")) {
      const table =
        tag === "TABLE" ? (el as HTMLTableElement) : el.querySelector("table")!;
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length > 0) {
        const tableLines: string[] = [];
        rows.forEach((r, idx) => {
          const cells = Array.from(r.querySelectorAll("th, td")).map(
            (c) => c.textContent?.trim().replace(/\|/g, "\\|") || "",
          );
          tableLines.push(`| ${cells.join(" | ")} |`);
          if (idx === 0) {
            tableLines.push(`| ${cells.map(() => "---").join(" | ")} |`);
          }
        });
        return tableLines.join("\n");
      }
    }

    if (tag === "PRE" || tag === "CODE") {
      return `\`\`\`\n${el.textContent?.trim() || ""}\n\`\`\``;
    }

    if (tag === "H1") return `# ${el.textContent?.trim() || ""}`;
    if (tag === "H2") return `## ${el.textContent?.trim() || ""}`;
    if (tag === "H3") return `### ${el.textContent?.trim() || ""}`;
    if (tag === "H4") return `#### ${el.textContent?.trim() || ""}`;
    if (tag === "LI") return `- ${el.textContent?.trim() || ""}`;

    const text = el.innerText || el.textContent || "";
    const clean = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");

    return clean;
  };

  const stopInspector = useCallback(() => {
    setIsInspectorActive(false);
    document.body.classList.remove("ai-inspecting-mode");
    document.querySelectorAll(".ai-inspectable-block").forEach((el) => {
      el.classList.remove("ai-inspectable-block");
      el.removeAttribute("data-ai-block-tag");
    });
  }, []);

  const startInspector = useCallback(() => {
    setIsInspectorActive(true);
    document.body.classList.add("ai-inspecting-mode");
    markInspectableBlocks();
  }, [markInspectableBlocks]);

  const toggleInspector = () => {
    if (isInspectorActive) {
      stopInspector();
    } else {
      startInspector();
    }
  };

  useEffect(() => {
    if (!isInspectorActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stopInspector();
      }
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (
        target.closest("#global-ai-pane") ||
        target.closest(".workbench-ai-pane") ||
        target.closest(".ai-copilot-prompt-sidebar") ||
        target.closest("#ai-inspector-toast-banner") ||
        target.closest(".pane-resizer") ||
        target.closest("#ai-settings-modal")
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const blockEl =
        target.closest(".ai-inspectable-block") ||
        target.closest(
          "h1, h2, h3, h4, h5, h6, table, pre, code, blockquote, p, ul, ol, li, .notion-block, .card, .dict-term-card, .dict-term-row, section, article, .dash-card",
        ) ||
        target;

      const extracted = cleanseAndExtractText(blockEl as HTMLElement);
      if (extracted && extracted.trim()) {
        const snippetToInsert = extracted.trim();
        setInputText((prev) => {
          if (!prev.trim()) return snippetToInsert;
          return `${prev.trim()}\n\n${snippetToInsert}`;
        });

        setInspectorFlash("Trecho capturado e anexado ao chat! ✨");
        setTimeout(() => setInspectorFlash(null), 2500);

        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isInspectorActive, stopInspector]);

  useEffect(() => {
    return () => {
      document.body.classList.remove("ai-inspecting-mode");
    };
  }, []);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isThinking) return;

    const textToSend = inputText.trim();
    setInputText("");

    if (isInspectorActive) {
      stopInspector();
    }

    isUserScrolledUp.current = false;
    await sendMessage(textToSend);
    setTimeout(() => scrollToBottom("smooth"), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleApplyToDoc = (text: string) => {
    if (onApplyContent) {
      onApplyContent(text);
    } else {
      setFileContent(text);
    }
  };

  const handleQuickModelSelect = async (provider: string, modelId: string) => {
    await quickSetModel(provider, modelId);
  };

  const activeModelDisplay =
    aiSettings?.model || aiSettings?.active_model || "gemini-2.5-flash";
  const activeProviderDisplay = aiSettings?.provider || "gemini";



  const extraActiveSkills = activeSkillIds.filter(
    (id) => !templateSkills.includes(id),
  );

  return (
    <>
      <div
        className="ai-pane-header"
        style={{ position: "relative", overflow: "visible", zIndex: 30 }}
      >
        {/* 1. Header: Quick Model Switcher */}
        <CopilotModelSelector
          activeModel={activeModelDisplay}
          activeProvider={activeProviderDisplay}
          onSelectModel={handleQuickModelSelect}
          onOpenSettings={openSettingsModal}
        />

        {/* Right Header Action Icons - Harmonized Alignment & Sizing */}
        <div
          className="ai-copilot-header-right"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            flexShrink: 0,
          }}
        >
          {/* New Chat Session Button */}
          <Button
            size="xs"
            variant="subtle"
            title="Iniciar nova conversa (arquiva a anterior no histórico)"
            onClick={newChatSession}
            icon={
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px" }}
              >
                add_comment
              </span>
            }
          >
            Novo Chat
          </Button>

          <Button
            size="xs"
            variant="ghost"
            title="Telemetria & Logs (Tokens, custos, payloads e chamadas de ferramentas)"
            onClick={onOpenRaw}
            icon={
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px" }}
              >
                query_stats
              </span>
            }
          >
            Telemetria
          </Button>

          <IconButton
            size="sm"
            variant="ghost"
            title="Linha de Raciocínio & Histórico de Sessões"
            onClick={onOpenHistory}
            icon={
              <span className="material-symbols-outlined icon-sm">history</span>
            }
          />

          <IconButton
            size="sm"
            variant="ghost"
            title="Recolher Assistente"
            onClick={onClose}
            icon={
              <span className="material-symbols-outlined icon-sm">close</span>
            }
          />
        </div>
      </div>

      {/* Mode & Skill Toolbar - Interactive Activation / Deactivation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          background: "var(--color-surface-container-low, #f8f9fa)",
          borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
          fontSize: "11px",
          position: "relative",
          zIndex: 25,
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            position: "relative",
          }}
        >
          {/* Harness / RAW Toggle */}
          <button
            type="button"
            onClick={() => setIsRawMode(!isRawMode)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "12px",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              background: isRawMode
                ? "var(--color-warning-container, #fef7e0)"
                : "var(--color-surface-container, #f1f3f4)",
              color: isRawMode
                ? "var(--color-warning, #b45309)"
                : "var(--text-muted, #64748b)",
              borderColor: isRawMode
                ? "var(--color-warning, #d97706)"
                : "var(--color-outline-variant, #cbd5e1)",
              transition: "all 0.15s ease",
            }}
            title={
              isRawMode
                ? "Modo RAW Ativo: Chamada direta sem ferramentas"
                : "Modo Agente Ativo: Com ferramentas e raciocínio multi-passos"
            }
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "13px" }}
            >
              {isRawMode ? "bolt" : "psychology"}
            </span>
            {isRawMode ? "RAW" : "Harness"}
          </button>

          {/* Provider Selector Pill */}
          {!isRawMode && (
            <button
              type="button"
              onClick={() =>
                setActiveProviderId(
                  activeProviderId === "antigravity"
                    ? "direct-api"
                    : "antigravity",
                )
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 8px",
                borderRadius: "12px",
                fontSize: "10.5px",
                fontWeight: 600,
                cursor: "pointer",
                border: "1px solid",
                background:
                  activeProviderId === "antigravity"
                    ? "rgba(34, 197, 94, 0.15)"
                    : "var(--color-surface-container, #f1f3f4)",
                color:
                  activeProviderId === "antigravity"
                    ? "#16a34a"
                    : "var(--text-muted, #64748b)",
                borderColor:
                  activeProviderId === "antigravity"
                    ? "#22c55e"
                    : "var(--color-outline-variant, #cbd5e1)",
                transition: "all 0.15s ease",
              }}
              title={
                activeProviderId === "antigravity"
                  ? "Agente Antigravity Conectado (Acesso Local à Máquina)"
                  : "Direct API (Modo Livre sem ferramentas de terminal)"
              }
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  backgroundColor:
                    activeProviderId === "antigravity" ? "#22c55e" : "#94a3b8",
                }}
              />
              {activeProviderId === "antigravity"
                ? "Antigravity"
                : "Direct API"}
            </button>
          )}

          {/* RAG Search Button (Top Bar) */}
          <button
            type="button"
            onClick={openRagModal}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              borderRadius: "12px",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              background:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "rgba(37, 99, 235, 0.15)"
                  : "var(--color-surface-container, #f1f3f4)",
              color:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "#2563eb"
                  : "var(--text-muted, #64748b)",
              borderColor:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "#3b82f6"
                  : "var(--color-outline-variant, #cbd5e1)",
              transition: "all 0.15s ease",
            }}
            title="Buscar e anexar fragmentos de outros documentos do projeto (Mini-RAG Local)"
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "14px",
                color:
                  ragReferences.length > 0 || isAutoRagEnabled
                    ? "#2563eb"
                    : "#64748b",
              }}
            >
              manage_search
            </span>
            <span>
              RAG
              {ragReferences.length > 0
                ? ` (${ragReferences.length})`
                : isAutoRagEnabled
                  ? " (Auto)"
                  : ""}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Document References & Global Scope Bar */}
      <CopilotContextBar
        referencedDocs={referencedDocs}
        isGlobalScope={isGlobalScope}
        tree={tree}
        onOpenContext={onOpenContext}
        onRemoveDoc={removeReferencedDoc}
        onSetGlobalScope={setIsGlobalScope}
      />

      {/* 2.1 Fixed Context Controls Bar: Context Prompts & Context Skills */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px",
          padding: "5px 12px",
          background: "var(--color-surface-container-low, #f8fafc)",
          borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
          position: "relative",
          zIndex: 20,
        }}
      >
        <CopilotPromptsSection
          templatePrompt={templatePrompt}
          templateTitle={templateTitle}
          isTemplatePromptEnabled={isTemplatePromptEnabled}
          onToggleTemplatePrompt={toggleTemplatePrompt}
          docPrompt={docPrompt}
          isDocPromptEnabled={isDocPromptEnabled}
          onToggleDocPrompt={toggleDocPrompt}
          onOpenPrompt={onOpenPrompt}
        />

        <CopilotSkillsBar
          templateSkills={templateSkills}
          activeSkillIds={activeSkillIds}
          extraActiveSkills={extraActiveSkills}
          availableSkills={availableSkills}
          onToggleSkill={toggleSkill}
          onRemoveActiveSkill={removeActiveSkill}
          onClearAllSkills={() => setActiveSkillIds([])}
          onOpenSkillsHub={() => {
            if (onOpenSkills) onOpenSkills();
            else openSkillsModal();
          }}
        />
      </div>

      {/* 3. Scrollable Message History Stream with Robust Scroll Management */}
      <div
        ref={messagesContainerRef}
        onScroll={handleContainerScroll}
        className="ai-messages-scroll ai-copilot-messages-container"
        style={{ position: "relative" }}
      >
        {/* Default Welcome Message */}
        <div className="chat-bubble ai">
          <div className="ai-reply-content">
            <p style={{ margin: 0 }}>
              {isGlobalScope || referencedDocs.length === 0
                ? "🌐 Operando em Modo Global. Posso responder sobre todo o repositório, cruzar arquivos ou criar novas especificações. Para focar em um arquivo específico, anexe-o na barra acima!"
                : `Pareando com você em ${referencedDocs.length > 1 ? `${referencedDocs.length} documentos` : referencedDocs[0]}. Pergunte, solicite refatorações ou use o alvo (🎯) para capturar trechos da tela!`}
            </p>
          </div>
        </div>

        {/* Dynamic Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.sender === "user" ? "user" : "ai"}`}
          >
            <div
              className={
                msg.sender === "user"
                  ? "user-reply-content"
                  : "ai-reply-content"
              }
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(marked.parse(msg.content) as string),
              }}
            />

            {/* Tool Execution Timeline */}
            {msg.tool_calls && msg.tool_calls.length > 0 && (
              <div
                style={{
                  margin: "8px 0",
                  padding: "8px 10px",
                  borderRadius: "8px",
                  background: "var(--color-surface-container-high, #0f172a)",
                  border: "1px solid var(--color-outline-variant, #334155)",
                  fontSize: "11px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    color: "#818cf8",
                    fontWeight: 600,
                    marginBottom: "6px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "14px" }}
                  >
                    build
                  </span>
                  Ações do Agente ({msg.tool_calls.length} ferramentas):
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {msg.tool_calls.map((tc, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "3px 6px",
                        background: "var(--color-surface-container, #020617)",
                        borderRadius: "4px",
                        border:
                          "1px solid var(--color-outline-variant, #1e293b)",
                        fontFamily: "monospace",
                        fontSize: "10px",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--color-on-surface, #e2e8f0)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            color: tc.result?.success ? "#34d399" : "#f87171",
                          }}
                        >
                          ●
                        </span>
                        {tc.tool}
                      </span>
                      <span
                        style={{
                          color: tc.result?.success ? "#34d399" : "#f87171",
                        }}
                      >
                        {tc.result?.success ? "OK" : "Erro"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proposed Patch / Diff Review Card */}
            {msg.diff && msg.diff.new_content && (
              <div
                style={{
                  margin: "8px 0",
                  padding: "10px",
                  borderRadius: "8px",
                  background: "rgba(99, 102, 241, 0.1)",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#a5b4fc",
                    fontWeight: 600,
                    fontSize: "12px",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                  >
                    difference
                  </span>
                  Proposta de Alteração: {msg.diff.path}
                </div>
                {msg.diff.rationale && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#cbd5e1",
                      fontStyle: "italic",
                      marginBottom: "8px",
                    }}
                  >
                    "{msg.diff.rationale}"
                  </div>
                )}
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  style={{
                    width: "100%",
                    padding: "6px",
                    fontSize: "11px",
                    fontWeight: 600,
                    borderRadius: "6px",
                  }}
                  onClick={() => handleApplyToDoc(msg.diff!.new_content)}
                >
                  Aceitar e Aplicar Alteração no Documento
                </button>
              </div>
            )}

            {msg.sender === "assistant" && (
              <div
                className="ai-bubble-actions"
                style={{
                  display: "flex",
                  gap: "6px",
                  marginTop: "8px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn btn-ghost btn-xs"
                  type="button"
                  style={{ fontSize: "11px", padding: "2px 6px" }}
                  onClick={() => copyToClipboard(msg.content)}
                  title="Copiar resposta"
                >
                  Copiar
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Interactive Pending Approval Card */}
        {pendingApproval && (
          <AgentApprovalCard
            prompt={pendingApproval.prompt}
            sessionId={pendingApproval.sessionId}
            providerName={
              activeProviderId === "antigravity"
                ? "Google Antigravity Agent"
                : "Agent"
            }
            onApprove={approveAction}
            onReject={rejectAction}
          />
        )}

        {isThinking && (
          <div
            className="chat-bubble ai thinking"
            style={{
              borderLeft: "3px solid #3b82f6",
              background: "var(--color-surface-container, #1e293b)",
              padding: "8px 12px",
            }}
          >
            <div
              className="ai-reply-content"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                width: "100%",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <span
                  className="material-symbols-outlined icon-xs"
                  style={{
                    animation: "spin 2s linear infinite",
                    color: "#60a5fa",
                    fontSize: "15px",
                  }}
                >
                  sync
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--color-on-surface, #f1f5f9)",
                    fontWeight: 500,
                  }}
                >
                  {thinkingStep || "Processando requisição..."}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted, #94a3b8)",
                    fontFamily: "monospace",
                    marginLeft: "4px",
                  }}
                >
                  ⏱️ {formatElapsed(elapsedSeconds)}
                </span>
              </div>
              <button
                type="button"
                onClick={stopGeneration}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 8px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  color: "#f87171",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                  marginLeft: "auto",
                }}
                title="Interromper execução do agente"
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "13px" }}
                >
                  stop_circle
                </span>
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => {
            isUserScrolledUp.current = false;
            scrollToBottom("smooth");
          }}
          style={{
            position: "absolute",
            bottom: "85px",
            right: "20px",
            zIndex: 40,
            background: "var(--color-primary, #2563eb)",
            color: "#ffffff",
            border: "none",
            borderRadius: "20px",
            padding: "5px 12px",
            fontSize: "11px",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "15px" }}
          >
            arrow_downward
          </span>
          Última mensagem
        </button>
      )}

      {/* 4. Floating Inspector Banner */}
      {isInspectorActive && (
        <div id="ai-inspector-toast-banner">
          <span
            className="material-symbols-outlined"
            style={{ color: "#60a5fa", fontSize: "18px" }}
          >
            ads_click
          </span>
          <span>
            Modo Alvo Ativo: Clique nos blocos da tela para adicionar ao chat
          </span>
          <span
            className="ai-kbd-badge"
            onClick={stopInspector}
            title="Finalizar modo de seleção"
          >
            ESC
          </span>
        </div>
      )}

      {/* 5. Full-Width Prompt Container */}
      <form className="ai-copilot-input-container" onSubmit={handleSend}>
        {inspectorFlash && (
          <div className="ai-inspector-mini-toast">{inspectorFlash}</div>
        )}

        {/* Attached RAG Reference Chips */}
        {ragReferences.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
              padding: "4px 8px",
              marginBottom: "4px",
              borderRadius: "8px",
              background: "rgba(37, 99, 235, 0.06)",
              border: "1px dashed rgba(37, 99, 235, 0.25)",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--color-primary, #2563eb)",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "12px" }}
              >
                attachment
              </span>
              RAG ({ragReferences.length}):
            </span>
            {ragReferences.map((ref) => (
              <span
                key={ref.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "#ffffff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "6px",
                  padding: "1px 6px",
                  fontSize: "10.5px",
                  color: "#1e40af",
                  maxWidth: "200px",
                }}
                title={ref.snippet}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ref.relativePath}
                </span>
                <span
                  className="material-symbols-outlined"
                  onClick={() => removeRagReference(ref.id)}
                  style={{
                    fontSize: "12px",
                    cursor: "pointer",
                    color: "#ef4444",
                    opacity: 0.8,
                  }}
                  title="Remover referência"
                >
                  close
                </span>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="ai-copilot-textarea"
          placeholder="Mensagem para o Agente... (Shift+Enter para nova linha)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <div className="ai-input-bottom-bar">
          <Button
            size="xs"
            variant={isInspectorActive ? "primary" : "subtle"}
            active={isInspectorActive}
            type="button"
            onClick={toggleInspector}
            icon={
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                ads_click
              </span>
            }
            title={
              isInspectorActive
                ? "Desativar seleção de blocos (ESC)"
                : "Alvo: Selecionar trechos na tela para colar no chat"
            }
          >
            {isInspectorActive ? "Alvo Ativo" : "Capturar"}
          </Button>

          <div className="ai-input-actions-right">
            {!isThinking && <span className="ai-input-hint">Enter ↵</span>}
            {isThinking ? (
              <IconButton
                size="sm"
                variant="danger"
                type="button"
                onClick={stopGeneration}
                title="Parar execução atual"
                icon={
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "18px" }}
                  >
                    stop
                  </span>
                }
              />
            ) : (
              <IconButton
                size="sm"
                variant="primary"
                type="submit"
                disabled={!inputText.trim()}
                title="Enviar mensagem (Enter)"
                icon={
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "18px" }}
                  >
                    arrow_upward
                  </span>
                }
              />
            )}
          </div>
        </div>
      </form>

      {/* Skills Hub Modal */}
      <SkillsHubModal
        isOpen={isSkillsModalOpen}
        onClose={closeSkillsModal}
        activeRepo={activeRepo?.name}
        onSkillSelect={(skill) => {
          setActiveSkillId(skill.id);
          closeSkillsModal();
        }}
      />

      {/* Local Workspace RAG Search Modal */}
      <RagSearchModal />
    </>
  );
};
