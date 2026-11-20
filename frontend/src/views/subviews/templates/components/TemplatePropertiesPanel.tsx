import React from "react";
import {
  FileText,
  Lock,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Type,
  X,
} from "lucide-react";
import {
  SelectDropdown,
  type SelectOption,
} from "../../../../components/common/SelectDropdown";
import {
  Badge,
  Chip,
  FormField,
  IconButton,
  Input,
} from "../../../../components/ui";
import type { SkillItem } from "../../../../types";
import type { BadgePreset } from "../types";

interface TemplatePropertiesPanelProps {
  onClose: () => void;
  tplTitle: string;
  onTitleChange: (val: string) => void;
  tplId: string;
  setTplId: (val: string) => void;
  isEditMode: boolean;
  tplCategory: string;
  setTplCategory: (val: string) => void;
  categoryDropdownOptions: SelectOption[];
  updateActiveEditingTemplate: (patch: any) => void;
  tplBadge: string;
  setTplBadge: (val: string) => void;
  badgePresets: BadgePreset[];
  tplDesc: string;
  setTplDesc: (val: string) => void;
  tplTags: string[];
  tagInputValue: string;
  setTagInputValue: (val: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  tplSkills: string[];
  availableSkills: SkillItem[];
  skillDropdownOptions: SelectOption[];
  onSkillSelect: (skillId: string) => void;
  onRemoveSkill: (skillId: string) => void;
}

export const TemplatePropertiesPanel: React.FC<TemplatePropertiesPanelProps> = ({
  onClose,
  tplTitle,
  onTitleChange,
  tplId,
  setTplId,
  isEditMode,
  tplCategory,
  setTplCategory,
  categoryDropdownOptions,
  updateActiveEditingTemplate,
  tplBadge,
  setTplBadge,
  badgePresets,
  tplDesc,
  setTplDesc,
  tplTags,
  tagInputValue,
  setTagInputValue,
  onAddTag,
  onRemoveTag,
  tplSkills,
  availableSkills,
  skillDropdownOptions,
  onSkillSelect,
  onRemoveSkill,
}) => {
  return (
    <div
      id="template-properties-panel"
      style={{
        background: "var(--color-surface-container)",
        borderBottom: "1px solid var(--color-outline-variant)",
        padding: "16px 24px 20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        flexShrink: 0,
        boxShadow: "0 4px 18px rgba(0, 0, 0, 0.08)",
      }}
    >
      {/* Header do Painel */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-outline-variant)",
          paddingBottom: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <SlidersHorizontal
            size={16}
            style={{ color: "var(--color-primary)" }}
          />
          <div>
            <span
              style={{
                fontSize: "13.5px",
                fontWeight: 700,
                color: "var(--color-on-surface)",
              }}
            >
              Propriedades do Template
            </span>
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-on-surface-variant)",
                marginLeft: "8px",
              }}
            >
              Identificação, metadados de catálogo e skills recomendadas
            </span>
          </div>
        </div>

        <IconButton
          variant="ghost"
          size="sm"
          onClick={onClose}
          tooltip="Fechar propriedades"
          icon={<X size={15} />}
        />
      </div>

      {/* Linha 1: Título, Slug, Categoria e Badge */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1.1fr 0.9fr",
          gap: "14px",
          alignItems: "flex-start",
        }}
      >
        {/* Título */}
        <FormField
          label="Título do Template"
          required
          helperText="Nome de exibição principal"
        >
          <Input
            id="tpl-prop-title"
            placeholder="ex: Especificação de Microsserviço"
            value={tplTitle}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onTitleChange(e.target.value)}
            startIcon={
              <Type size={14} style={{ color: "var(--color-outline)" }} />
            }
          />
        </FormField>

        {/* Slug / Arquivo */}
        <FormField
          label={`Slug / Arquivo ${!isEditMode ? "*" : ""}`}
          helperText={
            isEditMode
              ? "Identificador fixo após criação"
              : `templates/${tplId || "slug"}.md`
          }
        >
          <Input
            id="tpl-prop-slug"
            placeholder="ex: microservice-spec"
            value={tplId}
            disabled={isEditMode}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setTplId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ""))
            }
            startIcon={
              isEditMode ? (
                <Lock size={13} style={{ color: "var(--color-outline)" }} />
              ) : (
                <FileText size={13} style={{ color: "var(--color-outline)" }} />
              )
            }
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "12.5px",
            }}
          />
        </FormField>

        {/* Categoria com SelectDropdown */}
        <FormField label="Categoria" helperText="Agrupamento no catálogo">
          <SelectDropdown
            id="tpl-prop-category"
            value={tplCategory}
            options={categoryDropdownOptions}
            onChange={(val) => {
              setTplCategory(val);
              updateActiveEditingTemplate({ category: val });
            }}
            placeholder="Selecione uma categoria..."
            searchable={true}
            searchPlaceholder="Filtrar categorias..."
            variant="form"
            leadingIcon="folder"
          />
        </FormField>

        {/* Badge com Presets */}
        <FormField
          label="Badge / Tipo"
          helperText="Etiqueta curta de classificação"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <Input
              id="tpl-prop-badge"
              placeholder="ex: RFC, ADR, PRD"
              value={tplBadge}
              maxLength={10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const val = e.target.value.toUpperCase();
                setTplBadge(val);
                updateActiveEditingTemplate({ badge: val });
              }}
              style={{
                textTransform: "uppercase",
                fontWeight: 600,
                letterSpacing: "0.5px",
              }}
              rightIcon={
                tplBadge ? (
                  <Badge
                    size="sm"
                    style={
                      badgePresets.find((b) => b.name === tplBadge)?.color
                        ? {
                            background: `${badgePresets.find((b) => b.name === tplBadge)?.color}25`,
                            color: badgePresets.find((b) => b.name === tplBadge)?.color,
                            borderColor: badgePresets.find((b) => b.name === tplBadge)?.color,
                          }
                        : undefined
                    }
                    variant="primary"
                  >
                    {tplBadge}
                  </Badge>
                ) : undefined
              }
            />
            <div
              style={{
                display: "flex",
                gap: "4px",
                flexWrap: "wrap",
              }}
            >
              {badgePresets.map((preset) => {
                const isSelected = tplBadge === preset.name;
                return (
                  <Chip
                    key={preset.name}
                    size="xs"
                    active={isSelected}
                    color={preset.color}
                    onClick={() => {
                      setTplBadge(preset.name);
                      updateActiveEditingTemplate({ badge: preset.name });
                    }}
                    title={preset.description || preset.name}
                  >
                    {preset.name}
                  </Chip>
                );
              })}
            </div>
          </div>
        </FormField>
      </div>

      {/* Linha 2: Descrição e Tags de Busca */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1.2fr",
          gap: "14px",
          alignItems: "flex-start",
        }}
      >
        {/* Descrição */}
        <FormField
          label="Descrição da Finalidade"
          helperText="Orientação sobre quando e por que adotar este documento"
        >
          <Input
            id="tpl-prop-desc"
            placeholder="ex: Modelo para especificação e contratos de microsserviços..."
            value={tplDesc}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setTplDesc(e.target.value);
              updateActiveEditingTemplate({
                description: e.target.value,
              });
            }}
          />
        </FormField>

        {/* Tags Interativas */}
        <FormField
          label="Tags de Busca & Indexação"
          helperText="Pressione Enter ou vírgula para adicionar tags"
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              background: "var(--color-surface-container-high)",
              border: "1px solid var(--color-outline-variant)",
              borderRadius: "var(--radius-md, 6px)",
              minHeight: "38px",
              boxSizing: "border-box",
            }}
          >
            {tplTags.map((tag) => (
              <Chip
                key={tag}
                size="xs"
                variant="outlined"
                icon={<Tag size={11} />}
                onRemove={() => onRemoveTag(tag)}
              >
                {tag}
              </Chip>
            ))}

            <input
              id="tpl-new-tag-input"
              type="text"
              placeholder={
                tplTags.length === 0
                  ? "Adicionar tag (ex: backend, rest)..."
                  : "+ tag..."
              }
              value={tagInputValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val.includes(",")) {
                  val.split(",").forEach((part) => onAddTag(part));
                } else {
                  setTagInputValue(val);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  onAddTag(tagInputValue);
                } else if (
                  e.key === "Backspace" &&
                  !tagInputValue &&
                  tplTags.length > 0
                ) {
                  onRemoveTag(tplTags[tplTags.length - 1]);
                }
              }}
              onBlur={() => {
                if (tagInputValue.trim()) {
                  onAddTag(tagInputValue);
                }
              }}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "12px",
                color: "var(--color-on-surface)",
                flex: 1,
                minWidth: "110px",
              }}
            />
          </div>
        </FormField>
      </div>

      {/* Linha 3: Skills com SelectDropdown e visualização de chips */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          background: "var(--color-surface-container-low)",
          padding: "12px 14px",
          borderRadius: "var(--radius-md, 8px)",
          border: "1px solid var(--color-outline-variant)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--color-on-surface)",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Sparkles
                size={13}
                style={{ color: "var(--color-primary)" }}
              />
              Skills
            </div>
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--color-on-surface-variant)",
                marginTop: "2px",
              }}
            >
              Vincule diretrizes técnicas para o Copilot carregar
              automaticamente durante a edição deste modelo.
            </div>
          </div>

          {/* Dropdown com busca para seleção de skills */}
          <div style={{ minWidth: "280px", maxWidth: "420px", flex: 1 }}>
            <SelectDropdown
              id="tpl-skill-picker"
              value=""
              options={skillDropdownOptions}
              onChange={onSkillSelect}
              placeholder="+ Vincular skill do catálogo..."
              searchable={true}
              searchPlaceholder="Buscar skill por nome ou descrição..."
              leadingIcon="psychology"
              variant="compact"
            />
          </div>
        </div>

        {/* Lista de Skills Selecionadas */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginTop: "4px",
          }}
        >
          {tplSkills.length === 0 ? (
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--color-outline)",
                fontStyle: "italic",
                padding: "4px 2px",
              }}
            >
              Nenhuma skill vinculada. Escolha uma skill acima para conectar
              regras especializadas de IA.
            </span>
          ) : (
            tplSkills.map((skillId) => {
              const skillInfo = availableSkills.find((s) => s.id === skillId);
              const skillLabel =
                skillInfo?.title || skillInfo?.name || skillId;
              return (
                <Chip
                  key={skillId}
                  size="sm"
                  color="var(--md-sys-color-primary, #1a73e8)"
                  icon={<Sparkles size={12} />}
                  onRemove={() => onRemoveSkill(skillId)}
                  title={`Desvincular ${skillLabel}`}
                >
                  {skillLabel}
                </Chip>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
