#!/usr/bin/env node

/**
 * Script automatizado de Release para Contexos.
 *
 * Fluxo de execução:
 * 1. Valida se a working tree do Git está limpa.
 * 2. Determina a próxima versão (patch, minor, major ou explícita X.Y.Z).
 * 3. Valida se a tag Git já não existe.
 * 4. Executa a suíte de validação completa (TypeScript, testes, build, guardas estáticos).
 * 5. Atualiza a versão em todos os arquivos necessários:
 *    - package.json (raiz)
 *    - desktop/package.json
 *    - frontend/package.json
 *    - server/package.json
 *    - server/src/config/constants.ts
 * 6. Cria o commit e a tag correspondente (ex: v1.0.16).
 * 7. Envia os commits e a tag para o remote origin (disparando o CI/CD de build do Desktop).
 *
 * Uso:
 *   npm run release            # Faz bump de patch (ex: 1.0.15 -> 1.0.16) e envia para o origin
 *   npm run release patch      # Equivalente ao padrão
 *   npm run release minor      # Bump de minor (ex: 1.0.15 -> 1.1.0)
 *   npm run release major      # Bump de major (ex: 1.0.15 -> 2.0.0)
 *   npm run release 1.0.16     # Define uma versão explícita
 *   npm run release -- --no-push   # Cria commit e tag localmente sem fazer git push
 *   npm run release -- --dry-run   # Simula todos os passos sem alterar arquivos ou git
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Cores para o terminal
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function logStep(step, total, title) {
  console.log(`\n${c.cyan}=== [${step}/${total}] ${title} ===${c.reset}`);
}

function logSuccess(msg) {
  console.log(`${c.green}✔ ${msg}${c.reset}`);
}

function logWarn(msg) {
  console.log(`${c.yellow}⚠ ${msg}${c.reset}`);
}

function logError(msg) {
  console.error(`${c.red}✖ ${msg}${c.reset}`);
}

function parseSemver(version) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function formatSemver({ major, minor, patch, prerelease }) {
  const base = `${major}.${minor}.${patch}`;
  return prerelease ? `${base}-${prerelease}` : base;
}

function bumpVersion(current, type) {
  const sem = parseSemver(current);
  if (!sem) {
    throw new Error(`Versão atual "${current}" não é um SemVer válido.`);
  }

  if (type === 'major') {
    return formatSemver({ major: sem.major + 1, minor: 0, patch: 0 });
  }
  if (type === 'minor') {
    return formatSemver({ major: sem.major, minor: sem.minor + 1, patch: 0 });
  }
  if (type === 'patch') {
    return formatSemver({ major: sem.major, minor: sem.minor, patch: sem.patch + 1 });
  }

  // Versão explícita
  if (parseSemver(type)) {
    return type.trim();
  }

  throw new Error(`Tipo de release inválido: "${type}". Use: patch | minor | major | <X.Y.Z>`);
}

function run(command, options = {}) {
  return execSync(command, {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe',
    ...options,
  });
}

function runInteractive(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });
  return res.status === 0;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const flags = new Set(rawArgs.filter((a) => a.startsWith('--')));
  const positionalArgs = rawArgs.filter((a) => !a.startsWith('--'));

  const isDryRun = flags.has('--dry-run');
  const noPush = flags.has('--no-push');
  const skipVerify = flags.has('--skip-verify');
  const releaseType = positionalArgs[0] || 'patch';

  console.log(`\n${c.bright}${c.magenta}🚀 Contexos Release Automation${c.reset}`);
  if (isDryRun) {
    console.log(`${c.yellow}[MODO DRY-RUN: Nenhuma alteração real será salva ou enviada]${c.reset}`);
  }

  // 1. Validar status do Git
  logStep(1, 6, 'Validando estado do Git');
  const gitStatus = run('git status --porcelain').trim();
  if (gitStatus && !isDryRun) {
    logError('A working tree do repositório possui arquivos alterados ou não rastreados:');
    console.log(gitStatus);
    logError('Faça commit ou stash de suas alterações antes de iniciar o release.');
    process.exit(1);
  }

  const currentBranch = run('git rev-parse --abbrev-ref HEAD').trim();
  logSuccess(`Branch atual: ${currentBranch}`);

  // 2. Determinar versões
  logStep(2, 6, 'Determinando versão de release');
  const rootPkgPath = path.join(ROOT_DIR, 'package.json');
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
  const currentVersion = rootPkg.version;
  const nextVersion = bumpVersion(currentVersion, releaseType);

  console.log(`  Versão atual:  ${c.dim}${currentVersion}${c.reset}`);
  console.log(`  Nova versão:   ${c.bright}${c.green}${nextVersion}${c.reset} (${releaseType})`);
  console.log(`  Tag Git:       ${c.bright}${c.cyan}v${nextVersion}${c.reset}`);

  // Verificar se a tag já existe
  const tagExists = run(`git tag -l "v${nextVersion}"`).trim();
  if (tagExists) {
    logError(`A tag Git "v${nextVersion}" já existe no repositório.`);
    process.exit(1);
  }
  logSuccess('Nova versão e tag válidas.');

  // 3. Execução dos testes e verificação de qualidade
  logStep(3, 6, 'Executando suíte completa de verificação (npm run verify)');
  if (skipVerify) {
    logWarn('A verificação foi ignorada via --skip-verify!');
  } else {
    const verifySuccess = runInteractive('npm', ['run', 'verify']);
    if (!verifySuccess) {
      logError('A verificação completa falhou! Corrija os erros antes de lançar o release.');
      process.exit(1);
    }
    logSuccess('Todos os testes, compilações e guardas estáticos foram aprovados.');
  }

  // 4. Atualizar arquivos com a nova versão
  logStep(4, 6, 'Atualizando arquivos de versão');
  const filesToUpdate = [
    {
      file: 'package.json',
      type: 'json',
    },
    {
      file: 'desktop/package.json',
      type: 'json',
    },
    {
      file: 'frontend/package.json',
      type: 'json',
    },
    {
      file: 'server/package.json',
      type: 'json',
    },
    {
      file: 'server/src/config/constants.ts',
      type: 'ts-constant',
    },
  ];

  for (const item of filesToUpdate) {
    const fullPath = path.join(ROOT_DIR, item.file);
    if (!fs.existsSync(fullPath)) {
      logError(`Arquivo não encontrado: ${item.file}`);
      process.exit(1);
    }

    if (item.type === 'json') {
      const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      pkg.version = nextVersion;
      if (!isDryRun) {
        fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      }
      logSuccess(`${item.file} -> ${nextVersion}`);
    } else if (item.type === 'ts-constant') {
      let content = fs.readFileSync(fullPath, 'utf-8');
      // Atualiza o retorno fallback de getAppVersion: return '...';
      const updated = content.replace(
        /(export function getAppVersion[\s\S]*?return\s+['"])[^'"]+(['"];)/,
        `$1${nextVersion}$2`
      );
      if (updated === content) {
        logWarn(`Não foi possível substituir a versão em ${item.file} automaticamente.`);
      } else {
        if (!isDryRun) {
          fs.writeFileSync(fullPath, updated, 'utf-8');
        }
        logSuccess(`${item.file} -> fallback return '${nextVersion}'`);
      }
    }
  }

  // 5. Commit e Tag no Git
  logStep(5, 6, 'Criando commit e tag de release');
  const commitMsg = `chore(release): bump version to ${nextVersion}`;
  const tagName = `v${nextVersion}`;

  if (isDryRun) {
    console.log(`  [DRY-RUN] Executaria: git add ${filesToUpdate.map((f) => f.file).join(' ')}`);
    console.log(`  [DRY-RUN] Executaria: git commit -m "${commitMsg}"`);
    console.log(`  [DRY-RUN] Executaria: git tag ${tagName}`);
  } else {
    run(`git add ${filesToUpdate.map((f) => `"${f.file}"`).join(' ')}`);
    run(`git commit -m "${commitMsg}"`);
    run(`git tag "${tagName}"`);
    logSuccess(`Commit criado: "${commitMsg}"`);
    logSuccess(`Tag criada: "${tagName}"`);
  }

  // 6. Push para o origin
  logStep(6, 6, 'Publicando no GitHub (Git Push)');
  if (noPush || isDryRun) {
    if (noPush) {
      logWarn('Push ignorado conforme solicitado (--no-push).');
      console.log(`Para publicar manualmente, execute:\n  git push origin ${currentBranch} && git push origin ${tagName}`);
    } else {
      console.log(`  [DRY-RUN] Executaria: git push origin ${currentBranch} && git push origin ${tagName}`);
    }
  } else {
    console.log(`Enviando branch "${currentBranch}" e tag "${tagName}" para o origin...`);
    run(`git push origin ${currentBranch}`);
    run(`git push origin ${tagName}`);
    logSuccess('Push de branch e tag concluído com sucesso!');
  }

  console.log(`\n${c.bright}${c.green}🎉 Release v${nextVersion} finalizada com sucesso!${c.reset}`);
  if (!noPush && !isDryRun) {
    console.log(`${c.cyan}O workflow "Release Desktop App" do GitHub Actions foi iniciado automaticamente para compilar os instaladores.${c.reset}\n`);
  }
}

main().catch((err) => {
  logError(err.message || String(err));
  process.exit(1);
});
