"use strict";
/* ------------------------------------------------------------------ *
 *  Constants used by the MainAgent                                    *
 * ------------------------------------------------------------------ */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STYLESHEET_FALLBACK_GUIDELINES = exports.STYLESHEET_EXTENSIONS = void 0;
exports.STYLESHEET_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);
exports.STYLESHEET_FALLBACK_GUIDELINES = [
    {
        wcag_id: "1.4.1",
        description: "Use of Color: styling must not rely on color alone to communicate status, meaning, or required actions.",
    },
    {
        wcag_id: "2.4.7",
        description: "Focus Visible: styling must preserve a clear visible focus indicator and must not remove outlines without an adequate replacement.",
    },
    {
        wcag_id: "1.4.13",
        description: "Content on Hover or Focus: hover or focus triggered content styled here must remain dismissible, hoverable, and persistent when required.",
    },
    {
        wcag_id: "2.4.11",
        description: "Focus Not Obscured (Minimum): sticky, overlay, or positioned styling must not obscure focused controls.",
    },
];
//# sourceMappingURL=agentConstants.js.map