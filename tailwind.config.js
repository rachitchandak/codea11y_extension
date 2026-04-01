/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/webview/**/*.{tsx,ts,jsx,js}"],
  theme: {
    extend: {
      colors: {
        "vscode-bg": "var(--vscode-editor-background)",
        "vscode-fg": "var(--vscode-editor-foreground)",
        "vscode-input-bg": "var(--vscode-input-background)",
        "vscode-input-fg": "var(--vscode-input-foreground)",
        "vscode-input-border": "var(--vscode-input-border)",
        "vscode-button-bg": "var(--vscode-button-background)",
        "vscode-button-fg": "var(--vscode-button-foreground)",
        "vscode-button-hover": "var(--vscode-button-hoverBackground)",
        "vscode-badge-bg": "var(--vscode-badge-background)",
        "vscode-badge-fg": "var(--vscode-badge-foreground)",
        "vscode-list-hover": "var(--vscode-list-hoverBackground)",
        "vscode-border": "var(--vscode-panel-border)",
        "vscode-error": "var(--vscode-errorForeground)",
        "vscode-warning": "var(--vscode-editorWarning-foreground)",
        "vscode-info": "var(--vscode-editorInfo-foreground)",
      },
      keyframes: {
        "collapse-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-collapsible-content-height)", opacity: "1" },
        },
        "collapse-up": {
          from: { height: "var(--radix-collapsible-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "slide-down": {
          from: { maxHeight: "0", opacity: "0" },
          to: { maxHeight: "300px", opacity: "1" },
        },
        "slide-up": {
          from: { maxHeight: "300px", opacity: "1" },
          to: { maxHeight: "0", opacity: "0" },
        },
      },
      animation: {
        "collapse-down": "slide-down 250ms ease-out",
        "collapse-up": "slide-up 200ms ease-in",
      },
    },
  },
  plugins: [],
};
