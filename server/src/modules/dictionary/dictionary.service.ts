import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR, resolveRepoDir } from '../../config/constants.js';
import { loadConfig, recordChange } from '../../config/storage.js';
import { validateJsonSchema } from '../../utils/schema.validator.js';
import { writeJsonAtomic } from '../../utils/atomic-write.js';

export class DictionaryService {
  private getDictionaryPath(repoName: string): string {
    const cfg = loadConfig();
    const effectiveOwner = cfg.active_repo?.name === repoName ? cfg.active_repo?.owner : undefined;
    const repoDir = resolveRepoDir(repoName || 'local', effectiveOwner);
    const hiddenPath = path.join(repoDir, '.dictionary.json');
    const legacyPath = path.join(repoDir, 'project', 'dictionary.json');
    if (!fs.existsSync(hiddenPath) && fs.existsSync(legacyPath)) {
      return legacyPath;
    }
    return hiddenPath;
  }

  getDictionary(targetRepo?: string) {
    const cfg = loadConfig();
    const repoName = targetRepo || cfg.active_repo?.name || 'local';
    const dictPath = this.getDictionaryPath(repoName);

    if (fs.existsSync(dictPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
        const valRes = validateJsonSchema('dictionary', data);
        if (!valRes.valid) {
          console.warn('[Dictionary] Aviso de schema inválido em .dictionary.json:', valRes.errors);
        }
        return data;
      } catch (e) {
        console.error('Erro ao ler dicionário:', e);
      }
    }

    return {
      version: '1.0.0',
      terms: [],
      domains: [],
    };
  }

  saveDictionary(data: unknown, targetRepo?: string) {
    const valRes = validateJsonSchema('dictionary', data);
    if (!valRes.valid) {
      throw new Error(`Dados do dicionário inválidos: ${valRes.errors?.join(', ')}`);
    }

    const cfg = loadConfig();
    const repoName = targetRepo || cfg.active_repo?.name || 'local';
    const dictPath = this.getDictionaryPath(repoName);

    let oldContent = '';
    if (fs.existsSync(dictPath)) {
      oldContent = fs.readFileSync(dictPath, 'utf-8');
    } else {
      fs.mkdirSync(path.dirname(dictPath), { recursive: true });
    }

    const newContent = JSON.stringify(data, null, 2);
    writeJsonAtomic(dictPath, data, 2);

    recordChange(repoName, '.dictionary.json', oldContent ? 'MODIFIED' : 'ADDED', oldContent, newContent);

    return {
      success: true,
      dictionary: data,
    };
  }
}

export const dictionaryService = new DictionaryService();
