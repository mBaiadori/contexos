import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import { sanitizeHtml } from "../../utils/sanitize";
import { useAI } from "../../context/AIContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { SkillsHubModal } from "../modals/SkillsHubModal";
import { AgentApprovalCard } from "./AgentApprovalCard";
import { useCopilotStore } from "../../stores/copilotStore";
import { API } from "../../services/api";
import { Button, IconButton } from "../ui";
import { CopilotModelSelector } from "./CopilotModelSelector";
import type { ChatMediaAttachment } from "../../types";

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
    isTemplatePromptEnabled,
    docPrompt,
    isDocPromptEnabled,
    activeSkillIds,
    setActiveSkillId,
    isSkillsModalOpen,
    openSkillsModal,
    closeSkillsModal,
    isRawMode,
    setIsRawMode,
    activeProviderId,
    pendingApproval,
    approveAction,
    rejectAction,
    aiSettings,
    isSettingsModalOpen,
    openSettingsModal,
    quickSetModel,
    quickSetCliConfig,
    newChatSession,
    referencedDocs,
    isGlobalScope,
  } = useAI();
  const { activeRepo, setFileContent } = useWorkspace();
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<ChatMediaAttachment[]>([]);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [inspectorFlash, setInspectorFlash] = useState<string | null>(null);

  // Live CLI / Provider Detection State
  const [detectedProviders, setDetectedProviders] = useState<
    Array<{
      id: string;
      name: string;
      isAvailable: boolean;
      isAuthenticated: boolean;
      statusMessage?: string;
    }>
  >([]);
  const [isCheckingProviders, setIsCheckingProviders] = useState(false);

  const checkProviders = useCallback(async () => {
    setIsCheckingProviders(true);
    try {
      const res = await API.getAIProviders();
      if (res.ok && res.data?.providers) {
        setDetectedProviders(res.data.providers);
      }
    } catch (err) {
      console.warn("[AICopilotPanel] Erro ao verificar provedores:", err);
    } finally {
      setIsCheckingProviders(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && !isSettingsModalOpen) {
      checkProviders();
    }
  }, [isOpen, isSettingsModalOpen, checkProviders]);

  const activeApiProv =
    aiSettings?.active_provider || aiSettings?.provider || "gemini";
  const isApiConfigured = Boolean(
    aiSettings?.providers?.[activeApiProv]?.configured ||
      Object.values(aiSettings?.providers || {}).some((p) => p?.configured),
  );
  const activeCliInfo = detectedProviders.find((p) => p.id === activeProviderId);
  const isActiveConnectionReady =
    isRawMode || activeProviderId === "direct-api"
      ? isApiConfigured
      : Boolean(activeCliInfo?.isAvailable && activeCliInfo?.isAuthenticated);

  // Live Thinking Step & Timer
  const thinkingStep = useCopilotStore((s) => s.thinkingStep);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // RAG Hooks
  const ragReferences = useCopilotStore((s) => s.ragReferences);
  const openRagModal = useCopilotStore((s) => s.openRagModal);
  const removeRagReference = useCopilotStore((s) => s.removeRagReference);
  const isAutoRagEnabled = useCopilotStore((s) => s.isAutoRagEnabled);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
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

  const readFilesAsAttachments = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    setAttachmentError(null);

    const MAX_FILES = 10;
    const MAX_BYTES = 20 * 1024 * 1024;
    const availableSlots = MAX_FILES - pendingAttachments.length;
    if (availableSlots <= 0) {
      setAttachmentError("Limite máximo de 10 anexos por mensagem atingido.");
      return;
    }

    const toProcess = files.slice(0, availableSlots);
    const loaded: ChatMediaAttachment[] = [];

    for (const file of toProcess) {
      if (file.size > MAX_BYTES) {
        setAttachmentError(`"${file.name || "Arquivo"}" excede o limite de 20 MB.`);
        continue;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
          reader.readAsDataURL(file);
        });

        const base64Match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        const mimeType = file.type || base64Match?.[1] || "application/octet-stream";
        const dataBase64 = base64Match?.[2] || dataUrl;
        const fallbackExt = mimeType.split("/")[1]?.split("+")[0] || "bin";
        const fileName = file.name || `colado-${Date.now()}.${fallbackExt}`;

        loaded.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: fileName,
          mimeType,
          size: file.size,
          dataBase64,
          previewUrl: mimeType.startsWith("image/") || mimeType.startsWith("video/") || mimeType.startsWith("audio/") ? dataUrl : undefined,
        });
      } catch {
        setAttachmentError(`Não foi possível ler "${file.name || "mídia"}".`);
      }
    }

    if (loaded.length > 0) {
      setPendingAttachments((prev) => [...prev, ...loaded]);
    }
  }, [pendingAttachments.length]);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const files: File[] = [];
      if (clipboardData.items && clipboardData.items.length > 0) {
        for (let i = 0; i < clipboardData.items.length; i++) {
          const item = clipboardData.items[i];
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      } else if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
          files.push(clipboardData.files[i]);
        }
      }

      if (files.length > 0) {
        const hasPlainText = Boolean(clipboardData.getData("text/plain"));
        if (!hasPlainText) {
          e.preventDefault();
        }
        await readFilesAsAttachments(files);
      }
    },
    [readFilesAsAttachments],
  );

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent<HTMLFormElement>) => {
    if (e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      if (!isDraggingMedia) setIsDraggingMedia(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLFormElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingMedia(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMedia(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      await readFilesAsAttachments(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      await readFilesAsAttachments(files);
    }
    e.target.value = "";
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
    setAttachmentError(null);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!inputText.trim() && pendingAttachments.length === 0) || isThinking) return;
    if (isRawMode && !isApiConfigured) {
      openSettingsModal();
      return;
    }

    const textToSend = inputText.trim();
    const attachmentsToSend = [...pendingAttachments];
    setInputText("");
    setPendingAttachments([]);
    setAttachmentError(null);

    if (isInspectorActive) {
      stopInspector();
    }

    isUserScrolledUp.current = false;
    await sendMessage(textToSend, undefined, attachmentsToSend);
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

  return (
    <>
      {/* Unified Top Toolbar: Mode, RAG & Session Actions */}
      <div
        className="ai-pane-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "6px",
          padding: "6px 10px",
          background: "#ffffff",
          borderBottom: "1px solid var(--color-outline-variant, #e2e8f0)",
          fontSize: "11px",
          position: "relative",
          zIndex: 30,
          overflow: "visible",
          minHeight: "40px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            position: "relative",
            minWidth: 0,
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
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              border: isRawMode
                ? "1px solid var(--color-warning, #d97706)"
                : "1px solid transparent",
              background: isRawMode
                ? "var(--color-warning-container, #fef7e0)"
                : "var(--color-surface-container, #f1f3f4)",
              color: isRawMode
                ? "var(--color-warning, #b45309)"
                : "var(--text-muted, #64748b)",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
            }}
            title={
              isRawMode
                ? "Modo RAW Ativo: Chamada direta sem ferramentas"
                : "Modo Agente Ativo: Com ferramentas e raciocínio multi-passos"
            }
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "14px" }}
            >
              {isRawMode ? "bolt" : "psychology"}
            </span>
            {isRawMode ? "RAW" : "Harness"}
          </button>

          {/* RAG Search Button */}
          <button
            type="button"
            onClick={() => {
              const { isRagModalOpen, closeRagModal } = useCopilotStore.getState();
              if (isRagModalOpen) {
                closeRagModal();
              } else {
                openRagModal();
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "8px",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              border:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "1px solid rgba(59, 130, 246, 0.35)"
                  : "1px solid transparent",
              background:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "rgba(37, 99, 235, 0.12)"
                  : "var(--color-surface-container, #f1f3f4)",
              color:
                ragReferences.length > 0 || isAutoRagEnabled
                  ? "#2563eb"
                  : "var(--text-muted, #64748b)",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
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

        {/* Right Header Action Icons */}
        <div
          className="ai-copilot-header-right"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
          }}
        >
          <IconButton
            size="sm"
            variant="ghost"
            title="Novo Chat — Iniciar nova conversa (arquiva a anterior no histórico)"
            onClick={newChatSession}
            icon={
              <span className="material-symbols-outlined icon-sm">
                add_comment
              </span>
            }
          />

          <IconButton
            size="sm"
            variant="ghost"
            title="Telemetria & Logs (Tokens, custos, payloads e chamadas de ferramentas)"
            onClick={onOpenRaw}
            icon={
              <span className="material-symbols-outlined icon-sm">
                query_stats
              </span>
            }
          />

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

      {/* 2. Unified Lightweight Context, Prompts & Skills Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "5px 10px",
          borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
          background: "var(--color-surface, #ffffff)",
          position: "relative",
          zIndex: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Contexto */}
        <button
          type="button"
          onClick={onOpenContext}
          title={
            referencedDocs.length > 0 && !isGlobalScope
              ? `${referencedDocs.length} item(ns) no contexto. Clique para gerenciar.`
              : "Anexar arquivos ou pastas ao contexto"
          }
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            borderRadius: "7px",
            border: "none",
            background:
              referencedDocs.length > 0 && !isGlobalScope
                ? "rgba(37, 99, 235, 0.08)"
                : "transparent",
            color:
              referencedDocs.length > 0 && !isGlobalScope
                ? "var(--color-primary, #2563eb)"
                : "var(--color-on-surface-variant, #475569)",
            fontSize: "11.5px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            attachment
          </span>
          <span>
            Contexto
            {referencedDocs.length > 0 && !isGlobalScope
              ? ` (${referencedDocs.length})`
              : ""}
          </span>
        </button>

        {/* Prompts */}
        <button
          type="button"
          onClick={onOpenPrompt}
          title="Abrir instruções e prompts do documento/template"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            borderRadius: "7px",
            border: "none",
            background:
              (templatePrompt && isTemplatePromptEnabled) ||
              (docPrompt && isDocPromptEnabled)
                ? "rgba(37, 99, 235, 0.08)"
                : "transparent",
            color:
              (templatePrompt && isTemplatePromptEnabled) ||
              (docPrompt && isDocPromptEnabled)
                ? "var(--color-primary, #2563eb)"
                : "var(--color-on-surface-variant, #475569)",
            fontSize: "11.5px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            tune
          </span>
          <span>Prompts</span>
        </button>

        {/* Skills */}
        <button
          type="button"
          onClick={() => {
            if (onOpenSkills) onOpenSkills();
            else openSkillsModal();
          }}
          title="Gerenciar skills ativas do Copilot"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 8px",
            borderRadius: "7px",
            border: "none",
            background:
              activeSkillIds.length > 0
                ? "rgba(37, 99, 235, 0.08)"
                : "transparent",
            color:
              activeSkillIds.length > 0
                ? "var(--color-primary, #2563eb)"
                : "var(--color-on-surface-variant, #475569)",
            fontSize: "11.5px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
            auto_awesome
          </span>
          <span>
            Skills
            {activeSkillIds.length > 0 ? ` (${activeSkillIds.length})` : ""}
          </span>
        </button>
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

        {/* Guided Connection Card when no CLI or API Key is ready */}
        {messages.length === 0 && !isActiveConnectionReady && !isCheckingProviders && (
          <div
            style={{
              margin: "8px 4px",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              background: "var(--color-surface-container, #f8fafc)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              fontSize: "12px",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "13px" }}>
              {isRawMode ? "Modo RAW requer uma Chave de API" : "Conecte uma IA para começar"}
            </div>
            <p
              style={{
                margin: 0,
                color: "var(--text-muted, #64748b)",
                lineHeight: 1.45,
              }}
            >
              {isRawMode
                ? "O modo RAW faz chamadas diretas via API sem usar o harness da CLI. Informe uma Chave de API para continuar ou volte para o modo Harness."
                : "Use uma CLI instalada no computador (com agentes e harness) ou informe uma Chave de API."}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {["antigravity", "claude-code"].map((id) => {
                const p = detectedProviders.find((item) => item.id === id);
                const ok = Boolean(p?.isAvailable && p?.isAuthenticated);
                const label = id === "antigravity" ? "Antigravity (agy)" : "Claude Code (claude)";
                return (
                  <span
                    key={id}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: 500,
                      background: ok ? "rgba(34, 197, 94, 0.14)" : "rgba(148, 163, 184, 0.16)",
                      color: ok ? "#16a34a" : "var(--text-muted, #64748b)",
                    }}
                  >
                    {ok ? "✓" : "○"} {label}
                  </span>
                );
              })}
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 500,
                  background: isApiConfigured
                    ? "rgba(34, 197, 94, 0.14)"
                    : "rgba(148, 163, 184, 0.16)",
                  color: isApiConfigured ? "#16a34a" : "var(--text-muted, #64748b)",
                }}
              >
                {isApiConfigured ? "✓" : "○"} Chave de API
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={openSettingsModal}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#10b981",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Configurar Conexão
              </button>
              <button
                type="button"
                onClick={checkProviders}
                style={{
                  padding: "6px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-outline-variant, #cbd5e1)",
                  background: "transparent",
                  color: "inherit",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Verificar novamente
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-bubble ${msg.sender === "user" ? "user" : "ai"}`}
          >
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="chat-bubble-attachments">
                {msg.attachments.map((att) =>
                  att.mimeType.startsWith("image/") && att.previewUrl ? (
                    <a
                      key={att.id}
                      href={att.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={att.name}
                      className="chat-bubble-attachment-img-link"
                    >
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="chat-bubble-attachment-img"
                      />
                    </a>
                  ) : (
                    <span key={att.id} className="chat-bubble-attachment-file" title={att.mimeType}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                        {att.mimeType.startsWith("video/")
                          ? "movie"
                          : att.mimeType.startsWith("audio/")
                            ? "audio_file"
                            : att.mimeType === "application/pdf"
                              ? "picture_as_pdf"
                              : "attach_file"}
                      </span>
                      <span>{att.name}</span>
                    </span>
                  )
                )}
              </div>
            )}

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
      {isInspectorActive &&
        createPortal(
          <div id="ai-inspector-toast-banner">
            <span
              className="material-symbols-outlined"
              style={{ color: "var(--color-primary, #2563eb)", fontSize: "18px" }}
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
          </div>,
          document.body
        )}

      {/* 5. Full-Width Prompt Container */}
      <form
        className={`ai-copilot-input-container${isDraggingMedia ? " dragging-media" : ""}`}
        onSubmit={handleSend}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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

        {pendingAttachments.length > 0 && (
          <div className="ai-media-preview-strip">
            {pendingAttachments.map((att) => (
              <div key={att.id} className="ai-media-chip" title={`${att.name} (${att.mimeType})`}>
                {att.mimeType.startsWith("image/") && att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="ai-media-chip-thumb" />
                ) : (
                  <span className="material-symbols-outlined ai-media-chip-icon">
                    {att.mimeType.startsWith("video/")
                      ? "movie"
                      : att.mimeType.startsWith("audio/")
                        ? "audio_file"
                        : att.mimeType === "application/pdf"
                          ? "picture_as_pdf"
                          : "attach_file"}
                  </span>
                )}
                <span className="ai-media-chip-name">{att.name}</span>
                <button
                  type="button"
                  className="ai-media-chip-remove"
                  onClick={() => removePendingAttachment(att.id)}
                  title="Remover anexo"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>
                    close
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {attachmentError && (
          <div className="ai-media-error-banner">{attachmentError}</div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,application/pdf,text/*,.md,.json,.csv"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {isRawMode && !isApiConfigured && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              padding: "6px 10px",
              borderRadius: "8px",
              background: "var(--color-warning-container, #fef7e0)",
              border: "1px solid rgba(217, 119, 6, 0.3)",
              color: "var(--color-warning, #b45309)",
              fontSize: "11px",
              fontWeight: 500,
            }}
          >
            <span>Modo RAW usa API Direta e exige uma Chave de API.</span>
            <button
              type="button"
              onClick={openSettingsModal}
              style={{
                border: "none",
                background: "rgba(217, 119, 6, 0.14)",
                color: "#92400e",
                borderRadius: "6px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Configurar API Key
            </button>
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="ai-copilot-textarea"
          placeholder="Mensagem para o Agente... (Cole imagens/mídias ou Shift+Enter para nova linha)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
        />

        <div className="ai-input-bottom-bar">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              minWidth: 0,
              flex: 1,
            }}
          >
            <IconButton
              size="xs"
              variant="subtle"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Anexar imagem, PDF, áudio, vídeo ou arquivo"
              icon={
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px" }}
                >
                  attach_file
                </span>
              }
            />

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

            <CopilotModelSelector
              activeModel={activeModelDisplay}
              activeProvider={activeProviderDisplay}
              activeProviderId={isRawMode ? "direct-api" : activeProviderId}
              agentModel={aiSettings?.agent_model}
              claudeModel={aiSettings?.claude_model}
              agentEffort={aiSettings?.agent_effort}
              detectedProviders={detectedProviders}
              isApiConfigured={isApiConfigured}
              onSelectModel={handleQuickModelSelect}
              onSelectProvider={(providerId) => {
                if (providerId !== "direct-api" && isRawMode) {
                  setIsRawMode(false);
                }
                quickSetCliConfig({ default_provider: providerId });
              }}
              onSelectCliModel={(providerId, modelId, effort) => {
                if (isRawMode) {
                  setIsRawMode(false);
                }
                quickSetCliConfig(
                  providerId === "antigravity"
                    ? {
                        default_provider: "antigravity",
                        agent_model: modelId,
                        ...(effort ? { agent_effort: effort } : {}),
                      }
                    : { default_provider: "claude-code", claude_model: modelId },
                );
              }}
              onSelectEffort={(effort) =>
                quickSetCliConfig({ agent_effort: effort })
              }
              onOpenSettings={openSettingsModal}
            />
          </div>

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
                disabled={
                  (!inputText.trim() && pendingAttachments.length === 0) ||
                  (isRawMode && !isApiConfigured)
                }
                title={
                  isRawMode && !isApiConfigured
                    ? "Configure uma Chave de API para usar o modo RAW"
                    : "Enviar mensagem (Enter)"
                }
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
    </>
  );
};
