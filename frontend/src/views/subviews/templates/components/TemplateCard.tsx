import React from "react";
import { Check, Download, Edit3, MinusCircle, Sparkles, Tag, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, IconButton } from "../../../../components/ui";
import type { TemplateItem } from "../../../../types";
import type { TemplateTab } from "../types";

interface TemplateCardProps {
  tpl: TemplateItem;
  activeTab: TemplateTab;
  templates: TemplateItem[];
  importFeedback?: { ok: boolean; msg: string };
  importingId: string | null;
  onOpenEdit: (tpl: TemplateItem) => void;
  onDelete: (tpl: TemplateItem, isCommunity: boolean) => void;
  onImport: (tpl: TemplateItem) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  tpl,
  activeTab,
  templates,
  importFeedback,
  importingId,
  onOpenEdit,
  onDelete,
  onImport,
}) => {
  const alreadyImported =
    activeTab === "comunidade" && templates.some((t) => t.id === tpl.id);

  return (
    <Card
      key={tpl.id}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <CardHeader
        title={tpl.title}
        subtitle={tpl.templateName || tpl.id}
        action={
          <div style={{ display: "flex", gap: "4px" }}>
            {tpl.category && (
              <Badge variant="primary" size="sm">
                {tpl.category}
              </Badge>
            )}
            {tpl.badge && (
              <Badge variant="success" size="sm">
                {tpl.badge}
              </Badge>
            )}
            {tpl.source === "community" && (
              <Badge variant="purple" size="sm">
                Comunidade
              </Badge>
            )}
          </div>
        }
      />

      <CardContent
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12.5px",
            color: "var(--color-on-surface-variant)",
            lineHeight: 1.5,
            flex: 1,
          }}
        >
          {tpl.description ||
            (tpl.prompt
              ? `Prompt: ${tpl.prompt.slice(0, 90)}...`
              : "Sem descrição adicional.")}
        </p>

        {(tpl.tags || []).length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {(tpl.tags || []).slice(0, 4).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "10.5px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "var(--color-surface-container-high)",
                  color: "var(--color-outline)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                }}
              >
                <Tag size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {(tpl.skills || []).length > 0 && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {(tpl.skills || []).map((skillId: string) => (
              <span
                key={skillId}
                style={{
                  fontSize: "10.5px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  background: "var(--color-primary-container)",
                  color: "var(--color-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  fontWeight: 600,
                }}
              >
                <Sparkles size={10} />
                {skillId}
              </span>
            ))}
          </div>
        )}

        {importFeedback && (
          <div
            style={{
              fontSize: "11.5px",
              color: importFeedback.ok
                ? "var(--color-success)"
                : "var(--color-error)",
              fontWeight: 600,
            }}
          >
            {importFeedback.ok ? "✓" : "✗"} {importFeedback.msg}
          </div>
        )}
      </CardContent>

      <CardFooter
        style={{
          borderTop: "1px solid var(--color-outline-variant)",
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        {activeTab === "projeto" ? (
          <>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => onOpenEdit(tpl)}
              icon={<Edit3 size={14} />}
            >
              Editar Template
            </Button>
            <IconButton
              id={`btn-delete-tpl-${tpl.id}`}
              variant="ghost"
              size="sm"
              tooltip="Remover template"
              onClick={() => onDelete(tpl, false)}
              icon={
                <Trash2
                  size={15}
                  style={{ color: "var(--color-error)" }}
                />
              }
            />
          </>
        ) : alreadyImported ? (
          <div
            style={{
              display: "flex",
              gap: "6px",
              width: "100%",
              alignItems: "center",
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: "12px",
                color: "var(--color-success)",
                background: "var(--color-surface-container-high)",
                padding: "6px 10px",
                borderRadius: "var(--radius-md, 6px)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                fontWeight: 600,
              }}
            >
              <Check size={14} /> Importado no Projeto
            </span>
            <Button
              id={`btn-unimport-community-${tpl.id}`}
              variant="ghost"
              size="sm"
              onClick={() => onDelete(tpl, false)}
              icon={
                <MinusCircle
                  size={14}
                  style={{ color: "var(--color-warning)" }}
                />
              }
            >
              Remover
            </Button>
          </div>
        ) : (
          <Button
            id={`btn-import-community-${tpl.id}`}
            variant="primary"
            size="sm"
            fullWidth
            disabled={importingId === tpl.id}
            onClick={() => onImport(tpl)}
            icon={<Download size={14} />}
          >
            {importingId === tpl.id
              ? "Importando..."
              : "Importar para o Projeto"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
