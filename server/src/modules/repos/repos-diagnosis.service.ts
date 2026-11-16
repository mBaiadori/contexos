import fs from "node:fs";
import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { loadConfig } from "../../config/storage.js";
import { checkBranchProtection } from "../../utils/git.js";
import { docsMetadataService } from "../workspace/docs-metadata.service.js";
import type { RepoDiagnosis } from "./repos-types.js";

export class ReposDiagnosisService {
  async diagnoseRepo(
    repoName: string,
    ownerOrOrg?: string,
    checkRemote: boolean = false,
  ): Promise<RepoDiagnosis> {
    if (!repoName) {
      throw new Error("Nome do repositório é obrigatório para diagnóstico");
    }

    const cfg = loadConfig();
    const repoDir = resolveRepoDir(repoName, ownerOrOrg || cfg.active_repo?.owner);
    const isClonedLocally =
      fs.existsSync(repoDir) &&
      (fs.existsSync(path.join(repoDir, ".git")) ||
        fs.existsSync(path.join(repoDir, ".project.config.json")));
    const isLocal =
      cfg.active_repo?.name === repoName
        ? Boolean(cfg.active_repo?.is_local)
        : !cfg.token;
    const fullName =
      cfg.active_repo?.name === repoName
        ? cfg.active_repo?.full_name || repoName
        : repoName;
    const isOwner =
      cfg.active_repo?.name === repoName
        ? Boolean(cfg.active_repo?.is_owner)
        : true;
    const canAdmin =
      isLocal || Boolean(cfg.active_repo?.permissions?.admin) || isOwner;

    // 1. Check .project.config.json
    const pConfigPath = path.join(repoDir, ".project.config.json");
    let hasPConfig = fs.existsSync(pConfigPath);
    let validPConfig = false;
    let pConfigDetails = "Não encontrado";
    if (hasPConfig) {
      try {
        const parsed = docsMetadataService.getProjectConfig(repoName);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray(parsed.categories)
        ) {
          validPConfig = true;
          const tagsCount = Array.isArray(parsed.tags) ? parsed.tags.length : 0;
          pConfigDetails = `${parsed.categories.length} categorias, ${tagsCount} tags configuradas`;
        } else {
          pConfigDetails = "Arquivo corrompido ou formato inválido";
        }
      } catch {
        pConfigDetails = "JSON inválido";
      }
    }

    // 2. Check .docs.metadata.json (Catálogo de governança com auto-geração em cache local)
    const pMetaPath = path.join(repoDir, ".docs.metadata.json");
    let hasPMeta = fs.existsSync(pMetaPath);
    let validPMeta = false;
    let pMetaDetails = "Não encontrado";
    if (hasPMeta) {
      try {
        const metaList = docsMetadataService.loadDocsMetadata(repoName);
        validPMeta = true;
        pMetaDetails = `${metaList.length} documento(s) catalogado(s)`;
      } catch {
        pMetaDetails = "JSON inválido";
      }
    } else if (fs.existsSync(repoDir)) {
      // Auto-reconcilia no background se ainda não existir localmente
      docsMetadataService.scheduleBackgroundReconciliation(repoName);
      hasPMeta = true;
      validPMeta = true;
      pMetaDetails = "Catálogo gerado localmente em segundo plano";
    }

    // 3. Check .hidden_files.json
    const pHiddenPath = path.join(repoDir, ".hidden_files.json");
    const hasHidden = fs.existsSync(pHiddenPath);

    // 4. Check .github/CODEOWNERS
    const pCodeownersPath = path.join(repoDir, ".github", "CODEOWNERS");
    const hasCodeowners = fs.existsSync(pCodeownersPath);

    // 5. Check .dictionary.json
    const pDictPath = path.join(repoDir, ".dictionary.json");
    const hasDict = fs.existsSync(pDictPath);

    // 6. Check .templates.json
    const pTemplatesPath = path.join(repoDir, ".templates.json");
    const hasTemplates = fs.existsSync(pTemplatesPath);

    // 7. Check .spec-memory/
    const pSpecMemoryPath = path.join(repoDir, ".spec-memory");
    const hasSpecMemory =
      fs.existsSync(pSpecMemoryPath) &&
      fs.statSync(pSpecMemoryPath).isDirectory();

    // 8. Check Branch Protection (only if checkRemote is explicitly requested)
    let branchProtectionSupported = !isLocal && Boolean(cfg.token) && canAdmin;
    let branchProtectionActive = false;
    let branchProtectionDetails = isLocal
      ? "Não aplicável (modo local)"
      : "Não verificada";

    if (
      checkRemote &&
      branchProtectionSupported &&
      cfg.token &&
      fullName.includes("/")
    ) {
      const defaultBranch = cfg.active_repo?.default_branch || "main";
      const protCheck = await checkBranchProtection(
        fullName,
        defaultBranch,
        cfg.token,
      );
      branchProtectionActive = protCheck.isProtected;
      branchProtectionDetails =
        protCheck.details ||
        (branchProtectionActive
          ? "Ativa no provedor"
          : "Sem proteção configurada");
    }

    const missingEssentials: string[] = [];
    if (!hasPConfig || !validPConfig)
      missingEssentials.push(".project.config.json");
    if (!hasPMeta || !validPMeta) missingEssentials.push(".docs.metadata.json");
    if (!hasHidden) missingEssentials.push(".hidden_files.json");

    const isReady = isClonedLocally && missingEssentials.length === 0;

    return {
      name: repoName,
      full_name: fullName,
      is_local: isLocal,
      is_cloned_locally: isClonedLocally,
      is_owner: isOwner,
      can_admin: canAdmin,
      checks: {
        project_config: {
          exists: hasPConfig,
          valid: validPConfig,
          path: ".project.config.json",
          label: "Configurações de Taxonomia (.project.config.json)",
          details: pConfigDetails,
        },
        docs_metadata: {
          exists: hasPMeta,
          valid: validPMeta,
          path: ".docs.metadata.json",
          label: "Catálogo de Governança (.docs.metadata.json)",
          details: pMetaDetails,
        },
        hidden_files: {
          exists: hasHidden,
          valid: hasHidden,
          path: ".hidden_files.json",
          label: "Proteção de Arquivos (.hidden_files.json)",
          details: hasHidden ? "Configurado" : "Pendente",
        },
        codeowners: {
          exists: hasCodeowners,
          valid: hasCodeowners,
          path: ".github/CODEOWNERS",
          label: "Propriedade de Código (.github/CODEOWNERS)",
          details: hasCodeowners ? "Configurado" : "Pendente",
        },
        dictionary: {
          exists: hasDict,
          valid: hasDict,
          path: ".dictionary.json",
          label: "Dicionário Ubíquo (.dictionary.json)",
          details: hasDict ? "Configurado" : "Opcional",
        },
        templates: {
          exists: hasTemplates,
          valid: hasTemplates,
          path: ".templates.json",
          label: "Modelos de Documento (.templates.json)",
          details: hasTemplates ? "Configurado" : "Opcional",
        },
        spec_memory: {
          exists: hasSpecMemory,
          valid: hasSpecMemory,
          path: ".spec-memory/",
          label: "Memória Persistente de IA (.spec-memory/)",
          details: hasSpecMemory ? "Configurada" : "Opcional",
        },
        branch_protection: {
          supported: branchProtectionSupported,
          active: branchProtectionActive,
          label: "Proteção de Branch (main)",
          details: branchProtectionDetails,
        },
      },
      is_ready: isReady,
      missing_essentials: missingEssentials,
    };
  }
}

export const reposDiagnosisService = new ReposDiagnosisService();
