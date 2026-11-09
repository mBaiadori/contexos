import { FileText, Plus } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSecurity } from "../../context/SecurityContext";
import { useEditorStore } from "../../stores/editorStore";
import { useRepoStore } from "../../stores/repoStore";
import { useGitStore } from "../../stores/gitStore";
import { useGovernanceStore } from "../../stores/governanceStore";
import { API } from "../../services/api";
import {
  parseFrontmatter,
  serializeFrontmatter,
} from "../../services/frontmatter";
import type {
  DocumentMetadataItem,
  GitCommitInfo,
  SupportedLanguage,
  SyncToMainPreview,
} from "../../types";
import type { DictionaryPopoverData } from "../dictionary/DictionaryPopover";
import { DocConnectivityBar } from "./DocConnectivityBar";
import { DocumentHistoryDrawer } from "./DocumentHistoryDrawer";
import { EditorFooter } from "./EditorFooter";
import { EditorModalsContainer } from "./EditorModalsContainer";
import { EditorSecurityLockGate } from "./EditorSecurityLockGate";
import { EditorTopToolbar } from "./EditorTopToolbar";
import {
  NotionEditorEngine,
  type FragmentStatusInfo,
} from "./notion-editor-engine";
import { TranslationBanner } from "./TranslationBanner";
import { VisualMarkdownDiff } from "./VisualMarkdownDiff";

interface NotionEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  promptContent?: string;
  onPromptChange?: (newPrompt: string) => void;
  filePath: string | null;
  onNavigateFile?: (path: string) => void;
  onReload?: () => void;
  onOpenDiffModal?: () => void;
  onToggleCopilot?: () => void;
  onOpenScaffoldWizard?: () => void;
  onSendSelectionToCopilot?: (text: string) => void;
  isTemplateMode?: boolean;
  onCustomSave?: () => Promise<{ success: boolean; message?: string } | void>;
  customSaveStatus?: string;
  customTitle?: string;
  onCustomTitleChange?: (title: string) => void;
}

export const NotionEditor: React.FC<NotionEditorProps> = ({
  content,
  onChange,
  promptContent,
  onPromptChange,
  filePath,
  onNavigateFile,
  onReload = () => {},
  onOpenDiffModal: _onOpenDiffModal,
  onToggleCopilot: _onToggleCopilot,
  onOpenScaffoldWizard,
  onSendSelectionToCopilot,
  isTemplateMode = false,
  onCustomSave,
  customSaveStatus,
  customTitle,
  onCustomTitleChange,
}) => {
  const originalContent = useEditorStore((s) => s.originalContent);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const saveCurrentFile = useEditorStore((s) => s.saveCurrentFile);
  const fileMetadata = useEditorStore((s) => s.fileMetadata);
  const updateDocumentTitle = useEditorStore((s) => s.updateDocumentTitle);
  const updateFileMetadata = useEditorStore((s) => s.updateFileMetadata);
  const activeRepo = useRepoStore((s) => s.activeRepo);
  const refreshPendingChanges = useGitStore((s) => s.refreshPendingChanges);
  const refreshGitStatus = useGitStore((s) => s.refreshGitStatus);
  const dictionaryTerms = useGovernanceStore((s) => s.dictionaryTerms);
  const [editorTab, setEditorTab] = useState<"document" | "prompt">("document");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [titleValue, setTitleValue] = useState<string>("");
  const titleValueRef = useRef(titleValue);
  titleValueRef.current = titleValue;
  const translationParsedRef = useRef<{
    hasFrontmatter: boolean;
    metadata: Record<string, any>;
    body: string;
  }>({
    hasFrontmatter: false,
    metadata: {},
    body: "",
  });
  const [dictionaryPopoverData, setDictionaryPopoverData] =
    useState<DictionaryPopoverData | null>(null);

  // Git Mode, Visual Diff & Document History Drawer State
  const [isGitMode, setIsGitMode] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitInfo | null>(
    null,
  );
  const [historicalContent, setHistoricalContent] = useState<string>("");
  const [blameData, setBlameData] = useState<any[]>([]);
  const [docMetadata, setDocMetadata] = useState<DocumentMetadataItem | null>(
    null,
  );
  const [editorToast, setEditorToast] = useState<{
    text: string;
    type: "info" | "success" | "warning";
  } | null>(null);
  const [fragmentAlert, setFragmentAlert] = useState<FragmentStatusInfo | null>(
    null,
  );
  const titleDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Translation & SSOT State
  const [activeLanguage, setActiveLanguage] = useState<string>("pt-BR");
  const [defaultLanguage, setDefaultLanguage] = useState<string>("pt-BR");
  const [supportedLanguages, setSupportedLanguages] = useState<
    SupportedLanguage[]
  >([]);
  const [isTranslationOutdated, setIsTranslationOutdated] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SyncToMainPreview | null>(
    null,
  );
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Collaborative PR Editing Mode State
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const prId = searchParams.get("pr");
  const prBaseSha = searchParams.get("base") || "";
  const [prHeadSha, setPrHeadSha] = useState<string>(prBaseSha);
  const isPREditing = !!prId;

  // Merge Conflict State
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictBundleText, setConflictBundleText] = useState<string>("");
  const hasMergeConflict = useMemo(() => {
    return (
      typeof content === "string" &&
      content.includes("<<<<<<< ") &&
      content.includes("=======") &&
      content.includes(">>>>>>> ")
    );
  }, [content]);
  const [isSyncingToMain, setIsSyncingToMain] = useState(false);

  // Load document content directly from PR branch when in PR editing mode
  useEffect(() => {
    if (!prId || !filePath) return;
    let isCancelled = false;
    API.getPRFile({ pr_id: prId, path: filePath, repo: activeRepo?.name })
      .then((res) => {
        if (isCancelled) return;
        if (res.ok && res.data) {
          if (res.data.head_sha) {
            setPrHeadSha(res.data.head_sha);
          }
          if (res.data.content !== undefined) {
            onChangeRef.current(res.data.content);
            if (engineRef.current) {
              engineRef.current.setMarkdown(res.data.content);
            }
          }
        }
      })
      .catch((err) => {
        console.warn(
          "[NotionEditor] Erro ao carregar arquivo da branch do PR:",
          err,
        );
      });
    return () => {
      isCancelled = true;
    };
  }, [prId, filePath, activeRepo?.name]);

  // Security & Document Access Gate State
  const { departments, canAccessDoc } = useSecurity();

  const activeDeptObj = departments.find(
    (d) =>
      d.id === fileMetadata?.department ||
      d.folder.toLowerCase() === fileMetadata?.department?.toLowerCase(),
  );

  const isAllowedByDept = canAccessDoc(fileMetadata || {});
  const isDocumentLocked = !isAllowedByDept;

  // Link Insertion Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkModalInitialText, setLinkModalInitialText] = useState("");
  const [linkModalInitialUrl, setLinkModalInitialUrl] = useState("");
  const linkModalCallbackRef = useRef<
    ((url: string, text: string) => void) | null
  >(null);

  const handleOpenLinkModal = useCallback(
    (
      defaultText: string,
      callback: (url: string, text: string) => void,
      initialUrl: string = "",
    ) => {
      setLinkModalInitialText(defaultText || "");
      setLinkModalInitialUrl(initialUrl || "");
      linkModalCallbackRef.current = callback;
      setIsLinkModalOpen(true);
    },
    [],
  );

  // Dictionary Term & Synonym Modal State
  const [isAddTermModalOpen, setIsAddTermModalOpen] = useState(false);
  const [addTermInitialText, setAddTermInitialText] = useState("");
  const [isLinkSynonymModalOpen, setIsLinkSynonymModalOpen] = useState(false);
  const [linkSynonymInitialText, setLinkSynonymInitialText] = useState("");

  const handleOpenAddTermModal = useCallback((text: string) => {
    setAddTermInitialText(text);
    setIsAddTermModalOpen(true);
  }, []);

  const handleOpenLinkSynonymModal = useCallback((text: string) => {
    setLinkSynonymInitialText(text);
    setIsLinkSynonymModalOpen(true);
  }, []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<NotionEditorEngine | null>(null);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isInternalChangeRef = useRef(false);
  const lastEmittedMarkdownRef = useRef<string>("");
  const engineChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeLanguageRef = useRef(activeLanguage);
  activeLanguageRef.current = activeLanguage;

  const defaultLanguageRef = useRef(defaultLanguage);
  defaultLanguageRef.current = defaultLanguage;

  const parsed = parseFrontmatter(content || "");
  const docBody = parsed.hasFrontmatter ? parsed.body : (content || "");
  const effectivePrompt =
    promptContent !== undefined ? promptContent : fileMetadata?.prompt || "";
  const parsedOriginal = parseFrontmatter(originalContent || "");
  const originalBody = parsedOriginal.hasFrontmatter
    ? parsedOriginal.body
    : (originalContent || "");
  const isDirty = (originalBody || "").trim() !== (docBody || "").trim();

  // Armazena com segurança o conteúdo íntegro do Documento Oficial (SSOT)
  const officialContentRef = useRef(content || "");
  if (activeLanguage.toLowerCase() === defaultLanguage.toLowerCase()) {
    officialContentRef.current = content || "";
  }

  const editorTabRef = useRef(editorTab);
  editorTabRef.current = editorTab;

  const docBodyRef = useRef(docBody);
  if (activeLanguage.toLowerCase() === defaultLanguage.toLowerCase()) {
    docBodyRef.current = docBody;
  }

  const effectivePromptRef = useRef(effectivePrompt);
  effectivePromptRef.current = effectivePrompt;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const onPromptChangeRef = useRef(onPromptChange);
  onPromptChangeRef.current = onPromptChange;

  const updateFileMetadataRef = useRef(updateFileMetadata);
  updateFileMetadataRef.current = updateFileMetadata;

  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;

  const handleSwitchTab = (newTab: "document" | "prompt") => {
    if (newTab === editorTab) return;

    // Flush current editor content before switching
    if (engineRef.current) {
      const currentMd = engineRef.current.getMarkdown();
      if (editorTab === "document") {
        docBodyRef.current = currentMd;
        // Se estiver no documento oficial, propaga a alteração para o buffer pai
        if (
          activeLanguageRef.current.toLowerCase() ===
          defaultLanguageRef.current.toLowerCase()
        ) {
          const newContent = parsedRef.current.hasFrontmatter
            ? serializeFrontmatter(parsedRef.current.metadata, currentMd)
            : currentMd;
          onChangeRef.current(newContent);
        }
      } else {
        if (onPromptChangeRef.current) {
          onPromptChangeRef.current(currentMd);
        } else {
          updateFileMetadataRef.current({ prompt: currentMd });
        }
        effectivePromptRef.current = currentMd;
      }
    }

    setEditorTab(newTab);
    editorTabRef.current = newTab;
    const targetText =
      newTab === "document" ? docBodyRef.current : effectivePromptRef.current;
    if (engineRef.current) {
      isInternalChangeRef.current = true;
      engineRef.current.setMarkdown(targetText);
    }
  };

  // Auto-resize title textarea to fit content organically like a heading
  useEffect(() => {
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = "auto";
      titleTextareaRef.current.style.height = `${titleTextareaRef.current.scrollHeight}px`;
    }
  }, [titleValue]);

  // Toast de alerta caso ocorra falha de salvamento apenas se houver alterações não salvas
  useEffect(() => {
    if (saveStatus === "Erro" && isDirty) {
      setEditorToast({
        text: "Não foi possível gravar no disco. Rascunho temporário mantido na sessão.",
        type: "warning",
      });
      setTimeout(() => setEditorToast(null), 5000);
    }
  }, [saveStatus, isDirty]);

  // Sync document metadata and blame when file changes or git mode is opened
  useEffect(() => {
    if (!filePath) {
      setDocMetadata(null);
      return;
    }

    if (fileMetadata) {
      setDocMetadata(fileMetadata as DocumentMetadataItem);
      if (parsedRef.current) {
        parsedRef.current.metadata = {
          ...parsedRef.current.metadata,
          ...fileMetadata,
        };
        const hasMeta =
          parsedRef.current.hasFrontmatter ||
          Boolean(
            fileMetadata.templateId ||
            fileMetadata.status ||
            fileMetadata.categories ||
            (Array.isArray(fileMetadata.tags) && fileMetadata.tags.length > 0),
          );
        parsedRef.current.hasFrontmatter = hasMeta;
      }
    }

    // Reset commit selection when switching file
    setSelectedCommit(null);
    setHistoricalContent("");
    setFragmentAlert(null);
  }, [filePath, fileMetadata]);

  const [isUpdatingFromMain, setIsUpdatingFromMain] = useState(false);

  // Gravar tradução ativa no disco preservando frontmatter e título traduzido
  const saveActiveTranslation = async () => {
    if (
      !filePath ||
      activeLanguageRef.current.toLowerCase() ===
        defaultLanguageRef.current.toLowerCase()
    ) {
      return;
    }
    if (engineChangeTimerRef.current) {
      clearTimeout(engineChangeTimerRef.current);
      engineChangeTimerRef.current = null;
    }

    const currentMd = engineRef.current
      ? engineRef.current.getMarkdown()
      : docBodyRef.current;

    const meta = {
      ...(translationParsedRef.current?.metadata || {}),
      title: titleValueRef.current || translationParsedRef.current?.metadata?.title || "",
    };

    const fullTransContent = serializeFrontmatter(meta, currentMd ? currentMd.trim() : "");

    try {
      await API.saveTranslation({
        path: filePath,
        lang: activeLanguageRef.current,
        content: fullTransContent,
      });
    } catch (e) {
      console.warn("[NotionEditor] Falha ao salvar tradução:", e);
    }
  };

  // Sincronizar o título local com os metadados do documento ou customTitle
  useEffect(() => {
    if (isTemplateMode) {
      if (customTitle !== undefined) {
        setTitleValue(customTitle);
      }
      return;
    }
    // Se estiver em modo tradução, NÃO sobrescreve com o título do documento oficial!
    if (activeLanguage.toLowerCase() !== defaultLanguage.toLowerCase()) {
      return;
    }
    const metaTitle =
      fileMetadata?.title !== undefined
        ? fileMetadata.title
        : docMetadata?.title || "";
    setTitleValue(metaTitle);
  }, [
    fileMetadata?.title,
    docMetadata?.title,
    filePath,
    isTemplateMode,
    customTitle,
    activeLanguage,
    defaultLanguage,
  ]);

  const handleTitleChange = (newVal: string) => {
    setTitleValue(newVal);
    if (isTemplateMode) {
      if (onCustomTitleChange) onCustomTitleChange(newVal);
      return;
    }
    // Se estiver visualizando/editando uma tradução, atualiza os metadados da tradução e persiste
    if (activeLanguage.toLowerCase() !== defaultLanguage.toLowerCase()) {
      translationParsedRef.current.metadata = {
        ...translationParsedRef.current.metadata,
        title: newVal,
      };
      translationParsedRef.current.hasFrontmatter = true;
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
      }
      titleDebounceTimerRef.current = setTimeout(() => {
        saveActiveTranslation();
      }, 500);
      return;
    }
    if (titleDebounceTimerRef.current) {
      clearTimeout(titleDebounceTimerRef.current);
    }
    titleDebounceTimerRef.current = setTimeout(() => {
      updateDocumentTitle(newVal);
    }, 400);
  };

  // Load Blame info when entering Git / Audit Mode
  useEffect(() => {
    if (isGitMode && filePath) {
      API.getFileBlame(filePath)
        .then((res) => {
          if (res.ok && res.data?.blame) {
            setBlameData(res.data.blame);
          }
        })
        .catch(() => {});
    }
  }, [isGitMode, filePath]);

  // Load Historical Content when selecting a past commit
  useEffect(() => {
    if (!selectedCommit || !filePath) {
      setHistoricalContent("");
      return;
    }

    API.getFileVersion(filePath, selectedCommit.hash)
      .then((res) => {
        if (res.ok && res.data?.success) {
          setHistoricalContent(res.data.content);
        }
      })
      .catch((err) => {
        console.error("[NotionEditor] Erro ao carregar versão do commit:", err);
      });
  }, [selectedCommit, filePath]);

  // Carregar dados de tradução e idiomas suportados quando o arquivo ativo muda
  useEffect(() => {
    if (!filePath || isTemplateMode) return;
    API.listTranslations(filePath)
      .then((res) => {
        if (res.ok && res.data) {
          const defLang = res.data.defaultLanguage || "pt-BR";
          setDefaultLanguage(defLang);
          setActiveLanguage(defLang);
          setSupportedLanguages(res.data.supportedLanguages || []);
        }
      })
      .catch(() => {});
  }, [filePath, isTemplateMode]);

  // Alternar entre Documento Oficial e Versões Traduzidas
  const handleSelectLanguage = async (lang: string) => {
    if (!filePath) return;
    const isTargetMain =
      lang.toLowerCase() === defaultLanguageRef.current.toLowerCase();

    // Se estiver saindo de uma tradução, grava rascunho de tradução com metadados completos
    if (
      activeLanguageRef.current.toLowerCase() !==
      defaultLanguageRef.current.toLowerCase()
    ) {
      await saveActiveTranslation();
    }

    if (isTargetMain) {
      setActiveLanguage(defaultLanguageRef.current);
      setIsTranslationOutdated(false);

      // Restaura o corpo e o título oficial no editor a partir do buffer oficial intacto
      const rawOfficial = officialContentRef.current || content || "";
      const mainParsed = parseFrontmatter(rawOfficial);
      const metaTitle =
        mainParsed.metadata?.title !== undefined
          ? mainParsed.metadata.title
          : fileMetadata?.title !== undefined
          ? fileMetadata.title
          : docMetadata?.title || "";
      setTitleValue(metaTitle);
      parsedRef.current = mainParsed;
      docBodyRef.current = mainParsed.body;

      if (engineRef.current) {
        isInternalChangeRef.current = true;
        engineRef.current.setMarkdown(mainParsed.body || "");
      }
      if (onReload) onReload();
      return;
    }

    try {
      const res = await API.getTranslationFile(filePath, lang);
      if (res.ok && res.data) {
        setActiveLanguage(lang);
        setIsTranslationOutdated(res.data.isOutdated);

        // Traduções carregam Frontmatter para metadados locais (title, etc.) e corpo traduzido
        const parsedTrans = parseFrontmatter(res.data.content);
        translationParsedRef.current = parsedTrans;
        const transBody = parsedTrans.hasFrontmatter
          ? parsedTrans.body
          : res.data.content || "";
        docBodyRef.current = transBody;

        const transTitle =
          parsedTrans.metadata?.title !== undefined
            ? parsedTrans.metadata.title
            : "";
        setTitleValue(transTitle);

        if (engineRef.current) {
          isInternalChangeRef.current = true;
          engineRef.current.setMarkdown(transBody);
        }
      }
    } catch (err: any) {
      setEditorToast({
        text:
          err?.message ||
          `Não foi possível carregar a tradução (${lang.toUpperCase()}).`,
        type: "warning",
      });
      setTimeout(() => setEditorToast(null), 3000);
    }
  };

  // Atualizar tradução existente que esteja desatualizada em relação ao documento oficial
  const handleUpdateFromMain = async () => {
    if (
      !filePath ||
      activeLanguageRef.current.toLowerCase() ===
        defaultLanguageRef.current.toLowerCase()
    )
      return;
    setIsUpdatingFromMain(true);
    try {
      const res = await API.translateDocument({
        path: filePath,
        targetLang: activeLanguageRef.current,
      });

      if (res.ok && res.data) {
        setIsTranslationOutdated(false);
        const parsedTrans = parseFrontmatter(res.data.content);
        translationParsedRef.current = parsedTrans;
        const transBody = parsedTrans.hasFrontmatter
          ? parsedTrans.body
          : res.data.content || "";
        docBodyRef.current = transBody;

        const transTitle =
          parsedTrans.metadata?.title !== undefined
            ? parsedTrans.metadata.title
            : "";
        setTitleValue(transTitle);

        if (engineRef.current) {
          isInternalChangeRef.current = true;
          engineRef.current.setMarkdown(transBody);
        }
        setEditorToast({
          text: `Tradução (${activeLanguageRef.current.toUpperCase()}) atualizada com sucesso a partir do documento oficial!`,
          type: "success",
        });
        setTimeout(() => setEditorToast(null), 3000);
      } else {
        setEditorToast({
          text:
            (res.data as any)?.error ||
            "Erro ao atualizar tradução do documento oficial.",
          type: "warning",
        });
        setTimeout(() => setEditorToast(null), 3000);
      }
    } catch (err: any) {
      setEditorToast({
        text: err?.message || "Falha na comunicação ao atualizar tradução.",
        type: "warning",
      });
      setTimeout(() => setEditorToast(null), 3000);
    } finally {
      setIsUpdatingFromMain(false);
    }
  };

  // Preparar Sincronização Bidirecional da versão traduzida para o Documento Oficial
  const handleSyncToMain = async () => {
    if (!filePath) return;
    setIsSyncingToMain(true);
    try {
      const currentMd = engineRef.current
        ? engineRef.current.getMarkdown()
        : docBodyRef.current;

      const res = await API.syncTranslationToMain({
        path: filePath,
        translatedContent: currentMd,
        fromLang: activeLanguageRef.current,
      });

      if (res.ok && res.data) {
        setSyncPreview(res.data);
        setIsSyncModalOpen(true);
      } else {
        setEditorToast({
          text:
            (res.data as any)?.error ||
            "Erro ao preparar sincronização para o documento oficial.",
          type: "warning",
        });
        setTimeout(() => setEditorToast(null), 3000);
      }
    } catch (err: any) {
      setEditorToast({
        text: err?.message || "Falha na comunicação ao sincronizar tradução.",
        type: "warning",
      });
      setTimeout(() => setEditorToast(null), 3000);
    } finally {
      setIsSyncingToMain(false);
    }
  };

  // Confirmar Aplicação no Documento Oficial
  const handleConfirmApplyToMain = async (newMainContent: string) => {
    if (!filePath) return;
    const res = await API.applyTranslationToMain({
      path: filePath,
      content: newMainContent,
    });
    if (res.ok) {
      setEditorToast({
        text: "Documento oficial atualizado com sucesso a partir da tradução!",
        type: "success",
      });
      setTimeout(() => setEditorToast(null), 3500);

      // 1. Atualiza o buffer de conteúdo oficial para a nova versão consolidada
      officialContentRef.current = newMainContent;

      // 2. Alterna o estado ativo de volta para o idioma oficial
      setActiveLanguage(defaultLanguageRef.current);
      setIsTranslationOutdated(false);

      // 3. Extrai metadados e corpo do novo documento oficial
      const mainParsed = parseFrontmatter(newMainContent);
      const metaTitle =
        mainParsed.metadata?.title !== undefined
          ? mainParsed.metadata.title
          : fileMetadata?.title !== undefined
          ? fileMetadata.title
          : docMetadata?.title || "";
      setTitleValue(metaTitle);
      parsedRef.current = mainParsed;
      docBodyRef.current = mainParsed.body;

      // 4. Atualiza o canvas do NotionEditor imediatamente sem necessidade de refresh
      if (engineRef.current) {
        isInternalChangeRef.current = true;
        engineRef.current.setMarkdown(mainParsed.body);
      }

      // 5. Propaga o novo conteúdo oficial completo para o buffer do workspace pai
      onChangeRef.current(newMainContent);

      // Se o título mudou nos metadados oficiais, propaga alteração
      if (metaTitle && metaTitle !== fileMetadata?.title) {
        updateFileMetadataRef.current({ title: metaTitle });
      }

      // 6. Recarrega árvores e referências
      if (onReload) onReload();
    } else {
      setEditorToast({
        text:
          (res.data as any)?.error || "Erro ao atualizar documento oficial.",
        type: "warning",
      });
      setTimeout(() => setEditorToast(null), 3000);
    }
  };

  // Manual save trigger (Ctrl+S ou clique) que faz o flush imediato
  const handleSave = useCallback(async (metaOverride?: Record<string, any>) => {
    if (engineRef.current) {
      engineRef.current.applyDictionaryHighlights();
    }
    if (onCustomSave) {
      const res = await onCustomSave();
      if ((res as any)?.success !== false) {
        if (engineRef.current) {
          engineRef.current.applyDictionaryHighlights();
        }
        setEditorToast({
          text: (res as any)?.message || "Template salvo com sucesso!",
          type: "success",
        });
        setTimeout(() => setEditorToast(null), 2500);
      }
      return;
    }
    if (!filePath) return;

    // Se estiver em modo edição de PR, salva diretamente na branch isolada da proposta
    if (prId) {
      const currentMd = engineRef.current
        ? engineRef.current.getMarkdown()
        : docBodyRef.current;
      const fullContent = parsedRef.current.hasFrontmatter
        ? serializeFrontmatter(parsedRef.current.metadata, currentMd)
        : currentMd;

      try {
        const res = await API.editPRFile({
          id: prId,
          filePath: filePath || "",
          content: fullContent,
          expectedBaseSha: prHeadSha,
          author: user?.login,
          repo: activeRepo?.name,
        });

        if (res.ok && res.data) {
          if (res.data.conflict) {
            setEditorToast({
              text: "Conflito detectado com a versão remota da proposta.",
              type: "warning",
            });
            // Fetch 3-way conflict bundle
            const confRes = await API.getPRConflict({
              pr_id: prId,
              path: filePath,
              repo: activeRepo?.name,
            });
            if (confRes.ok && confRes.data?.merged) {
              setConflictBundleText(confRes.data.merged);
            } else {
              setConflictBundleText(fullContent);
            }
            setIsConflictModalOpen(true);
          } else {
            if (res.data.head_sha) {
              setPrHeadSha(res.data.head_sha);
            }
            if (engineRef.current) {
              engineRef.current.applyDictionaryHighlights();
            }
            setEditorToast({
              text: `Proposta #${prId} atualizada com sucesso!`,
              type: "success",
            });
            setTimeout(() => setEditorToast(null), 2500);
          }
        } else {
          setEditorToast({
            text: res.data?.error || "Erro ao salvar alterações no PR.",
            type: "warning",
          });
        }
      } catch (err: any) {
        setEditorToast({
          text: err.message || "Erro de rede ao salvar no PR.",
          type: "warning",
        });
      }
      return;
    }

    // Se estiver em modo tradução, salva com frontmatter traduzido no arquivo oculto de tradução
    if (
      activeLanguageRef.current.toLowerCase() !==
      defaultLanguageRef.current.toLowerCase()
    ) {
      await saveActiveTranslation();
      if (engineRef.current) {
        engineRef.current.applyDictionaryHighlights();
      }
      setEditorToast({
        text: `Tradução (${activeLanguageRef.current.toUpperCase()}) gravada no disco!`,
        type: "success",
      });
      setTimeout(() => setEditorToast(null), 2500);
      return;
    }

    if (engineChangeTimerRef.current) {
      clearTimeout(engineChangeTimerRef.current);
      engineChangeTimerRef.current = null;
    }

    const currentMd = engineRef.current
      ? engineRef.current.getMarkdown()
      : docBodyRef.current;
    docBodyRef.current = currentMd;

    // Validação estrita: se metaOverride for um evento DOM ou SyntheticEvent do React, descarta-o
    const isEvent =
      metaOverride &&
      (typeof (metaOverride as any).preventDefault === "function" ||
        "_reactName" in metaOverride ||
        "nativeEvent" in metaOverride ||
        ("clientX" in metaOverride && "clientY" in metaOverride) ||
        ("bubbles" in metaOverride && "cancelable" in metaOverride));
    const safeMetaOverride = isEvent ? undefined : metaOverride;

    const rawMetaToUse = {
      ...(parsedRef.current?.metadata || {}),
      ...(fileMetadata || {}),
      ...(safeMetaOverride || {}),
    };

    // Remove propriedades de eventos que possam ter vazado para o metadado
    const eventKeysToOmit = new Set([
      "_reactName",
      "nativeEvent",
      "isTrusted",
      "bubbles",
      "cancelable",
      "defaultPrevented",
      "eventPhase",
      "timeStamp",
      "clientX",
      "clientY",
      "pageX",
      "pageY",
      "screenX",
      "screenY",
      "movementX",
      "movementY",
      "altKey",
      "ctrlKey",
      "metaKey",
      "shiftKey",
      "button",
      "buttons",
      "detail",
      "target",
      "currentTarget",
    ]);
    const metaToUse: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawMetaToUse)) {
      if (eventKeysToOmit.has(k)) continue;
      if (
        k === "type" &&
        typeof v === "string" &&
        ["click", "keydown", "change", "submit"].includes(v)
      ) {
        continue;
      }
      metaToUse[k] = v;
    }

    const hasAnyMeta =
      Boolean(parsedRef.current?.hasFrontmatter) ||
      Boolean(
        metaToUse.templateId ||
        metaToUse.status ||
        metaToUse.categories ||
        (Array.isArray(metaToUse.tags) && metaToUse.tags.length > 0),
      );
    const fullContent = hasAnyMeta
      ? serializeFrontmatter(metaToUse, currentMd)
      : currentMd;

    // Se o documento já estiver idêntico ao original salvo no disco e sem override de metadados,
    // não executa gravação redundante nem exibe alertas, pois já está devidamente salvo.
    const isAlreadySaved = (originalContent || "").trim() === fullContent.trim();
    if (isAlreadySaved && !safeMetaOverride) {
      return;
    }

    if (parsedRef.current) {
      parsedRef.current.hasFrontmatter = hasAnyMeta;
      parsedRef.current.metadata = metaToUse;
    }

    if (onChangeRef.current) {
      onChangeRef.current(fullContent);
    }

    const res = await saveCurrentFile(metaToUse, fullContent);
    if (res?.success) {
      if (engineRef.current) {
        engineRef.current.applyDictionaryHighlights();
      }
      setEditorToast({
        text: "Alterações gravadas no disco!",
        type: "success",
      });
      setTimeout(() => setEditorToast(null), 2500);
    }
  }, [
    filePath,
    saveCurrentFile,
    onCustomSave,
    prId,
    prHeadSha,
    user?.login,
    activeRepo?.name,
    fileMetadata,
  ]);

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  const handleAddLinkFromBar = useCallback(
    async (url: string, text: string, type: "dependency" | "consumer") => {
      if (!filePath) return;
      const isDoc =
        url.endsWith(".md") ||
        url.includes(".md#") ||
        url.includes(":~:text=") ||
        url.startsWith("#");
      const label = text || url;

      if (type === "dependency") {
        if (engineRef.current) {
          engineRef.current.insertBlockHtml(
            `<p><a href="${url}" class="${isDoc ? "notion-doc-link" : ""}" target="${isDoc ? "_self" : "_blank"}">${label}</a></p>`,
          );
        } else {
          const linkMd = `\n[${label}](${url})\n`;
          docBodyRef.current = (docBodyRef.current || "") + linkMd;
        }

        const currentLinks: string[] = Array.isArray(fileMetadata?.links)
          ? [...fileMetadata.links]
          : [];
        if (!currentLinks.includes(url)) {
          currentLinks.push(url);
          await updateFileMetadata({ links: currentLinks });
        }

        await handleSave();
      } else {
        try {
          const targetContext = await API.getDocumentContext(url);
          const existingLinks: string[] = Array.isArray(targetContext?.dependencies)
            ? targetContext.dependencies.map((d: any) => d.path || d.filePath || d)
            : [];
          if (!existingLinks.includes(filePath)) {
            existingLinks.push(filePath);
          }
          await API.updateDocumentMetadataItem({
            path: url,
            meta: { links: existingLinks },
            repo: activeRepo?.name,
          });
          await handleSave();
        } catch (err) {
          console.error("Erro ao vincular dependente:", err);
        }
      }
    },
    [filePath, fileMetadata, updateFileMetadata, handleSave, activeRepo?.name],
  );

  // Initialize & Mount NotionEditorEngine
  useLayoutEffect(() => {
    if (!canvasRef.current || isGitMode) return;

    const engine = new NotionEditorEngine({
      canvasElement: canvasRef.current,
      filePath: filePath,
      onNavigateFile: onNavigateFile,
      dictionaryTerms: dictionaryTerms,
      onShowDictionaryPopover: (data) => {
        setDictionaryPopoverData(data);
      },
      onChange: () => {
        if (!engineRef.current) return;
        if (engineChangeTimerRef.current) {
          clearTimeout(engineChangeTimerRef.current);
        }
        engineChangeTimerRef.current = setTimeout(() => {
          engineChangeTimerRef.current = null;
          if (!engineRef.current) return;
          const currentMd = engineRef.current.getMarkdown();
          lastEmittedMarkdownRef.current = currentMd;
          isInternalChangeRef.current = true;
          if (editorTabRef.current === "document") {
            docBodyRef.current = currentMd;
            // Se estiver em modo tradução, NUNCA muta o buffer do documento oficial!
            if (
              activeLanguageRef.current.toLowerCase() !==
              defaultLanguageRef.current.toLowerCase()
            ) {
              return;
            }
            const metaToUse = {
              ...(parsedRef.current?.metadata || {}),
              ...(fileMetadata || {}),
            };
            const hasAnyMeta =
              Boolean(parsedRef.current?.hasFrontmatter) ||
              Boolean(
                metaToUse.templateId ||
                metaToUse.status ||
                metaToUse.categories ||
                (Array.isArray(metaToUse.tags) && metaToUse.tags.length > 0),
              );
            const newContent = hasAnyMeta
              ? serializeFrontmatter(metaToUse, currentMd)
              : currentMd;
            onChangeRef.current(newContent);
          } else {
            effectivePromptRef.current = currentMd;
            if (onPromptChangeRef.current) {
              onPromptChangeRef.current(currentMd);
            } else {
              updateFileMetadataRef.current({ prompt: currentMd });
            }
          }
        }, 120);
      },
      onSave: () => {
        if (handleSaveRef.current) {
          handleSaveRef.current();
        }
      },
      onSendSelectionToCopilot: (text) => {
        if (onSendSelectionToCopilot) {
          onSendSelectionToCopilot(text);
        }
      },
      onToast: (msg, type) => {
        setEditorToast({ text: msg, type: type || "info" });
        setTimeout(() => setEditorToast(null), 3800);
      },
      onOpenLinkModal: handleOpenLinkModal,
      onAddDictionaryTerm: handleOpenAddTermModal,
      onLinkSynonym: handleOpenLinkSynonymModal,
      onFragmentStatus: (status) => {
        setFragmentAlert(status);
      },
    });

    engineRef.current = engine;
    const initialText = editorTab === "document" ? docBody : effectivePrompt;
    engine.setMarkdown(initialText);

    const hash = window.location.hash;
    if (
      hash &&
      (hash.includes(":~:text=") || hash.startsWith("#")) &&
      initialText.trim()
    ) {
      setTimeout(() => {
        engine.scrollToFragment(hash);
      }, 250);
    }

    return () => {
      if (engineChangeTimerRef.current) {
        clearTimeout(engineChangeTimerRef.current);
        engineChangeTimerRef.current = null;
      }
      engine.destroy();
      engineRef.current = null;
    };
  }, [isGitMode]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setDictionaryTerms(dictionaryTerms);
    }
  }, [dictionaryTerms]);

  useLayoutEffect(() => {
    if (engineRef.current) {
      engineRef.current.filePath = filePath;
      const targetText = editorTab === "document" ? docBody : effectivePrompt;
      isInternalChangeRef.current = false;
      engineRef.current.setMarkdown(targetText);
      setFragmentAlert(null);
      engineRef.current.clearFragmentHighlights();

      const hash = window.location.hash;
      if (
        hash &&
        (hash.includes(":~:text=") || hash.startsWith("#")) &&
        targetText.trim()
      ) {
        setTimeout(() => {
          engineRef.current?.scrollToFragment(hash);
        }, 150);
      }
    }
  }, [filePath]);

  // Listeners para navegação e atualização de fragmentos de texto (Deep Linking)
  useEffect(() => {
    const handleFragmentNav = (e: any) => {
      // Se o evento especificou um filePath de destino, só executa se corresponder a este editor
      if (e.detail?.filePath && e.detail.filePath !== filePath) {
        return;
      }
      const targetHash = e.detail?.hash || window.location.hash;
      if (
        targetHash &&
        (targetHash.includes(":~:text=") || targetHash.startsWith("#"))
      ) {
        setTimeout(() => {
          engineRef.current?.scrollToFragment(targetHash);
        }, 80);
      }
    };

    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash) {
        setFragmentAlert(null);
        engineRef.current?.clearFragmentHighlights();
        return;
      }
      if (hash && (hash.includes(":~:text=") || hash.startsWith("#"))) {
        setTimeout(() => {
          engineRef.current?.scrollToFragment(hash);
        }, 80);
      }
    };

    window.addEventListener("workspace:navigate-fragment", handleFragmentNav);
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener(
        "workspace:navigate-fragment",
        handleFragmentNav,
      );
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [filePath]);

  // Sync external content changes into the editor canvas
  useEffect(() => {
    if (isInternalChangeRef.current) {
      isInternalChangeRef.current = false;
      return;
    }
    // Se o usuário estiver ativamente digitando ou com foco no editor, NUNCA sobrescreve com props defasadas
    if (engineRef.current?.isFocused()) {
      return;
    }
    // Se estiver em modo tradução, NÃO sobrescreve o canvas com o documento oficial externo!
    if (
      activeLanguageRef.current.toLowerCase() !==
      defaultLanguageRef.current.toLowerCase()
    ) {
      return;
    }
    if (engineRef.current) {
      const currentEngineMd = engineRef.current.getMarkdown();
      const targetText = editorTab === "document" ? docBody : effectivePrompt;

      const normEngine = (currentEngineMd || "").replace(/\r\n/g, "\n").trim();
      const normTarget = (targetText || "").replace(/\r\n/g, "\n").trim();
      const normLastEmitted = (lastEmittedMarkdownRef.current || "")
        .replace(/\r\n/g, "\n")
        .trim();

      // Se o que veio de fora for idêntico ao que emitimos por último localmente, não é uma alteração externa nova
      if (normTarget === normLastEmitted) {
        return;
      }

      // Só recarrega o DOM se a mudança for externa real e diferente do que está no engine
      if (normEngine !== normTarget) {
        lastEmittedMarkdownRef.current = targetText;
        engineRef.current.setMarkdown(targetText, true);
        const hash = window.location.hash;
        if (hash && (hash.includes(":~:text=") || hash.startsWith("#"))) {
          setTimeout(() => {
            engineRef.current?.scrollToFragment(hash);
          }, 120);
        }
      }
    }
  }, [docBody, effectivePrompt, editorTab]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (handleSaveRef.current) {
          handleSaveRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Listener para erros de abertura de documentos inexistentes no workspace
  useEffect(() => {
    const handleFileLoadError = (e: any) => {
      const msg =
        e.detail?.message ||
        "Documento referenciado não foi encontrado no workspace.";
      setEditorToast({ text: msg, type: "warning" });
      setTimeout(() => setEditorToast(null), 4500);
    };
    window.addEventListener("workspace:file-load-error", handleFileLoadError);
    return () =>
      window.removeEventListener(
        "workspace:file-load-error",
        handleFileLoadError,
      );
  }, []);

  const handleRevealInTree = useCallback(() => {
    if (!filePath) return;
    window.dispatchEvent(
      new CustomEvent("spec:reveal-in-tree", { detail: { path: filePath } }),
    );
  }, [filePath]);

  const handleCopyFullDoc = () => {
    navigator.clipboard.writeText(content);
  };

  const handleExportMarkdown = () => {
    const filename = (filePath || "document").split("/").pop() || "document.md";
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".md") ? filename : `${filename}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirmPasteImport = () => {
    if (importText.trim()) {
      onChange(importText);
      setIsImportModalOpen(false);
      setImportText("");
    }
  };

  const handleRestoreHistoricalVersion = async () => {
    if (!historicalContent) return;
    if (
      window.confirm(
        `Deseja restaurar o documento para a Versão #${selectedCommit?.shortHash || selectedCommit?.hash.slice(0, 7) || "selecionada"} (${selectedCommit?.message || ""})?`,
      )
    ) {
      onChange(historicalContent);
      setIsGitMode(false);
      setSelectedCommit(null);
      await API.saveProjectFile({
        path: filePath!,
        content: historicalContent,
      });
      await refreshPendingChanges();
      await refreshGitStatus();
    }
  };

  const currentContent = editorTab === "document" ? docBody : effectivePrompt;
  const wordCount = currentContent.trim()
    ? currentContent.trim().split(/\s+/).length
    : 0;
  const lineCount = currentContent ? currentContent.split(/\r?\n/).length : 0;

  if (!filePath) {
    return (
      <div id="editor-empty-state" className="editor-empty-state">
        <div className="editor-empty-state-card">
          <div className="empty-icon-circle">
            <FileText size={32} color="var(--primary, #2563eb)" />
          </div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--text-heading, #0f172a)",
              margin: "14px 0 6px",
            }}
          >
            Nenhum Documento Selecionado
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted, #64748b)",
              margin: "0 0 22px",
              lineHeight: 1.5,
              maxWidth: "380px",
            }}
          >
            Selecione uma especificação na árvore lateral ou inicie a modelagem
            de um novo domínio de arquitetura.
          </p>
          <div
            className="empty-state-actions"
            style={{ display: "flex", gap: "10px", justifyContent: "center" }}
          >
            {onOpenScaffoldWizard && (
              <button
                id="btn-empty-new-spec"
                className="btn btn-primary btn-sm"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={onOpenScaffoldWizard}
              >
                <Plus size={15} />
                <span>Explorar Templates & Criar</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const comparisonOldContent = selectedCommit
    ? historicalContent
    : originalContent || "";
  const comparisonOldTitle = selectedCommit
    ? `Versão #${selectedCommit.shortHash || selectedCommit.hash.slice(0, 7)} (${selectedCommit.author})`
    : "Versão Base Publicada";

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Center Main Editor / Git Visual Diff Canvas */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minWidth: 0,
        }}
      >
        {/* 1. Document Header & Toolbar */}
        <EditorTopToolbar
          filePath={filePath}
          repoName={activeRepo?.name}
          onRevealInTree={handleRevealInTree}
          onShowToast={(text, type) => {
            setEditorToast({ text, type });
            setTimeout(() => setEditorToast(null), 2500);
          }}
          editorTab={editorTab}
          onSwitchTab={handleSwitchTab}
          isTemplateMode={isTemplateMode}
          activeLanguage={activeLanguage}
          onSelectLanguage={handleSelectLanguage}
          onTranslationCreated={(lang, transContent) => {
            setActiveLanguage(lang);
            const parsedTrans = parseFrontmatter(transContent);
            translationParsedRef.current = parsedTrans;
            const bodyContent = parsedTrans.hasFrontmatter
              ? parsedTrans.body
              : transContent || "";
            docBodyRef.current = bodyContent;
            setTitleValue(parsedTrans.metadata?.title || "");
            if (engineRef.current) {
              isInternalChangeRef.current = true;
              engineRef.current.setMarkdown(bodyContent);
            }
            setEditorToast({
              text: `Tradução para ${lang.toUpperCase()} criada com sucesso!`,
              type: "success",
            });
            setTimeout(() => setEditorToast(null), 2500);
          }}
        />

        {/* Floating Toast Notification */}
        {editorToast && (
          <div
            className={`editor-floating-toast toast-${editorToast.type}`}
            style={{
              position: "absolute",
              top: "52px",
              right: "24px",
              zIndex: 999,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
              boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <span className="material-symbols-outlined icon-xs">
              {editorToast.type === "success"
                ? "check_circle"
                : editorToast.type === "warning"
                  ? "warning"
                  : "info"}
            </span>
            <span>{editorToast.text}</span>
          </div>
        )}

        {/* Top Context & Connectivity Bar */}
        {!isTemplateMode && (
          <DocConnectivityBar
            filePath={filePath}
            onNavigateFile={onNavigateFile || (() => {})}
            onCopyDoc={handleCopyFullDoc}
            onExportDoc={handleExportMarkdown}
            onImportDoc={() => setIsImportModalOpen(true)}
            isGitMode={isGitMode}
            onToggleGitMode={() => {
              const nextMode = !isGitMode;
              setIsGitMode(nextMode);
              if (nextMode) setIsHistoryDrawerOpen(true);
            }}
            isHistoryDrawerOpen={isHistoryDrawerOpen}
            onToggleHistoryDrawer={() => setIsHistoryDrawerOpen(!isHistoryDrawerOpen)}
            onSave={handleSave}
            saveStatus={saveStatus}
            isDirty={isDirty}
            onAddLink={handleAddLinkFromBar}
          />
        )}

        {/* Collaborative PR Editing Banner */}
        {isPREditing && (
          <div
            style={{
              margin: "12px 24px 0",
              padding: "10px 16px",
              borderRadius: "var(--radius-md, 8px)",
              background: "var(--md-sys-color-primary-container, #e0f2fe)",
              border: "1px solid var(--md-sys-color-primary, #0284c7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--md-sys-color-on-primary-container, #0369a1)",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                className="material-symbols-outlined"
                style={{
                  color: "var(--md-sys-color-primary, #0284c7)",
                  fontSize: "22px",
                }}
              >
                rate_review
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>
                  Modo de Edição na Proposta #{prId}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--md-sys-color-on-surface-variant, #334155)",
                  }}
                >
                  As alterações são gravadas na branch da proposta. O seu
                  workspace e branch ativa permanecem intactos.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                className="ui-btn ui-btn--tonal ui-btn--sm"
                onClick={() =>
                  navigate(
                    `/repo/${encodeURIComponent(activeRepo?.name || "local")}/revisoes`,
                  )
                }
                style={{
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "16px" }}
                >
                  arrow_back
                </span>
                Voltar para Revisões
              </button>
            </div>
          </div>
        )}

        {/* Translation Mode Banner */}
        {!isTemplateMode &&
          activeLanguage.toLowerCase() !== defaultLanguage.toLowerCase() && (
            <TranslationBanner
              currentLanguage={activeLanguage}
              defaultLanguage={defaultLanguage}
              supportedLanguages={supportedLanguages}
              isOutdated={isTranslationOutdated}
              onSyncToMain={handleSyncToMain}
              onBackToMain={() => handleSelectLanguage(defaultLanguage)}
              onUpdateFromMain={handleUpdateFromMain}
              isSyncing={isSyncingToMain}
              isUpdating={isUpdatingFromMain}
            />
          )}

        {/* Merge Conflict Banner */}
        {hasMergeConflict && (
          <div
            style={{
              margin: "12px 24px 0",
              padding: "12px 16px",
              borderRadius: "var(--radius-md, 8px)",
              background: "rgba(234, 179, 8, 0.12)",
              border: "1px solid rgba(234, 179, 8, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--color-on-surface)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                className="material-symbols-outlined"
                style={{ color: "#eab308", fontSize: "22px" }}
              >
                merge_type
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>
                  Conflito de Merge Detectado
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--color-outline)" }}
                >
                  Este documento possui alterações conflitantes entre sua versão
                  local e o repositório Git.
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsConflictModalOpen(true)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                background: "#eab308",
                color: "#000",
                fontWeight: 600,
                fontSize: "12px",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "16px" }}
              >
                splitscreen
              </span>
              Resolver Conflito Visualmente
            </button>
          </div>
        )}

        {/* Fragment Not Found / Snippet Alert Banner */}
        {fragmentAlert && fragmentAlert.type === "not_found" && (
          <div
            className="fragment-not-found-banner"
            id="fragment-not-found-alert"
          >
            <div className="fragment-alert-header">
              <div className="fragment-alert-title-row">
                <span className="material-symbols-outlined fragment-alert-icon">
                  link_off
                </span>
                <span className="fragment-alert-title">
                  Trecho referenciado não encontrado
                </span>
              </div>
              <button
                className="fragment-alert-close-btn"
                title="Dispensar alerta"
                onClick={() => setFragmentAlert(null)}
              >
                <span className="material-symbols-outlined icon-xs">close</span>
              </button>
            </div>
            <p className="fragment-alert-description">
              O link apontava para um trecho específico que foi substancialmente
              modificado ou excluído deste documento.
            </p>
            <div className="fragment-alert-original-box">
              <div className="fragment-alert-box-label">
                <span>Texto que estava lá originalmente:</span>
                <button
                  type="button"
                  className="btn-copy-original-fragment"
                  title="Copiar texto original para a área de transferência"
                  onClick={() => {
                    navigator.clipboard.writeText(fragmentAlert.exact);
                    setEditorToast({
                      text: "Texto original copiado!",
                      type: "success",
                    });
                    setTimeout(() => setEditorToast(null), 2000);
                  }}
                >
                  <span className="material-symbols-outlined icon-xs">
                    content_copy
                  </span>
                  Copiar texto
                </button>
              </div>
              <div className="fragment-alert-box-quote">
                {fragmentAlert.prefix && (
                  <span className="fragment-quote-context">
                    ...{fragmentAlert.prefix}{" "}
                  </span>
                )}
                <span className="fragment-quote-exact">
                  {fragmentAlert.exact}
                </span>
                {fragmentAlert.suffix && (
                  <span className="fragment-quote-context">
                    {" "}
                    {fragmentAlert.suffix}...
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. Body: Either Document Lock Gate, Visual Markdown Diff (Git Mode) or Notion Live Editor */}
        {isDocumentLocked ? (
          <EditorSecurityLockGate
            activeDeptObj={activeDeptObj}
            departmentName={fileMetadata?.department}
          />
        ) : isGitMode ? (
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <VisualMarkdownDiff
              oldContent={comparisonOldContent}
              newContent={docBody}
              oldTitle={comparisonOldTitle}
              newTitle="Rascunho Atual (Em Edição)"
              fileName={filePath || undefined}
              blameData={blameData}
              showAuthorship={true}
              onRestoreOldVersion={
                selectedCommit ? handleRestoreHistoricalVersion : undefined
              }
              onClose={() => setIsGitMode(false)}
            />
          </div>
        ) : (
          <div className="notion-editor-wrapper" id="notion-editor-wrapper">
            <div className="notion-editor-scroll-container">
              {/* Título H1 Separado do Markdown (apenas na aba Documento) */}
              {editorTab === "document" && (
                <>
                  <div
                    className="notion-doc-header-block"
                    id="notion-doc-header-block"
                    onClick={() => titleTextareaRef.current?.focus()}
                  >
                    <div className="notion-doc-title-row">
                      <textarea
                        ref={titleTextareaRef}
                        id="notion-doc-title-input"
                        className="notion-doc-title-input"
                        rows={1}
                        placeholder="Sem título..."
                        value={titleValue}
                        disabled={
                          activeLanguage.toLowerCase() !==
                          defaultLanguage.toLowerCase()
                        }
                        onChange={(e) => {
                          handleTitleChange(e.target.value);
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (canvasRef.current) {
                              const firstBlock =
                                canvasRef.current.querySelector(
                                  '[contenteditable="true"]',
                                ) as HTMLElement;
                              if (firstBlock) firstBlock.focus();
                            }
                          }
                        }}
                        title={
                          activeLanguage.toLowerCase() !==
                          defaultLanguage.toLowerCase()
                            ? `Título Oficial (${defaultLanguage.toUpperCase()}) - Metadados são editados no Documento Oficial`
                            : "Título principal do documento (.docs.metadata.json)"
                        }
                      />
                      {activeLanguage.toLowerCase() !==
                        defaultLanguage.toLowerCase() && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            marginLeft: "12px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              padding: "2px 8px",
                              borderRadius: "12px",
                              background: "rgba(16, 185, 129, 0.12)",
                              color: "#059669",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            Versão Traduzida ({activeLanguage.toUpperCase()})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Divider separador entre o Título e o conteúdo .md */}
                  <div
                    className="notion-doc-title-divider"
                    id="notion-doc-title-divider"
                  />
                </>
              )}

              <div
                ref={canvasRef}
                id="notion-editor-canvas"
                className="notion-canvas"
              />
            </div>
          </div>
        )}

        {/* 3. Editor Status Footer */}
        <EditorFooter
          isGitMode={isGitMode}
          isTemplateMode={isTemplateMode}
          customSaveStatus={customSaveStatus}
          saveStatus={saveStatus}
          isDirty={isDirty}
          wordCount={wordCount}
          lineCount={lineCount}
          onReload={onReload}
        />
      </div>

      {/* Right Drawer: Document History Timeline & Governance */}
      <DocumentHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        filePath={filePath}
        selectedCommitHash={selectedCommit ? selectedCommit.hash : null}
        onSelectCommit={(commit) => {
          setSelectedCommit(commit);
          setIsGitMode(true);
        }}
        documentMeta={docMetadata}
      />

      {/* Modals & Popovers */}
      <EditorModalsContainer
        isLinkModalOpen={isLinkModalOpen}
        linkModalInitialText={linkModalInitialText}
        linkModalInitialUrl={linkModalInitialUrl}
        onCloseLinkModal={() => setIsLinkModalOpen(false)}
        onConfirmLinkModal={(url, text) => {
          if (linkModalCallbackRef.current) {
            linkModalCallbackRef.current(url, text);
            setTimeout(() => {
              saveCurrentFile();
            }, 80);
          }
          setIsLinkModalOpen(false);
        }}
        isImportModalOpen={isImportModalOpen}
        importText={importText}
        onImportTextChange={setImportText}
        onCloseImportModal={() => setIsImportModalOpen(false)}
        onConfirmPasteImport={handleConfirmPasteImport}
        isAddTermModalOpen={isAddTermModalOpen}
        addTermInitialText={addTermInitialText}
        onCloseAddTermModal={() => setIsAddTermModalOpen(false)}
        onTermCreated={() => {
          if (engineRef.current) {
            engineRef.current.applyDictionaryHighlights();
          }
          setEditorToast({
            text: "Termo cadastrado com sucesso no Dicionário!",
            type: "success",
          });
          setTimeout(() => setEditorToast(null), 3000);
        }}
        isLinkSynonymModalOpen={isLinkSynonymModalOpen}
        linkSynonymInitialText={linkSynonymInitialText}
        onCloseLinkSynonymModal={() => setIsLinkSynonymModalOpen(false)}
        onSynonymLinked={() => {
          if (engineRef.current) {
            engineRef.current.applyDictionaryHighlights();
          }
          setEditorToast({
            text: "Sinônimo vinculado com sucesso!",
            type: "success",
          });
          setTimeout(() => setEditorToast(null), 3000);
        }}
        dictionaryPopoverData={dictionaryPopoverData}
        onCloseDictionaryPopover={() => setDictionaryPopoverData(null)}
        isSyncModalOpen={isSyncModalOpen}
        onCloseSyncModal={() => setIsSyncModalOpen(false)}
        syncPreview={syncPreview}
        onConfirmApplyToMain={handleConfirmApplyToMain}
        isConflictModalOpen={isConflictModalOpen}
        onCloseConflictModal={() => setIsConflictModalOpen(false)}
        filePath={filePath}
        conflictContent={conflictBundleText || content}
        onSaveResolvedConflict={async (resolvedContent) => {
          if (prId && filePath) {
            try {
              const res = await API.resolvePRConflict({
                pr_id: prId,
                filePath,
                resolvedContent,
                repo: activeRepo?.name,
              });
              if (res.ok) {
                if (res.data?.commitHash) {
                  setPrHeadSha(res.data.commitHash);
                }
                onChange(resolvedContent);
                if (engineRef.current) {
                  engineRef.current.setMarkdown(resolvedContent);
                  engineRef.current.applyDictionaryHighlights();
                }
                setIsConflictModalOpen(false);
                setEditorToast({
                  text: "Conflito resolvido e gravado na proposta de alteração!",
                  type: "success",
                });
                setTimeout(() => setEditorToast(null), 3000);
              } else {
                alert(res.data?.error || "Erro ao resolver conflito no PR.");
              }
            } catch (err: any) {
              alert(err.message || "Erro ao resolver conflito no PR.");
            }
          } else {
            const parsed = parseFrontmatter(resolvedContent);
            const bodyOnly = parsed.hasFrontmatter ? parsed.body : resolvedContent;
            docBodyRef.current = bodyOnly;
            onChange(resolvedContent);
            if (engineRef.current) {
              engineRef.current.setMarkdown(bodyOnly);
              engineRef.current.applyDictionaryHighlights();
            }
            if (saveCurrentFile) {
              await saveCurrentFile(parsed.metadata, resolvedContent);
            }
            setIsConflictModalOpen(false);
            setEditorToast({
              text: "Conflito resolvido e arquivo gravado com sucesso!",
              type: "success",
            });
            setTimeout(() => setEditorToast(null), 3000);
          }
        }}
      />
    </div>
  );
};
