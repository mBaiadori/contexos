import React, { useState, useEffect, useMemo } from "react";
import { API } from "../../services/api";
import { useAI } from "../../context/AIContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useCopilotStore } from "../../stores/copilotStore";
import { Badge, Button, IconButton, SearchInput } from "../ui";

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  repo: string;
  docPath: string;
  onRestoreSession?: (session: any) => void;
}

function formatRelativeTime(dateStr?: string | number): string {
  if (!dateStr) return "";
  const date =
    typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffSec < 45) return "Agora mesmo";
  if (diffMin < 60) return `Há ${diffMin} min`;

  const isToday = now.toDateString() === date.toDateString();
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isToday) return `Hoje às ${timeStr}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === date.toDateString())
    return `Ontem às ${timeStr}`;

  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} às ${timeStr}`;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  repo,
  docPath,
}) => {
  const { restoreSession, currentSessionId, newChatSession, resetMemory } =
    useAI();
  const { projectConfig, activeRepo } = useWorkspace();
  const historyVersion = useCopilotStore((s) => s.historyVersion);
  const [sessions, setSessions] = useState<any[]>([]);
  const [briefing, setBriefing] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isHandoffExpanded, setIsHandoffExpanded] = useState<boolean>(false);

  const effectiveRepo =
    repo && repo !== "default" && repo !== "local"
      ? repo
      : activeRepo?.name || "default";

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, effectiveRepo, docPath, historyVersion]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const [histRes, briefRes] = await Promise.all([
        API.getMemoryHistory({ repo: effectiveRepo, path: docPath }),
        API.getMemoryBrief({ repo: effectiveRepo, path: docPath }),
      ]);

      if (histRes.ok && histRes.data) {
        const rawSessions: any[] = Array.isArray(histRes.data.sessions)
          ? histRes.data.sessions
          : [];

        // Ordenação: mais recente sempre primeiro
        rawSessions.sort((a, b) => {
          const timeA =
            a.timestamp ||
            new Date(a.updated_at || a.created_at || 0).getTime() ||
            0;
          const timeB =
            b.timestamp ||
            new Date(b.updated_at || b.created_at || 0).getTime() ||
            0;
          return timeB - timeA;
        });

        setSessions(rawSessions);
      }
      if (briefRes.ok && briefRes.data) {
        setBriefing(briefRes.data.briefing || "");
      }
    } catch (err) {
      console.error("[HistorySidebar] Erro ao carregar histórico:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      const res = await API.getMemorySession({
        repo: effectiveRepo,
        session_id: sessionId,
      });
      if (res.ok && res.data?.session) {
        setSelectedSession(res.data.session);
      } else if (res.ok && res.data?.events) {
        setSelectedSession(res.data);
      }
    } catch (e) {
      console.warn("Erro ao carregar detalhes da sessão:", e);
    }
  };

  const handleRestoreToChat = async (
    sessionId: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    const success = await restoreSession(sessionId);
    if (success) {
      setFeedback("Conversa restaurada no Copilot! ✨");
      setTimeout(() => {
        setFeedback(null);
        onClose();
      }, 1000);
    } else {
      setFeedback("Erro ao restaurar sessão.");
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  const handleNewChat = () => {
    newChatSession();
    setFeedback("Nova conversa iniciada! 🚀");
    setTimeout(() => {
      setFeedback(null);
      onClose();
    }, 700);
  };

  const handleDeleteSession = async (
    sessionId: string,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Deseja excluir esta conversa do histórico?")) return;
    try {
      const res = await API.deleteMemorySession({
        repo: effectiveRepo,
        session_id: sessionId,
      });
      if (res.ok) {
        if (selectedSession?.session_id === sessionId) {
          setSelectedSession(null);
        }
        await loadHistory();
        setFeedback("Conversa excluída.");
        setTimeout(() => setFeedback(null), 1500);
      }
    } catch (err) {
      console.error("Erro ao excluir sessão:", err);
    }
  };

  const handleConsolidateMemory = async () => {
    setIsConsolidating(true);
    try {
      const res = await API.finalizeMemorySession({
        repo: effectiveRepo,
        path: docPath,
        session_id: currentSessionId,
      });
      if (res.ok && res.data?.briefing) {
        setBriefing(res.data.briefing);
        setFeedback("Memória persistida com sucesso! 🧠");
        setTimeout(() => setFeedback(null), 2500);
      }
    } catch (err) {
      console.error("Erro ao consolidar memória:", err);
    } finally {
      setIsConsolidating(false);
    }
  };

  const handleResetMemory = async () => {
    if (
      !window.confirm(
        "Tem certeza que deseja limpar a memória consolidada (.spec-memory/)?",
      )
    )
      return;
    await resetMemory("repo");
    setBriefing("");
    setSessions([]);
    setSelectedSession(null);
    setFeedback("Memória reiniciada.");
    setTimeout(() => setFeedback(null), 2000);
  };

  const handleCopyMessage = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  // Filtragem dinâmica por termo de busca
  const filteredSessions = useMemo(() => {
    if (!searchTerm.trim()) return sessions;
    const term = searchTerm.toLowerCase();
    return sessions.filter((s) => {
      const preview = (s.preview || "").toLowerCase();
      const path = (s.path || "").toLowerCase();
      const model = (s.model || "").toLowerCase();
      const author = (s.author?.name || "").toLowerCase();
      const id = (s.session_id || "").toLowerCase();
      return (
        preview.includes(term) ||
        path.includes(term) ||
        model.includes(term) ||
        author.includes(term) ||
        id.includes(term)
      );
    });
  }, [sessions, searchTerm]);

  const projectColor =
    projectConfig?.primary_color || "var(--color-primary, #2563eb)";

  if (!isOpen) return null;

  return (
    <aside className="ai-copilot-prompt-sidebar ai-copilot-history-sidebar ui-sidebar-drawer">
      {/* 1. Header do Painel */}
      <div className="ui-sidebar-drawer__header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "7px",
              background: `${projectColor}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: projectColor,
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "18px" }}
            >
              history
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
          >
            <strong
              style={{
                fontSize: "12.5px",
                color: "var(--color-text-primary, #0f172a)",
                whiteSpace: "nowrap",
              }}
            >
              Histórico de Conversas
            </strong>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            title="Iniciar novo chat limpo"
            icon={
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "14px" }}
              >
                add_comment
              </span>
            }
          >
            Novo
          </Button>
          <IconButton
            size="sm"
            variant="ghost"
            title="Recarregar histórico"
            onClick={loadHistory}
            icon={
              <span className="material-symbols-outlined icon-xs">refresh</span>
            }
          />
          <IconButton
            size="sm"
            variant="ghost"
            title="Fechar painel de histórico"
            onClick={onClose}
            icon={
              <span className="material-symbols-outlined icon-sm">close</span>
            }
          />
        </div>
      </div>

      {/* 2. Feedback Toast Bar */}
      {feedback && (
        <div
          style={{
            padding: "7px 12px",
            background: "var(--color-success-subtle, #dcfce7)",
            color: "var(--color-success, #15803d)",
            fontSize: "11px",
            fontWeight: 600,
            textAlign: "center",
            borderBottom: "1px solid var(--color-border-subtle, #bbf7d0)",
            flexShrink: 0,
          }}
        >
          {feedback}
        </div>
      )}

      {/* 3. Corpo com Scroll Vertical */}
      <div
        className="ui-sidebar-drawer__body"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          padding: "12px",
        }}
      >
        {selectedSession ? (
          /* ================= VISUALIZAÇÃO DETALHADA DA SESSÃO ================= */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              minHeight: 0,
              gap: "10px",
            }}
          >
            {/* Header com Ações de Restauração */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
                paddingBottom: "8px",
                flexShrink: 0,
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSession(null)}
                icon={
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "15px" }}
                  >
                    arrow_back
                  </span>
                }
              >
                Voltar à lista
              </Button>
              <div style={{ display: "flex", gap: "6px" }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    handleRestoreToChat(selectedSession.session_id)
                  }
                  icon={
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "14px" }}
                    >
                      restore
                    </span>
                  }
                >
                  Restaurar no Chat
                </Button>
                <IconButton
                  size="sm"
                  variant="danger"
                  title="Excluir sessão"
                  onClick={() =>
                    handleDeleteSession(selectedSession.session_id)
                  }
                  icon={
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "15px" }}
                    >
                      delete
                    </span>
                  }
                />
              </div>
            </div>

            {/* Metadados da Sessão */}
            <div
              className="ui-card"
              style={{ padding: "9px 12px", flexShrink: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <strong
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-primary, #0f172a)",
                  }}
                >
                  {selectedSession.author?.name || "Developer"}
                </strong>
                <span className="ui-text-muted" style={{ fontSize: "10.5px" }}>
                  {formatRelativeTime(
                    selectedSession.updated_at || selectedSession.created_at,
                  )}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginTop: "4px",
                }}
              >
                <Badge variant="neutral" size="sm">
                  🤖 {selectedSession.model || "AI Assistant"}
                </Badge>
                <Badge variant="neutral" size="sm">
                  📄 {selectedSession.path || "Global"}
                </Badge>
                {selectedSession.metrics?.total_tokens ? (
                  <Badge variant="neutral" size="sm">
                    ⚡ {selectedSession.metrics.total_tokens} tokens
                  </Badge>
                ) : null}
              </div>
            </div>

            {/* Stream de Mensagens da Sessão */}
            <div
              className="ai-history-messages-stream"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                paddingRight: "2px",
              }}
            >
              {selectedSession.events && selectedSession.events.length > 0 ? (
                selectedSession.events.map((ev: any, i: number) => {
                  const isUser = ev.role === "user";
                  return (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        padding: "9px 11px",
                        borderRadius: "9px",
                        background: isUser
                          ? "var(--color-primary-subtle, #eff6ff)"
                          : "var(--color-surface-subtle, #f8fafc)",
                        border: `1px solid ${isUser ? "var(--color-primary-subtle, #bfdbfe)" : "var(--color-border-subtle, #e2e8f0)"}`,
                        fontSize: "11.5px",
                        lineHeight: 1.45,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "10.5px",
                            color: isUser
                              ? "var(--color-primary, #1d4ed8)"
                              : "var(--color-text-secondary, #475569)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "13px" }}
                          >
                            {isUser ? "person" : "smart_toy"}
                          </span>
                          {isUser
                            ? "Você"
                            : selectedSession.model || "Assistente"}
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            className="ui-text-muted"
                            style={{ fontSize: "10px" }}
                          >
                            {ev.timestamp
                              ? new Date(ev.timestamp).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : ""}
                          </span>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              handleCopyMessage(ev.text || ev.content || "", i)
                            }
                            title="Copiar mensagem"
                            icon={
                              <span
                                className="material-symbols-outlined"
                                style={{
                                  fontSize: "13px",
                                  color:
                                    copiedIndex === i
                                      ? "var(--color-success, #10b981)"
                                      : undefined,
                                }}
                              >
                                {copiedIndex === i ? "check" : "content_copy"}
                              </span>
                            }
                          />
                        </div>
                      </div>
                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          color: "var(--color-text-primary, #1e293b)",
                          wordBreak: "break-word",
                        }}
                      >
                        {ev.text || ev.content}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  className="ui-empty-state"
                  style={{ padding: "24px 16px" }}
                >
                  <span className="ui-text-muted" style={{ fontSize: "11px" }}>
                    Nenhuma mensagem registrada nesta sessão.
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= LISTA GERAL DE SESSÕES ================= */
          <>
            {/* 1. Card de Memória Consolidada (Handoff) */}
            <div
              className="ui-card"
              style={{
                padding: "9px 12px",
                background:
                  "var(--color-primary-subtle, rgba(37, 99, 235, 0.03))",
                borderColor:
                  "var(--color-primary-subtle, rgba(37, 99, 235, 0.16))",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
                onClick={() => setIsHandoffExpanded(!isHandoffExpanded)}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <span
                    className="material-symbols-outlined icon-xs"
                    style={{ color: "var(--color-primary, #2563eb)" }}
                  >
                    psychology
                  </span>
                  <strong
                    style={{
                      fontSize: "11.5px",
                      color: "var(--color-primary, #2563eb)",
                    }}
                  >
                    Memória Consolidada
                  </strong>
                </div>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <Badge variant="primary" size="sm">
                    .spec-memory
                  </Badge>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "15px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {isHandoffExpanded ? "expand_less" : "expand_more"}
                  </span>
                </div>
              </div>

              {isHandoffExpanded && (
                <div style={{ marginTop: "8px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      lineHeight: "1.4",
                      color: "var(--color-text-primary)",
                      maxHeight: "110px",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      fontFamily: "var(--font-family-mono)",
                      background: "var(--color-surface, #fff)",
                      padding: "6px 8px",
                      borderRadius: "5px",
                      border: "1px solid var(--color-border-subtle, #e2e8f0)",
                    }}
                  >
                    {briefing ||
                      'Nenhum handoff gerado ainda. Clique em "Consolidar" para salvar a síntese desta sessão.'}
                  </div>

                  <div
                    style={{ display: "flex", gap: "6px", marginTop: "7px" }}
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ flex: 1 }}
                      disabled={isConsolidating}
                      onClick={handleConsolidateMemory}
                      icon={
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "13px" }}
                        >
                          save_as
                        </span>
                      }
                    >
                      {isConsolidating
                        ? "Consolidando..."
                        : "Consolidar Memória"}
                    </Button>
                    {briefing && (
                      <IconButton
                        size="sm"
                        variant="danger"
                        onClick={handleResetMemory}
                        title="Limpar memória"
                        icon={
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: "15px" }}
                          >
                            delete_sweep
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Barra de Busca e Filtro de Conversas */}
            {sessions.length > 0 && (
              <SearchInput
                placeholder={`Buscar em ${sessions.length} conversas...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm("")}
              />
            )}

            {/* 3. Lista de Conversas */}
            {isLoading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "30px 16px",
                  color: "var(--color-text-muted)",
                  fontSize: "11.5px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "24px",
                    animation: "spin 1s infinite linear",
                    color: "var(--color-primary, #2563eb)",
                    display: "block",
                    margin: "0 auto 8px auto",
                  }}
                >
                  sync
                </span>
                Carregando histórico de conversas...
              </div>
            ) : filteredSessions.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 2px",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {searchTerm
                      ? `Resultados (${filteredSessions.length} de ${sessions.length})`
                      : `Conversas Recentes (${sessions.length})`}
                  </span>
                  <span className="ui-text-muted" style={{ fontSize: "10px" }}>
                    Mais recente primeiro
                  </span>
                </div>

                {filteredSessions.map((s, idx) => {
                  const isActive = s.session_id === currentSessionId;
                  const formattedTime = formatRelativeTime(
                    s.timestamp || s.updated_at || s.created_at,
                  );

                  return (
                    <div
                      key={s.session_id || idx}
                      className={`ui-sidebar-item ${isActive ? "ui-sidebar-item--active" : ""}`}
                      onClick={() => handleSelectSession(s.session_id)}
                      style={{
                        flexDirection: "column",
                        alignItems: "stretch",
                        gap: "5px",
                      }}
                    >
                      {/* Topo do Card: Autor, Badge Ativa e Data */}
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
                            gap: "5px",
                            minWidth: 0,
                          }}
                        >
                          <strong
                            style={{
                              fontSize: "11.5px",
                              color: "var(--color-text-primary, #0f172a)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "140px",
                            }}
                          >
                            {s.author?.name || "Developer"}
                          </strong>
                          {isActive && (
                            <Badge variant="primary" size="sm">
                              Ativa
                            </Badge>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <span
                            className="ui-text-muted"
                            style={{ fontSize: "10px" }}
                            title={
                              s.updated_at
                                ? new Date(s.updated_at).toLocaleString("pt-BR")
                                : ""
                            }
                          >
                            {formattedTime}
                          </span>
                          <IconButton
                            size="xs"
                            variant="ghost"
                            onClick={(e) =>
                              handleDeleteSession(s.session_id, e)
                            }
                            title="Excluir sessão"
                            icon={
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: "14px" }}
                              >
                                close
                              </span>
                            }
                          />
                        </div>
                      </div>

                      {/* Preview da Mensagem */}
                      {s.preview && (
                        <p
                          style={{
                            margin: 0,
                            fontSize: "11px",
                            color: "var(--color-text-secondary, #334155)",
                            lineHeight: 1.35,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          "{s.preview}"
                        </p>
                      )}

                      {/* Rodapé do Card */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "10px",
                          color: "var(--color-text-muted, #64748b)",
                          marginTop: "2px",
                          paddingTop: "4px",
                          borderTop:
                            "1px dashed var(--color-border-subtle, #f1f5f9)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "120px",
                            }}
                          >
                            📄 {s.path || "Global"}
                          </span>
                          <span>
                            💬 {s.event_count || s.metrics?.rounds || 1} msg
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleRestoreToChat(s.session_id, e)}
                          title="Restaurar esta conversa no Copilot"
                          icon={
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: "12px" }}
                            >
                              restore
                            </span>
                          }
                        >
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Estado Vazio */
              <div className="ui-empty-state" style={{ margin: "auto 0" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    margin: "0 auto 10px auto",
                    borderRadius: "50%",
                    background:
                      "var(--color-primary-subtle, rgba(37, 99, 235, 0.08))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-primary, #2563eb)",
                  }}
                >
                  <span className="material-symbols-outlined icon-md">
                    {searchTerm ? "search_off" : "forum"}
                  </span>
                </div>
                <strong
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    color: "var(--color-text-primary, #0f172a)",
                    marginBottom: "4px",
                  }}
                >
                  {searchTerm
                    ? "Nenhuma conversa encontrada"
                    : "Nenhum histórico arquivado ainda"}
                </strong>
                <p
                  className="ui-text-muted"
                  style={{
                    margin: "0 0 12px 0",
                    fontSize: "11px",
                    lineHeight: 1.4,
                  }}
                >
                  {searchTerm
                    ? `Nenhum resultado corresponde ao termo "${searchTerm}".`
                    : "Todas as suas mensagens no Copilot são gravadas e versionadas automaticamente no histórico seguro."}
                </p>
                {searchTerm ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                  >
                    Limpar Filtro
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleNewChat}
                    icon={
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "13px" }}
                      >
                        add
                      </span>
                    }
                  >
                    Iniciar Nova Conversa
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
