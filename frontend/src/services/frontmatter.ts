import * as yaml from "js-yaml";

export interface DocumentMetadata {
  id?: string;
  title?: string;
  type?: string;
  version?: string;
  status?: string;
  layer?: string;
  path?: string;
  parent?: string;
  lifecycle?: {
    stage?: string;
    previous_stage?: string;
    next_stage?: string;
    feedback_loops?: Record<string, string>;
  };
  [key: string]: unknown;
}

export interface ParsedDocument {
  hasFrontmatter: boolean;
  metadata: DocumentMetadata;
  body: string;
}

export function createDefaultMetadata(): DocumentMetadata {
  return {
    title: "",
    status: "",
    categories: "",
    tags: [],
  };
}

export function sanitizeMetadataForFrontmatter(
  meta: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!meta || typeof meta !== "object") return {};
  const cleaned: Record<string, any> = {};

  const internalKeys = new Set([
    "ext",
    "name",
    "path",
    "links",
    "updated_at",
    "prompt",
    "feedback_loops",
    "lifecycle",
    "stage",
    "layer",
    "parent",
    "version",
    "isDraft",
    "id",
    // Synthetic/DOM Event properties that should never be saved to frontmatter
    "_reactName",
    "nativeEvent",
    "isTrusted",
    "bubbles",
    "cancelable",
    "defaultPrevented",
    "eventPhase",
    "timeStamp",
    "clientX",
    "clientY",
    "pageX",
    "pageY",
    "screenX",
    "screenY",
    "movementX",
    "movementY",
    "altKey",
    "ctrlKey",
    "metaKey",
    "shiftKey",
    "button",
    "buttons",
    "detail",
    "target",
    "currentTarget",
  ]);

  for (const [key, rawVal] of Object.entries(meta)) {
    if (internalKeys.has(key)) continue;
    // Previne que 'type' seja sobrescrito por eventos como 'click'
    if (key === "type" && typeof rawVal === "string" && ["click", "keydown", "change", "submit"].includes(rawVal)) {
      continue;
    }
    if (
      rawVal === undefined ||
      rawVal === null ||
      rawVal === "{}" ||
      (rawVal === "" && key !== "title")
    ) {
      continue;
    }

    if (key === "templateId") {
      if (typeof rawVal === "string" && rawVal.trim().length > 0) {
        cleaned.templateId = rawVal.trim();
      }
      continue;
    }

    if (key === "tags" || key === "approvers") {
      let arr: string[] = [];
      if (Array.isArray(rawVal)) {
        arr = rawVal;
      } else if (typeof rawVal === "string") {
        const trimmed = rawVal.trim();
        if (trimmed === "[]" || trimmed === "{}" || trimmed === "") {
          cleaned[key] = [];
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) arr = parsed;
          else arr = trimmed.split(",");
        } catch {
          arr = trimmed.split(",");
        }
      }
      const validItems = arr
        .map((s) => (typeof s === "string" ? s.trim() : String(s)))
        .filter((s) => s && s !== "[]" && s !== "{}" && s !== '""' && s !== "''");
      cleaned[key] = validItems;
      continue;
    }

    if (key === "category" && !cleaned.categories) {
      const trimmed = String(rawVal).trim();
      if (trimmed && trimmed !== "[]" && trimmed !== "{}") {
        cleaned.categories = trimmed;
      }
      continue;
    }

    if (typeof rawVal === "string") {
      const trimmed = rawVal.trim();
      if (trimmed && trimmed !== "[]" && trimmed !== "{}") {
        cleaned[key] = trimmed;
      }
    } else if (typeof rawVal === "number" || typeof rawVal === "boolean") {
      cleaned[key] = rawVal;
    }
  }

  // Ordem canônica determinística
  const preferredOrder = [
    "title",
    "type",
    "badge",
    "status",
    "categories",
    "tags",
    "department",
    "templateId",
    "approvers",
  ];
  const sorted: Record<string, any> = {};
  const keys = Object.keys(cleaned).sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  for (const k of keys) {
    sorted[k] = cleaned[k];
  }

  return sorted;
}

export function parseFrontmatter(rawContent = ""): ParsedDocument {
  if (!rawContent || typeof rawContent !== "string") {
    return {
      hasFrontmatter: false,
      metadata: createDefaultMetadata(),
      body: "",
    };
  }

  const match = rawContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(\r?\n[\s\S]*)?$/);
  if (!match) {
    return {
      hasFrontmatter: false,
      metadata: createDefaultMetadata(),
      body: rawContent,
    };
  }

  const yamlBlock = match[1];
  const rawBody = match[2] || "";
  const body = rawBody.startsWith("\r\n")
    ? rawBody.slice(2)
    : rawBody.startsWith("\n")
    ? rawBody.slice(1)
    : rawBody;

  try {
    const parsed = yaml.load(yamlBlock) as DocumentMetadata;
    const sanitized = sanitizeMetadataForFrontmatter(parsed || {});
    return {
      hasFrontmatter: true,
      metadata: {
        ...createDefaultMetadata(),
        ...sanitized,
      },
      body,
    };
  } catch (e) {
    console.warn("[Frontmatter] Erro ao analisar YAML:", e);
    return {
      hasFrontmatter: false,
      metadata: createDefaultMetadata(),
      body: rawContent,
    };
  }
}

export function serializeFrontmatter(
  metadata: DocumentMetadata | null | undefined,
  body = "",
): string {
  if (!metadata) return body;
  const cleanMeta = sanitizeMetadataForFrontmatter(metadata);
  if (Object.keys(cleanMeta).length === 0) {
    return body.trimStart();
  }

  try {
    const yamlString = yaml
      .dump(cleanMeta, { lineWidth: -1, forceQuotes: false })
      .trim();
    return `---\n${yamlString}\n---\n\n${body.trimStart()}`;
  } catch (e) {
    console.error("[Frontmatter] Erro ao serializar YAML:", e);
    return body;
  }
}

export function stripFrontmatter(rawContent = ""): string {
  const parsed = parseFrontmatter(rawContent);
  return parsed.body;
}
