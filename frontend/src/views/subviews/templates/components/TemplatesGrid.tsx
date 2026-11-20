import React from "react";
import { Folder, Globe, Layers } from "lucide-react";
import { EmptyState, FilterChips, SearchInput, Spinner, Tabs } from "../../../../components/ui";
import type { TemplateItem } from "../../../../types";
import type { TemplateTab } from "../types";
import { TemplateCard } from "./TemplateCard";
import { TemplatesHeader } from "./TemplatesHeader";

interface TemplatesGridProps {
  templatesCount: number;
  onRefresh: () => void;
  onOpenCreate: () => void;
  activeTab: TemplateTab;
  onSelectTab: (tab: TemplateTab) => void;
  communityTemplatesCount: number;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  activeListCount: number;
  allCategories: string[];
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
  loading: boolean;
  filteredTemplates: TemplateItem[];
  templates: TemplateItem[];
  importFeedback: Record<string, { ok: boolean; msg: string }>;
  importingId: string | null;
  onOpenEdit: (tpl: TemplateItem) => void;
  onDelete: (tpl: TemplateItem, isCommunity: boolean) => void;
  onImport: (tpl: TemplateItem) => void;
}

export const TemplatesGrid: React.FC<TemplatesGridProps> = ({
  templatesCount,
  onRefresh,
  onOpenCreate,
  activeTab,
  onSelectTab,
  communityTemplatesCount,
  searchQuery,
  onSearchChange,
  activeListCount,
  allCategories,
  activeCategory,
  onSelectCategory,
  loading,
  filteredTemplates,
  templates,
  importFeedback,
  importingId,
  onOpenEdit,
  onDelete,
  onImport,
}) => {
  const tabList = [
    {
      id: "projeto",
      label: "Projeto",
      badge: templatesCount,
      icon: <Folder size={14} />,
    },
    {
      id: "comunidade",
      label: "Comunidade Global",
      badge: communityTemplatesCount,
      icon: <Globe size={14} />,
    },
  ];

  return (
    <div
      id="subview-templates"
      style={{
        padding: "24px 32px",
        maxWidth: "1400px",
        margin: "0 auto",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <TemplatesHeader
        templatesCount={templatesCount}
        onRefresh={onRefresh}
        onOpenCreate={onOpenCreate}
      />

      {/* Tabs & Search & Category Bar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <Tabs
            tabs={tabList}
            activeTab={activeTab}
            onChange={(tab) => onSelectTab(tab as any)}
            variant="pills"
          />

          <div style={{ width: "320px" }}>
            <SearchInput
              id="tpl-search-input"
              placeholder="Buscar template por título, tags..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
              onClear={() => onSearchChange("")}
            />
          </div>
        </div>

        {/* Categories Chips */}
        <FilterChips
          items={[
            { id: "all", label: `Todos (${activeListCount})` },
            ...allCategories.map((c) => ({ id: c, label: c })),
          ]}
          activeId={activeCategory}
          onChange={(cat) => onSelectCategory(cat)}
          size="sm"
        />
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div
          style={{
            padding: "60px 0",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Spinner size="lg" message="Carregando templates..." />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={<Layers size={48} />}
          title={
            activeTab === "projeto"
              ? "Nenhum template no projeto"
              : "Nenhum template na comunidade"
          }
          description={
            searchQuery
              ? `Nenhum resultado encontrado para "${searchQuery}".`
              : activeTab === "projeto"
                ? "Crie modelos estruturados de RFCs, ADRs e especificações técnicas."
                : "Explore e importe modelos da comunidade global."
          }
          actionLabel={
            activeTab === "projeto" ? "Criar Primeiro Template" : undefined
          }
          onAction={activeTab === "projeto" ? onOpenCreate : undefined}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredTemplates.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              tpl={tpl}
              activeTab={activeTab}
              templates={templates}
              importFeedback={importFeedback[tpl.id]}
              importingId={importingId}
              onOpenEdit={onOpenEdit}
              onDelete={onDelete}
              onImport={onImport}
            />
          ))}
        </div>
      )}
    </div>
  );
};
