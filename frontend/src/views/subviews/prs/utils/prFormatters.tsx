import { marked } from "marked";
import { sanitizeHtml } from "../../../../utils/sanitize";
import type { VersionNode } from "../../../../types";

export const cleanSemanticTitle = (rawTitle?: string): string => {
  if (!rawTitle) return "";
  const cleaned = rawTitle
    .replace(/^(\[?(PR|pr|pull request|pull|pr#|pr-)[\s#:]*\d+\]?[:\s-]*)/i, "")
    .replace(/^(merge pull request #\d+ from [^\n]+|merge branch [^\n]+)/i, "")
    .replace(/^publicação da versão:\s*/i, "")
    .replace(/^(feat|fix|docs|chore|refactor|test|style)(\([^)]+\))?:\s*/i, "")
    .trim() || rawTitle;

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

export const humanizeBranchName = (branchName?: string, nodes?: VersionNode[]): string => {
  if (!branchName) return "Versão Oficial";
  if (branchName === "main" || branchName === "master") return "Versão Oficial";

  if (nodes && nodes.length > 0) {
    const matched = nodes.find((n) => n.name === branchName);
    if (matched?.displayName) return matched.displayName;
    if (matched?.proposal?.title) return cleanSemanticTitle(matched.proposal.title);
  }

  if (/^prop-\d+-/i.test(branchName)) {
    const raw = branchName.replace(/^prop-\d+-/i, "").replace(/[-_]+/g, " ").trim();
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : branchName;
  }

  if (/^galho-/i.test(branchName)) {
    return `Versão ${branchName.replace(/^galho-/i, "")}`;
  }

  if (branchName.includes("-") || branchName.includes("_")) {
    const raw = branchName.replace(/[-_]+/g, " ").trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  return branchName;
};

export const formatPRDate = (dateStr?: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

export const renderMarkdownDescription = (text: string) => {
  try {
    const rawHtml = marked.parse(text, { breaks: true, gfm: true }) as string;
    return (
      <div
        className="ui-markdown-rendered-desc"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawHtml) }}
      />
    );
  } catch {
    return (
      <div
        className="ui-markdown-rendered-desc"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {text}
      </div>
    );
  }
};
