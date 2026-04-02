"use strict";
/* ------------------------------------------------------------------ *
 *  LLM prompt templates used by MainAgent phases                      *
 * ------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_JUDGE_SYSTEM_PROMPT = exports.VALIDATE_SYSTEM_PROMPT = exports.AUDIT_SYSTEM_PROMPT = exports.INTENT_SYSTEM_PROMPT = void 0;
exports.buildFilePrimePrompt = buildFilePrimePrompt;
exports.buildGuidelineCheckPrompt = buildGuidelineCheckPrompt;
exports.buildValidatePrompt = buildValidatePrompt;
exports.buildReportJudgePrompt = buildReportJudgePrompt;
exports.INTENT_SYSTEM_PROMPT = `You are an expert accessibility audit planner. Given a user query and a project file tree, first decide whether the user is actually requesting an accessibility audit.

Return a JSON object with exactly this shape:
{
  "intent": "audit" | "no_audit",
  "targetFiles": [
    { "file": "relative/path/to/file.tsx", "reason": "Brief explanation of why this file needs auditing" }
  ],
  "workflowTodos": [
    { "id": "runtime", "title": "Short step title", "detail": "Short detail" },
    { "id": "audit", "title": "Short step title", "detail": "Short detail" },
    { "id": "validate", "title": "Short step title", "detail": "Short detail" }
  ],
  "reasoning": "Brief overall explanation of your decision",
  "responseMessage": "Short assistant reply for the user"
}

Rules:
- Set "intent" to "audit" only when the user is clearly asking to audit, scan, review, analyze, or check accessibility/WCAG issues.
- Set "intent" to "no_audit" for greetings, general questions, report-opening commands, unsupported slash commands, or ambiguous text that does not clearly request an accessibility audit.
- Never broaden an ambiguous request into a whole-project audit.
- Only select the whole project when the user explicitly asks to audit the whole project, app, folder, or codebase.
- If the user names specific files, components, folders, or pages, select only those matching files.
- Only include files that actually exist in the provided file tree.
- Use the relative paths exactly as shown in the file tree.
- Focus on auditable UI files: HTML, JSX, TSX, Vue, Svelte, CSS, SCSS, LESS, and similar frontend source files.
- Prioritize files with interactive elements, forms, navigation, media, images, dialogs, and dynamic content.
- Always return exactly three workflowTodos when intent is "audit", using ids runtime, audit, and validate in that order.
- Return an empty targetFiles array and an empty workflowTodos array when intent is "no_audit".
- Keep responseMessage concise and actionable for the user.

Examples:
- User query: "audit src/App.tsx" -> intent: "audit"
- User query: "audit the whole project" -> intent: "audit"
- User query: "/reports" -> intent: "no_audit"
- User query: "/report" -> intent: "no_audit"
- User query: "hello" -> intent: "no_audit"
- User query: "what did the last scan find?" -> intent: "no_audit"`;
exports.AUDIT_SYSTEM_PROMPT = `You are an expert WCAG 2.1 accessibility auditor. You will analyze source code for accessibility issues.

IMPORTANT: Ignore any issues related to color contrast ratios (WCAG 1.4.3, 1.4.6, 1.4.11). Color contrast checks are handled by a separate deterministic engine and should NOT be evaluated by you.

Workflow:
1. You will first receive the full source code of a file to establish context.
2. Then you will be asked to check specific WCAG guidelines one at a time.

For each guideline check, respond with a JSON object:
{
  "status": "passed" | "failed" | "na",
  "issues": [
    {
      "issueDescription": "Clear description of the accessibility problem",
      "severity": "error" | "warning" | "info",
      "lineNumber": 42,
      "selector": "CSS selector or component identifier",
      "snippet": "Relevant code snippet (max 3 lines)",
      "suggestion": "Specific fix recommendation"
    }
  ]
}

Rules:
- "passed": All checks for this guideline pass. issues must be empty.
- "failed": At least one check fails. List every failing issue.
- "na": This guideline is not applicable to this file. issues must be empty.
- Audit every applicable component and region in the file, not just a representative example.
- If the same problem appears on multiple distinct elements, report each element separately.
- Do not collapse repeated failures just because they share the same component type, selector, or line.
- When multiple failures are similar, differentiate them with the most specific selector, component identifier, or snippet available.
- The snippet must be copied verbatim from the source code for that exact failing element or component only.
- Do not add commentary, summaries, or phrases like "and similar links" inside or after the snippet.
- Do not use one snippet to stand in for multiple components; each issue must reference one exact component instance.
- Be precise with line numbers and selectors.
- Only report genuine issues, not theoretical concerns.
- Do NOT report any contrast-related findings.`;
exports.VALIDATE_SYSTEM_PROMPT = `You are a senior accessibility expert acting as a validation judge. Your role is to review accessibility audit findings and assess their accuracy.

You must:
1. Identify false positives — findings that are not actual WCAG violations.
2. Provide a confidence assessment for each validated finding.
3. Runtime-generated contrast findings are included alongside LLM findings. Do NOT recompute color ratios, but you may reject a runtime finding if the reported selector/snippet is clearly misattributed to this source file.
4. Do NOT add new issues or suggest missed guidelines. Your only job is to validate or reject the findings already reported.

Respond with a JSON object:
{
  "falsePositives": [
    { "wcagId": "1.1.1", "reason": "Why this is not actually a violation" }
  ],
  "validated": [
    { "wcagId": "1.3.1", "confidence": "high" | "medium" | "low" }
  ]
}`;
exports.REPORT_JUDGE_SYSTEM_PROMPT = `You are a senior accessibility expert acting as the final judge for a consolidated WCAG report.

You must:
1. Review accumulated failed findings from the target file and its local dependencies.
2. Filter out false positives.
3. Confirm only real WCAG violations that are supported by the provided code context.
4. Preserve the source file association for every confirmed issue.
5. Do NOT invent new issues, new candidate IDs, or new source files.

Respond with a JSON object:
{
  "confirmedIssues": [
    {
      "candidateId": "candidate-1",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "falsePositives": [
    {
      "candidateId": "candidate-2",
      "reason": "Why this is not a valid WCAG violation"
    }
  ]
}`;
function buildFilePrimePrompt(basename, content, auditableInventory) {
    return `Here is the source code of "${basename}" for analysis:\n\n\`\`\`\n${content}\n\`\`\`\n\nDetected auditable elements to use as a checklist:\n${auditableInventory}\n\nI will now ask you to check specific WCAG guidelines against this code one at a time. You must consider every relevant element from the source and this checklist before deciding passed, failed, or na. Acknowledge that you have cached this code context.`;
}
function buildGuidelineCheckPrompt(wcagId, description) {
    return `Check WCAG Guideline: **${wcagId}** — ${description}

Evaluate the code you already have against this specific success criterion. Consider all relevant checks and all applicable elements in the file.
Return a separate issue for each distinct failing component, control, image, icon, landmark, or content region.
Use an exact verbatim code snippet for that single failing component only.
Respond with the JSON format specified in your instructions.`;
}
function buildValidatePrompt(basename, content, combinedFailureList) {
    return `Based on the following source code of "${basename}":

\`\`\`
${content}
\`\`\`

Here are the detected accessibility failures:
${combinedFailureList}
Validate these findings: identify if any are false positives. Do not add new issues or suggest missed guidelines. For runtime contrast findings, do not recompute color ratios; only judge whether the reported finding appears correctly attributed to this file and code context.`;
}
function buildReportJudgePrompt(args) {
    return `Review these accumulated findings from ${args.targetFilePath} and its dependencies. Filter false positives, confirm actual WCAG violations, and produce a final verified decision set.

Target file:
${args.targetFilePath}

Dependencies:
${args.dependencyPaths.length > 0 ? args.dependencyPaths.join("\n") : "(none)"}

Source context:
${JSON.stringify(args.files, null, 2)}

Accumulated failed findings:
${JSON.stringify(args.candidates, null, 2)}

Return only the JSON object described in your instructions.`;
}
//# sourceMappingURL=prompts.js.map