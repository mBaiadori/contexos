import React from "react";
import { ArrowUpDown, Filter, Layers, LayoutGrid, List } from "lucide-react";
import { SearchInput } from "../../../../components/ui";
import { DDD_CATEGORIES, type SortOption, type ViewMode } from "../types";

interface DictionaryToolbarProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  categories: Array<{ name: string; label?: string; color?: string }>;
  selectedDomainFilter: string;
  onSelectDomainFilter: (val: string) => void;
  selectedCategoryFilter: string;
  onSelectCategoryFilter: (val: string) => void;
  sortOption: SortOption;
  onSortChange: (val: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (val: ViewMode) => void;
  termsCount: number;
  availableLetters: string[];
  selectedLetter: string;
  onSelectLetter: (val: string) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

export const DictionaryToolbar: React.FC<DictionaryToolbarProps> = ({
  searchTerm,
  onSearchChange,
  categories,
  selectedDomainFilter,
  onSelectDomainFilter,
  selectedCategoryFilter,
  onSelectCategoryFilter,
  sortOption,
  onSortChange,
  viewMode,
  onViewModeChange,
  termsCount,
  availableLetters,
  selectedLetter,
  onSelectLetter,
  hasActiveFilters,
  onClearFilters,
}) => {
  return (
    <div
      style={{
        background: "var(--color-surface, #ffffff)",
        borderRadius: "10px",
        border: "1px solid var(--color-outline-variant, #e2e8f0)",
        padding: "10px 14px",
        marginBottom: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Main Controls Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        {/* Search Input */}
        <div style={{ flex: "1 1 260px", maxWidth: "440px" }}>
          <SearchInput
            id="dict-search-input"
            placeholder="Buscar termo, codename, sinônimo..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            onClear={() => onSearchChange("")}
          />
        </div>

        {/* Filter Selectors & View Mode */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          {/* Domain Filter */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--color-surface-container, #f8fafc)",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              borderRadius: "6px",
              padding: "0 8px",
              height: "32px",
            }}
          >
            <Filter size={13} style={{ color: "var(--color-on-surface-variant, #64748b)", marginRight: "5px" }} />
            <select
              id="dict-domain-filter"
              value={selectedDomainFilter}
              onChange={(e) => onSelectDomainFilter(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-on-surface, #1e293b)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
                padding: "4px 0",
              }}
            >
              <option value="ALL">Todos os Domínios</option>
              {categories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.label || cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* DDD Category Filter */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--color-surface-container, #f8fafc)",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              borderRadius: "6px",
              padding: "0 8px",
              height: "32px",
            }}
          >
            <Layers size={13} style={{ color: "var(--color-on-surface-variant, #64748b)", marginRight: "5px" }} />
            <select
              id="dict-category-filter"
              value={selectedCategoryFilter}
              onChange={(e) => onSelectCategoryFilter(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-on-surface, #1e293b)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
                padding: "4px 0",
              }}
            >
              <option value="ALL">Todos os Tipos (DDD)</option>
              {DDD_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort selector */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "var(--color-surface-container, #f8fafc)",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              borderRadius: "6px",
              padding: "0 8px",
              height: "32px",
            }}
          >
            <ArrowUpDown size={13} style={{ color: "var(--color-on-surface-variant, #64748b)", marginRight: "5px" }} />
            <select
              id="dict-sort-select"
              value={sortOption}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-on-surface, #1e293b)",
                fontSize: "12.5px",
                fontWeight: 500,
                cursor: "pointer",
                outline: "none",
                padding: "4px 0",
              }}
            >
              <option value="name-asc">Ordem (A-Z)</option>
              <option value="name-desc">Ordem (Z-A)</option>
              <option value="code-asc">Por Codename</option>
              <option value="domain-asc">Por Domínio</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "var(--color-surface-container, #f1f5f9)",
              padding: "2px",
              borderRadius: "6px",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              height: "28px",
            }}
          >
            <button
              type="button"
              id="btn-view-mode-table"
              onClick={() => onViewModeChange("table")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                fontSize: "12px",
                fontWeight: viewMode === "table" ? 600 : 500,
                cursor: "pointer",
                background: viewMode === "table" ? "var(--color-surface, #ffffff)" : "transparent",
                color: viewMode === "table" ? "var(--color-on-surface, #0f172a)" : "var(--color-on-surface-variant, #64748b)",
                boxShadow: viewMode === "table" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <List size={13} />
              <span>Tabela</span>
            </button>
            <button
              type="button"
              id="btn-view-mode-grid"
              onClick={() => onViewModeChange("grid")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "3px 8px",
                borderRadius: "4px",
                border: "none",
                fontSize: "12px",
                fontWeight: viewMode === "grid" ? 600 : 500,
                cursor: "pointer",
                background: viewMode === "grid" ? "var(--color-surface, #ffffff)" : "transparent",
                color: viewMode === "grid" ? "var(--color-on-surface, #0f172a)" : "var(--color-on-surface-variant, #64748b)",
                boxShadow: viewMode === "grid" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <LayoutGrid size={13} />
              <span>Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Alphabet Jump Strip */}
      {termsCount > 5 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "3px",
            overflowX: "auto",
            paddingTop: "6px",
            borderTop: "1px solid var(--color-outline-variant, #f1f5f9)",
          }}
        >
          <button
            type="button"
            onClick={() => onSelectLetter("ALL")}
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              border: "none",
              fontSize: "11px",
              fontWeight: selectedLetter === "ALL" ? 600 : 500,
              cursor: "pointer",
              background: selectedLetter === "ALL" ? "var(--color-primary, #1a73e8)" : "transparent",
              color: selectedLetter === "ALL" ? "#ffffff" : "var(--color-on-surface-variant, #64748b)",
              transition: "all 0.15s ease",
            }}
          >
            Todos ({termsCount})
          </button>
          {availableLetters.map((ltr) => {
            const isActive = selectedLetter === ltr;
            return (
              <button
                key={ltr}
                type="button"
                onClick={() => onSelectLetter(ltr)}
                style={{
                  minWidth: "22px",
                  height: "22px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: isActive ? 600 : 500,
                  cursor: "pointer",
                  background: isActive ? "var(--color-primary, #1a73e8)" : "transparent",
                  color: isActive ? "#ffffff" : "var(--color-on-surface-variant, #64748b)",
                  transition: "all 0.15s ease",
                }}
              >
                {ltr}
              </button>
            );
          })}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              style={{
                marginLeft: "auto",
                padding: "2px 6px",
                background: "transparent",
                border: "none",
                fontSize: "11px",
                color: "var(--color-primary, #1a73e8)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Limpar Filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
};
