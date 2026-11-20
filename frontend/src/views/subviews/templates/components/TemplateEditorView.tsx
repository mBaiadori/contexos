import React from "react";
import type { SelectOption } from "../../../../components/common/SelectDropdown";
import { NotionEditor } from "../../../../components/editor/NotionEditor";
import { AlertBanner } from "../../../../components/ui";
import type { SkillItem } from "../../../../types";
import type { BadgePreset } from "../types";
import { TemplateEditorTopBar } from "./TemplateEditorTopBar";
import { TemplatePropertiesPanel } from "./TemplatePropertiesPanel";

interface TemplateEditorViewProps {
  isEditMode: boolean;
  tplTemplateName: string;
  tplId: string;
  setTplId: (val: string) => void;
  showConfigDrawer: boolean;
  setShowConfigDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  tplSkills: string[];
  isSaving: boolean;
  saveError: string;
  setSaveError: (val: string) => void;
  saveSuccessMsg: string;
  setSaveSuccessMsg: (val: string) => void;
  onBack: () => void;
  onSaveTemplate: () => Promise<void>;
  tplTitle: string;
  onTitleChange: (val: string) => void;
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
  availableSkills: SkillItem[];
  skillDropdownOptions: SelectOption[];
  onSkillSelect: (skillId: string) => void;
  onRemoveSkill: (skillId: string) => void;
  tplContent: string;
  onContentChange: (val: string) => void;
  tplPrompt: string;
  onPromptChange: (val: string) => void;
}

export const TemplateEditorView: React.FC<TemplateEditorViewProps> = ({
  isEditMode,
  tplTemplateName,
  tplId,
  setTplId,
  showConfigDrawer,
  setShowConfigDrawer,
  tplSkills,
  isSaving,
  saveError,
  setSaveError,
  saveSuccessMsg,
  setSaveSuccessMsg,
  onBack,
  onSaveTemplate,
  tplTitle,
  onTitleChange,
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
  availableSkills,
  skillDropdownOptions,
  onSkillSelect,
  onRemoveSkill,
  tplContent,
  onContentChange,
  tplPrompt,
  onPromptChange,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        background: "var(--color-surface)",
      }}
    >
      <TemplateEditorTopBar
        isEditMode={isEditMode}
        tplTemplateName={tplTemplateName}
        tplId={tplId}
        showConfigDrawer={showConfigDrawer}
        tplSkillsCount={tplSkills.length}
        isSaving={isSaving}
        onBack={onBack}
        onToggleConfigDrawer={() => setShowConfigDrawer((v) => !v)}
        onSaveTemplate={onSaveTemplate}
      />

      {/* Feedback Banner */}
      {saveError && (
        <AlertBanner
          variant="error"
          title={saveError}
          onClose={() => setSaveError("")}
        />
      )}
      {saveSuccessMsg && (
        <AlertBanner
          variant="success"
          title={saveSuccessMsg}
          onClose={() => setSaveSuccessMsg("")}
        />
      )}

      {/* Painel de Propriedades do Template */}
      {showConfigDrawer && (
        <TemplatePropertiesPanel
          onClose={() => setShowConfigDrawer(false)}
          tplTitle={tplTitle}
          onTitleChange={onTitleChange}
          tplId={tplId}
          setTplId={setTplId}
          isEditMode={isEditMode}
          tplCategory={tplCategory}
          setTplCategory={setTplCategory}
          categoryDropdownOptions={categoryDropdownOptions}
          updateActiveEditingTemplate={updateActiveEditingTemplate}
          tplBadge={tplBadge}
          setTplBadge={setTplBadge}
          badgePresets={badgePresets}
          tplDesc={tplDesc}
          setTplDesc={setTplDesc}
          tplTags={tplTags}
          tagInputValue={tagInputValue}
          setTagInputValue={setTagInputValue}
          onAddTag={onAddTag}
          onRemoveTag={onRemoveTag}
          tplSkills={tplSkills}
          availableSkills={availableSkills}
          skillDropdownOptions={skillDropdownOptions}
          onSkillSelect={onSkillSelect}
          onRemoveSkill={onRemoveSkill}
        />
      )}

      {/* Embedded Notion Document Editor */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <NotionEditor
          content={tplContent}
          onChange={onContentChange}
          promptContent={tplPrompt}
          onPromptChange={onPromptChange}
          filePath={
            tplTemplateName
              ? `templates/${tplTemplateName}.md`
              : `templates/${tplId || "novo-template"}.md`
          }
          isTemplateMode={true}
          customTitle={tplTitle}
          onCustomTitleChange={onTitleChange}
          onCustomSave={onSaveTemplate}
          customSaveStatus={
            isSaving ? "Salvando template..." : "Template Pronto"
          }
        />
      </div>
    </div>
  );
};
