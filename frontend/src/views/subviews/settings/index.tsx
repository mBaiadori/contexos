import React from "react";
import { PageContainer, PageBody, AlertBanner } from "../../../components/ui";
import { SettingsHeader } from "./components/SettingsHeader";
import { TaxonomySection } from "./components/TaxonomySection";
import { LanguagesSection } from "./components/LanguagesSection";
import { AgentHarnessSection } from "./components/AgentHarnessSection";
import { AIEngineSection } from "./components/AIEngineSection";
import { UserSessionSection } from "./components/UserSessionSection";
import { DeleteTaxonomyModal } from "./components/DeleteTaxonomyModal";
import { LanguageModals } from "./components/LanguageModals";
import { useSettingsData } from "./hooks/useSettingsData";

export const SettingsSubView: React.FC = () => {
  const data = useSettingsData();

  return (
    <PageContainer>
      <SettingsHeader
        activeRepoName={data.activeRepo?.name}
        isSavingAll={data.isSavingAll}
        handleSaveAllSettings={data.handleSaveAllSettings}
      />

      <PageBody>
        <div
          style={{
            maxWidth: "960px",
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}
        >
          {data.saveStatus && (
            <AlertBanner
              type={data.saveStatus.includes("Erro") ? "error" : "success"}
              title={data.saveStatus}
              onClose={() => data.setSaveStatus(null)}
            />
          )}

          {/* 1. SEÇÃO: CATEGORIAS, TAGS & STATUS */}
          <TaxonomySection
            categories={data.categories}
            editingCatIndex={data.editingCatIndex}
            editCatName={data.editCatName}
            editCatColor={data.editCatColor}
            handleStartEditCategory={data.handleStartEditCategory}
            setEditCatName={data.setEditCatName}
            setEditCatColor={data.setEditCatColor}
            handleSaveEditCategory={data.handleSaveEditCategory}
            setEditingCatIndex={data.setEditingCatIndex}
            handleRequestRemoveCategory={data.handleRequestRemoveCategory}
            isAddingCategory={data.isAddingCategory}
            newCatName={data.newCatName}
            newCatColor={data.newCatColor}
            setIsAddingCategory={data.setIsAddingCategory}
            setNewCatName={data.setNewCatName}
            setNewCatColor={data.setNewCatColor}
            handleAddCategory={data.handleAddCategory}
            badges={data.badges}
            editingBadgeIndex={data.editingBadgeIndex}
            editBadgeName={data.editBadgeName}
            editBadgeColor={data.editBadgeColor}
            handleStartEditBadge={data.handleStartEditBadge}
            setEditBadgeName={data.setEditBadgeName}
            setEditBadgeColor={data.setEditBadgeColor}
            handleSaveEditBadge={data.handleSaveEditBadge}
            setEditingBadgeIndex={data.setEditingBadgeIndex}
            handleRequestRemoveBadge={data.handleRequestRemoveBadge}
            isAddingBadge={data.isAddingBadge}
            newBadgeName={data.newBadgeName}
            newBadgeColor={data.newBadgeColor}
            setIsAddingBadge={data.setIsAddingBadge}
            setNewBadgeName={data.setNewBadgeName}
            setNewBadgeColor={data.setNewBadgeColor}
            handleAddBadge={data.handleAddBadge}
            tags={data.tags}
            editingTagIndex={data.editingTagIndex}
            editTagName={data.editTagName}
            editTagColor={data.editTagColor}
            handleStartEditTag={data.handleStartEditTag}
            setEditTagName={data.setEditTagName}
            setEditTagColor={data.setEditTagColor}
            handleSaveEditTag={data.handleSaveEditTag}
            setEditingTagIndex={data.setEditingTagIndex}
            handleRequestRemoveTag={data.handleRequestRemoveTag}
            isAddingTag={data.isAddingTag}
            newTagName={data.newTagName}
            newTagColor={data.newTagColor}
            setIsAddingTag={data.setIsAddingTag}
            setNewTagName={data.setNewTagName}
            setNewTagColor={data.setNewTagColor}
            handleAddTag={data.handleAddTag}
            statuses={data.statuses}
            editingStatusIndex={data.editingStatusIndex}
            editStatusName={data.editStatusName}
            editStatusColor={data.editStatusColor}
            handleStartEditStatus={data.handleStartEditStatus}
            setEditStatusName={data.setEditStatusName}
            setEditStatusColor={data.setEditStatusColor}
            handleSaveEditStatus={data.handleSaveEditStatus}
            setEditingStatusIndex={data.setEditingStatusIndex}
            handleRequestRemoveStatus={data.handleRequestRemoveStatus}
            isAddingStatus={data.isAddingStatus}
            newStatusName={data.newStatusName}
            newStatusColor={data.newStatusColor}
            setIsAddingStatus={data.setIsAddingStatus}
            setNewStatusName={data.setNewStatusName}
            setNewStatusColor={data.setNewStatusColor}
            handleAddStatus={data.handleAddStatus}
          />

          {/* 1.5 SEÇÃO: GOVERNANÇA LINGUÍSTICA & IDIOMAS DO PROJETO */}
          <LanguagesSection
            defaultLanguage={data.defaultLanguage}
            setDefaultLanguage={data.setDefaultLanguage}
            supportedLanguages={data.supportedLanguages}
            setSupportedLanguages={data.setSupportedLanguages}
            translationEngine={data.translationEngine}
            setTranslationEngine={data.setTranslationEngine}
            docMetadataListLength={data.docMetadataList.length}
            setLanguageChangeDialog={data.setLanguageChangeDialog}
            setIsAddLanguageModalOpen={data.setIsAddLanguageModalOpen}
            setLanguageSearchFilter={data.setLanguageSearchFilter}
            handleSaveLanguages={data.handleSaveLanguages}
          />

          {/* 2. SEÇÃO: MOTOR DE IA E HARNESS DE AGENTES */}
          <section
            id="ai-engine"
            className="ui-stack ui-stack--md"
            style={{ scrollMarginTop: "72px" }}
          >
            {/* CARD 1: AGENTES CONECTADOS & CLI HARNESS */}
            <AgentHarnessSection
              harnessProvider={data.harnessProvider}
              setHarnessProvider={data.setHarnessProvider}
              detectedProviders={data.detectedProviders}
              agentEffort={data.agentEffort}
              setAgentEffort={data.setAgentEffort}
              isCheckingHarness={data.isCheckingHarness}
              checkHarnessProviders={data.checkHarnessProviders}
              harnessCheckFeedback={data.harnessCheckFeedback}
              antigravityCliPath={data.antigravityCliPath}
              setAntigravityCliPath={data.setAntigravityCliPath}
              claudeCliPath={data.claudeCliPath}
              setClaudeCliPath={data.setClaudeCliPath}
            />

            {/* CARD 2: MOTOR DE INTELIGÊNCIA ARTIFICIAL */}
            <AIEngineSection
              provider={data.provider}
              setProvider={data.setProvider}
              model={data.model}
              setModel={data.setModel}
              apiKey={data.apiKey}
              setApiKey={data.setApiKey}
              endpoint={data.endpoint}
              setEndpoint={data.setEndpoint}
              selectOptions={data.selectOptions}
              fetchModelsForProvider={data.fetchModelsForProvider}
              isLoadingModels={data.isLoadingModels}
              handleSaveAISettings={data.handleSaveAISettings}
            />
          </section>

          {/* 3. SEÇÃO: SESSÃO & GITHUB */}
          <UserSessionSection
            user={data.user}
            onLogout={data.logout}
          />
        </div>
      </PageBody>

      {/* Modal de Alerta de Referências na Exclusão */}
      <DeleteTaxonomyModal
        deleteDialog={data.deleteDialog}
        onClose={() => data.setDeleteDialog((d) => ({ ...d, isOpen: false }))}
      />

      {/* Modais de Governança Linguística */}
      <LanguageModals
        languageChangeDialog={data.languageChangeDialog}
        setLanguageChangeDialog={data.setLanguageChangeDialog}
        defaultLanguage={data.defaultLanguage}
        setDefaultLanguage={data.setDefaultLanguage}
        supportedLanguages={data.supportedLanguages}
        setSupportedLanguages={data.setSupportedLanguages}
        isAddLanguageModalOpen={data.isAddLanguageModalOpen}
        setIsAddLanguageModalOpen={data.setIsAddLanguageModalOpen}
        languageSearchFilter={data.languageSearchFilter}
        setLanguageSearchFilter={data.setLanguageSearchFilter}
        handleSaveLanguages={data.handleSaveLanguages}
      />
    </PageContainer>
  );
};

export default SettingsSubView;
