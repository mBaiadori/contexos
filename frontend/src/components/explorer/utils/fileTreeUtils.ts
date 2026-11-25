import type { ScannedFile } from "../types";

interface FileSystemEntryLike {
  isFile?: boolean;
  isDirectory?: boolean;
  name: string;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      cb: (entries: FileSystemEntryLike[]) => void,
      err?: (e: unknown) => void,
    ) => void;
  };
}

// Utilitário: Escanear recursivamente arquivos e pastas arrastados do SO / Finder / Explorer
export const scanDataTransferItems = async (
  items: DataTransferItemList,
): Promise<ScannedFile[]> => {
  const result: ScannedFile[] = [];

  const traverseEntry = async (entry: FileSystemEntryLike | null, currentPath: string = "") => {
    if (!entry) return;
    if (entry.isFile && entry.file) {
      try {
        const file = await new Promise<File>((resolve, reject) => {
          entry.file!(resolve, reject);
        });
        const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        result.push({ file, relativePath: rel });
      } catch (err) {
        console.warn("[FileTree] Falha ao ler arquivo de entrada:", entry.name, err);
      }
    } else if (entry.isDirectory && entry.createReader) {
      const dirReader = entry.createReader();
      const readAllEntries = async (): Promise<FileSystemEntryLike[]> => {
        let allEntries: FileSystemEntryLike[] = [];
        let batch: FileSystemEntryLike[] = [];
        do {
          batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
          });
          allEntries = allEntries.concat(batch);
        } while (batch && batch.length > 0);
        return allEntries;
      };

      try {
        const entries = await readAllEntries();
        const nextPath = currentPath
          ? `${currentPath}/${entry.name}`
          : entry.name;
        for (const childEntry of entries) {
          await traverseEntry(childEntry, nextPath);
        }
      } catch (err) {
        console.warn("[FileTree] Falha ao ler pasta:", entry.name, err);
      }
    }
  };

  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null };
    if (item.kind === "file") {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        promises.push(traverseEntry(entry));
      } else {
        const file = item.getAsFile();
        if (file) {
          result.push({ file, relativePath: file.name });
        }
      }
    }
  }

  await Promise.all(promises);
  return result;
};

// Utilitário: Converter FileList do input HTML para ScannedFile[]
export const filesToScannedList = (fileList: FileList): ScannedFile[] => {
  const result: ScannedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i] as File & { webkitRelativePath?: string };
    const rel = file.webkitRelativePath || file.name;
    result.push({ file, relativePath: rel });
  }
  return result;
};

// Utilitário: Processar arquivos para payload de upload (Texto ou Base64)
export const processFilesForUpload = async (scannedFiles: ScannedFile[]) => {
  const textExts = [
    "md",
    "markdown",
    "txt",
    "json",
    "yaml",
    "yml",
    "csv",
    "tsv",
    "js",
    "ts",
    "jsx",
    "tsx",
    "html",
    "css",
    "scss",
    "svg",
    "xml",
    "env",
    "sh",
    "py",
    "sql",
    "gitignore",
    "conf",
    "ini",
    "toml",
  ];

  const payload: Array<{
    name: string;
    relativePath: string;
    content?: string;
    base64?: string;
  }> = [];

  for (const item of scannedFiles) {
    const file = item.file;
    const name = file.name;
    const ext = name.includes(".")
      ? name.split(".").pop()?.toLowerCase() || ""
      : "";
    const isText = textExts.includes(ext) || file.type.startsWith("text/");

    if (isText) {
      try {
        const text = await file.text();
        payload.push({
          name,
          relativePath: item.relativePath,
          content: text,
        });
      } catch (err) {
        const b64 = await readFileAsBase64(file);
        payload.push({
          name,
          relativePath: item.relativePath,
          base64: b64,
        });
      }
    } else {
      const b64 = await readFileAsBase64(file);
      payload.push({
        name,
        relativePath: item.relativePath,
        base64: b64,
      });
    }
  }

  return payload;
};

export const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const commaIdx = res.indexOf(",");
      resolve(commaIdx >= 0 ? res.substring(commaIdx + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const getExpandedStorageKey = (repoName?: string) =>
  `spec_tree_expanded_folders_${repoName || "default"}`;

export const getSelectedFolderStorageKey = (repoName?: string) =>
  `spec_tree_selected_folder_${repoName || "default"}`;

export const getScrollStorageKey = (repoName?: string) =>
  `spec_tree_scroll_${repoName || "default"}`;
