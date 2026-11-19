import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { executeGit, isGitRepo } from '../../utils/git.js';
import { getDefaultBranch } from '../../utils/git.js';
import { gitService } from '../git/git.service.js';
import { CONFIG_PATH } from '../../config/constants.js';

describe('C3: default_branch preservation and origin/HEAD resolution', () => {
  let tmpDir: string;

  beforeEach(async () => {
    if (!CONFIG_PATH.startsWith(os.tmpdir())) {
      throw new Error(`ABORT: CONFIG_PATH ("${CONFIG_PATH}") está fora de os.tmpdir(). Os testes devem rodar em ambiente isolado via scripts/run-tests.mjs.`);
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-defbranch-test-'));
    await executeGit(['init', '-b', 'main'], tmpDir);
    await executeGit(['config', 'user.name', 'Tester'], tmpDir);
    await executeGit(['config', 'user.email', 'test@example.com'], tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test');
    await executeGit(['add', 'README.md'], tmpDir);
    await executeGit(['commit', '-m', 'initial commit'], tmpDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('getDefaultBranch deve detectar branch padrão main em repositório local', async () => {
    const defBranch = await getDefaultBranch(tmpDir);
    assert.strictEqual(defBranch, 'main');
  });

  test('Criar ou alternar para branch de feature NÃO deve sobrescrever default_branch', async () => {
    // Cria branch de feature
    await executeGit(['checkout', '-b', 'gov/feature-nova'], tmpDir);

    // getDefaultBranch ainda deve retornar main (baseada em main/master), não a branch de feature atual
    const defBranch = await getDefaultBranch(tmpDir);
    assert.strictEqual(defBranch, 'main');
  });

  test('Repositório sem branch main/master com apenas branches temporárias não deve eleger prefixo gov/ ou fix/', async () => {
    const specialTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-defbranch-gov-'));
    try {
      await executeGit(['init', '-b', 'gov/update-1'], specialTmpDir);
      await executeGit(['config', 'user.name', 'Tester'], specialTmpDir);
      await executeGit(['config', 'user.email', 'test@example.com'], specialTmpDir);
      fs.writeFileSync(path.join(specialTmpDir, 'README.md'), '# Test');
      await executeGit(['add', 'README.md'], specialTmpDir);
      await executeGit(['commit', '-m', 'initial commit'], specialTmpDir);
      await executeGit(['branch', 'feat/login'], specialTmpDir);

      const defBranch = await getDefaultBranch(specialTmpDir);
      // Deve cair para 'main' e não eleger 'feat/login' ou 'gov/update-1'
      assert.strictEqual(defBranch, 'main');
    } finally {
      fs.rmSync(specialTmpDir, { recursive: true, force: true });
    }
  });

  test('getDefaultBranch deve preservar prefixo com barra quando origin/HEAD aponta para gov/update-2675', async () => {
    await executeGit(['branch', 'gov/update-2675'], tmpDir);
    await executeGit(['update-ref', 'refs/remotes/origin/gov/update-2675', 'HEAD'], tmpDir);
    await executeGit(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/gov/update-2675'], tmpDir);

    const defBranch = await getDefaultBranch(tmpDir);
    assert.strictEqual(defBranch, 'gov/update-2675');
  });
});
