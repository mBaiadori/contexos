import fs from 'node:fs';
import path from 'node:path';
import { PROJECTS_DIR } from '../config/constants.js';
import { loadConfig } from '../config/storage.js';

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

/**
 * Valida se um segmento de nome de org ou repositório é seguro.
 * Rejeita vazios, caracteres de path traversal (., ..), barras e caracteres inválidos.
 */
export function sanitizeRepoSegment(segment: string): string {
  if (!segment) return '';
  const trimmed = segment.trim();
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Segmento de repositório inválido: "${segment}"`);
  }
  // Remove sufixo .git se fornecido
  const clean = trimmed.replace(/\.git$/i, '');
  // Permite alfanuméricos, hífens, sublinhados e pontos seguros
  if (!/^[a-zA-Z0-9_.-]+$/.test(clean)) {
    throw new Error(`Segmento contém caracteres inválidos: "${segment}"`);
  }
  return clean;
}

/**
 * Valida rigorosamente um nome ou identificador de repositório (ex: "meu-repo" ou "owner/meu-repo").
 * Rejeita directory traversal (..), caracteres nulos (\0), barras extras ou caracteres de controle.
 * Retorna o identificador sanitizado ou lança Error.
 */
export function validateRepoName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Nome de repositório não informado ou inválido.');
  }
  if (name.includes('\0')) {
    throw new Error('Nome de repositório contém caractere nulo (null byte).');
  }
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Nome de repositório não informado ou vazio.');
  }

  // Bloqueio rigoroso de qualquer tentativa de traversal
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..') || /(^|[/\\])\.{1,2}([/\\]|$)/.test(trimmed)) {
    throw new Error(`Identificador de repositório inválido ou path traversal detectado: "${name}"`);
  }

  // Se contiver caracteres perigosos de injeção
  if (/[;`$<>|]/.test(trimmed)) {
    throw new Error(`Identificador de repositório contém caracteres inválidos: "${name}"`);
  }

  // Se for caminho absoluto seguro (ex: diretórios de teste em tmpdir)
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }

  // Se contiver barra (formato owner/repo)
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    const parts = trimmed.split(/[/\\]/);
    if (parts.length !== 2 || parts.some((p) => !p)) {
      throw new Error(`Identificador de repositório inválido ou path traversal detectado: "${name}"`);
    }
    const cleanOwner = sanitizeRepoSegment(parts[0]);
    const cleanRepo = sanitizeRepoSegment(parts[1]);
    return `${cleanOwner}/${cleanRepo}`;
  }

  return sanitizeRepoSegment(trimmed);
}

/**
 * Converte qualquer entrada (string "owner/repo", objeto com owner/name, etc.) em RepoRef canônico.
 */
export function parseRepoRef(
  input: string | { owner?: string | { login?: string } | null; repo?: string; name?: string; full_name?: string } | null | undefined,
  fallbackOwner?: string,
): RepoRef | null {
  if (!input) return null;

  if (typeof input === 'string') {
    const raw = input.trim().replace(/\.git$/i, '');
    if (!raw) return null;

    if (raw.includes('/')) {
      const parts = raw.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = sanitizeRepoSegment(parts[0]);
        const repo = sanitizeRepoSegment(parts.slice(1).join('-'));
        return { owner, repo };
      }
    }

    let owner = fallbackOwner;
    if (!owner) {
      try {
        const cfg = loadConfig();
        if (cfg.active_repo?.name?.toLowerCase() === raw.toLowerCase() && cfg.active_repo?.owner) {
          owner = cfg.active_repo.owner;
        } else {
          owner = cfg.active_repo?.owner || cfg.user?.login || 'local';
        }
      } catch {
        owner = 'local';
      }
    }

    if (owner && raw) {
      return {
        owner: sanitizeRepoSegment(owner),
        repo: sanitizeRepoSegment(raw),
      };
    }

    return null;
  }

  if (typeof input === 'object') {
    const rawFullName = input.full_name;
    if (rawFullName && typeof rawFullName === 'string' && rawFullName.includes('/')) {
      return parseRepoRef(rawFullName, fallbackOwner);
    }

    let rawOwner =
      typeof input.owner === 'string'
        ? input.owner
        : typeof input.owner?.login === 'string'
          ? input.owner.login
          : fallbackOwner;

    const rawRepo = input.repo || input.name;

    if (!rawOwner && rawRepo) {
      try {
        const cfg = loadConfig();
        if (cfg.active_repo?.name?.toLowerCase() === rawRepo.toLowerCase() && cfg.active_repo?.owner) {
          rawOwner = cfg.active_repo.owner;
        } else {
          rawOwner = cfg.active_repo?.owner || cfg.user?.login || 'local';
        }
      } catch {
        rawOwner = 'local';
      }
    }

    if (rawOwner && rawRepo) {
      const owner = sanitizeRepoSegment(rawOwner);
      const repo = sanitizeRepoSegment(rawRepo);
      return { owner, repo };
    }
  }

  return null;
}

/**
 * Chave única em minúsculas para Map/Set/Lookup seguro sem colisão de maiúsculas/minúsculas.
 */
export function repoKey(ref: RepoRef): string {
  return `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
}

/**
 * Nome completo no formato "Owner/Repo".
 */
export function repoFullName(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}

/**
 * Resolve o caminho de disco canônico e determinístico de um repositório:
 * SEMPRE `projects/<owner>/<repo>`.
 * Nunca cria diretório, nunca faz heurísticas de busca ou fallbacks legados.
 */
export function resolveRepoDirPath(refOrRepo: RepoRef | string, ownerOrOrg?: string): string {
  const ref =
    typeof refOrRepo === 'object' && refOrRepo !== null && 'owner' in refOrRepo && 'repo' in refOrRepo
      ? (refOrRepo as RepoRef)
      : parseRepoRef(refOrRepo, ownerOrOrg);

  if (!ref) {
    throw new Error(
      `Não foi possível resolver o repositório. Identificador inválido: "${String(refOrRepo)}" (owner: "${ownerOrOrg}")`,
    );
  }

  const cleanOwner = sanitizeRepoSegment(ref.owner);
  const cleanRepo = sanitizeRepoSegment(ref.repo);

  const resolved = path.resolve(PROJECTS_DIR, cleanOwner, cleanRepo);
  const rootResolved = path.resolve(PROJECTS_DIR);

  // Validação de segurança para garantir que não escapa de PROJECTS_DIR
  // No Windows, normalizamos para lowercase para evitar falso-positivo em drive letters (C: vs c:)
  const isWindows = process.platform === 'win32';
  const normResolved = isWindows ? resolved.toLowerCase() : resolved;
  const normRoot = isWindows ? rootResolved.toLowerCase() : rootResolved;

  if (!normResolved.startsWith(normRoot + path.sep)) {
    throw new Error(`Caminho fora do diretório de projetos permitido: ${resolved}`);
  }

  return resolved;
}

/**
 * Resolve o caminho real no sistema de arquivos, seguindo symlinks.
 * Se o caminho ou parte dele não existir ainda, resolve o realpath do ancestral
 * existente mais próximo e anexa os segmentos restantes normalizados.
 */
export function resolveRealPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);

  // Se o caminho completo já existe no disco, realpathSync resolve diretamente
  if (fs.existsSync(resolved)) {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  // Se o caminho não existe (ex: arquivo ou pasta nova sendo criada),
  // encontramos o ancestral existente mais próximo para resolver quaisquer symlinks intermediários
  let current = resolved;
  const segments: string[] = [];

  while (current && current !== path.dirname(current)) {
    const parent = path.dirname(current);
    segments.unshift(path.basename(current));

    if (fs.existsSync(parent)) {
      try {
        const realParent = fs.realpathSync(parent);
        return path.resolve(realParent, ...segments);
      } catch {
        return resolved;
      }
    }
    current = parent;
  }

  return resolved;
}

/**
 * Verifica se um caminho está estritamente contido dentro de um diretório base permitido,
 * resolvendo symlinks reais tanto da base quanto do alvo para impedir symlink escape e path traversal.
 */
export function isPathInside(parentDir: string, targetPath: string): boolean {
  const realParent = resolveRealPath(parentDir);
  const realTarget = resolveRealPath(targetPath);

  return (
    realTarget === realParent ||
    realTarget.startsWith(realParent + path.sep)
  );
}

export function assertPathInside(parentDir: string, targetPath: string, label = "Caminho"): string {
  if (!isPathInside(parentDir, targetPath)) {
    throw new Error(`${label} fora do diretório permitido: ${targetPath}`);
  }
  return resolveRealPath(targetPath);
}

/**
 * Resolve e valida rigorosamente que o caminho resultante está contido dentro do diretório raiz autorizado,
 * prevenindo escapes por '..', caminhos absolutos forçados e symlinks maliciosos.
 */
export function resolveSafeRepoPath(baseDir: string, userPath: string, label = "Caminho"): string {
  if (!userPath || typeof userPath !== 'string') {
    throw new Error(`${label} inválido ou não informado.`);
  }
  const clean = userPath.replace(/\0/g, '').trim().replace(/^\/+/, '');
  const resolved = path.resolve(baseDir, clean);
  if (!isPathInside(baseDir, resolved)) {
    throw new Error(`Acesso negado: ${label} '${clean}' está fora do diretório permitido.`);
  }
  return resolved;
}

