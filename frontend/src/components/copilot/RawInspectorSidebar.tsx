import React, { useState, useMemo } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Download,
  Copy,
  Check,
  Search,
  X,
} from "lucide-react";
import { useCopilotStore } from "../../stores/copilotStore";
import { useAI } from "../../context/AIContext";
import {
  formatCostUsd,
  formatTokenCount,
  getPricingForModel,
} from "../../utils/token-costs";
import { RawCodeViewer } from "./RawCodeViewer";
import { Badge, Button } from "../ui";
import type { RawTurnTelemetry } from "../../types";

interface RawInspectorSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  docPath?: string;
  rawPayload?: Record<string, unknown>;
  rawResponse?: Record<string, unknown> | import("../../types").ChatMessage | null;
}

export const RawInspectorSidebar: React.FC<RawInspectorSidebarProps> = ({
  isOpen,
  onClose,
  docPath = "index.md",
  rawPayload: fallbackPayload,
  rawResponse: fallbackResponse,
}) => {
  const { currentSessionId, aiSettings } = useAI();
  const sessionTelemetry = useCopilotStore((s) => s.sessionTelemetry);
  const activeRawTurnIndex = useCopilotStore((s) => s.activeRawTurnIndex);
  const setActiveRawTurnIndex = useCopilotStore((s) => s.setActiveRawTurnIndex);

  // Navegação: 'list' (visão de lista de mensagens) ou 'detail' (visão de raio-x da mensagem selecionada)
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [detailTab, setDetailTab] = useState<
    "request" | "response" | "costs" | "json"
  >("request");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const currentTurns: RawTurnTelemetry[] = useMemo(() => {
    return sessionTelemetry[currentSessionId] || [];
  }, [sessionTelemetry, currentSessionId]);

  // Se o usuário clicou no botão "Raio-X" de uma mensagem específica no chat, abre direto em 'detail'
  React.useEffect(() => {
    if (activeRawTurnIndex >= 0 && activeRawTurnIndex < currentTurns.length) {
      setViewMode("detail");
    }
  }, [activeRawTurnIndex, currentTurns.length]);

  const selectedTurnIndex = useMemo(() => {
    if (currentTurns.length === 0) return -1;
    if (activeRawTurnIndex >= 0 && activeRawTurnIndex < currentTurns.length) {
      return activeRawTurnIndex;
    }
    return currentTurns.length - 1;
  }, [currentTurns, activeRawTurnIndex]);

  const activeTurn: RawTurnTelemetry | null = useMemo(() => {
    if (selectedTurnIndex >= 0 && currentTurns[selectedTurnIndex]) {
      return currentTurns[selectedTurnIndex];
    }
    return null;
  }, [currentTurns, selectedTurnIndex]);

  const filteredTurns = useMemo(() => {
    if (!searchQuery.trim()) return currentTurns;
    const q = searchQuery.toLowerCase();
    return currentTurns.filter((turn) => {
      const p = (turn.request?.prompt || "").toLowerCase();
      const r = (turn.response?.reply || "").toLowerCase();
      const m = (turn.model || "").toLowerCase();
      return p.includes(q) || r.includes(q) || m.includes(q);
    });
  }, [currentTurns, searchQuery]);

  // Lista com as mensagens mais recentes no topo (ordem cronológica reversa)
  const displayTurns = useMemo(() => {
    return [...filteredTurns].reverse();
  }, [filteredTurns]);

  const sessionAggregates = useMemo(() => {
    const totalTurns = currentTurns.length;
    const totalPromptTokens = currentTurns.reduce(
      (acc, t) => acc + (t.metrics?.prompt_tokens || 0),
      0,
    );
    const totalCompletionTokens = currentTurns.reduce(
      (acc, t) => acc + (t.metrics?.completion_tokens || 0),
      0,
    );
    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const totalCostUsd = currentTurns.reduce(
      (acc, t) => acc + (t.metrics?.cost_usd || 0),
      0,
    );

    return {
      totalTurns,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      totalCostUsd,
    };
  }, [currentTurns]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleExportTurn = () => {
    const dataToExport = activeTurn || {
      session_id: currentSessionId,
      fallbackPayload,
      fallbackResponse,
    };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetria-mensagem-${selectedTurnIndex + 1}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportFullSession = () => {
    const dataToExport = {
      session_id: currentSessionId,
      exported_at: new Date().toISOString(),
      aggregates: sessionAggregates,
      turns_count: currentTurns.length,
      turns: currentTurns,
    };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetria-sessao-${currentSessionId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const currentModelName =
    activeTurn?.model || aiSettings?.active_model || "gemini-2.5-flash";
  const pricingInfo = getPricingForModel(currentModelName);

  return (
    <aside
      className="ai-copilot-prompt-sidebar ai-copilot-raw-sidebar ui-sidebar-drawer"
      style={{ width: "460px", maxWidth: "60vw" }}
    >
      {/* Top Header */}
      <div className="ui-sidebar-drawer__header">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-text-primary, #0f172a)",
              }}
            >
              Telemetria & Logs
            </span>
          </div>
          <span className="ui-text-muted" style={{ fontSize: "11px" }}>
            Documento:{" "}
            <span
              style={{
                fontFamily: "var(--font-family-mono)",
                color: "var(--color-text-secondary)",
              }}
            >
              {docPath}
            </span>
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportFullSession}
            title="Exportar telemetria e logs da sessão completa em JSON"
            icon={<Download size={13} />}
          >
            Exportar
          </Button>
          <button
            className="btn-icon"
            type="button"
            title="Fechar telemetria"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Session Overview Stats */}
      <div
        style={{
          padding: "10px 16px",
          background: "var(--color-surface, #ffffff)",
          borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            className="ui-text-muted"
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Mensagens no Chat
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text-primary, #0f172a)",
            }}
          >
            {sessionAggregates.totalTurns}{" "}
            {sessionAggregates.totalTurns === 1 ? "interação" : "interações"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            className="ui-text-muted"
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Tokens Acumulados
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-primary, #2563eb)",
            }}
          >
            {formatTokenCount(sessionAggregates.totalTokens)}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            className="ui-text-muted"
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Custo Estimado
          </span>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-success, #16a34a)",
            }}
          >
            {formatCostUsd(sessionAggregates.totalCostUsd, pricingInfo.isLocal)}
          </span>
        </div>
      </div>

      {/* VIEW 1: LISTA DE MENSAGENS / TURNOS */}
      {viewMode === "list" && (
        <div className="ui-sidebar-drawer__body" style={{ padding: 0 }}>
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
              background: "var(--color-surface-subtle, #f8fafc)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                flex: 1,
              }}
            >
              <Search
                size={13}
                style={{
                  position: "absolute",
                  left: "10px",
                  color: "var(--color-text-muted, #94a3b8)",
                }}
              />
              <input
                type="text"
                placeholder="Filtrar mensagens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 10px 6px 30px",
                  fontSize: "11.5px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border-subtle, #cbd5e1)",
                  background: "var(--color-surface, #ffffff)",
                }}
              />
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {displayTurns.length > 0 ? (
              displayTurns.map((turn) => {
                const originalIndex =
                  currentTurns.findIndex((t) => t.turn_id === turn.turn_id) !==
                  -1
                    ? currentTurns.findIndex((t) => t.turn_id === turn.turn_id)
                    : turn.turn_index
                      ? turn.turn_index - 1
                      : 0;
                const turnNumber = turn.turn_index || originalIndex + 1;
                const isLatest = originalIndex === currentTurns.length - 1;
                const promptSnippet =
                  turn.request?.prompt || "Mensagem sem conteúdo de texto";
                const hasTools =
                  turn.response?.tool_calls &&
                  turn.response.tool_calls.length > 0;
                const isSelected = selectedTurnIndex === originalIndex;

                return (
                  <div
                    key={turn.turn_id || originalIndex}
                    onClick={() => {
                      setActiveRawTurnIndex(originalIndex);
                      setViewMode("detail");
                    }}
                    style={{
                      padding: "12px",
                      borderRadius: "8px",
                      border: isSelected
                        ? "1.5px solid var(--color-primary, #2563eb)"
                        : "1px solid var(--color-border-subtle, #e2e8f0)",
                      background: isSelected
                        ? "var(--color-primary-subtle, #eff6ff)"
                        : "var(--color-surface, #ffffff)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11.5px",
                            fontWeight: 700,
                            color: "var(--color-text-primary, #0f172a)",
                          }}
                        >
                          Mensagem #{turnNumber}
                        </span>
                        {isLatest && (
                          <Badge variant="primary" size="sm">
                            Recente
                          </Badge>
                        )}
                        {turn.timestamp && (
                          <span
                            className="ui-text-muted"
                            style={{ fontSize: "10.5px" }}
                          >
                            {new Date(turn.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <Badge
                          variant="neutral"
                          size="sm"
                          title={`Entrada: ${formatTokenCount(turn.metrics?.prompt_tokens)} | Saída: ${formatTokenCount(turn.metrics?.completion_tokens)}`}
                        >
                          {formatTokenCount(turn.metrics?.total_tokens)}
                        </Badge>
                        <ChevronRight
                          size={14}
                          style={{ color: "var(--color-text-muted, #94a3b8)" }}
                        />
                      </div>
                    </div>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "11.5px",
                        color: "var(--color-text-secondary, #334155)",
                        lineHeight: 1.35,
                      }}
                    >
                      {promptSnippet.length > 110
                        ? `${promptSnippet.slice(0, 110)}...`
                        : promptSnippet}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "10.5px",
                        color: "var(--color-text-muted, #64748b)",
                        marginTop: "2px",
                      }}
                    >
                      <span>
                        Entrada:{" "}
                        <strong>
                          {formatTokenCount(turn.metrics?.prompt_tokens)}
                        </strong>{" "}
                        · Saída:{" "}
                        <strong>
                          {formatTokenCount(turn.metrics?.completion_tokens)}
                        </strong>
                      </span>
                      <span>
                        {hasTools
                          ? `${turn.response?.tool_calls?.length} ferramentas`
                          : "Resposta direta"}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="ui-empty-state" style={{ padding: "30px 16px" }}>
                <span className="ui-text-muted" style={{ fontSize: "12px" }}>
                  {currentTurns.length === 0
                    ? "Nenhuma mensagem registrada nesta sessão do Copilot ainda."
                    : "Nenhuma mensagem corresponde à busca."}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: DETALHES DA MENSAGEM SELECIONADA */}
      {viewMode === "detail" && activeTurn && (
        <div className="ui-sidebar-drawer__body" style={{ padding: 0 }}>
          {/* Detail Sub-Header / Back & Navigation */}
          <div
            style={{
              padding: "8px 16px",
              borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
              background: "var(--color-surface-subtle, #f8fafc)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("list")}
              icon={<ArrowLeft size={13} />}
            >
              Voltar à lista
            </Button>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-text-primary, #0f172a)",
                }}
              >
                Mensagem {selectedTurnIndex + 1} de {currentTurns.length}
              </span>
              <div style={{ display: "flex", gap: "2px" }}>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={selectedTurnIndex <= 0}
                  onClick={() => setActiveRawTurnIndex(selectedTurnIndex - 1)}
                  style={{ padding: "2px" }}
                  title="Mensagem anterior"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={selectedTurnIndex >= currentTurns.length - 1}
                  onClick={() => setActiveRawTurnIndex(selectedTurnIndex + 1)}
                  style={{ padding: "2px" }}
                  title="Próxima mensagem"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Segmented Control Tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
              background: "var(--color-surface, #ffffff)",
            }}
          >
            {[
              { id: "request", label: "Enviado (Request)" },
              { id: "response", label: "Recebido (Response)" },
              { id: "costs", label: "Tokens & Preço" },
              { id: "json", label: "Payload" },
            ].map((tab) => {
              const isActive = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id as "costs" | "json" | "request" | "response")}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    fontSize: "11px",
                    fontWeight: isActive ? 600 : 500,
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid var(--color-primary, #2563eb)"
                      : "2px solid transparent",
                    background: "none",
                    color: isActive
                      ? "var(--color-primary, #2563eb)"
                      : "var(--color-text-muted, #64748b)",
                    cursor: "pointer",
                    textAlign: "center",
                    transition: "all 0.1s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Detail Body Content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {/* TAB 1: ENVIADO */}
            {detailTab === "request" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <RawCodeViewer
                  title="Prompt do Usuário"
                  content={activeTurn.request?.prompt}
                  copyKey="req-p"
                  copiedKey={copiedKey}
                  onCopy={copyToClipboard}
                  maxHeight="160px"
                />

                <RawCodeViewer
                  title="Instruções do Sistema & Skills"
                  content={activeTurn.request?.system_prompt}
                  copyKey="req-sys"
                  copiedKey={copiedKey}
                  onCopy={copyToClipboard}
                  maxHeight="160px"
                />

                <div
                  className="ui-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--color-surface-subtle, #f8fafc)",
                      borderBottom:
                        "1px solid var(--color-border-subtle, #e2e8f0)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "var(--color-text-primary, #0f172a)",
                      }}
                    >
                      Arquivos e Contexto Injetados
                    </span>
                    <Badge variant="neutral" size="sm">
                      {activeTurn.request?.context_files?.length || 0} arquivos
                    </Badge>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: "11px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {activeTurn.request?.context_files &&
                    activeTurn.request.context_files.length > 0 ? (
                      activeTurn.request.context_files.map((cf, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: "4px 8px",
                            background: "var(--color-surface-subtle, #f8fafc)",
                            borderRadius: "4px",
                            border:
                              "1px solid var(--color-border-subtle, #e2e8f0)",
                            fontFamily: "var(--font-family-mono)",
                          }}
                        >
                          {cf.path}
                        </div>
                      ))
                    ) : (
                      <span className="ui-text-muted">
                        Nenhum arquivo injetado neste turno (Escopo Global).
                      </span>
                    )}

                    {activeTurn.request?.dynamic_context && (
                      <div style={{ marginTop: "4px" }}>
                        <span
                          style={{
                            fontSize: "10.5px",
                            fontWeight: 600,
                            color: "var(--color-text-secondary)",
                            display: "block",
                            marginBottom: "2px",
                          }}
                        >
                          Fragmento Dinâmico Selecionado:
                        </span>
                        <pre
                          style={{
                            margin: 0,
                            padding: "6px 8px",
                            background: "var(--color-surface-subtle, #f1f5f9)",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontFamily: "var(--font-family-mono)",
                            maxHeight: "90px",
                            overflowY: "auto",
                          }}
                        >
                          {activeTurn.request.dynamic_context}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className="ui-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--color-surface-subtle, #f8fafc)",
                      borderBottom:
                        "1px solid var(--color-border-subtle, #e2e8f0)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "var(--color-text-primary, #0f172a)",
                      }}
                    >
                      Histórico Anterior Transmitido
                    </span>
                    <Badge variant="neutral" size="sm">
                      {activeTurn.request?.history_messages?.length || 0}{" "}
                      mensagens
                    </Badge>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: "10.5px",
                      maxHeight: "120px",
                      overflowY: "auto",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {activeTurn.request?.history_messages &&
                    activeTurn.request.history_messages.length > 0 ? (
                      activeTurn.request.history_messages.map((hm, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: "3px 6px",
                            background: "var(--color-surface-subtle, #f8fafc)",
                            borderRadius: "4px",
                            border:
                              "1px solid var(--color-border-subtle, #e2e8f0)",
                          }}
                        >
                          <strong>
                            {hm.role === "user" || hm.sender === "user"
                              ? "Usuário"
                              : "Assistente"}
                            :{" "}
                          </strong>
                          <span>
                            {(hm.content || hm.text || "").slice(0, 70)}...
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="ui-text-muted">
                        Primeira interação da conversa (sem histórico prévio).
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: RECEBIDO */}
            {detailTab === "response" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <RawCodeViewer
                  title="Texto Gerado"
                  content={activeTurn.response?.reply}
                  copyKey="res-p"
                  copiedKey={copiedKey}
                  onCopy={copyToClipboard}
                  maxHeight="200px"
                />

                <div
                  className="ui-card"
                  style={{ padding: 0, overflow: "hidden" }}
                >
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "var(--color-surface-subtle, #f8fafc)",
                      borderBottom:
                        "1px solid var(--color-border-subtle, #e2e8f0)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11.5px",
                        fontWeight: 600,
                        color: "var(--color-text-primary, #0f172a)",
                      }}
                    >
                      Ferramentas Executadas (
                      {activeTurn.response?.tool_calls?.length || 0})
                    </span>
                  </div>
                  <div
                    style={{
                      padding: "10px 12px",
                      fontSize: "11px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {activeTurn.response?.tool_calls &&
                    activeTurn.response.tool_calls.length > 0 ? (
                      activeTurn.response.tool_calls.map(
                        (tc, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              background:
                                "var(--color-surface-subtle, #f8fafc)",
                              border:
                                "1px solid var(--color-border-subtle, #e2e8f0)",
                              borderRadius: "4px",
                              padding: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "4px",
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: "var(--font-family-mono)",
                                  fontWeight: 600,
                                  color: "var(--color-text-primary, #0f172a)",
                                }}
                              >
                                {tc.tool || tc.name}
                              </span>
                              <Badge
                                variant={
                                  tc.result?.success !== false
                                    ? "success"
                                    : "danger"
                                }
                                size="sm"
                              >
                                {tc.result?.success !== false
                                  ? "Sucesso"
                                  : "Erro"}
                              </Badge>
                            </div>
                            <details
                              style={{
                                fontSize: "10.5px",
                                color: "var(--color-text-secondary, #475569)",
                              }}
                            >
                              <summary style={{ cursor: "pointer" }}>
                                Entrada e Retorno
                              </summary>
                              <pre
                                style={{
                                  margin: "4px 0 0 0",
                                  padding: "6px",
                                  background: "var(--color-surface, #ffffff)",
                                  borderRadius: "4px",
                                  border:
                                    "1px solid var(--color-border-subtle, #e2e8f0)",
                                  fontSize: "10px",
                                  maxHeight: "100px",
                                  overflowY: "auto",
                                }}
                              >
                                {JSON.stringify(
                                  {
                                    args: tc.args || tc.input,
                                    result: tc.result || tc.output,
                                  },
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        ),
                      )
                    ) : (
                      <span className="ui-text-muted">
                        Nenhuma ferramenta executada neste turno.
                      </span>
                    )}
                  </div>
                </div>

                {activeTurn.response?.stream_events &&
                  activeTurn.response.stream_events.length > 0 && (
                    <div
                      className="ui-card"
                      style={{ padding: 0, overflow: "hidden" }}
                    >
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "var(--color-surface-subtle, #f8fafc)",
                          borderBottom:
                            "1px solid var(--color-border-subtle, #e2e8f0)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11.5px",
                            fontWeight: 600,
                            color: "var(--color-text-primary, #0f172a)",
                          }}
                        >
                          Linha do Tempo de Eventos SSE (
                          {activeTurn.response.stream_events.length})
                        </span>
                      </div>
                      <div
                        style={{
                          padding: "8px 12px",
                          fontSize: "10.5px",
                          maxHeight: "120px",
                          overflowY: "auto",
                          display: "flex",
                          flexDirection: "column",
                          gap: "3px",
                        }}
                      >
                        {(activeTurn.response.stream_events as Array<{ type?: string; toolName?: string }>)
                          .slice(0, 15)
                          .map((ev, idx: number) => (
                            <div
                              key={idx}
                              style={{
                                fontFamily: "var(--font-family-mono)",
                                color: "var(--color-text-secondary, #475569)",
                              }}
                            >
                              [{ev.type}]{" "}
                              {ev.toolName ? `tool: ${ev.toolName}` : ""}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* TAB 3: TOKENS & PRECIFICAÇÃO */}
            {detailTab === "costs" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div className="ui-card" style={{ padding: "12px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-text-primary, #0f172a)",
                      display: "block",
                      marginBottom: "10px",
                    }}
                  >
                    Contagem de Tokens Desta Mensagem
                  </span>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "8px",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "8px",
                        background: "var(--color-surface-subtle, #f8fafc)",
                        borderRadius: "6px",
                        border: "1px solid var(--color-border-subtle, #e2e8f0)",
                        textAlign: "center",
                      }}
                    >
                      <span
                        className="ui-text-muted"
                        style={{
                          fontSize: "10px",
                          textTransform: "uppercase",
                          display: "block",
                        }}
                      >
                        Entrada
                      </span>
                      <strong
                        style={{
                          fontSize: "15px",
                          color: "var(--color-text-primary, #0f172a)",
                        }}
                      >
                        {formatTokenCount(activeTurn.metrics?.prompt_tokens)}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "8px",
                        background: "var(--color-surface-subtle, #f8fafc)",
                        borderRadius: "6px",
                        border: "1px solid var(--color-border-subtle, #e2e8f0)",
                        textAlign: "center",
                      }}
                    >
                      <span
                        className="ui-text-muted"
                        style={{
                          fontSize: "10px",
                          textTransform: "uppercase",
                          display: "block",
                        }}
                      >
                        Saída
                      </span>
                      <strong
                        style={{
                          fontSize: "15px",
                          color: "var(--color-text-primary, #0f172a)",
                        }}
                      >
                        {formatTokenCount(
                          activeTurn.metrics?.completion_tokens,
                        )}
                      </strong>
                    </div>

                    <div
                      style={{
                        padding: "8px",
                        background: "var(--color-surface-subtle, #f8fafc)",
                        borderRadius: "6px",
                        border: "1px solid var(--color-border-subtle, #e2e8f0)",
                        textAlign: "center",
                      }}
                    >
                      <span
                        className="ui-text-muted"
                        style={{
                          fontSize: "10px",
                          textTransform: "uppercase",
                          display: "block",
                        }}
                      >
                        Total
                      </span>
                      <strong
                        style={{
                          fontSize: "15px",
                          color: "var(--color-primary, #2563eb)",
                        }}
                      >
                        {formatTokenCount(activeTurn.metrics?.total_tokens)}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      background: "var(--color-surface-subtle, #f1f5f9)",
                      borderRadius: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-secondary, #334155)",
                      }}
                    >
                      Custo Estimado da Mensagem:
                    </span>
                    <strong
                      style={{
                        fontSize: "13px",
                        color: "var(--color-success, #16a34a)",
                      }}
                    >
                      {formatCostUsd(
                        activeTurn.metrics?.cost_usd,
                        pricingInfo.isLocal,
                      )}
                    </strong>
                  </div>
                </div>

                {/* Explicação da Origem do Custo */}
                <div
                  className="ui-card"
                  style={{
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--color-text-primary, #0f172a)",
                    }}
                  >
                    Origem da Precificação & Modelo
                  </span>

                  <p
                    className="ui-text-muted"
                    style={{ margin: 0, fontSize: "11px", lineHeight: 1.4 }}
                  >
                    Os valores são calculados com base nas tabelas públicas
                    oficiais dos provedores de API por 1 milhão de tokens.
                    Modelos locais ou CLIs executados no seu computador são
                    computados como gratuitos ($0.00).
                  </p>

                  <div
                    style={{
                      fontSize: "11px",
                      background: "var(--color-surface-subtle, #f8fafc)",
                      padding: "8px 10px",
                      borderRadius: "4px",
                      border: "1px solid var(--color-border-subtle, #e2e8f0)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="ui-text-muted">Modelo Ativo:</span>
                      <span
                        style={{
                          fontFamily: "var(--font-family-mono)",
                          color: "var(--color-text-primary, #0f172a)",
                        }}
                      >
                        {currentModelName}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="ui-text-muted">
                        Taxa Entrada (Prompt):
                      </span>
                      <span>
                        {pricingInfo.isLocal
                          ? "$0.00 / 1M"
                          : `$${pricingInfo.promptPerMillion} / 1M tokens`}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="ui-text-muted">
                        Taxa Saída (Completion):
                      </span>
                      <span>
                        {pricingInfo.isLocal
                          ? "$0.00 / 1M"
                          : `$${pricingInfo.completionPerMillion} / 1M tokens`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: PAYLOAD */}
            {detailTab === "json" && (
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
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(activeTurn, null, 2),
                        "raw-json",
                      )
                    }
                    icon={
                      copiedKey === "raw-json" ? (
                        <Check
                          size={13}
                          style={{ color: "var(--color-success, #16a34a)" }}
                        />
                      ) : (
                        <Copy size={13} />
                      )
                    }
                    title="Copiar JSON do payload"
                  >
                    {copiedKey === "raw-json" ? "Copiado" : "Copiar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleExportTurn}
                    icon={<Download size={13} />}
                    title="Baixar JSON do payload"
                  >
                    Baixar
                  </Button>
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: "12px 14px",
                    background: "var(--color-surface-subtle, #f8fafc)",
                    borderRadius: "6px",
                    border: "1px solid var(--color-border-subtle, #e2e8f0)",
                    fontFamily: "var(--font-family-mono, monospace)",
                    fontSize: "11px",
                    lineHeight: "1.5",
                    color: "var(--color-text-primary, #0f172a)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: "calc(100vh - 280px)",
                    overflowY: "auto",
                  }}
                >
                  {activeTurn ? JSON.stringify(activeTurn, null, 2) : "{}"}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

export const TelemetrySidebar = RawInspectorSidebar;
