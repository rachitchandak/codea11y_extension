import type { AuditResult, Severity } from "../../shared/messages";

export function normalizeIssueText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function severityRank(severity: Severity | string): number {
  switch (severity) {
    case "error":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

export function normalizeGuidelineLabel(label: string): string {
  const match = label.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : label.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function trimCommonIndentation(value: string): string {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const minIndent = nonEmptyLines.reduce((smallest, line) => {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    return Math.min(smallest, indent);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(minIndent)) {
    return value.trim();
  }

  return lines
    .map((line) => line.slice(Math.min(minIndent, line.length)))
    .join("\n")
    .trim();
}

function extractPrimaryMarkupBlock(snippet: string): string {
  const pairedPatterns = [
    /<([A-Za-z][\w:-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/,
    /<([A-Z][\w.]*)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/,
  ];

  for (const pattern of pairedPatterns) {
    const match = snippet.match(pattern);
    if (match?.[0]) {
      return trimCommonIndentation(match[0]);
    }
  }

  const selfClosingPatterns = [
    /<([A-Za-z][\w:-]*)(?:\s[^>]*)?\/>/,
    /<([A-Z][\w.]*)((?:\s[^>]*)?)\/>/,
  ];

  for (const pattern of selfClosingPatterns) {
    const match = snippet.match(pattern);
    if (match?.[0]) {
      return trimCommonIndentation(match[0]);
    }
  }

  return "";
}

export function sanitizeIssueSnippet(value: string | null | undefined): string {
  const raw = String(value || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";

  const markupBlock = extractPrimaryMarkupBlock(raw);
  if (markupBlock) {
    return markupBlock;
  }

  const withoutTrailingCommentary = raw
    .replace(/\s+\((?:and|or|plus)\s+[^)]*\)\s*$/i, "")
    .replace(/\s+and\s+similar\s+[^\n]*$/i, "")
    .trim();

  return trimCommonIndentation(withoutTrailingCommentary);
}

function normalizeSnippetForKey(value: string | null | undefined): string {
  return sanitizeIssueSnippet(value).replace(/\s+/g, " ").trim();
}

function compactIssueAnchor(value: string | null | undefined): string {
  return normalizeSnippetForKey(value).slice(0, 160);
}

function extractQuotedAttribute(snippet: string, attribute: string): string {
  const patterns = [
    new RegExp(`${attribute}\\s*=\\s*"([^"]+)"`, "i"),
    new RegExp(`${attribute}\\s*=\\s*'([^']+)'`, "i"),
    new RegExp(`${attribute}\\s*=\\s*\\{\\s*"([^"]+)"\\s*\\}`, "i"),
    new RegExp(`${attribute}\\s*=\\s*\\{\\s*'([^']+)'\\s*\\}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match?.[1]) {
      return normalizeIssueText(decodeHtmlEntities(match[1]));
    }
  }

  return "";
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInnerTextFromSnippet(snippet: string): string {
  const pairedTagMatch = snippet.match(/<([a-z0-9:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/i);
  if (pairedTagMatch?.[2]) {
    return normalizeIssueText(stripTags(pairedTagMatch[2]));
  }

  return normalizeIssueText(stripTags(snippet));
}

function extractComponentText(issue: AuditResult): string {
  const snippet = sanitizeIssueSnippet(issue.snippet);
  if (!snippet) return "";

  const attributeCandidates = [
    "aria-label",
    "alt",
    "title",
    "placeholder",
    "name",
    "label",
  ];

  for (const attribute of attributeCandidates) {
    const value = extractQuotedAttribute(snippet, attribute);
    if (value) return value;
  }

  const text = extractInnerTextFromSnippet(snippet);
  if (text) return text;

  return "";
}

function getLastSelectorNode(selector: string): string {
  const normalized = normalizeIssueText(selector);
  if (!normalized) return "component";

  const segments = normalized.split(/\s+|>|\+|~/).filter(Boolean);
  const lastSegment = segments[segments.length - 1] || normalized;
  const cleaned = lastSegment
    .replace(/:{1,2}[a-z-]+\([^)]*\)/gi, "")
    .replace(/:{1,2}[a-z-]+/gi, "")
    .trim();

  const tagMatch = cleaned.match(/^[a-z][a-z0-9-]*/i);
  if (tagMatch) return tagMatch[0].toLowerCase();

  const roleLike = cleaned.match(/\.?([a-z][a-z0-9_-]*)/i);
  return roleLike?.[1]?.toLowerCase() || "component";
}

export function buildIssueMergeKey(issue: AuditResult): string {
  const selector = normalizeIssueText(issue.selector);
  const snippet = normalizeSnippetForKey(issue.snippet);

  return [
    issue.filePath,
    normalizeGuidelineLabel(issue.guideline),
    issue.source || "llm",
    issue.lineNumber ?? "",
    selector,
    snippet,
    normalizeIssueText(issue.issueDescription),
  ].join("|");
}

export function buildComponentGroupKey(issue: AuditResult): string {
  const selector = normalizeIssueText(issue.selector);
  const snippet = normalizeSnippetForKey(issue.snippet);
  const description = compactIssueAnchor(issue.issueDescription);

  if (issue.lineNumber !== undefined && issue.lineNumber !== null) {
    return [issue.filePath, issue.lineNumber, selector, snippet].join("|");
  }

  if (selector) {
    return [issue.filePath, selector, snippet].join("|");
  }

  return [issue.filePath, snippet, description].join("|");
}

export function getComponentGroupLabel(issue: AuditResult): string {
  const selector = normalizeIssueText(issue.selector);
  const nodeType = getLastSelectorNode(selector);
  const text = extractComponentText(issue);

  if (text) {
    return `${text} · ${nodeType}`;
  }

  if (selector) {
    return nodeType;
  }

  const snippet = compactIssueAnchor(issue.snippet);
  if (snippet) return `${snippet} · ${nodeType}`;

  if (issue.lineNumber !== undefined && issue.lineNumber !== null) {
    return `Component at line ${issue.lineNumber} · ${nodeType}`;
  }

  return "Component · component";
}

export function mergeIssues(existing: AuditResult, incoming: AuditResult): AuditResult {
  const preferIncoming = severityRank(incoming.severity) > severityRank(existing.severity);
  const primary = preferIncoming ? incoming : existing;
  const secondary = preferIncoming ? existing : incoming;

  return {
    ...secondary,
    ...primary,
    id: primary.id,
    ignored: existing.ignored || incoming.ignored,
    issueDescription:
      normalizeIssueText(primary.issueDescription) ||
      normalizeIssueText(secondary.issueDescription) ||
      undefined,
    selector:
      normalizeIssueText(primary.selector) ||
      normalizeIssueText(secondary.selector) ||
      undefined,
    snippet:
      sanitizeIssueSnippet(primary.snippet) ||
      sanitizeIssueSnippet(secondary.snippet) ||
      "",
    suggestion:
      normalizeIssueText(primary.suggestion) ||
      normalizeIssueText(secondary.suggestion) ||
      undefined,
    lineNumber: primary.lineNumber ?? secondary.lineNumber,
  };
}
