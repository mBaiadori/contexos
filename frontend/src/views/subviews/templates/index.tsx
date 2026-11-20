import React from "react";
import { TemplateEditorView } from "./components/TemplateEditorView";
import { TemplatesGrid } from "./components/TemplatesGrid";
import { useTemplatesData } from "./hooks/useTemplatesData";

interface TemplatesSubViewProps {
  onApplyTemplate?: (filePath: string) => void;
}

export const TemplatesSubView: React.FC<TemplatesSubViewProps> = () => {
  const {
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    templates,
    communityTemplates,
    loading,
    importingId,
    fetchTemplates,
    fetchCommunityTemplates,
    allCategories,
    activeList,
    filteredTemplates,
    badgePresets,
    categoryDropdownOptions,
    skillDropdownOptions,
    availableSkills,
    isEditMode,
    isSaving,
    saveError,
    setSaveError,
    saveSuccessMsg,
    setSaveSuccessMsg,
    showConfigDrawer,
    setShowConfigDrawer,
    tplId,
    setTplId,
    tplTemplateName,
    tplTitle,
    tplCategory,
    setTplCategory,
    tplBadge,
    setTplBadge,
    tplDesc,
    setTplDesc,
    tplTags,
    tagInputValue,
    setTagInputValue,
    tplContent,
    tplPrompt,
    tplSkills,
    importFeedback,
    handleOpenCreate,
    handleOpenEdit,
    handleAddTag,
    handleRemoveTag,
    handleSkillSelect,
    handleRemoveSkill,
    handleSaveTemplate,
    handleDelete,
    handleImport,
    handleContentChange,
    handlePromptChange,
    handleTitleChange,
    updateActiveEditingTemplate,
  } = useTemplatesData();

  if (viewMode === "editor") {
    return (
      <TemplateEditorView
        isEditMode={isEditMode}
        tplTemplateName={tplTemplateName}
        tplId={tplId}
        setTplId={setTplId}
        showConfigDrawer={showConfigDrawer}
        setShowConfigDrawer={setShowConfigDrawer}
        tplSkills={tplSkills}
        isSaving={isSaving}
        saveError={saveError}
        setSaveError={setSaveError}
        saveSuccessMsg={saveSuccessMsg}
        setSaveSuccessMsg={setSaveSuccessMsg}
        onBack={() => {
          setViewMode("grid");
          fetchTemplates();
        }}
        onSaveTemplate={handleSaveTemplate}
        tplTitle={tplTitle}
        onTitleChange={handleTitleChange}
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
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        availableSkills={availableSkills}
        skillDropdownOptions={skillDropdownOptions}
        onSkillSelect={handleSkillSelect}
        onRemoveSkill={handleRemoveSkill}
        tplContent={tplContent}
        onContentChange={handleContentChange}
        tplPrompt={tplPrompt}
        onPromptChange={handlePromptChange}
      />
    );
  }

  return (
    <TemplatesGrid
      templatesCount={templates.length}
      onRefresh={() => {
        fetchTemplates();
        fetchCommunityTemplates();
      }}
      onOpenCreate={handleOpenCreate}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      communityTemplatesCount={communityTemplates.length}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeListCount={activeList.length}
      allCategories={allCategories}
      activeCategory={activeCategory}
      onSelectCategory={setActiveCategory}
      loading={loading}
      filteredTemplates={filteredTemplates}
      templates={templates}
      importFeedback={importFeedback}
      importingId={importingId}
      onOpenEdit={handleOpenEdit}
      onDelete={handleDelete}
      onImport={handleImport}
    />
  );
};

export default TemplatesSubView;
