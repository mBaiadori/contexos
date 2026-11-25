import { useState, useRef, useEffect, useCallback } from "react";
import type { TreeNode, Repo } from "../../../types";
import type { DraggedItem, ScannedFile } from "../types";
import { API } from "../../../services/api";
import {
  scanDataTransferItems,
  filesToScannedList,
  processFilesForUpload,
} from "../utils/fileTreeUtils";

interface UseFileTreeDnDProps {
  activeRepo: Repo | null;
  loadTree: (repo?: string) => Promise<void>;
  refreshPendingChanges: () => Promise<void>;
  refreshGitStatus: () => Promise<void>;
  moveFileOrFolder: (
    old_path: string,
    new_path: string,
    sourceRepo?: string,
    targetRepo?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onOpenFile: (path: string) => void;
  showToast: (message: string, type?: "info" | "warning") => void;
  expandedFolders: Record<string, boolean>;
  setExpandedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  collapsedRepos: Record<string, boolean>;
  setCollapsedRepos: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedFolder: string;
}

export const useFileTreeDnD = ({
  activeRepo,
  loadTree,
  refreshPendingChanges,
  refreshGitStatus,
  moveFileOrFolder,
  onOpenFile,
  showToast,
  expandedFolders,
  setExpandedFolders,
  collapsedRepos,
  setCollapsedRepos,
  selectedFolder,
}: UseFileTreeDnDProps) => {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  const [isDragOverRoot, setIsDragOverRoot] = useState(false);
  const [isExternalDragActive, setIsExternalDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgressMessage, setImportProgressMessage] = useState("");
  const [targetUploadFolder, setTargetUploadFolder] = useState<string>("");
  const [targetUploadRepo, setTargetUploadRepo] = useState<string>("");

  const dragHoverTimerRef = useRef<any>(null);
  const hoveredFolderForExpansionRef = useRef<string | null>(null);
  const externalDragCounterRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Limpeza de DnD ao pressionar Escape ou soltar fora
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsExternalDragActive(false);
        setDraggedItem(null);
        setDragOverTarget(null);
        setIsDragOverRoot(false);
        externalDragCounterRef.current = 0;
        hoveredFolderForExpansionRef.current = null;
        if (dragHoverTimerRef.current) {
          clearTimeout(dragHoverTimerRef.current);
          dragHoverTimerRef.current = null;
        }
      }
    };

    const handleGlobalDragEnd = () => {
      setIsExternalDragActive(false);
      setDraggedItem(null);
      setDragOverTarget(null);
      setIsDragOverRoot(false);
      externalDragCounterRef.current = 0;
      hoveredFolderForExpansionRef.current = null;
      if (dragHoverTimerRef.current) {
        clearTimeout(dragHoverTimerRef.current);
        dragHoverTimerRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("dragend", handleGlobalDragEnd);
    window.addEventListener("drop", handleGlobalDragEnd);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("dragend", handleGlobalDragEnd);
      window.removeEventListener("drop", handleGlobalDragEnd);
    };
  }, []);

  const isExternalFileDrag = useCallback(
    (e: React.DragEvent) => {
      return (
        !draggedItem &&
        e.dataTransfer &&
        (e.dataTransfer.types.includes("Files") ||
          Array.from(e.dataTransfer.types).includes("Files"))
      );
    },
    [draggedItem],
  );

  const handlePaneDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (isExternalFileDrag(e)) {
        e.preventDefault();
        externalDragCounterRef.current++;
        setIsExternalDragActive(true);
      }
    },
    [isExternalFileDrag],
  );

  const handlePaneDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (isExternalFileDrag(e)) {
        e.preventDefault();
        externalDragCounterRef.current--;
        if (externalDragCounterRef.current <= 0) {
          externalDragCounterRef.current = 0;
          setIsExternalDragActive(false);
          setDragOverTarget(null);
          setIsDragOverRoot(false);
        }
      }
    },
    [isExternalFileDrag],
  );

  const handleImportFiles = useCallback(
    async (
      scannedFiles: ScannedFile[],
      targetFolder: string = "",
      targetRepoName?: string,
    ) => {
      if (!scannedFiles || scannedFiles.length === 0) return;

      const targetRepo = targetRepoName || activeRepo?.name;
      setIsImporting(true);
      const count = scannedFiles.length;
      setImportProgressMessage(
        `Lendo e processando ${count} arquivo${count > 1 ? "s" : ""}...`,
      );

      try {
        const filesPayload = await processFilesForUpload(scannedFiles);
        const destLabel = targetFolder
          ? `/${targetFolder}`
          : targetRepo
            ? `a raiz de ${targetRepo}`
            : "a raiz do projeto";

        setImportProgressMessage(`Importando para ${destLabel}...`);

        const res = await API.importFiles({
          target_folder: targetFolder,
          files: filesPayload,
          repo: targetRepo,
        });

        if (res.ok && res.data?.success) {
          if (targetRepo) {
            await loadTree(targetRepo);
          } else {
            await loadTree();
          }
          await Promise.all([refreshPendingChanges(), refreshGitStatus()]);

          const imported = res.data.importedFiles || [];
          showToast(
            `${imported.length} arquivo${imported.length > 1 ? "s" : ""} importado${imported.length > 1 ? "s" : ""} com sucesso em ${destLabel}!`,
            "info",
          );

          if (targetFolder) {
            setExpandedFolders((prev) => ({ ...prev, [targetFolder]: true }));
          }

          if (imported.length === 1) {
            onOpenFile(imported[0].path);
          }
        } else {
          const errMsg =
            res.data?.errors?.join(", ") ||
            res.data?.error ||
            "Falha ao importar arquivos.";
          showToast(`Erro na importação: ${errMsg}`, "warning");
        }
      } catch (err: unknown) {
        showToast(
          `Erro ao conectar com o servidor: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
          "warning",
        );
      } finally {
        setIsImporting(false);
        setImportProgressMessage("");
      }
    },
    [
      activeRepo?.name,
      loadTree,
      refreshPendingChanges,
      refreshGitStatus,
      showToast,
      setExpandedFolders,
      onOpenFile,
    ],
  );

  const executeMove = useCallback(
    async (
      old_path: string,
      new_path: string,
      itemName: string,
      destinationLabel: string,
      sourceRepo?: string,
      targetRepo?: string,
    ) => {
      const srcRepo = sourceRepo || activeRepo?.name || "default";
      const dstRepo = targetRepo || srcRepo;
      try {
        const res = await moveFileOrFolder(old_path, new_path, srcRepo, dstRepo);
        if (res.success) {
          showToast(
            `"${itemName}" movido com sucesso para ${dstRepo === srcRepo ? destinationLabel : `${dstRepo}/${destinationLabel}`}.`,
            "info",
          );
        } else {
          showToast(
            `Erro ao mover: ${res.error || "Falha ao mover item"}`,
            "warning",
          );
        }
      } catch (err: unknown) {
        console.error("[FileTree] Falha ao mover item:", err);
        showToast(err instanceof Error ? err.message : "Erro inesperado ao mover o item.", "warning");
      }
    },
    [activeRepo?.name, moveFileOrFolder, showToast],
  );

  const handleDragStart = useCallback(
    (
      e: React.DragEvent,
      node: TreeNode,
      isFolder: boolean,
      repoNameForNode?: string,
    ) => {
      e.stopPropagation();
      const itemRepo = repoNameForNode || activeRepo?.name || "default";
      const item: DraggedItem = {
        path: node.path,
        name: node.name,
        isFolder,
        repo: itemRepo,
      };
      setDraggedItem(item);
      e.dataTransfer.setData("text/plain", node.path);
      e.dataTransfer.effectAllowed = "move";
    },
    [activeRepo?.name],
  );

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDraggedItem(null);
    setDragOverTarget(null);
    setIsDragOverRoot(false);
    setIsExternalDragActive(false);
    externalDragCounterRef.current = 0;
    hoveredFolderForExpansionRef.current = null;
    if (dragHoverTimerRef.current) {
      clearTimeout(dragHoverTimerRef.current);
      dragHoverTimerRef.current = null;
    }
  }, []);

  const handleDragOverFolder = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      e.preventDefault();
      e.stopPropagation();

      const isExt = isExternalFileDrag(e);

      if (isExt) {
        e.dataTransfer.dropEffect = "copy";
        setDragOverTarget(folderPath);
        setIsDragOverRoot(false);
      } else {
        if (!draggedItem) return;
        if (draggedItem.path === folderPath) return;
        if (
          draggedItem.isFolder &&
          (folderPath === draggedItem.path ||
            folderPath.startsWith(`${draggedItem.path}/`))
        ) {
          return;
        }
        e.dataTransfer.dropEffect = "move";
        setDragOverTarget(folderPath);
        setIsDragOverRoot(false);
      }

      if (hoveredFolderForExpansionRef.current !== folderPath) {
        hoveredFolderForExpansionRef.current = folderPath;
        if (dragHoverTimerRef.current) {
          clearTimeout(dragHoverTimerRef.current);
        }
        if (!expandedFolders[folderPath]) {
          dragHoverTimerRef.current = setTimeout(() => {
            setExpandedFolders((prev) => ({ ...prev, [folderPath]: true }));
          }, 400);
        }
      }
    },
    [draggedItem, isExternalFileDrag, expandedFolders, setExpandedFolders],
  );

  const handleDragLeaveFolder = useCallback(
    (e: React.DragEvent, folderPath: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragOverTarget === folderPath) {
        setDragOverTarget(null);
      }
      if (hoveredFolderForExpansionRef.current === folderPath) {
        hoveredFolderForExpansionRef.current = null;
        if (dragHoverTimerRef.current) {
          clearTimeout(dragHoverTimerRef.current);
          dragHoverTimerRef.current = null;
        }
      }
    },
    [dragOverTarget],
  );

  const handleDropOnFolder = useCallback(
    async (
      e: React.DragEvent,
      targetFolderPath: string,
      targetRepoName?: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      setIsDragOverRoot(false);
      setIsExternalDragActive(false);
      externalDragCounterRef.current = 0;
      if (dragHoverTimerRef.current) clearTimeout(dragHoverTimerRef.current);

      if (
        isExternalFileDrag(e) ||
        (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedItem)
      ) {
        const scanned = e.dataTransfer.items
          ? await scanDataTransferItems(e.dataTransfer.items)
          : filesToScannedList(e.dataTransfer.files);
        if (scanned.length > 0) {
          await handleImportFiles(scanned, targetFolderPath, targetRepoName);
        }
        return;
      }

      if (!draggedItem) return;
      const {
        path: sourcePath,
        name: itemName,
        isFolder,
        repo: sourceRepo,
      } = draggedItem;
      setDraggedItem(null);

      const srcRepo = sourceRepo || activeRepo?.name || "default";
      const dstRepo = targetRepoName || activeRepo?.name || "default";
      const isCrossRepo = srcRepo.toLowerCase() !== dstRepo.toLowerCase();

      if (!isCrossRepo && sourcePath === targetFolderPath) return;
      if (
        !isCrossRepo &&
        isFolder &&
        (targetFolderPath === sourcePath || targetFolderPath.startsWith(`${sourcePath}/`))
      ) {
        showToast(
          "Não é possível mover uma pasta para dentro de si mesma.",
          "warning",
        );
        return;
      }

      const targetPath = `${targetFolderPath}/${itemName}`;
      if (!isCrossRepo && sourcePath === targetPath) return;

      await executeMove(
        sourcePath,
        targetPath,
        itemName,
        targetFolderPath,
        srcRepo,
        dstRepo,
      );
    },
    [
      isExternalFileDrag,
      draggedItem,
      activeRepo?.name,
      handleImportFiles,
      showToast,
      executeMove,
    ],
  );

  const handleDragOverFile = useCallback(
    (e: React.DragEvent, filePath: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (isExternalFileDrag(e)) {
        e.dataTransfer.dropEffect = "copy";
        setDragOverTarget(filePath);
        setIsDragOverRoot(false);
        return;
      }

      if (!draggedItem) return;
      if (draggedItem.path === filePath) return;
      e.dataTransfer.dropEffect = "move";
      setDragOverTarget(filePath);
      setIsDragOverRoot(false);
    },
    [isExternalFileDrag, draggedItem],
  );

  const handleDragLeaveFile = useCallback(
    (e: React.DragEvent, filePath: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragOverTarget === filePath) {
        setDragOverTarget(null);
      }
    },
    [dragOverTarget],
  );

  const handleDropOnFile = useCallback(
    async (
      e: React.DragEvent,
      targetFilePath: string,
      targetRepoName?: string,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      setIsDragOverRoot(false);
      setIsExternalDragActive(false);
      externalDragCounterRef.current = 0;

      const segments = targetFilePath.split("/");
      segments.pop();
      const parentDir = segments.join("/");

      if (
        isExternalFileDrag(e) ||
        (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedItem)
      ) {
        const scanned = e.dataTransfer.items
          ? await scanDataTransferItems(e.dataTransfer.items)
          : filesToScannedList(e.dataTransfer.files);
        if (scanned.length > 0) {
          await handleImportFiles(scanned, parentDir, targetRepoName);
        }
        return;
      }

      if (!draggedItem) return;
      const {
        path: sourcePath,
        name: itemName,
        isFolder,
        repo: sourceRepo,
      } = draggedItem;
      setDraggedItem(null);

      const srcRepo = sourceRepo || activeRepo?.name || "default";
      const dstRepo = targetRepoName || activeRepo?.name || "default";
      const isCrossRepo = srcRepo.toLowerCase() !== dstRepo.toLowerCase();

      if (!isCrossRepo && sourcePath === targetFilePath) return;

      if (
        !isCrossRepo &&
        isFolder &&
        parentDir &&
        (parentDir === sourcePath || parentDir.startsWith(`${sourcePath}/`))
      ) {
        showToast(
          "Não é possível mover uma pasta para dentro de si mesma.",
          "warning",
        );
        return;
      }

      const targetPath = parentDir ? `${parentDir}/${itemName}` : itemName;
      if (!isCrossRepo && sourcePath === targetPath) return;

      await executeMove(
        sourcePath,
        targetPath,
        itemName,
        parentDir || "raiz",
        srcRepo,
        dstRepo,
      );
    },
    [
      isExternalFileDrag,
      draggedItem,
      activeRepo?.name,
      handleImportFiles,
      showToast,
      executeMove,
    ],
  );

  const handleDragOverRoot = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (isExternalFileDrag(e)) {
        e.dataTransfer.dropEffect = "copy";
        setIsDragOverRoot(true);
        setDragOverTarget(null);
        return;
      }

      if (draggedItem) {
        setIsDragOverRoot(true);
        setDragOverTarget(null);
      }
    },
    [isExternalFileDrag, draggedItem],
  );

  const handleDragLeaveRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverRoot(false);
  }, []);

  const handleDropOnRoot = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragOverRoot(false);
      setDragOverTarget(null);
      setIsExternalDragActive(false);
      externalDragCounterRef.current = 0;

      if (
        isExternalFileDrag(e) ||
        (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedItem)
      ) {
        const scanned = e.dataTransfer.items
          ? await scanDataTransferItems(e.dataTransfer.items)
          : filesToScannedList(e.dataTransfer.files);
        if (scanned.length > 0) {
          await handleImportFiles(scanned, selectedFolder || "");
        }
        return;
      }

      if (!draggedItem) return;

      const sourcePath = draggedItem.path;
      const itemName = sourcePath.split("/").pop() || sourcePath;

      if (!sourcePath.includes("/")) return;

      const targetPath = itemName;
      if (sourcePath === targetPath) return;

      await executeMove(
        sourcePath,
        targetPath,
        itemName,
        "raiz",
        draggedItem.repo,
      );
    },
    [
      isExternalFileDrag,
      draggedItem,
      selectedFolder,
      handleImportFiles,
      executeMove,
    ],
  );

  const handleDragOverRepo = useCallback(
    (e: React.DragEvent, targetRepoName: string) => {
      e.preventDefault();
      e.stopPropagation();

      const isExt = isExternalFileDrag(e);
      if (isExt) {
        e.dataTransfer.dropEffect = "copy";
      } else {
        e.dataTransfer.dropEffect = "move";
      }

      setDragOverTarget(`__repo__:${targetRepoName}`);
      setIsDragOverRoot(false);

      if (hoveredFolderForExpansionRef.current !== `__repo__:${targetRepoName}`) {
        hoveredFolderForExpansionRef.current = `__repo__:${targetRepoName}`;
        if (dragHoverTimerRef.current) {
          clearTimeout(dragHoverTimerRef.current);
        }
        if (collapsedRepos[targetRepoName]) {
          dragHoverTimerRef.current = setTimeout(() => {
            setCollapsedRepos((prev) => ({ ...prev, [targetRepoName]: false }));
          }, 400);
        }
      }
    },
    [isExternalFileDrag, collapsedRepos, setCollapsedRepos],
  );

  const handleDragLeaveRepo = useCallback(
    (e: React.DragEvent, targetRepoName: string) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
      }

      if (dragOverTarget === `__repo__:${targetRepoName}`) {
        setDragOverTarget(null);
      }
      if (hoveredFolderForExpansionRef.current === `__repo__:${targetRepoName}`) {
        hoveredFolderForExpansionRef.current = null;
        if (dragHoverTimerRef.current) {
          clearTimeout(dragHoverTimerRef.current);
          dragHoverTimerRef.current = null;
        }
      }
    },
    [dragOverTarget],
  );

  const handleDropOnRepo = useCallback(
    async (e: React.DragEvent, targetRepoName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverTarget(null);
      setIsDragOverRoot(false);
      setIsExternalDragActive(false);
      externalDragCounterRef.current = 0;
      if (dragHoverTimerRef.current) {
        clearTimeout(dragHoverTimerRef.current);
        dragHoverTimerRef.current = null;
      }

      setCollapsedRepos((prev) => ({ ...prev, [targetRepoName]: false }));

      if (
        isExternalFileDrag(e) ||
        (e.dataTransfer.files && e.dataTransfer.files.length > 0 && !draggedItem)
      ) {
        const scanned = e.dataTransfer.items
          ? await scanDataTransferItems(e.dataTransfer.items)
          : filesToScannedList(e.dataTransfer.files);
        if (scanned.length > 0) {
          await handleImportFiles(scanned, "", targetRepoName);
        }
        return;
      }

      if (!draggedItem) return;
      const { path: sourcePath, name: itemName, repo: sourceRepo } = draggedItem;
      setDraggedItem(null);

      const srcRepo = sourceRepo || activeRepo?.name || "default";
      const targetPath = itemName;

      if (
        srcRepo.toLowerCase() === targetRepoName.toLowerCase() &&
        !sourcePath.includes("/")
      ) {
        return;
      }

      await executeMove(
        sourcePath,
        targetPath,
        itemName,
        "raiz",
        srcRepo,
        targetRepoName,
      );
    },
    [
      isExternalFileDrag,
      draggedItem,
      activeRepo?.name,
      setCollapsedRepos,
      handleImportFiles,
      executeMove,
    ],
  );

  return {
    draggedItem,
    setDraggedItem,
    dragOverTarget,
    setDragOverTarget,
    isDragOverRoot,
    isExternalDragActive,
    isImporting,
    importProgressMessage,
    targetUploadFolder,
    setTargetUploadFolder,
    targetUploadRepo,
    setTargetUploadRepo,
    fileInputRef,
    folderInputRef,
    handlePaneDragEnter,
    handlePaneDragLeave,
    handleImportFiles,
    handleDragStart,
    handleDragEnd,
    handleDragOverFolder,
    handleDragLeaveFolder,
    handleDropOnFolder,
    handleDragOverFile,
    handleDragLeaveFile,
    handleDropOnFile,
    handleDragOverRoot,
    handleDragLeaveRoot,
    handleDropOnRoot,
    handleDragOverRepo,
    handleDragLeaveRepo,
    handleDropOnRepo,
    executeMove,
  };
};
