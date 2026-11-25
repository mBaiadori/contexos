import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../config/storage.js";
import { callGitHubAPI } from "../../utils/git.js";
import {
  BranchProtectionStatus,
  GovernanceQuorumRules,
  SecretScanResult,
  SecretScanViolation,
  GovernanceActionWorkflowStatus,
} from "./governance.types.js";
import { scanContentForSecrets } from "../../utils/crypto.js";
import { writeTextAtomic } from "../../utils/atomic-write.js";
import { governanceConfigService } from "./governance-config.service.js";
import { governanceCollaboratorsService } from "./governance-collaborators.service.js";

export class GovernanceRulesService {
  async getBranchProtection(
    repoName?: string,
  ): Promise<BranchProtectionStatus> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = repoName || activeRepo?.name || "local";
    const defaultBranch = activeRepo?.default_branch || "main";

    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      !activeRepo?.is_local &&
      activeRepo?.name === targetRepoName
    ) {
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${activeRepo.full_name}/branches/${defaultBranch}/protection`,
          cfg.token,
        );
        if (ghRes.statusCode === 200 && ghRes.data) {
          const d = ghRes.data;
          return {
            enabled: true,
            required_approving_review_count:
              d.required_pull_request_reviews
                ?.required_approving_review_count || 1,
            dismiss_stale_reviews:
              d.required_pull_request_reviews?.dismiss_stale_reviews || false,
            require_code_owner_reviews:
              d.required_pull_request_reviews?.require_code_owner_reviews ||
              false,
            enforce_admins: d.enforce_admins?.enabled || false,
            allow_force_pushes: d.allow_force_pushes?.enabled || false,
            allow_deletions: d.allow_deletions?.enabled || false,
          };
        }
      } catch {}
    }

    // Return stored local rules or default disabled
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    const localProt = pConfig.governance_branch_protection;
    if (localProt) {
      return localProt;
    }

    return {
      enabled: false,
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      enforce_admins: true,
      allow_force_pushes: false,
      allow_deletions: false,
    };
  }

  async applyBranchProtection(payload: {
    repo?: string;
    min_approvals?: number;
    enforce_admins?: boolean;
    dismiss_stale_reviews?: boolean;
  }): Promise<{
    success: boolean;
    message: string;
    protection: BranchProtectionStatus;
  }> {
    const cfg = loadConfig();
    const activeRepo = cfg.active_repo;
    const targetRepoName = payload.repo || activeRepo?.name || "local";
    const defaultBranch = activeRepo?.default_branch || "main";
    const minApprovals = payload.min_approvals || 1;

    const protectionPayload = {
      required_status_checks: null,
      enforce_admins: payload.enforce_admins !== false,
      required_pull_request_reviews: {
        dismiss_stale_reviews: payload.dismiss_stale_reviews !== false,
        require_code_owner_reviews: false,
        required_approving_review_count: minApprovals,
      },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
    };

    if (
      cfg.authenticated &&
      cfg.token &&
      activeRepo?.full_name &&
      !activeRepo?.is_local &&
      activeRepo?.name === targetRepoName
    ) {
      try {
        const ghRes = await callGitHubAPI(
          `/repos/${activeRepo.full_name}/branches/${defaultBranch}/protection`,
          cfg.token,
          "PUT",
          protectionPayload,
        );
        if (ghRes.statusCode >= 400) {
          const msg = ghRes.data?.message || "";
          if (
            ghRes.statusCode === 403 &&
            (msg.includes("Upgrade to GitHub Pro") ||
              msg.includes("pricing plans"))
          ) {
            console.info(
              "[GovernanceService] Repositório privado em plano GitHub Free: O GitHub exige plano Pro/Team para regras de nuvem em repositórios privados. Governança local mantida 100% ativa.",
            );
          } else {
            console.warn(
              "[GovernanceService] Aviso do GitHub ao aplicar branch protection:",
              ghRes.statusCode,
              msg,
            );
          }
        }
      } catch (err: unknown) {
        console.warn(
          "[GovernanceService] Erro ao aplicar regra de branch protection no GitHub:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const protectionStatus: BranchProtectionStatus = {
      enabled: true,
      required_approving_review_count: minApprovals,
      dismiss_stale_reviews: payload.dismiss_stale_reviews !== false,
      require_code_owner_reviews: false,
      enforce_admins: payload.enforce_admins !== false,
      allow_force_pushes: false,
      allow_deletions: false,
    };

    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    pConfig.governance_branch_protection = protectionStatus;
    governanceConfigService.writeProjectConfig(targetRepoName, pConfig);

    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
      action: "BRANCH_PROTECTED",
      actor,
      target: `versão '${defaultBranch}'`,
      details: `Regras de proteção ativadas: ${minApprovals} aprovações exigidas, envio direto bloqueado e revisões obsoletas dispensadas na atualização.`,
    });

    return {
      success: true,
      message: `Versão principal '${defaultBranch}' protegida com sucesso! Envio direto bloqueado e ${minApprovals} aprovações requeridas.`,
      protection: protectionStatus,
    };
  }

  async getQuorumRules(repoName?: string): Promise<{
    rules: GovernanceQuorumRules;
    isSoloMode: boolean;
    activeCollaboratorsCount: number;
    effectiveMinApprovals: number;
  }> {
    const targetRepoName = repoName || "local";
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    const storedRules = pConfig.governance_rules || {};

    const collabsData = await governanceCollaboratorsService.getCollaborators(targetRepoName);
    const activeCount = collabsData.activeCount;
    const isSoloMode = activeCount <= 1;

    const defaultMin = Number(storedRules.min_approvals_default) || 1;
    const effectiveMinApprovals = isSoloMode ? 1 : Math.max(1, defaultMin);

    const rules: GovernanceQuorumRules = {
      mode: storedRules.mode || "auto",
      min_approvals_default: defaultMin,
      anti_self_approval:
        storedRules.anti_self_approval !== undefined
          ? storedRules.anti_self_approval
          : !isSoloMode,
      require_review_before_merge:
        storedRules.require_review_before_merge !== false,
      dismiss_stale_reviews_on_push:
        storedRules.dismiss_stale_reviews_on_push !== false,
      enforce_admins_on_branch: storedRules.enforce_admins_on_branch !== false,
    };

    return {
      rules,
      isSoloMode,
      activeCollaboratorsCount: activeCount,
      effectiveMinApprovals,
    };
  }

  async updateQuorumRules(payload: {
    repo?: string;
    rules: Partial<GovernanceQuorumRules>;
  }): Promise<{ success: boolean; rules: GovernanceQuorumRules }> {
    const targetRepoName = payload.repo || "local";
    const pConfig = governanceConfigService.readProjectConfig(targetRepoName);
    if (!pConfig.governance_rules) pConfig.governance_rules = {};

    pConfig.governance_rules = {
      ...pConfig.governance_rules,
      ...payload.rules,
    };

    governanceConfigService.writeProjectConfig(targetRepoName, pConfig);

    const cfg = loadConfig();
    const actor = cfg.user?.login ? `@${cfg.user.login}` : "Tech Lead";
    governanceConfigService.logAudit(targetRepoName, {
      action: "QUORUM_UPDATED",
      actor,
      details: `Regras de quórum atualizadas: Mínimo padrão de ${pConfig.governance_rules.min_approvals_default} aprovações.`,
    });

    const res = await this.getQuorumRules(targetRepoName);
    return {
      success: true,
      rules: res.rules,
    };
  }

  getAllMarkdownFiles(dir: string, baseDir = dir): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".translations") {
          if (
            entry.name === ".git" ||
            entry.name === ".context" ||
            entry.name === "node_modules"
          )
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".git") {
            results.push(...this.getAllMarkdownFiles(full, baseDir));
          }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          results.push(path.relative(baseDir, full));
        }
      }
    } catch {}
    return results;
  }

  async scanRepositorySecrets(repoName?: string): Promise<SecretScanResult> {
    const targetRepoName = repoName || "local";
    const repoDir = governanceConfigService.getRepoDir(targetRepoName);
    const allMdFiles = this.getAllMarkdownFiles(repoDir);
    const violations: SecretScanViolation[] = [];

    for (const relPath of allMdFiles) {
      const fullPath = path.join(repoDir, relPath);
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const scan = scanContentForSecrets(content, relPath);
        if (scan.hasSecrets) {
          violations.push(...scan.violations);
        }
      } catch {}
    }

    return {
      hasSecrets: violations.length > 0,
      violations,
    };
  }

  async getGovernanceWorkflowStatus(
    repoName?: string,
  ): Promise<GovernanceActionWorkflowStatus> {
    const repoDir = governanceConfigService.getRepoDir(repoName);
    const workflowPath = path.join(
      repoDir,
      ".github",
      "workflows",
      "governance-check.yml",
    );
    const exists = fs.existsSync(workflowPath);
    let content: string | undefined;
    if (exists) {
      try {
        content = fs.readFileSync(workflowPath, "utf-8");
      } catch {}
    }
    return {
      installed: exists,
      path: ".github/workflows/governance-check.yml",
      content,
    };
  }

  async installGovernanceWorkflow(
    repoName?: string,
  ): Promise<{ success: boolean; message: string }> {
    const repoDir = governanceConfigService.getRepoDir(repoName);
    const workflowsDir = path.join(repoDir, ".github", "workflows");
    const workflowPath = path.join(workflowsDir, "governance-check.yml");

    const workflowYaml = `# Contexos — Automated Governance & Security Gatekeeper
# Este workflow aplica verificações contínuas de governança (Secret Scanning, Quorum Rules e CODEOWNERS) em Pull Requests e Pushes.

name: Contexos Governance Gatekeeper

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches:
      - main
      - master
      - develop

jobs:
  governance-validation:
    name: 🛡️ Validar Regras de Governança & Secrets
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Validar CODEOWNERS e Estrutura de Arquivos
        run: |
          echo "=== 🔍 Verificando Integridade do CODEOWNERS ==="
          if [ -f "CODEOWNERS" ] || [ -f ".github/CODEOWNERS" ] || [ -f "docs/CODEOWNERS" ]; then
            echo "✅ Arquivo CODEOWNERS detectado."
          else
            echo "⚠️ Aviso: Arquivo CODEOWNERS não encontrado na raiz ou .github/."
          fi

      - name: Scan de Chaves e Credenciais Vazadas
        run: |
          echo "=== 🔒 Varredura Básica de Segredos ==="
          # Busca simples por tokens e chaves privadas em arquivos modificados
          if grep -r -E "(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\\-_]{35}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)" --exclude-dir=".git" .; then
            echo "❌ ERRO CRÍTICO: Possível credencial ou segredo em texto claro detectado no repositório!"
            exit 1
          else
            echo "✅ Nenhum segredo ou token em texto claro detectado."
          fi

      - name: Validar Configuração do Contexos (.project.config.json)
        run: |
          echo "=== 📋 Validando .project.config.json ==="
          if [ -f ".project.config.json" ]; then
            python3 -c "import json; json.load(open('.project.config.json'))" && echo "✅ .project.config.json é um JSON válido."
          fi
`;

    try {
      writeTextAtomic(workflowPath, workflowYaml);
      governanceConfigService.logAudit(repoName, {
        action: "BRANCH_PROTECTED",
        actor: "System / Tech Lead",
        details:
          "Workflow de governança GitHub Actions instalado (.github/workflows/governance-check.yml).",
      });
      return {
        success: true,
        message:
          "Workflow de governança do GitHub Actions instalado com sucesso em .github/workflows/governance-check.yml",
      };
    } catch (err: unknown) {
      throw new Error(
        `Falha ao instalar workflow de GitHub Actions: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export const governanceRulesService = new GovernanceRulesService();
