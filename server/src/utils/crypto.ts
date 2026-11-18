import crypto from 'node:crypto';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { executeGit } from './git.js';
import type { SecretScanResult, SecretScanViolation } from '../modules/governance/governance.types.js';

export interface MergePlaintextResult {
  hasConflicts: boolean;
  mergedContent: string;
  conflictCount: number;
}

/**
 * Checks multidimensional access clearance for a collaborator against a document's security metadata.
 * Evaluates:
 * 1. Root / Wildcard bypass (user.departments includes '*' or user.allowed_paths includes '*')
 * 2. Public clearance (doc.department is 'public' | 'general' | empty)
 * 3. Horizontal Compartment / Department clearance (user.departments includes doc.department)
 * 4. Path/Route check (if user has allowed_paths configured and doc has a path)
 */
export function canAccessDocument(
  user: {
    departments?: string[];
    allowed_paths?: string[];
    denied_paths?: string[];
    isOwner?: boolean;
    role?: string;
  },
  doc: { department?: string; path?: string }
): boolean {
  // 1. Root or owner bypass
  if (user.isOwner || user.role === 'owner') {
    return true;
  }

  // 2. Denied Paths check: Explicit deny ALWAYS overrides allow & wildcards
  if (Array.isArray(user.denied_paths) && user.denied_paths.length > 0 && doc.path) {
    const cleanDocPath = doc.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const isExplicitlyDenied = user.denied_paths.some((pattern) => {
      if (!pattern) return false;
      const cleanPattern = pattern
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/\*+$/, '')
        .toLowerCase();
      return cleanDocPath === cleanPattern || cleanDocPath.startsWith(cleanPattern + '/');
    });
    if (isExplicitlyDenied) {
      return false;
    }
  }

  // 3. Wildcard bypass in departments or allowed_paths
  if (
    (Array.isArray(user.departments) && user.departments.includes('*')) ||
    (Array.isArray(user.allowed_paths) && user.allowed_paths.includes('*'))
  ) {
    return true;
  }

  // 4. Compartment / Department check
  if (doc.department && doc.department !== 'general' && doc.department !== 'public') {
    if (!Array.isArray(user.departments) || !user.departments.includes(doc.department)) {
      return false;
    }
  }

  // 5. Path/Route check: if user has allowed_paths configured and doc has a path
  if (Array.isArray(user.allowed_paths) && user.allowed_paths.length > 0 && doc.path) {
    const cleanDocPath = doc.path.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    const hasPathAccess = user.allowed_paths.some((pattern) => {
      if (pattern === '*' || pattern === '/**') return true;
      const cleanPattern = pattern
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/\/\*+$/, '')
        .toLowerCase();
      return cleanDocPath === cleanPattern || cleanDocPath.startsWith(cleanPattern + '/');
    });
    if (!hasPathAccess) {
      return false;
    }
  }

  return true;
}

/**
 * Secret Scanner for Pre-Commit and Pre-PR checks (detects API keys, private keys, AWS tokens, etc.).
 */
export function scanContentForSecrets(content: string, filePath: string): SecretScanResult {
  const violations: SecretScanViolation[] = [];

  if (!content || typeof content !== 'string') {
    return { hasSecrets: false, violations };
  }

  // Ignore internal system memory, caches, dependencies and build artifacts
  const cleanPath = (filePath || '').replace(/\\/g, '/');
  const isSystemFile = 
    cleanPath.includes('.git/') ||
    cleanPath.includes('/node_modules/') ||
    cleanPath.includes('/dist/') ||
    cleanPath.endsWith('package.json') ||
    cleanPath.endsWith('package-lock.json') ||
    cleanPath.endsWith('tsconfig.json');

  if (isSystemFile) {
    return { hasSecrets: false, violations };
  }

  // Check 1: GitHub Tokens
  if (/(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,255}/.test(content) || /github_pat_[A-Za-z0-9_]{50,255}/.test(content)) {
    violations.push({
      rule: 'GITHUB_PAT_DETECTED',
      file: filePath,
      message: 'Token de Acesso Pessoal do GitHub (PAT) detectado no arquivo.',
    });
  }

  // Check 2: OpenAI / Anthropic / Generic AI API Keys
  if (/\bsk-[A-Za-z0-9_-]{20,80}\b/.test(content) || /\bsk-ant-[A-Za-z0-9_-]{20,100}\b/.test(content)) {
    violations.push({
      rule: 'AI_API_KEY_DETECTED',
      file: filePath,
      message: 'Chave de API de IA (OpenAI / Anthropic) detectada em texto claro.',
    });
  }

  // Check 3: Google AI / Cloud API Keys
  if (/\bAIza[0-9A-Za-z-_]{30,45}\b/.test(content)) {
    violations.push({
      rule: 'GOOGLE_API_KEY_DETECTED',
      file: filePath,
      message: 'Chave de API do Google Cloud / Gemini detectada no arquivo.',
    });
  }

  // Check 4: Slack Tokens
  if (/\bxox[baprs]-[0-9a-zA-Z-]{10,48}\b/.test(content)) {
    violations.push({
      rule: 'SLACK_TOKEN_DETECTED',
      file: filePath,
      message: 'Token de API do Slack detectado no arquivo.',
    });
  }

  // Check 5: Stripe Secret Keys
  if (/\b(?:sk|rk)_(?:test|live)_[0-9a-zA-Z]{24,}\b/.test(content)) {
    violations.push({
      rule: 'STRIPE_SECRET_KEY_DETECTED',
      file: filePath,
      message: 'Chave Secreta do Stripe detectada no arquivo.',
    });
  }

  // Check 6: AWS Access Keys
  if (/(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/.test(content)) {
    violations.push({
      rule: 'AWS_CREDENTIAL_DETECTED',
      file: filePath,
      message: 'Chave de Acesso AWS detectada no arquivo.',
    });
  }

  // Check 7: Private RSA / SSH Keys
  if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(content)) {
    violations.push({
      rule: 'PRIVATE_KEY_DETECTED',
      file: filePath,
      message: 'Chave Privada criptográfica (SSH/RSA) detectada em texto claro.',
    });
  }

  return {
    hasSecrets: violations.length > 0,
    violations,
  };
}

/**
 * Executa um Merge de 3 Vias no texto plano (Base Ancestral vs Nossa Versão Local vs Versão Remota do Git).
 * Utiliza o algoritmo nativo `git merge-file` para garantir fusão perfeita linha a linha.
 * Se houver conflitos reais de linha, embute os marcadores legíveis em texto plano.
 */
export async function mergePlaintext3Way(
  baseText: string,
  oursText: string,
  theirsText: string,
  labels: { ours?: string; base?: string; theirs?: string } = {}
): Promise<MergePlaintextResult> {
  const secureTmpDir = path.join(os.tmpdir(), `ctx_merge_${crypto.randomBytes(12).toString('hex')}`);
  await fs.promises.mkdir(secureTmpDir, { recursive: true, mode: 0o700 });

  const fBase = path.join(secureTmpDir, 'base.tmp');
  const fOurs = path.join(secureTmpDir, 'ours.tmp');
  const fTheirs = path.join(secureTmpDir, 'theirs.tmp');

  const lblOurs = labels.ours || 'Sua Versão (Local)';
  const lblBase = labels.base || 'Versão Original (Base)';
  const lblTheirs = labels.theirs || 'Versão Remota (Git)';

  try {
    await fs.promises.writeFile(fBase, baseText, { encoding: 'utf-8', mode: 0o600 });
    await fs.promises.writeFile(fOurs, oursText, { encoding: 'utf-8', mode: 0o600 });
    await fs.promises.writeFile(fTheirs, theirsText, { encoding: 'utf-8', mode: 0o600 });

    // Executa git merge-file diretamente sem passar por shell via executeGit
    const mergeRes = await executeGit(
      ['merge-file', '-p', '-L', lblOurs, '-L', lblBase, '-L', lblTheirs, fOurs, fBase, fTheirs],
      secureTmpDir,
      undefined,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    if (mergeRes.success) {
      return {
        hasConflicts: false,
        mergedContent: mergeRes.stdout,
        conflictCount: 0,
      };
    } else {
      // Se houver conflito, o git merge-file sai com código > 0 e o stdout contém os marcadores!
      const outputWithMarkers = mergeRes.stdout ? String(mergeRes.stdout) : '';
      const escapedLbl = lblOurs.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const conflictMarkers = (outputWithMarkers.match(new RegExp(`<<<<<<< ${escapedLbl}`, 'g')) || []).length;

      return {
        hasConflicts: true,
        mergedContent: outputWithMarkers,
        conflictCount: conflictMarkers || 1,
      };
    }
  } catch (err: any) {
    // Fallback se não conseguir rodar git merge-file: retorna a versão local e sinaliza
    return {
      hasConflicts: true,
      mergedContent: oursText,
      conflictCount: 1,
    };
  } finally {
    try {
      await fs.promises.rm(secureTmpDir, { recursive: true, force: true });
    } catch {}
  }
}
