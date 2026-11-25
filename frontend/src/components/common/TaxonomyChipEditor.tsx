import React, { useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { ColorDotPicker } from "./ColorDotPicker";
import type { TaxonomyItem, DocumentMetadataItem } from "../../types";

export interface TaxonomyChipEditorProps {
  items: Array<TaxonomyItem | DocumentMetadataItem | any>;
  editingIndex: number | null;
  editName: string;
  editColor: string;
  onStartEdit: (index: number) => void;
  onEditNameChange: (val: string) => void;
  onEditColorChange: (val: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestRemove: (index: number) => void;
  isAdding: boolean;
  newName: string;
  newColor: string;
  onStartAdd: () => void;
  onNewNameChange: (val: string) => void;
  onNewColorChange: (val: string) => void;
  onSaveAdd: () => void;
  onCancelAdd: () => void;
  placeholder?: string;
  addTooltip?: string;
}

export const TaxonomyChipEditor: React.FC<TaxonomyChipEditorProps> = ({
  items,
  editingIndex,
  editName,
  editColor,
  onStartEdit,
  onEditNameChange,
  onEditColorChange,
  onSaveEdit,
  onCancelEdit,
  onRequestRemove,
  isAdding,
  newName,
  newColor,
  onStartAdd,
  onNewNameChange,
  onNewColorChange,
  onSaveAdd,
  onCancelAdd,
  placeholder = "Novo item...",
  addTooltip = "Adicionar item",
}) => {
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  return (
    <div className="ui-taxonomy-chip-container">
      {items.map((item, idx) => {
        const isEditing = editingIndex === idx;
        const color = isEditing ? editColor : (item.color || "#3b82f6");
        const metaItem = item as { label?: string; name?: string; id?: string };
        const name = metaItem.label || metaItem.name || metaItem.id || "";

        if (isEditing) {
          return (
            <div
              key={idx}
              className="ui-taxonomy-chip-edit"
              style={{
                backgroundColor: `${color}18`,
                border: `1px solid ${color}55`,
                color: color,
              }}
            >
              <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <ColorDotPicker
                  color={editColor}
                  onChange={onEditColorChange}
                  size={12}
                />
              </div>
              <input
                ref={editInputRef}
                type="text"
                className="ui-taxonomy-chip-input"
                value={editName}
                onChange={(e) => onEditNameChange(e.target.value)}
                onBlur={() => {
                  if (editName.trim()) {
                    onSaveEdit();
                  } else {
                    onCancelEdit();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveEdit();
                  if (e.key === "Escape") onCancelEdit();
                }}
                style={{
                  width: `${Math.max(editName.length, 2) + 1.5}ch`,
                  minWidth: "24px",
                }}
              />
              <button
                type="button"
                className="ui-taxonomy-chip__action-btn"
                onMouseDown={(e) => {
                  e.preventDefault(); // Evita o blur prematuro antes da remoção
                  onRequestRemove(idx);
                }}
                title="Remover"
                style={{ color: color }}
              >
                <X size={12} />
              </button>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className="ui-taxonomy-chip"
            style={{
              backgroundColor: `${color}14`,
              border: `1px solid ${color}35`,
              color: color,
              cursor: "pointer",
            }}
            onClick={() => onStartEdit(idx)}
            title="Clique para editar"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <ColorDotPicker
                color={color}
                onChange={(newCol) => {
                  onStartEdit(idx);
                  onEditColorChange(newCol);
                  onSaveEdit();
                }}
                size={12}
              />
            </div>
            <span className="ui-taxonomy-chip__label">
              {name}
            </span>
            <button
              type="button"
              className="ui-taxonomy-chip__action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onRequestRemove(idx);
              }}
              title="Remover"
              style={{ color: color }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* Chip de Adicionar Novo Item */}
      {isAdding ? (
        <div
          className="ui-taxonomy-chip-edit"
          style={{
            backgroundColor: `${newColor}18`,
            border: `1px solid ${newColor}55`,
            color: newColor,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <ColorDotPicker
              color={newColor}
              onChange={onNewColorChange}
              size={12}
            />
          </div>
          <input
            ref={addInputRef}
            type="text"
            className="ui-taxonomy-chip-input"
            placeholder={placeholder}
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            onBlur={() => {
              if (newName.trim()) {
                onSaveAdd();
              } else {
                onCancelAdd();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) onSaveAdd();
              if (e.key === "Escape") onCancelAdd();
            }}
            style={{
              width: `${Math.max(newName.length, placeholder.length) + 1.5}ch`,
              minWidth: "60px",
            }}
          />
          <button
            type="button"
            className="ui-taxonomy-chip__action-btn"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancelAdd();
            }}
            title="Cancelar"
            style={{ color: newColor }}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartAdd}
          title={addTooltip}
          className="ui-chip-add-btn"
        >
          <Plus size={13} style={{ display: "inline-block", verticalAlign: "middle" }} />
          <span style={{ display: "inline-block", verticalAlign: "middle" }}>Adicionar</span>
        </button>
      )}
    </div>
  );
};


