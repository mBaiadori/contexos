import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeGit } from '../../utils/git.js';
import { CONFIG_PATH } from '../../config/constants.js';
import { ensureMainBranchInitialized } from './repos-lifecycle.service.js';

describe('ensureMainBranchInitialized', () => {
  let tmpDir: string;

  beforeEach(() => {
    if (!CONFIG_PATH.startsWith(os.tmpdir())) {
      throw new Error(
        `ABORT: CONFIG_PATH ("${CONFIG_PATH}") está fora de os.tmpdir(). Os testes devem rodar em ambiente isolado via scripts/run-tests.mjs.`,
      );
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-main-branch-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('cria repositório local do zero já com commit inicial na branch main', async () => {
    const repoDir = path.join(tmpDir, 'novo-repo');
    await ensureMainBranchInitialized({
      repoDir,
      repoName: 'novo-repo',
      description: 'Teste de criação',
    });

    const headRef = await executeGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    assert.strictEqual(headRef.success, true);
    assert.strictEqual(headRef.stdout, 'main');

    const mainCommit = await executeGit(['rev-parse', '--verify', 'refs/heads/main'], repoDir);
    assert.strictEqual(mainCommit.success, true);
    assert.ok(fs.existsSync(path.join(repoDir, 'README.md')));
  });

  test('recupera repositório com .git já existente porém sem nenhum commit (unborn main)', async () => {
    const repoDir = path.join(tmpDir, 'empty-git-repo');
    fs.mkdirSync(repoDir, { recursive: true });
    await executeGit(['init', '-b', 'main'], repoDir);

    await ensureMainBranchInitialized({
      repoDir,
      repoName: 'empty-git-repo',
    });

    const mainCommit = await executeGit(['rev-parse', '--verify', 'refs/heads/main'], repoDir);
    assert.strictEqual(mainCommit.success, true);
  });

  test('converte branch inicial master para main quando repositório veio com outra branch padrão', async () => {
    const repoDir = path.join(tmpDir, 'master-repo');
    fs.mkdirSync(repoDir, { recursive: true });
    await executeGit(['init', '-b', 'master'], repoDir);
    await executeGit(['config', 'user.name', 'Tester'], repoDir);
    await executeGit(['config', 'user.email', 'test@example.com'], repoDir);
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Master');
    await executeGit(['add', 'README.md'], repoDir);
    await executeGit(['commit', '-m', 'initial'], repoDir);

    await ensureMainBranchInitialized({
      repoDir,
      repoName: 'master-repo',
    });

    const headRef = await executeGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    assert.strictEqual(headRef.stdout, 'main');

    const mainCommit = await executeGit(['rev-parse', '--verify', 'refs/heads/main'], repoDir);
    assert.strictEqual(mainCommit.success, true);
  });

  test('faz commit e push para origin/main quando o repositório remoto foi clonado vazio', async () => {
    const bareDir = path.join(tmpDir, 'remote.git');
    const localDir = path.join(tmpDir, 'cloned-empty');
    fs.mkdirSync(bareDir, { recursive: true });
    await executeGit(['init', '--bare', '-b', 'main'], bareDir);
    await executeGit(['clone', bareDir, localDir], tmpDir);

    await ensureMainBranchInitialized({
      repoDir: localDir,
      repoName: 'cloned-empty',
      token: 'test-token',
      pushToOrigin: true,
    });

    const remoteMain = await executeGit(['rev-parse', '--verify', 'refs/heads/main'], bareDir);
    assert.strictEqual(remoteMain.success, true);
  });
});
