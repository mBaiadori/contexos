import React, { useRef, useEffect } from "react";
import { Folder, FileText } from "lucide-react";
import type { TemplateItem } from "../../types";
import { TemplatePickerModal } from "../modals/TemplatePickerModal";
import type { InlineCreatingState } from "./types";

interface InlineCreateRowProps {
  inlineCreating: InlineCreatingState | null;
  inlineValue: string;
  setInlineValue: (val: string) => void;
  selectedTemplate: TemplateItem | { id?: string; name?: string; title?: string; [key: string]: unknown } | null;
  setSelectedTemplate: (tpl: TemplateItem | null) => void;
  templatePickerOpen: boolean;
  setTemplatePickerOpen: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmittingRef: React.MutableRefObject<boolean>;
}

export const InlineCreateRow: React.FC<InlineCreateRowProps> = ({
  inlineCreating,
  inlineValue,
  setInlineValue,
  selectedTemplate,
  setSelectedTemplate,
  templatePickerOpen,
  setTemplatePickerOpen,
  onConfirm,
  onCancel,
  isSubmittingRef,
}) => {
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const isFolder = inlineCreating?.isFolder ?? false;

  useEffect(() => {
    if (inlineInputRef.current) {
      inlineInputRef.current.focus();
      inlineInputRef.current.select();
    }
  }, []);

  return (
    <>
      <div
        className="tree-inline-create-row"
        onClick={(e) => e.stopPropagation()}
      >
        {isFolder ? (
          <Folder size={14} color="#2563eb" style={{ flexShrink: 0 }} />
        ) : (
          <FileText size={14} color="#2563eb" style={{ flexShrink: 0 }} />
        )}
        <input
          ref={inlineInputRef}
          type="text"
          className="tree-inline-input"
          placeholder={isFolder ? "nome-da-pasta" : "nome-do-arquivo"}
          value={inlineValue}
          onChange={(e) => setInlineValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onConfirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          onBlur={() => {
            if (templatePickerOpen) return;
            if (isSubmittingRef.current) return;
            if (!inlineValue.trim()) {
              onCancel();
            } else {
              onConfirm();
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        {!isFolder && (
          <button
            type="button"
            title={
              selectedTemplate
                ? `Template: ${selectedTemplate.title}`
                : "Usar template"
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setTemplatePickerOpen(true);
            }}
            style={{
              flexShrink: 0,
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid",
              fontSize: "10px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: selectedTemplate
                ? "var(--color-primary-container)"
                : "transparent",
              color: selectedTemplate
                ? "var(--color-primary)"
                : "var(--color-outline)",
              borderColor: selectedTemplate
                ? "var(--color-primary)"
                : "var(--color-outline-variant)",
              display: "flex",
              alignItems: "center",
              gap: "3px",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "12px" }}
            >
              description
            </span>
            {selectedTemplate
              ? String(selectedTemplate.title || selectedTemplate.name || "").slice(0, 12)
              : "Template"}
          </button>
        )}
      </div>

      <TemplatePickerModal
        isOpen={templatePickerOpen}
        onClose={() => {
          setTemplatePickerOpen(false);
          setTimeout(() => inlineInputRef.current?.focus(), 50);
        }}
        onSelect={(tpl) => {
          setSelectedTemplate(tpl);
          setTemplatePickerOpen(false);
          setTimeout(() => inlineInputRef.current?.focus(), 50);
        }}
      />
    </>
  );
};
