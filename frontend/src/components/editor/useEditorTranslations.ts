import { useState, useRef, useEffect, useCallback } from "react";
import { API } from "../../services/api";
import { parseFrontmatter, serializeFrontmatter } from "../../services/frontmatter";
import type { SupportedLanguage, SyncToMainPreview, DocumentMetadataItem } from "../../types";
import type { NotionEditorEngine } from "./notion-editor-engine";

interface UseEditorTranslationsOptions {
  filePath: string | null;
  isTemplateMode: boolean;
  content: string;
  fileMetadata: Record<string, any> | null;
  docMetadata: DocumentMetadataItem | null;
  engineRef: React.MutableRefObject<NotionEditorEngine | null>;
  docBodyRef: React.MutableRefObject<string>;
  officialContentRef: React.MutableRefObject<string>;
  parsedRef: React.MutableRefObject<{
    hasFrontmatter: boolean;
    metadata: Record<string, any>;
    body: string;
  } | null>;
  titleValueRef: React.MutableRefObject<string>;
  setTitleValue: (title: string) => void;
  setEditorToast: (toast: { text: string; type: "success" | "warning" | "info" } | null) => void;
  isInternalChangeRef: React.MutableRefObject<boolean>;
  engineChangeTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onChangeRef: React.MutableRefObject<(val: string) => void>;
  updateFileMetadataRef: React.MutableRefObject<(meta: Partial<DocumentMetadataItem>) => void>;
  onReload?: () => void;
}

export function useEditorTranslations({
  filePath,
  isTemplateMode,
  content,
  fileMetadata,
  docMetadata,
  engineRef,
  docBodyRef,
  officialContentRef,
  parsedRef,
  titleValueRef,
  setTitleValue,
  setEditorToast,
  isInternalChangeRef,
  engineChangeTimerRef,
  onChangeRef,
  updateFileMetadataRef,
  onReload,
}: UseEditorTranslationsOptions) {
  const [activeLanguage, setActiveLanguage] = useState<string>("pt-BR");
  const [defaultLanguage, setDefaultLanguage] = useState<string>("pt-BR");
  const [supportedLanguages, setSupportedLanguages] = useState<SupportedLanguage[]>([]);
  const [isTranslationOutdated, setIsTranslationOutdated] = useState(false);
  const [syncPreview, setSyncPreview] = useState<SyncToMainPreview | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncingToMain, setIsSyncingToMain] = useState(false);
  const [isUpdatingFromMain, setIsUpdatingFromMain] = useState(false);

  const activeLanguageRef = useRef(activeLanguage);
  activeLanguageRef.current = activeLanguage;
  const defaultLanguageRef = useRef(defaultLanguage);
  defaultLanguageRef.current = defaultLanguage;

  const translationParsedRef = useRef<{
    hasFrontmatter: boolean;
    metadata: Record<string, any>;
    body: string;
  }>({
    hasFrontmatter: false,
    metadata: {},
    body: "",
  });

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

  // Gravar tradução ativa no disco preservando frontmatter e título traduzido
  const saveActiveTranslation = useCallback(async () => {
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
  }, [filePath, engineChangeTimerRef, engineRef, docBodyRef, titleValueRef]);

  // Alternar entre Documento Oficial e Versões Traduzidas
  const handleSelectLanguage = useCallback(
    async (lang: string) => {
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
    },
    [
      filePath,
      saveActiveTranslation,
      officialContentRef,
      content,
      fileMetadata?.title,
      docMetadata?.title,
      setTitleValue,
      parsedRef,
      docBodyRef,
      engineRef,
      isInternalChangeRef,
      onReload,
      setEditorToast,
    ],
  );

  // Atualizar tradução existente que esteja desatualizada em relação ao documento oficial
  const handleUpdateFromMain = useCallback(async () => {
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
  }, [filePath, docBodyRef, setTitleValue, engineRef, isInternalChangeRef, setEditorToast]);

  // Preparar Sincronização Bidirecional da versão traduzida para o Documento Oficial
  const handleSyncToMain = useCallback(async () => {
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
  }, [filePath, engineRef, docBodyRef, setEditorToast]);

  // Confirmar Aplicação no Documento Oficial
  const handleConfirmApplyToMain = useCallback(
    async (newMainContent: string) => {
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
    },
    [
      filePath,
      officialContentRef,
      fileMetadata?.title,
      docMetadata?.title,
      setTitleValue,
      parsedRef,
      docBodyRef,
      engineRef,
      isInternalChangeRef,
      onChangeRef,
      updateFileMetadataRef,
      onReload,
      setEditorToast,
    ],
  );

  return {
    activeLanguage,
    setActiveLanguage,
    activeLanguageRef,
    defaultLanguage,
    setDefaultLanguage,
    defaultLanguageRef,
    supportedLanguages,
    setSupportedLanguages,
    isTranslationOutdated,
    setIsTranslationOutdated,
    syncPreview,
    setSyncPreview,
    isSyncModalOpen,
    setIsSyncModalOpen,
    isSyncingToMain,
    isUpdatingFromMain,
    translationParsedRef,
    saveActiveTranslation,
    handleSelectLanguage,
    handleUpdateFromMain,
    handleSyncToMain,
    handleConfirmApplyToMain,
  };
}
