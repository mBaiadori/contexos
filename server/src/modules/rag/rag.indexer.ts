import fs from "node:fs";
import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { writeJsonAtomic } from "../../utils/atomic-write.js";
import { checkAiPolicy } from "../ai/ai-policy.service.js";
import { RagChunk, RagDiskStorage, RagFileManifestItem } from "./rag.types.js";

// Normalizador e Tokenizador Simples e Rápido
export function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

const STOPWORDS = new Set([
  "de",
  "a",
  "o",
  "que",
  "e",
  "do",
  "da",
  "em",
  "um",
  "para",
  "com",
  "nao",
  "uma",
  "os",
  "no",
  "se",
  "na",
  "por",
  "mais",
  "as",
  "dos",
  "como",
  "mas",
  "ao",
  "ele",
  "das",
  "sua",
  "seu",
  "ou",
  "quando",
  "muito",
  "nos",
  "ja",
  "eu",
  "tambem",
  "so",
  "pelo",
  "pela",
  "ate",
  "isso",
  "ela",
  "entre",
  "depois",
  "sem",
  "mesmo",
  "aos",
  "seus",
  "quem",
  "nas",
  "me",
  "esse",
  "eles",
  "the",
  "and",
  "to",
  "of",
  "a",
  "in",
  "is",
  "that",
  "for",
  "it",
  "as",
  "was",
  "with",
  "on",
  "are",
  "this",
  "by",
  "at",
  "be",
  "from",
]);

export class RagIndexer {
  private ignoredDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".cache",
    ".spec-memory",
    "coverage",
    ".vscode",
    ".antigravity",
  ]);

  private supportedExts = new Set([
    ".md",
    ".markdown",
    ".txt",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".mermaid",
    ".ts",
    ".js",
  ]);

  private getDiskIndexPath(
    repoName: string,
    explicitProjectRoot?: string,
  ): string {
    const projectRoot =
      explicitProjectRoot || resolveRepoDir(repoName || "local");
    const memoryDir = path.join(projectRoot, ".rag");
    if (!fs.existsSync(memoryDir)) {
      try {
        fs.mkdirSync(memoryDir, { recursive: true });
      } catch {}
    }
    return path.join(memoryDir, "rag-index.json");
  }

  /**
   * Carrega o índice persistido do disco em .spec-memory/rag-index.json
   */
  loadDiskIndex(
    repoName: string,
    explicitProjectRoot?: string,
  ): RagDiskStorage | null {
    const indexPath = this.getDiskIndexPath(repoName, explicitProjectRoot);
    if (!fs.existsSync(indexPath)) return null;

    try {
      const raw = fs.readFileSync(indexPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.chunks) && parsed.manifest) {
        return parsed as RagDiskStorage;
      }
    } catch (err) {
      console.warn(
        `[RAG Indexer] Falha ao ler cache do disco de ${repoName}:`,
        err,
      );
    }
    return null;
  }

  /**
   * Salva o índice consolidado no disco
   */
  saveDiskIndex(
    repoName: string,
    data: RagDiskStorage,
    explicitProjectRoot?: string,
  ): void {
    const indexPath = this.getDiskIndexPath(repoName, explicitProjectRoot);
    try {
      writeJsonAtomic(indexPath, data, 2);
    } catch (err) {
      console.warn(
        `[RAG Indexer] Falha ao persistir cache do disco em ${indexPath}:`,
        err,
      );
    }
  }

  /**
   * Indexação Incremental com controle por mtime e manifesto de arquivos
   */
  indexRepositoryIncremental(
    repoName: string,
    explicitProjectRoot?: string,
  ): { chunks: RagChunk[]; indexedFiles: string[]; updatedCount: number } {
    const projectRoot =
      explicitProjectRoot || resolveRepoDir(repoName || "local");
    if (!fs.existsSync(projectRoot)) {
      return { chunks: [], indexedFiles: [], updatedCount: 0 };
    }

    const diskCache = this.loadDiskIndex(repoName, projectRoot);
    const existingManifest: Record<string, RagFileManifestItem> =
      diskCache?.manifest || {};
    const existingChunksMap = new Map<string, RagChunk>();

    if (diskCache?.chunks) {
      for (const ch of diskCache.chunks) {
        existingChunksMap.set(ch.id, ch);
      }
    }

    const currentFiles = this.collectFiles(projectRoot, projectRoot);
    const currentFilesSet = new Set(currentFiles);
    const newManifest: Record<string, RagFileManifestItem> = {};
    const finalChunks: RagChunk[] = [];
    let updatedCount = 0;

    for (const relFile of currentFiles) {
      const fullPath = path.join(projectRoot, relFile);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 1024 * 1024) continue; // Pula arquivos > 1MB

        // Consulta de privacidade LGPD: documentos restritos/confidenciais são excluídos do RAG
        const privacyPolicy = checkAiPolicy({
          projectRoot,
          repoName,
          filePath: relFile,
          provider: "rag",
        });
        if (!privacyPolicy.allowed || privacyPolicy.policy === "deny") {
          continue;
        }

        const prevManifest = existingManifest[relFile];
        // SE o arquivo NÃO foi alterado no disco (mtime e tamanho idênticos)
        if (
          prevManifest &&
          prevManifest.mtimeMs === stat.mtimeMs &&
          prevManifest.size === stat.size
        ) {
          newManifest[relFile] = prevManifest;
          for (const cId of prevManifest.chunkIds) {
            const cachedChunk = existingChunksMap.get(cId);
            if (cachedChunk) {
              finalChunks.push(cachedChunk);
            }
          }
        } else {
          // Arquivo novo ou modificado: particiona apenas este arquivo!
          const content = fs.readFileSync(fullPath, "utf-8");
          const fileChunks = this.chunkFile(
            repoName,
            fullPath,
            relFile,
            content,
            stat.mtimeMs,
          );
          const chunkIds = fileChunks.map((c) => c.id);

          newManifest[relFile] = {
            relativePath: relFile,
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            chunkIds,
          };

          finalChunks.push(...fileChunks);
          updatedCount++;
        }
      } catch (err) {
        console.warn(
          `[RAG Indexer] Erro ao processar arquivo ${relFile}:`,
          err,
        );
      }
    }

    // Salva o novo índice consolidado em disco
    this.saveDiskIndex(
      repoName,
      {
        repo: repoName,
        lastIndexedAt: Date.now(),
        manifest: newManifest,
        chunks: finalChunks,
      },
      projectRoot,
    );

    return { chunks: finalChunks, indexedFiles: currentFiles, updatedCount };
  }

  /**
   * Indexa apenas um único arquivo pontual quando o evento do chokidar avisar
   */
  indexSingleFile(
    repoName: string,
    relativePath: string,
    explicitProjectRoot?: string,
  ): { chunks: RagChunk[]; updated: boolean } {
    const projectRoot =
      explicitProjectRoot || resolveRepoDir(repoName || "local");
    const fullPath = path.join(projectRoot, relativePath);

    if (!fs.existsSync(fullPath)) {
      return { chunks: [], updated: false };
    }

    const privacyPolicy = checkAiPolicy({
      projectRoot,
      repoName,
      filePath: relativePath,
      provider: "rag",
    });
    if (!privacyPolicy.allowed || privacyPolicy.policy === "deny") {
      return { chunks: [], updated: false };
    }

    try {
      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, "utf-8");
      const fileChunks = this.chunkFile(
        repoName,
        fullPath,
        relativePath,
        content,
        stat.mtimeMs,
      );
      return { chunks: fileChunks, updated: true };
    } catch {
      return { chunks: [], updated: false };
    }
  }

  private collectFiles(dir: string, rootDir: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (this.ignoredDirs.has(entry.name) || entry.name.startsWith("."))
            continue;
          results.push(
            ...this.collectFiles(path.join(dir, entry.name), rootDir),
          );
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (this.supportedExts.has(ext) && !entry.name.startsWith(".")) {
            const rel = path.relative(rootDir, path.join(dir, entry.name));
            results.push(rel);
          }
        }
      }
    } catch {}
    return results;
  }

  private chunkFile(
    repo: string,
    filePath: string,
    relativePath: string,
    content: string,
    updatedAt: number,
  ): RagChunk[] {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".md" || ext === ".markdown") {
      return this.chunkMarkdown(
        repo,
        filePath,
        relativePath,
        content,
        updatedAt,
      );
    }

    // Para outros arquivos, particiona por blocos de linhas (~40 linhas por chunk com overlap)
    const lines = content.split("\n");
    const chunks: RagChunk[] = [];
    const CHUNK_SIZE = 40;
    const OVERLAP = 10;

    for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
      const slice = lines.slice(i, i + CHUNK_SIZE);
      if (slice.length === 0) break;
      const text = slice.join("\n").trim();
      if (!text) continue;

      const tokens = tokenizeText(text);
      const tf: Record<string, number> = {};
      for (const tok of tokens) {
        tf[tok] = (tf[tok] || 0) + 1;
      }

      chunks.push({
        id: `${relativePath}#L${i + 1}-${i + slice.length}`,
        repo,
        filePath,
        relativePath,
        sectionTitle: `${relativePath} (Linhas ${i + 1}-${i + slice.length})`,
        content: text,
        lineStart: i + 1,
        lineEnd: i + slice.length,
        tokens,
        termFrequency: tf,
        updatedAt,
      });

      if (i + CHUNK_SIZE >= lines.length) break;
    }

    return chunks;
  }

  private chunkMarkdown(
    repo: string,
    filePath: string,
    relativePath: string,
    content: string,
    updatedAt: number,
  ): RagChunk[] {
    const lines = content.split("\n");
    const chunks: RagChunk[] = [];

    let currentSection = relativePath;
    let currentLines: string[] = [];
    let startLine = 1;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const isHeader = /^#{1,4}\s+(.+)$/.test(line.trim());

      if (isHeader && currentLines.length > 0) {
        const text = currentLines.join("\n").trim();
        if (text) {
          const tokens = tokenizeText(currentSection + " " + text);
          const tf: Record<string, number> = {};
          for (const tok of tokens) {
            tf[tok] = (tf[tok] || 0) + 1;
          }

          chunks.push({
            id: `${relativePath}#${currentSection.replace(/\s+/g, "-").toLowerCase()}#L${startLine}-${idx}`,
            repo,
            filePath,
            relativePath,
            sectionTitle: currentSection,
            content: text,
            lineStart: startLine,
            lineEnd: idx,
            tokens,
            termFrequency: tf,
            updatedAt,
          });
        }

        const match = line.trim().match(/^#{1,4}\s+(.+)$/);
        currentSection = match ? match[1].trim() : `${relativePath} - Seção`;
        currentLines = [line];
        startLine = idx + 1;
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      const text = currentLines.join("\n").trim();
      if (text) {
        const tokens = tokenizeText(currentSection + " " + text);
        const tf: Record<string, number> = {};
        for (const tok of tokens) {
          tf[tok] = (tf[tok] || 0) + 1;
        }

        chunks.push({
          id: `${relativePath}#${currentSection.replace(/\s+/g, "-").toLowerCase()}#L${startLine}-${lines.length}`,
          repo,
          filePath,
          relativePath,
          sectionTitle: currentSection,
          content: text,
          lineStart: startLine,
          lineEnd: lines.length,
          tokens,
          termFrequency: tf,
          updatedAt,
        });
      }
    }

    return chunks;
  }
}

export const ragIndexer = new RagIndexer();
