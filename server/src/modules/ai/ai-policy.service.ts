import fs from "node:fs";
import path from "node:path";
import { resolveRepoDir } from "../../config/constants.js";
import { extractFrontmatterMeta } from "../workspace/docs-metadata-parser.js";
import { docsMetadataCrudService } from "../workspace/docs-metadata-crud.service.js";

export type AiPolicyMode = "allow_external" | "local_only" | "deny";

export interface AiProjectPolicy {
  default: AiPolicyMode;
  by_classification?: Record<string, AiPolicyMode>;
  by_department?: Record<string, AiPolicyMode>;
}

const DEFAULT_AI_POLICY: AiProjectPolicy = {
  default: "allow_external",
  by_classification: {
    confidential: "deny",
    restricted: "local_only",
    internal: "allow_external",
    public: "allow_external",
  },
  by_department: {},
};

/**
 * Lê dinamicamente as políticas de IA do .project.config.json do repositório
 */
export function getProjectAiPolicy(projectRootOrName?: string): AiProjectPolicy {
  let projectDir = projectRootOrName || "";
  if (!projectDir || !path.isAbsolute(projectDir)) {
    try {
      projectDir = resolveRepoDir(projectRootOrName || "local");
    } catch {
      return DEFAULT_AI_POLICY;
    }
  }

  const configPath = path.join(projectDir, ".project.config.json");
  if (!fs.existsSync(configPath)) {
    return DEFAULT_AI_POLICY;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.ai_policy) {
      return {
        default: parsed.ai_policy.default || DEFAULT_AI_POLICY.default,
        by_classification: {
          ...DEFAULT_AI_POLICY.by_classification,
          ...(parsed.ai_policy.by_classification || {}),
        },
        by_department: {
          ...(parsed.ai_policy.by_department || {}),
        },
      };
    }
  } catch (err) {
    console.warn("[AiPolicy] Falha ao ler .project.config.json:", err);
  }

  return DEFAULT_AI_POLICY;
}

export interface CheckAiPolicyOptions {
  projectRoot?: string;
  repoName?: string;
  filePath?: string;
  classification?: string;
  department?: string;
  provider: string;
}

export interface AiPolicyCheckResult {
  allowed: boolean;
  reason?: string;
  policy: AiPolicyMode;
}

const LOCAL_PROVIDERS = new Set(["ollama", "local", "local_ai", "onprem"]);

/**
 * Valida se um envio de prompt/documento para um provedor de IA respeita as regras de LGPD e segurança
 */
export function checkAiPolicy(options: CheckAiPolicyOptions): AiPolicyCheckResult {
  const root = options.projectRoot || (options.repoName ? resolveRepoDir(options.repoName) : undefined);
  const policyConfig = getProjectAiPolicy(root);

  let classification = options.classification;
  let department = options.department;

  // Se filePath foi passado e faltam metadados, consulta frontmatter do documento, índice em cache ou legado
  if (root && options.filePath && (!classification || !department)) {
    const cleanRel = options.filePath.replace(/^\/+/, "");
    const absDocPath = path.resolve(root, cleanRel);
    if (
      absDocPath.startsWith(path.resolve(root) + path.sep) &&
      fs.existsSync(absDocPath) &&
      (cleanRel.endsWith(".md") || cleanRel.endsWith(".markdown"))
    ) {
      try {
        const fd = fs.openSync(absDocPath, "r");
        try {
          const buf = Buffer.alloc(8192);
          const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
          const head = buf.subarray(0, bytesRead).toString("utf-8");
          const fm = extractFrontmatterMeta(head);
          if (!classification && typeof fm.classification === "string") {
            classification = fm.classification;
          }
          if (!classification && typeof fm.badge === "string") {
            classification = fm.badge;
          }
          if (!department && typeof fm.department === "string") {
            department = fm.department;
          }
        } finally {
          fs.closeSync(fd);
        }
      } catch {}
    }

    if ((!classification || !department) && options.repoName) {
      try {
        const list = docsMetadataCrudService.loadDocsMetadata(options.repoName);
        const item = list.find(
          (d) =>
            d.path === cleanRel ||
            d.name === path.basename(cleanRel, path.extname(cleanRel)),
        );
        if (item) {
          if (!classification && typeof item.classification === "string") {
            classification = item.classification;
          }
          if (!classification && typeof item.badge === "string") {
            classification = item.badge;
          }
          if (!department && typeof item.department === "string") {
            department = item.department;
          }
        }
      } catch {}
    }

    if (!classification || !department) {
      try {
        const legacyMetaPath = path.join(root, ".docs.metadata.json");
        if (fs.existsSync(legacyMetaPath)) {
          const rawMeta = fs.readFileSync(legacyMetaPath, "utf-8");
          const parsed = JSON.parse(rawMeta);
          const list = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.items)
              ? parsed.items
              : null;
          if (Array.isArray(list)) {
            const item = list.find(
              (d: Record<string, unknown>) =>
                d.path === options.filePath ||
                d.name === path.basename(options.filePath || ""),
            );
            if (item) {
              if (!classification && typeof item.classification === "string") {
                classification = item.classification;
              }
              if (!classification && typeof item.badge === "string") {
                classification = item.badge;
              }
              if (!department && typeof item.department === "string") {
                department = item.department;
              }
            }
          }
        }
      } catch {}
    }
  }

  let effectivePolicy: AiPolicyMode = policyConfig.default;

  // 1. Prioridade para classificação do documento
  if (classification) {
    const classKey = classification.toLowerCase().trim();
    if (policyConfig.by_classification && policyConfig.by_classification[classKey]) {
      effectivePolicy = policyConfig.by_classification[classKey];
    } else if (classKey === "confidential" || classKey === "confidencial") {
      effectivePolicy = "deny";
    } else if (classKey === "restricted" || classKey === "restrito") {
      effectivePolicy = "local_only";
    }
  }

  // 2. Departamento
  if (department && policyConfig.by_department) {
    const deptKey = department.toLowerCase().trim();
    if (policyConfig.by_department[deptKey]) {
      const deptPolicy = policyConfig.by_department[deptKey];
      // Se departamento restringe mais que a classificação, departamento vence
      if (deptPolicy === "deny" || (deptPolicy === "local_only" && effectivePolicy === "allow_external")) {
        effectivePolicy = deptPolicy;
      }
    }
  }

  const isLocalProvider = LOCAL_PROVIDERS.has((options.provider || "").toLowerCase().trim());

  if (effectivePolicy === "deny") {
    return {
      allowed: false,
      policy: "deny",
      reason: `Política de Privacidade LGPD: O documento com classificação '${options.classification || "restrita"}' está bloqueado para processamento por inteligência artificial.`,
    };
  }

  if (effectivePolicy === "local_only" && !isLocalProvider) {
    return {
      allowed: false,
      policy: "local_only",
      reason: `Política de Privacidade LGPD: O documento classificado como '${options.classification || "restrito"}' só pode ser processado localmente (Ollama/On-Premise) e não pode ser enviado para provedores externos de nuvem (${options.provider}).`,
    };
  }

  return {
    allowed: true,
    policy: effectivePolicy,
  };
}
