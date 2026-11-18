import { DepartmentConfig } from "../governance/governance.types.js";

export interface DocumentMetadataItem {
  id: string;
  name: string;
  title?: string;
  ext: string;
  path: string;
  status: string;
  categories: string;
  tags: string[];
  updated_at: string;
  approvers: string[];
  links: string[];
  templateId: string;
  prompt: string;
  department?: string; // id do departamento (e.g. "engineering", "finance", "legal")
  badge?: string;
  classification?: string;
  [key: string]: unknown;
}

export interface ProjectMetadataOptions {
  categories: Array<string | { name: string; color?: string }>;
  statuses: Array<{
    key?: string;
    name?: string;
    label: string;
    badge?: string;
    color?: string;
  }>;
  tags: Array<string | { name: string; color?: string }>;
  badges?: Array<
    string | { name: string; color?: string; description?: string }
  >;
  departments?: DepartmentConfig[];
}

export function generateDocId(filePath: string): string {
  return filePath
    .replace(/\.md$/, "")
    .replace(/[\/\\]/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

export function areArraysEqual(
  a: unknown[] | undefined,
  b: unknown[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function areMetadataItemsEqual(
  a: DocumentMetadataItem,
  b: DocumentMetadataItem,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.path === b.path &&
    a.title === b.title &&
    a.name === b.name &&
    a.status === b.status &&
    a.categories === b.categories &&
    a.department === b.department &&
    a.badge === b.badge &&
    a.classification === b.classification &&
    a.templateId === b.templateId &&
    areArraysEqual(a.tags, b.tags) &&
    areArraysEqual(a.approvers, b.approvers) &&
    areArraysEqual(a.links, b.links)
  );
}

export function areMetadataListsEqual(
  a: DocumentMetadataItem[] | undefined,
  b: DocumentMetadataItem[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const mapA = new Map(a.map((item) => [item.path, item]));
  for (const itemB of b) {
    const itemA = mapA.get(itemB.path);
    if (!itemA || !areMetadataItemsEqual(itemA, itemB)) {
      return false;
    }
  }
  return true;
}

export function sanitizeMetadataForFrontmatter(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!meta || typeof meta !== "object") return {};
  const cleaned: Record<string, unknown> = {};

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
  ]);

  for (const [key, rawVal] of Object.entries(meta)) {
    if (internalKeys.has(key)) continue;
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
    "classification",
    "status",
    "categories",
    "tags",
    "department",
    "templateId",
    "approvers",
  ];
  const sorted: Record<string, unknown> = {};
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

export function extractFrontmatterMeta(content: string): {
  title?: string;
  status?: string;
  categories?: string;
  tags?: string[];
  department?: string;
  badge?: string;
  classification?: string;
  templateId?: string;
  approvers?: string[];
  [key: string]: unknown;
} {
  if (!content) return {};
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};

  const rawFm = match[1];
  const rawParsed: Record<string, unknown> = {};
  const lines = rawFm.split("\n");
  let currentListKey: string | null = null;
  let currentList: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Item de lista yaml multiline (ex: "  - tag1" ou "- tag1")
    if (currentListKey && trimmed.startsWith("-")) {
      let itemVal = trimmed.replace(/^-\s*/, "").trim();
      if (
        (itemVal.startsWith('"') && itemVal.endsWith('"')) ||
        (itemVal.startsWith("'") && itemVal.endsWith("'"))
      ) {
        itemVal = itemVal.slice(1, -1);
      }
      if (itemVal && itemVal !== "[]" && itemVal !== "{}") {
        currentList.push(itemVal);
      }
      continue;
    } else if (currentListKey) {
      if (currentList.length > 0) {
        rawParsed[currentListKey] = currentList;
      }
      currentListKey = null;
      currentList = [];
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    // Início de lista multiline (ex: "tags:" sem valor na mesma linha)
    if (!val) {
      currentListKey = key;
      currentList = [];
      continue;
    }

    // Remove aspas externas se existirem antes de checar formato
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1).trim();
    }

    // Se o valor for "[]" (array vazio legítimo)
    if (val === "[]") {
      if (key === "tags" || key === "approvers") {
        rawParsed[key] = [];
      }
      continue;
    }

    if (!val || val === "{}") {
      continue;
    }

    // Array inline (ex: ["rfc", "core"] ou [rfc, core])
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.slice(1, -1).trim();
      if (inner) {
        const items = inner
          .split(",")
          .map((s) => {
            let item = s.trim();
            if (
              (item.startsWith('"') && item.endsWith('"')) ||
              (item.startsWith("'") && item.endsWith("'"))
            ) {
              item = item.slice(1, -1);
            }
            return item;
          })
          .filter((item) => item && item !== "[]" && item !== "{}");
        rawParsed[key] = items;
      } else if (key === "tags" || key === "approvers") {
        rawParsed[key] = [];
      }
      continue;
    }

    if (val === "true") rawParsed[key] = true;
    else if (val === "false") rawParsed[key] = false;
    else rawParsed[key] = val;
  }

  if (currentListKey && currentList.length > 0) {
    rawParsed[currentListKey] = currentList;
  }

  return sanitizeMetadataForFrontmatter(rawParsed);
}

export function updateFrontmatterInMarkdown(
  content: string,
  meta: Record<string, unknown>,
): string {
  if (!content) content = "";
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  let existingMeta: Record<string, unknown> = {};
  let body = content;

  if (match) {
    existingMeta = extractFrontmatterMeta(content);
    body = content.slice(match[0].length);
  }

  const merged = { ...existingMeta, ...meta };
  const sanitized = sanitizeMetadataForFrontmatter(merged);

  if (Object.keys(sanitized).length === 0) {
    return body.replace(/^\r?\n/, "");
  }

  const lines = ["---"];
  for (const [k, v] of Object.entries(sanitized)) {
    if (typeof v === "number" || typeof v === "boolean") {
      lines.push(`${k}: ${v}`);
    } else if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((item) => `"${item}"`).join(", ")}]`);
    } else {
      lines.push(`${k}: "${v}"`);
    }
  }
  lines.push("---");
  const cleanBody = body.replace(/^\r?\n+/, "");
  return lines.join("\n") + (cleanBody ? `\n\n${cleanBody}` : "\n");
}

export function extractDocLinksFromMarkdown(content: string): string[] {
  if (!content) return [];
  const links: string[] = [];
  const regex = /\[.*?\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    if (
      !rawTarget.startsWith("http://") &&
      !rawTarget.startsWith("https://") &&
      !rawTarget.startsWith("mailto:")
    ) {
      const cleanTarget = rawTarget.split("#")[0].replace(/^\.?\//, "");
      if (
        cleanTarget.endsWith(".md") ||
        cleanTarget.endsWith(".markdown") ||
        cleanTarget.length > 0 ||
        rawTarget.startsWith("#") ||
        rawTarget.startsWith(":~:text=")
      ) {
        if (!links.includes(rawTarget)) {
          links.push(rawTarget);
        }
      }
    }
  }
  return links;
}

export function extractDocTitleFromMarkdown(content: string): string | null {
  if (!content) return null;
  const match = content.match(/^#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim().replace(/^[\uD800-\uDBFF\uDC00-\uDFFF\s]+/g, ""); // remove initial emojis if any
  }
  return null;
}
