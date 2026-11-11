import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { prsService } from './prs.service.js';
import { resolveRepoDir } from '../../config/constants.js';
import { executeGit } from '../../utils/git.js';

describe('PRsService - Isolamento de PRs por Repositório', () => {
  const TEST_REPO_A = 'test-repo-alpha';
  const TEST_REPO_B = 'test-repo-beta';

  const repoADir = resolveRepoDir(TEST_REPO_A);
  const repoBDir = resolveRepoDir(TEST_REPO_B);

  after(() => {
    try {
      if (fs.existsSync(repoADir)) fs.rmSync(repoADir, { recursive: true, force: true });
      if (fs.existsSync(repoBDir)) fs.rmSync(repoBDir, { recursive: true, force: true });
    } catch {}
  });

  it('Deve salvar e carregar PRs isoladamente na pasta de cada projeto (.spec-memory/prs.json)', () => {
    const prA = [{ id: 1, title: 'PR Alpha', repo_name: TEST_REPO_A, status: 'OPEN' }];
    const prB = [{ id: 10, title: 'PR Beta', repo_name: TEST_REPO_B, status: 'OPEN' }];

    prsService.saveRepoPRs(TEST_REPO_A, prA);
    prsService.saveRepoPRs(TEST_REPO_B, prB);

    // 1. Carrega Repo A
    const loadedA = prsService.loadRepoPRs(TEST_REPO_A);
    assert.strictEqual(loadedA.length, 1);
    assert.strictEqual(loadedA[0].title, 'PR Alpha');

    // 2. Carrega Repo B
    const loadedB = prsService.loadRepoPRs(TEST_REPO_B);
    assert.strictEqual(loadedB.length, 1);
    assert.strictEqual(loadedB[0].title, 'PR Beta');

    // 3. Verifica se os arquivos físicos foram criados nos caminhos corretos
    const fileAPath = path.join(repoADir, '.spec-memory', 'prs.json');
    const fileBPath = path.join(repoBDir, '.spec-memory', 'prs.json');

    assert.strictEqual(fs.existsSync(fileAPath), true);
    assert.strictEqual(fs.existsSync(fileBPath), true);
  });

  it('Deve purgar automaticamente propostas contaminadas de outros repositórios ao carregar', () => {
    // Simula contaminação: PR apontando para github.com/.../test-repo-alpha gravado indevidamente no repo-beta
    const contaminatedPRs = [
      { id: 99, title: 'PR Legítimo Beta', repo_name: TEST_REPO_B, status: 'OPEN' },
      { id: 100, title: 'PR Vazado de Alpha', repo_name: TEST_REPO_A, html_url: `https://github.com/enursy/${TEST_REPO_A}/pull/100`, status: 'OPEN' }
    ];
    prsService.saveRepoPRs(TEST_REPO_B, contaminatedPRs);

    const loaded = prsService.loadRepoPRs(TEST_REPO_B);
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].id, 99);
    assert.strictEqual(loaded[0].title, 'PR Legítimo Beta');
  });

  it('Deve encontrar propostas pelo findPRAcrossRepos mesmo se o repositório passado estiver incorreto', () => {
    const prA = [{ id: 1234, title: 'PR Exclusivo de Alpha', repo_name: TEST_REPO_A, status: 'OPEN' }];
    prsService.saveRepoPRs(TEST_REPO_A, prA);

    // Consulta passando repo_name errado ('test-repo-beta')
    const found = prsService.findPRAcrossRepos(1234, TEST_REPO_B);
    assert.notStrictEqual(found, null);
    assert.strictEqual(found?.repoName, TEST_REPO_A);
    assert.strictEqual(found?.pr.title, 'PR Exclusivo de Alpha');
  });

  it('getPRs("all") deve agregar propostas de múltiplos repositórios com contagens precisas', async () => {
    const prA = [{ id: 101, title: 'PR 101 Alpha', repo_name: TEST_REPO_A, status: 'OPEN', created_at: new Date().toISOString() }];
    const prB = [{ id: 202, title: 'PR 202 Beta', repo_name: TEST_REPO_B, status: 'OPEN', created_at: new Date().toISOString() }];
    prsService.saveRepoPRs(TEST_REPO_A, prA);
    prsService.saveRepoPRs(TEST_REPO_B, prB);

    const res = await prsService.getPRs('all');
    assert.strictEqual(res.repo_name, 'all');
    assert.strictEqual(typeof res.repoOpenCounts, 'object');
    assert.ok(res.prs.some((p: any) => p.id === 101 && p.repo_name === TEST_REPO_A));
    assert.ok(res.prs.some((p: any) => p.id === 202 && p.repo_name === TEST_REPO_B));
  });
});

describe('PRsService - Geração Inteligente de Resumos (IA e Diff)', () => {
  const TEST_REPO = 'test-repo-summary';
  const repoDir = resolveRepoDir(TEST_REPO);

  before(() => {
    try {
      if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
      fs.mkdirSync(repoDir, { recursive: true });
    } catch {}
  });

  after(() => {
    try {
      if (fs.existsSync(repoDir)) fs.rmSync(repoDir, { recursive: true, force: true });
    } catch {}
  });

  it('Deve retornar mensagem padrão quando não houver alterações pendentes', async () => {
    const summary = await prsService.generatePRSummary(TEST_REPO);
    assert.strictEqual(summary.success, true);
    assert.strictEqual(summary.is_ai_generated, false);
    assert.match(summary.description, /Nenhuma alteração pendente detectada/);
  });

  it('Deve gerar resumo estruturado por Diff quando IA não estiver configurada', async () => {
    // Inicializar repositório Git
    await executeGit(['init'], repoDir);
    await executeGit(['config', 'user.name', 'Test'], repoDir);
    await executeGit(['config', 'user.email', 'test@test.com'], repoDir);

    // Criar arquivo de teste no repo
    const docPath = path.join(repoDir, 'auth.md');
    fs.writeFileSync(docPath, '---\ntitle: "Autenticação OAuth"\nstatus: DRAFT\n---\n# Autenticação OAuth\n\n## Fluxo Inicial\nEspecificações...', 'utf-8');

    const summary = await prsService.generatePRSummary(TEST_REPO);
    assert.strictEqual(summary.success, true);
    assert.strictEqual(summary.is_ai_generated, false);
    // Título deve ser humano e semântico em linguagem natural (sem prefixos técnicos como feat:/docs:)
    assert.match(summary.title, /^(?:Inclusão|Atualização|Edição|Remoção|Alterações)/);
    assert.doesNotMatch(summary.title, /^(?:feat|docs|refactor|fix|chore):/);
    // Descrição deve conter nota explicativa de fallback e análise estrutural
    assert.match(summary.description, /Resumo gerado via análise estruturada de alterações/);
    assert.match(summary.description, /auth\.md/);
  });
});
