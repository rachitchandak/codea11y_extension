# wcag-mapper

A streamlined tool that instruments a web project's source code, runs it in the browser, detects UI components, maps them back to source files, and outputs a `report.json` with applicable WCAG guidelines per file — including deduplicated contrast findings.

## How It Works

1. **Project Detection** — Reads `package.json` to detect framework (React, Vue, Svelte, Next.js, Astro, Angular, etc.), package manager, start command, and port.
2. **Interactive Prompts** — If the start command or URL cannot be detected, the tool asks you interactively.
3. **Source Instrumentation** — Backs up source files, then injects `data-source-loc` attributes into JSX, Vue SFCs, Svelte, Astro, HTML, and other template files to enable DOM-to-source mapping.
4. **Dev Server Launch** — Starts the dev server and waits for it to respond.
5. **Browser Analysis** — Launches headless Chromium via Playwright, navigates to the app, and:
   - Detects widgets (tabs, dialogs, accordions, carousels, etc.) via ARIA roles and class patterns
   - Classifies semantic components (buttons, forms, headings, links, images, tables, etc.)
   - Analyzes contrast ratios for all text elements (WCAG AA/AAA)
   - Maps every detected element back to its source file via `data-source-loc`
6. **WCAG Mapping** — Attaches applicable WCAG guidelines to each file based on the types of components found in it.
7. **Report Output** — Writes a single `report.json` with per-file issues, deduplicated contrast findings, and summary statistics.

## Usage

```bash
# Install dependencies
npm install

# Run against a project
npm start -- /path/to/your/project

# With explicit options
npm start -- /path/to/project --start-command="npm run dev" --url=http://localhost:3000

# If the server is already running
npm start -- /path/to/project --skip-server --url=http://localhost:3000

# Show the browser while analyzing
npm start -- /path/to/project --headful

# Custom output directory
npm start -- /path/to/project --out=./my-report
```

## CLI Options

| Option | Description |
|---|---|
| `<project-path>` | Path to the project root (positional) |
| `--start-command=<cmd>` | Override the dev server command |
| `--url=<url>` | Explicit URL to analyze |
| `--skip-server` | Don't start a server (use with `--url`) |
| `--out=<dir>` | Output directory (default: `<project>/wcag-report/`) |
| `--headful` | Show the browser window |
| `--timeout=<ms>` | Server startup timeout (default: 45000) |
| `--settle-ms=<ms>` | Wait time after page load (default: 5000) |

## Output

The tool produces a single `report.json` containing:

```json
{
  "project": { "root", "sourceDir", "framework", "startCommand", "url" },
  "title": "Page Title",
  "generatedAt": "ISO timestamp",
  "files": [
    {
      "path": "src/components/Header.tsx",
      "displayName": "Header.tsx",
      "artifactCount": 5,
      "issueCount": 12,
      "contrastFailureCount": 2,
      "artifacts": [...],
      "issues": [...],
      "contrastFindings": [...]
    }
  ],
  "summary": {
    "widgets": 3,
    "components": 42,
    "mappedArtifacts": 40,
    "unmappedArtifacts": 5,
    "files": 8,
    "issues": 67,
    "contrastFailures": 4
  },
  "contrastSummary": { "findings": 120, "failures": 4 },
  "runErrors": []
}
```

**Key features of the report:**
- **Per-file grouping**: All artifacts and applicable WCAG guidelines grouped by source file
- **Deduplicated contrast findings**: Same foreground/background color combinations are collapsed, keeping the worst-case ratio
- **Only applicable guidelines**: Each file only lists WCAG criteria relevant to the component types found in it

## Supported Frameworks

React, Next.js, Vue, Nuxt, Svelte, SvelteKit, Astro, Angular, Ember, Gatsby, Remix, Solid, Qwik, Marko, Express, and generic Vite projects.

## Supported File Types

JSX, TSX, TypeScript, Vue SFCs, Svelte, Astro, Glimmer (GTS/GJS), Marko, HTML, EJS, ERB, HBS, Njk, PHP templates, Blade, Handlebars, Mustache, Jinja2, Liquid, Twig.
