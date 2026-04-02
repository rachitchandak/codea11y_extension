"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractAuditableElementInventory = extractAuditableElementInventory;
function normalizeInlineWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function clip(value, maxLength = 180) {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
function buildTagIdentifier(tagName, attributes) {
    const idMatch = attributes.match(/id\s*=\s*["']([^"']+)["']/i);
    if (idMatch?.[1])
        return `${tagName}#${idMatch[1]}`;
    const classMatch = attributes.match(/class(?:Name)?\s*=\s*["']([^"']+)["']/i);
    if (classMatch?.[1]) {
        const firstClass = classMatch[1].trim().split(/\s+/)[0];
        if (firstClass)
            return `${tagName}.${firstClass}`;
    }
    return tagName;
}
function isAuditableTag(tagName, attributes) {
    const normalizedTag = tagName.toLowerCase();
    const semanticTags = new Set([
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "img",
        "svg",
        "video",
        "audio",
        "form",
        "label",
        "details",
        "summary",
        "dialog",
        "iframe",
        "nav",
        "main",
        "section",
        "article",
        "aside",
        "header",
        "footer",
        "table",
        "th",
        "td",
        "tr",
    ]);
    if (semanticTags.has(normalizedTag))
        return true;
    return /(onClick|onKeyDown|onKeyUp|onSubmit|href=|role=|tabIndex=|aria-|alt=|title=|placeholder=)/i.test(attributes);
}
function extractAuditableElementInventory(content) {
    const lines = content.replace(/\r\n/g, "\n").split("\n");
    const entries = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const matches = [...line.matchAll(/<([A-Za-z][\w:-]*)([^>]*)>/g)];
        for (const match of matches) {
            const [rawTag, tagName, attributes] = match;
            if (rawTag.startsWith("</"))
                continue;
            if (!isAuditableTag(tagName, attributes || ""))
                continue;
            const identifier = buildTagIdentifier(tagName.toLowerCase(), attributes || "");
            entries.push(`- line ${index + 1}: ${identifier} :: ${clip(normalizeInlineWhitespace(rawTag))}`);
        }
    }
    return entries.length > 0
        ? entries.join("\n")
        : "- No auditable element inventory could be extracted from the source.";
}
//# sourceMappingURL=sourceInventory.js.map