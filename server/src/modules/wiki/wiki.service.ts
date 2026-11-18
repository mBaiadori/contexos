import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig, recordChange } from '../../config/storage.js';
import { resolveSafeRepoPath } from '../../utils/repo-ref.js';
import { writeTextAtomic } from '../../utils/atomic-write.js';

export interface WikiPage {
  slug: string;
  title: string;
  category: string;
  content: string;
  updated_at: string;
  path?: string;
}

export const WIKI_CATEGORIES = [
  'decisions',
  '_rules',
  'concepts',
  'gotchas',
  'handoffs',
  'geral',
] as const;

export class WikiService {
  private getWikiRootDir(repoName: string): string {
    const cfg = loadConfig();
    const effectiveOwner = cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined;
    const repoDir = resolveRepoDir(repoName || 'local', effectiveOwner);
    return path.join(repoDir, '.wiki');
  }

  private getCategoryDir(repoName: string, category: string): string {
    const rootDir = this.getWikiRootDir(repoName);
    const cleanCategory = (category || 'decisions').toLowerCase().trim();
    return resolveSafeRepoPath(rootDir, cleanCategory, 'Categoria Wiki');
  }

  private ensureMigration(repoName: string) {
    const rootDir = this.getWikiRootDir(repoName);
    if (!fs.existsSync(rootDir)) return;

    try {
      const items = fs.readdirSync(rootDir);
      for (const item of items) {
        const fullItemPath = path.join(rootDir, item);
        const stat = fs.statSync(fullItemPath);
        if (stat.isFile() && item.endsWith('.md')) {
          // Arquivo solto na raiz -> migrar para 'decisions' ou 'geral'
          const targetDir = path.join(rootDir, 'decisions');
          fs.mkdirSync(targetDir, { recursive: true });
          const targetFile = path.join(targetDir, item);
          if (!fs.existsSync(targetFile)) {
            fs.renameSync(fullItemPath, targetFile);
          } else {
            fs.unlinkSync(fullItemPath);
          }
        }
      }
    } catch (err) {
      console.error('[WikiService] Erro durante auto-migração de pastas:', err);
    }
  }

  getWikiPages(repoNameInput?: string, categoryFilter?: string, searchQuery?: string): WikiPage[] {
    const cfg = loadConfig();
    const repoName = repoNameInput || cfg.active_repo?.name || 'local';
    const wikiRootDir = this.getWikiRootDir(repoName);
    this.ensureMigration(repoName);

    const pages: WikiPage[] = [];
    if (!fs.existsSync(wikiRootDir)) {
      return pages;
    }

    const scanCategoryDir = (dirPath: string, catName: string) => {
      if (!fs.existsSync(dirPath)) return;
      try {
        const files = fs.readdirSync(dirPath);
        for (const f of files) {
          if (f.endsWith('.md')) {
            const fullPath = path.join(dirPath, f);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const slug = f.replace('.md', '');
              const titleMatch = content.match(/^#\s+(.*)$/m);
              const title = titleMatch ? titleMatch[1].trim() : slug;
              const stat = fs.statSync(fullPath);

              pages.push({
                slug,
                title,
                category: catName,
                content,
                updated_at: stat.mtime.toISOString(),
                path: `${catName}/${slug}.md`,
              });
            } catch {}
          }
        }
      } catch {}
    };

    if (categoryFilter && categoryFilter !== 'all') {
      const targetDir = path.join(wikiRootDir, categoryFilter);
      scanCategoryDir(targetDir, categoryFilter);
    } else {
      // Escanear todas as subpastas
      const subEntries = fs.readdirSync(wikiRootDir);
      for (const entry of subEntries) {
        const fullEntryPath = path.join(wikiRootDir, entry);
        if (fs.statSync(fullEntryPath).isDirectory()) {
          scanCategoryDir(fullEntryPath, entry);
        }
      }
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return pages.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q)
      );
    }

    // Ordenar por mais recentemente atualizado
    return pages.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  getWikiPage(category: string, slug: string, repoNameInput?: string): WikiPage | null {
    const cfg = loadConfig();
    const repoName = repoNameInput || cfg.active_repo?.name || 'local';
    const cleanCat = (category || 'decisions').toLowerCase().trim();
    const cleanSlug = (slug || '').replace('.md', '').toLowerCase().trim();

    const catDir = this.getCategoryDir(repoName, cleanCat);
    const fullPath = resolveSafeRepoPath(catDir, `${cleanSlug}.md`, 'Página Wiki');
    if (!fs.existsSync(fullPath)) {
      // Fallback: tentar na raiz ou em outras categorias
      const allPages = this.getWikiPages(repoName);
      const found = allPages.find((p) => p.slug === cleanSlug);
      return found || null;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const titleMatch = content.match(/^#\s+(.*)$/m);
      const title = titleMatch ? titleMatch[1].trim() : cleanSlug;
      const stat = fs.statSync(fullPath);

      return {
        slug: cleanSlug,
        title,
        category: cleanCat,
        content,
        updated_at: stat.mtime.toISOString(),
        path: `${cleanCat}/${cleanSlug}.md`,
      };
    } catch {
      return null;
    }
  }

  saveWikiPage(
    category: string,
    slug: string,
    title: string,
    content: string,
    repoNameInput?: string
  ) {
    const cfg = loadConfig();
    const repoName = repoNameInput || cfg.active_repo?.name || 'local';
    const cleanCat = (category || 'decisions').toLowerCase().trim();
    const catDir = this.getCategoryDir(repoName, cleanCat);
    fs.mkdirSync(catDir, { recursive: true });

    const rawSlug = slug || title || 'nota';
    const cleanSlug = rawSlug
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const fullPath = resolveSafeRepoPath(catDir, `${cleanSlug}.md`, 'Página Wiki');
    const finalTitle = title || cleanSlug;
    const finalContent = content.startsWith('# ') ? content : `# ${finalTitle}\n\n${content}`;

    let oldContent = '';
    const isNew = !fs.existsSync(fullPath);
    if (!isNew) {
      try {
        oldContent = fs.readFileSync(fullPath, 'utf-8');
      } catch {}
    }

    writeTextAtomic(fullPath, finalContent);

    const relWikiPath = `.wiki/${cleanCat}/${cleanSlug}.md`;
    recordChange(repoName, relWikiPath, isNew ? 'ADDED' : 'MODIFIED', oldContent, finalContent);

    return {
      success: true,
      page: {
        slug: cleanSlug,
        title: finalTitle,
        category: cleanCat,
        content: finalContent,
        updated_at: new Date().toISOString(),
        path: `${cleanCat}/${cleanSlug}.md`,
      },
    };
  }

  deleteWikiPage(category: string, slug: string, repoNameInput?: string) {
    const cfg = loadConfig();
    const repoName = repoNameInput || cfg.active_repo?.name || 'local';
    const cleanCat = (category || 'decisions').toLowerCase().trim();
    const cleanSlug = (slug || '').replace('.md', '').toLowerCase().trim();

    const catDir = this.getCategoryDir(repoName, cleanCat);
    const fullPath = resolveSafeRepoPath(catDir, `${cleanSlug}.md`, 'Página Wiki');
    if (fs.existsSync(fullPath)) {
      let oldContent = '';
      try {
        oldContent = fs.readFileSync(fullPath, 'utf-8');
      } catch {}
      fs.unlinkSync(fullPath);
      const relWikiPath = `.wiki/${cleanCat}/${cleanSlug}.md`;
      recordChange(repoName, relWikiPath, 'DELETED', oldContent, '');
      return { success: true };
    }

    // Tentar deletar na raiz ou em outra categoria se existir
    const rootPath = path.join(this.getWikiRootDir(repoName), `${cleanSlug}.md`);
    if (fs.existsSync(rootPath)) {
      fs.unlinkSync(rootPath);
      return { success: true };
    }

    return { success: true };
  }
}

export const wikiService = new WikiService();
