import React, { useEffect, useState, useRef } from "react";
import { BookOpen, ArrowUpRight, Layers } from "lucide-react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { useNavigate } from "react-router-dom";

export interface DictionaryPopoverData {
  termId?: string;
  term: string;
  codename: string;
  domain?: string;
  definition: string;
  synonyms?: string[];
  rect: DOMRect;
}

interface DictionaryPopoverProps {
  data: DictionaryPopoverData | null;
  onClose: () => void;
  onOpenDictionary?: (term: string) => void;
}

export const DictionaryPopover: React.FC<DictionaryPopoverProps> = ({
  data,
  onClose,
  onOpenDictionary,
}) => {
  const { activeRepo, projectMetaOptions, projectConfig } = useWorkspace();
  const navigate = useNavigate();
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placeAbove: boolean;
  }>({
    top: 0,
    left: 0,
    placeAbove: false,
  });

  // Encontra a cor da categoria do domain a partir do .project.config.json
  const domainColor = React.useMemo(() => {
    if (!data?.domain) return "#64748b";
    const categories =
      projectMetaOptions?.categories || projectConfig?.categories || [];
    const found = (categories as Array<{ name?: string; label?: string; color?: string }>).find(
      (c) =>
        (c.name || "").toLowerCase() === data.domain?.toLowerCase() ||
        (c.label || "").toLowerCase() === data.domain?.toLowerCase(),
    );
    return found?.color || "#3b82f6";
  }, [data?.domain, projectMetaOptions, projectConfig]);

  const startCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      onClose();
      closeTimerRef.current = null;
    }, 1800);
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  // Posicionamento inteligente na tela
  useEffect(() => {
    if (!data || !popoverRef.current) return;
    const rect = data.rect;
    const popWidth = 340;
    const popHeight = 220;
    const padding = 12;

    let left = rect.left + rect.width / 2 - popWidth / 2;
    if (left < padding) left = padding;
    if (left + popWidth > window.innerWidth - padding) {
      left = window.innerWidth - popWidth - padding;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < popHeight && rect.top > popHeight;

    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;

    setCoords({ top, left, placeAbove });
    startCloseTimer();

    return () => {
      clearCloseTimer();
    };
  }, [data]);

  // Click outside listener e tecla Escape para fechar imediatamente
  useEffect(() => {
    if (!data) return;

    const handleDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        // Se não clicou dentro do popover, verifica se não foi no span do termo
        const target = e.target as HTMLElement;
        if (!target.closest(".dict-term-highlight")) {
          onClose();
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [data, onClose]);

  if (!data) return null;

  const handleGoToDictionary = () => {
    onClose();
    if (onOpenDictionary) {
      onOpenDictionary(data.term);
      return;
    }
    if (activeRepo) {
      navigate(
        `/repo/${activeRepo.name}/dictionary?search=${encodeURIComponent(data.term)}`,
      );
    }
  };

  return (
    <div
      ref={popoverRef}
      className="dict-popover-card"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transform: coords.placeAbove ? "translateY(-100%)" : "none",
        zIndex: 9999,
      }}
      onMouseEnter={() => {
        clearCloseTimer();
      }}
      onMouseLeave={() => {
        startCloseTimer();
      }}
    >
      {/* Header */}
      <div className="dict-popover-header">
        <div className="dict-popover-title-row">
          <div className="dict-popover-icon-box">
            <BookOpen size={16} />
          </div>
          <div className="dict-popover-title" title={data.term}>
            {data.term}
          </div>
        </div>

        {/* Badges: Codename & Domain */}
        <div className="dict-popover-badges">
          {data.codename && (
            <span
              className="dict-popover-badge-codename"
              title="Codename Ubíquo"
            >
              <code>{data.codename}</code>
            </span>
          )}
          {data.domain && (
            <span
              className="dict-popover-badge-domain"
              style={{
                backgroundColor: `${domainColor}15`,
                color: domainColor,
                borderColor: `${domainColor}40`,
              }}
              title="Domínio / Categoria"
            >
              <Layers
                size={11}
                style={{ marginRight: 3, verticalAlign: "middle" }}
              />
              {data.domain}
            </span>
          )}
        </div>
      </div>

      {/* Body: Definition */}
      <div className="dict-popover-body">
        <p className="dict-popover-def">
          {data.definition || "Sem definição cadastrada."}
        </p>

        {/* Synonyms */}
        {data.synonyms && data.synonyms.length > 0 && (
          <div className="dict-popover-synonyms-section">
            <span className="dict-popover-syn-label">Sinônimos:</span>
            <div className="dict-popover-syn-chips">
              {data.synonyms.map((syn, idx) => (
                <span key={idx} className="dict-popover-syn-chip">
                  {syn}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer / Action */}
      <div className="dict-popover-footer">
        <button
          type="button"
          className="dict-popover-action-btn"
          onClick={handleGoToDictionary}
        >
          <span>Ver no Dicionário</span>
          <ArrowUpRight size={13} />
        </button>
      </div>
    </div>
  );
};
