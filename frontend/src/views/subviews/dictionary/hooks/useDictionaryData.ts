import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAI } from "../../../../context/AIContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import type { DictionaryTerm } from "../../../../types";
import { DDD_CATEGORIES, type SortOption, type ViewMode } from "../types";

export function useDictionaryData() {
  const { setDynamicContext } = useAI();
  const { projectMetaOptions, projectConfig, dictionaryTerms, loadDictionaryTerms, saveDictionaryTerms } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const [terms, setTerms] = useState<DictionaryTerm[]>(dictionaryTerms || []);
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") || "");
  const [selectedLetter, setSelectedLetter] = useState<string>("ALL");
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>("ALL");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");
  const [sortOption, setSortOption] = useState<SortOption>("name-asc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");
  const [importError, setImportError] = useState("");
  const [formError, setFormError] = useState("");
  const [copiedGeneral, setCopiedGeneral] = useState<string | null>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Sincroniza termos com o WorkspaceContext
  useEffect(() => {
    if (dictionaryTerms && dictionaryTerms.length > 0) {
      setTerms(dictionaryTerms);
    }
  }, [dictionaryTerms]);

  // Sincroniza com parâmetros de busca da URL
  useEffect(() => {
    const q = searchParams.get("search");
    if (q !== null && q !== searchTerm) {
      setSearchTerm(q);
    }
  }, [searchParams]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (val.trim()) {
          next.set("search", val);
        } else {
          next.delete("search");
        }
        return next;
      },
      { replace: true }
    );
  };

  // Dynamic Categories from .project.config.json
  const categories = useMemo(() => {
    const cats = projectMetaOptions?.categories || projectConfig?.categories || [];
    return cats.length > 0 ? cats : [{ name: "geral", label: "Geral", color: "#3b82f6" }];
  }, [projectMetaOptions, projectConfig]);

  // Form State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [inputTerm, setInputTerm] = useState("");
  const [inputCodename, setInputCodename] = useState("");
  const [inputDomain, setInputDomain] = useState("geral");
  const [inputCategory, setInputCategory] = useState("Entity");
  const [inputContext, setInputContext] = useState("");
  const [inputSynonyms, setInputSynonyms] = useState("");
  const [inputDefinition, setInputDefinition] = useState("");

  const loadDictionary = useCallback(async () => {
    if (dictionaryTerms.length === 0) {
      setIsLoading(true);
      try {
        const fetched = await loadDictionaryTerms();
        setTerms(fetched);
      } catch (err) {
        console.error("[DictionarySubView] Erro ao buscar dicionário:", err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [dictionaryTerms.length, loadDictionaryTerms]);

  useEffect(() => {
    loadDictionary();
  }, [loadDictionary]);

  // Sync with AI Context
  useEffect(() => {
    if (terms.length > 0) {
      setDynamicContext({
        filePath: "dictionary.json",
        content: JSON.stringify(terms, null, 2),
        badge: "📚 Dicionário de Dados",
      });
    }
    return () => {
      setDynamicContext(null);
    };
  }, [terms, setDynamicContext]);

  // Handle Opening Modal for New Term
  const handleOpenNewTerm = () => {
    setEditingIndex(null);
    setInputTerm("");
    setInputCodename("");
    setInputDomain(categories[0]?.name || "geral");
    setInputCategory("Entity");
    setInputContext("");
    setInputSynonyms("");
    setInputDefinition("");
    setFormError("");
    setIsModalOpen(true);
  };

  // Handle Opening Modal for Edit
  const handleEditTerm = (t: DictionaryTerm, idx: number) => {
    setEditingIndex(idx);
    setInputTerm(t.term || "");
    setInputCodename(t.codename || t.code_name || "");
    setInputDomain(t.domain || categories[0]?.name || "geral");
    setInputCategory(t.category || "Entity");
    setInputContext(t.context || "");
    const syns = t.synonyms || t.aliases || [];
    setInputSynonyms(syns.join(", "));
    setInputDefinition(t.definition || "");
    setFormError("");
    setIsModalOpen(true);
  };

  // Handle Deleting Term
  const handleDeleteTerm = async (idx: number) => {
    const target = terms[idx];
    if (
      !window.confirm(
        `Tem certeza que deseja remover o termo "${target?.term || "selecionado"}" do dicionário?`
      )
    ) {
      return;
    }
    const updated = terms.filter((_, i) => i !== idx);
    try {
      setIsSaving(true);
      const res = await saveDictionaryTerms(updated);
      if (res.success) {
        setTerms(updated);
      } else {
        alert(res.error || "Erro ao remover termo do dicionário.");
      }
    } catch (err) {
      console.error("Erro ao deletar termo:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Saving Term
  const handleSaveTerm = async () => {
    if (!inputTerm.trim()) {
      setFormError("O nome do termo é obrigatório.");
      return;
    }
    if (!inputDefinition.trim()) {
      setFormError("A definição do termo é obrigatória para manter a precisão conceitual.");
      return;
    }

    const syns = inputSynonyms
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter((s) => s && s.toLowerCase() !== inputTerm.trim().toLowerCase());

    const termItem: DictionaryTerm = {
      id: editingIndex !== null ? terms[editingIndex].id : undefined,
      term: inputTerm.trim(),
      codename:
        inputCodename.trim() ||
        inputTerm
          .trim()
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[\s-]+/g, "_")
          .replace(/[^A-Z0-9_]/g, ""),
      domain: inputDomain.trim() || "geral",
      category: inputCategory.trim() || "Entity",
      context: inputContext.trim() || undefined,
      definition: inputDefinition.trim(),
      synonyms: Array.from(new Set(syns)),
    };

    let updated: DictionaryTerm[];
    if (editingIndex !== null) {
      updated = [...terms];
      updated[editingIndex] = termItem;
    } else {
      updated = [...terms, termItem];
    }

    try {
      setIsSaving(true);
      setFormError("");
      const res = await saveDictionaryTerms(updated);
      if (res.success) {
        setTerms(updated);
        setIsModalOpen(false);
      } else {
        setFormError(res.error || "Erro ao salvar termo no dicionário.");
      }
    } catch (err: unknown) {
      console.error("[DictionarySubView] Erro ao salvar termo:", err);
      setFormError(err instanceof Error ? err.message : "Erro inesperado ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, type: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } else {
      setCopiedGeneral(type);
      setTimeout(() => setCopiedGeneral(null), 2000);
    }
  };

  // Export Markdown table
  const handleExportMarkdown = () => {
    let md = "# 📚 Dicionário Ubíquo & Vocabulário Oficial\n\n";
    md += "| Termo | Code Name | Domínio | Categoria DDD | Contexto | Sinônimos | Definição |\n";
    md += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n";
    terms.forEach((t) => {
      const syns = (t.synonyms || t.aliases || []).join(", ") || "-";
      md += `| **${t.term.replace(/\|/g, "\\|")}** | \`${t.codename || t.code_name || "-"}\` | ${t.domain || "-"} | ${t.category || "-"} | ${t.context || "-"} | ${syns} | ${t.definition.replace(/\|/g, "\\|")} |\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dictionary.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON handler
  const handleApplyImport = async () => {
    setImportError("");
    try {
      const parsed = JSON.parse(importJsonText);
      let incomingTerms: Array<Record<string, unknown>> = [];
      if (Array.isArray(parsed)) {
        incomingTerms = parsed;
      } else if (parsed && Array.isArray(parsed.terms)) {
        incomingTerms = parsed.terms;
      } else {
        throw new Error(
          "O JSON deve ser um array de termos ou um objeto com a chave 'terms'."
        );
      }

      // Validate and normalize structure
      const valid: DictionaryTerm[] = incomingTerms
        .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === "object" && typeof (t as Record<string, unknown>).term === "string" && String((t as Record<string, unknown>).term).trim().length > 0))
        .map((t) => {
          const termStr = String(t.term).trim();
          return {
            id: t.id ? String(t.id) : undefined,
            term: termStr,
            codename:
              (typeof t.codename === "string" && t.codename) ||
              (typeof t.code_name === "string" && t.code_name) ||
              termStr
                .toUpperCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s-]+/g, "_")
                .replace(/[^A-Z0-9_]/g, ""),
            domain: typeof t.domain === "string" && t.domain ? t.domain : "geral",
            category: typeof t.category === "string" && t.category ? t.category : "Entity",
            context: typeof t.context === "string" && t.context ? t.context : undefined,
            definition: t.definition ? String(t.definition).trim() : "Definição não informada.",
            synonyms: Array.isArray(t.synonyms)
              ? t.synonyms.map(String)
              : Array.isArray(t.aliases)
                ? t.aliases.map(String)
                : typeof t.synonyms === "string"
                  ? t.synonyms.split(",").map((s: string) => s.trim()).filter(Boolean)
                  : [],
          };
        });

      if (valid.length === 0) {
        throw new Error("Nenhum termo válido encontrado no JSON.");
      }

      setIsSaving(true);
      const res = await saveDictionaryTerms(valid);
      if (res.success) {
        setTerms(valid);
        setIsImportModalOpen(false);
        setImportJsonText("");
      } else {
        setImportError(res.error || "Falha ao gravar termos importados.");
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : "Erro ao processar JSON.");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to get domain color
  const getDomainColor = useCallback(
    (domainName?: string) => {
      if (!domainName) return "#64748b";
      const cat = categories.find(
        (c: { name?: string; label?: string; color?: string }) =>
          (c.name || "").toLowerCase() === domainName.toLowerCase() ||
          (c.label || "").toLowerCase() === domainName.toLowerCase()
      );
      return cat?.color || "#3b82f6";
    },
    [categories]
  );

  // Helper to get DDD category info
  const getDddCategoryInfo = useCallback((catName?: string) => {
    if (!catName) return { label: "Entity", color: "#2563eb" };
    const found = DDD_CATEGORIES.find(
      (c) => c.id.toLowerCase() === catName.toLowerCase()
    );
    return found || { label: catName, color: "#6366f1" };
  }, []);

  // Available Alphabet Letters for fast filtering
  const availableLetters = useMemo(() => {
    const set = new Set<string>();
    terms.forEach((t) => {
      const first = t.term.trim().charAt(0).toUpperCase();
      if (/[A-Z]/.test(first)) {
        set.add(first);
      } else {
        set.add("#");
      }
    });
    return Array.from(set).sort();
  }, [terms]);

  // Filtered & Sorted terms
  const filteredTerms = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();

    return terms
      .filter((t) => {
        // Search Filter
        const synsText = (t.synonyms || t.aliases || []).join(" ").toLowerCase();
        const matchesSearch =
          !q ||
          t.term.toLowerCase().includes(q) ||
          (t.codename && t.codename.toLowerCase().includes(q)) ||
          (t.code_name && t.code_name.toLowerCase().includes(q)) ||
          (t.definition && t.definition.toLowerCase().includes(q)) ||
          (t.context && t.context.toLowerCase().includes(q)) ||
          (t.domain && t.domain.toLowerCase().includes(q)) ||
          (t.category && t.category.toLowerCase().includes(q)) ||
          synsText.includes(q);

        if (!matchesSearch) return false;

        // Domain Filter
        if (
          selectedDomainFilter !== "ALL" &&
          (t.domain || "geral").toLowerCase() !== selectedDomainFilter.toLowerCase()
        ) {
          return false;
        }

        // Category DDD Filter
        if (
          selectedCategoryFilter !== "ALL" &&
          (t.category || "Entity").toLowerCase() !== selectedCategoryFilter.toLowerCase()
        ) {
          return false;
        }

        // Letter Filter
        if (selectedLetter !== "ALL") {
          const first = t.term.trim().charAt(0).toUpperCase();
          if (selectedLetter === "#") {
            return !/[A-Z]/.test(first);
          }
          return first === selectedLetter;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOption === "name-asc") {
          return a.term.localeCompare(b.term, "pt", { sensitivity: "base" });
        }
        if (sortOption === "name-desc") {
          return b.term.localeCompare(a.term, "pt", { sensitivity: "base" });
        }
        if (sortOption === "code-asc") {
          return (a.codename || a.code_name || "").localeCompare(b.codename || b.code_name || "");
        }
        if (sortOption === "domain-asc") {
          return (a.domain || "").localeCompare(b.domain || "");
        }
        return 0;
      });
  }, [terms, searchTerm, selectedLetter, selectedDomainFilter, selectedCategoryFilter, sortOption]);

  const hasActiveFilters =
    searchTerm.trim() !== "" ||
    selectedLetter !== "ALL" ||
    selectedDomainFilter !== "ALL" ||
    selectedCategoryFilter !== "ALL";

  const clearFilters = () => {
    handleSearchChange("");
    setSelectedLetter("ALL");
    setSelectedDomainFilter("ALL");
    setSelectedCategoryFilter("ALL");
  };

  return {
    terms,
    searchTerm,
    handleSearchChange,
    selectedLetter,
    setSelectedLetter,
    selectedDomainFilter,
    setSelectedDomainFilter,
    selectedCategoryFilter,
    setSelectedCategoryFilter,
    sortOption,
    setSortOption,
    viewMode,
    setViewMode,
    isLoading,
    isSaving,
    isModalOpen,
    setIsModalOpen,
    isImportModalOpen,
    setIsImportModalOpen,
    importJsonText,
    setImportJsonText,
    importError,
    setImportError,
    formError,
    copiedGeneral,
    copiedCodeId,
    categories,
    editingIndex,
    inputTerm,
    setInputTerm,
    inputCodename,
    setInputCodename,
    inputDomain,
    setInputDomain,
    inputCategory,
    setInputCategory,
    inputContext,
    setInputContext,
    inputSynonyms,
    setInputSynonyms,
    inputDefinition,
    setInputDefinition,
    handleOpenNewTerm,
    handleEditTerm,
    handleDeleteTerm,
    handleSaveTerm,
    copyToClipboard,
    handleExportMarkdown,
    handleApplyImport,
    getDomainColor,
    getDddCategoryInfo,
    availableLetters,
    filteredTerms,
    hasActiveFilters,
    clearFilters,
  };
}
