import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BackupManager } from './dom-source-map/fs-manager.js';
import { instrumentAllFiles } from './dom-source-map/instrumenter.js';
import { ServerRunner } from './dom-source-map/server-runner.js';
import { resolveProjectConfig } from './project-config.js';
import { loadIssueCatalog, mapArtifactsToFiles } from './issue-mapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ── Component classification selectors ──────────────────────────────────────

const componentSelectorRules = [
  { selector: 'a[href]', type: 'link' },
  { selector: 'article', type: 'article' },
  { selector: 'aside, footer, header', type: 'landmark' },
  { selector: 'button', type: 'button' },
  { selector: 'details', type: 'details' },
  { selector: 'figure', type: 'figure' },
  { selector: 'figcaption', type: 'figcaption' },
  { selector: 'form', type: 'form' },
  { selector: 'h1, h2, h3, h4, h5, h6', type: 'heading' },
  { selector: 'iframe', type: 'iframe' },
  { selector: 'img', type: 'image' },
  { selector: 'input[type="button"], input[type="submit"], input[type="reset"]', type: 'button-input' },
  { selector: 'input[type="checkbox"]', type: 'checkbox' },
  { selector: 'input[type="date"], input[type="datetime-local"], input[type="month"], input[type="week"]', type: 'date-input' },
  { selector: 'input:not([type]), input[type="email"], input[type="tel"], input[type="url"], input[type="text"]', type: 'text-input' },
  { selector: 'input[type="file"]', type: 'file-input' },
  { selector: 'input[type="number"]', type: 'number-input' },
  { selector: 'input[type="password"], input[type="search"]', type: 'search-input' },
  { selector: 'input[type="radio"]', type: 'radio-input' },
  { selector: 'input[type="range"]', type: 'range-input' },
  { selector: 'label, legend', type: 'label' },
  { selector: 'main', type: 'main' },
  { selector: 'nav', type: 'nav' },
  { selector: 'ol, ul', type: 'list' },
  { selector: 'option', type: 'option' },
  { selector: 'output', type: 'output' },
  { selector: 'p', type: 'paragraph' },
  { selector: 'pre', type: 'preformatted' },
  { selector: 'progress', type: 'progress' },
  { selector: 'q, blockquote', type: 'quote' },
  { selector: 'section', type: 'section' },
  { selector: 'select', type: 'select' },
  { selector: 'svg', type: 'svg' },
  { selector: 'table, thead, tbody, tfoot', type: 'table' },
  { selector: 'td, th', type: 'table-cell' },
  { selector: 'tr', type: 'table-row' },
  { selector: 'textarea', type: 'textarea' },
  { selector: 'video', type: 'video' },
];

// ── ARIA-based widget detection ─────────────────────────────────────────────

const widgetAriaRules = [
  { role: 'tablist', kind: 'tabs' },
  { role: 'dialog', kind: 'dialog' },
  { role: 'alertdialog', kind: 'dialog' },
  { role: 'menu', kind: 'menu-bar' },
  { role: 'menubar', kind: 'menu-bar' },
  { role: 'tree', kind: 'tree-view' },
  { role: 'treegrid', kind: 'tree-view' },
  { role: 'slider', kind: 'slider' },
  { role: 'progressbar', kind: 'progress-bar' },
  { role: 'feed', kind: 'feed' },
  { role: 'grid', kind: 'grid' },
  { role: 'navigation', kind: 'breadcrumb' },
  { role: 'toolbar', kind: 'menu-bar' },
  { role: 'tooltip', kind: 'tooltip' },
];

const widgetClassPatterns = [
  { pattern: /accordion|collaps/i, kind: 'accordion' },
  { pattern: /carousel|slider|swiper|slick/i, kind: 'carousel' },
  { pattern: /tab-?list|tab-?nav|tab-?bar|tab-?container/i, kind: 'tabs' },
  { pattern: /modal|dialog|popup|overlay/i, kind: 'dialog' },
  { pattern: /breadcrumb/i, kind: 'breadcrumb' },
  { pattern: /tooltip|popover/i, kind: 'tooltip' },
  { pattern: /progress/i, kind: 'progress-bar' },
  { pattern: /tree-?view|tree-?node/i, kind: 'tree-view' },
  { pattern: /menu-?bar|mega-?menu|nav-?menu/i, kind: 'menu-bar' },
];

const containerSignatureAllowlist = new Set([
  'div, nav, p, section, span',
  'div, nav, section, span',
  'div, section',
  'div, section, span',
  'button, div, span',
  'div, li, span',
  'div, p, section, span',
  'div, section, span, ul',
  'div, span',
]);

const ignoredRootMarkers = [
  'astro-dev-toolbar', 'nuxt-devtools-container', 'react-refresh-overlay',
  'vite-error-overlay', 'vue-tracer-overlay', 'webpack-dev-server-client-overlay',
  '__next-build-watcher', '__next-dev-overlay', '__parcel__error__overlay__',
];

// ── Interactive prompts ─────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const flags = {
    projectRoot: '',
    startCommand: '',
    url: '',
    outputDir: '',
    timeout: 45_000,
    settleMs: 5_000,
    skipServer: false,
    headless: true,
    issueDataPath: path.join(rootDir, 'data.json'),
  };

  const positionals = [];
  for (const arg of argv) {
    if (arg === '--headful') { flags.headless = false; continue; }
    if (arg === '--skip-server') { flags.skipServer = true; continue; }
    if (arg.startsWith('--start-command=')) { flags.startCommand = arg.slice('--start-command='.length); continue; }
    if (arg.startsWith('--url=')) { flags.url = arg.slice('--url='.length); continue; }
    if (arg.startsWith('--out=')) { flags.outputDir = arg.slice('--out='.length); continue; }
    if (arg.startsWith('--timeout=')) { const v = Number(arg.split('=')[1]); if (v > 0) flags.timeout = v; continue; }
    if (arg.startsWith('--settle-ms=')) { const v = Number(arg.split('=')[1]); if (v >= 0) flags.settleMs = v; continue; }
    positionals.push(arg);
  }

  return { ...flags, projectRoot: flags.projectRoot || positionals[0] || '' };
}

// ── In-page analysis function (runs inside Chromium) ────────────────────────

function analyzeInPage(payload) {
  const { componentRules, widgetAriaRules, widgetClassPatterns: rawClassPatterns, containerAllowlist, ignoredMarkers } = payload;
  const widgetClassPatterns = (rawClassPatterns || []).map((r) => ({ pattern: new RegExp(r.pattern, r.flags), kind: r.kind }));
  const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'META', 'LINK', 'HEAD']);
  const containerAllowlistSet = new Set(containerAllowlist || []);
  const ignoredMarkerSet = new Set((ignoredMarkers || []).map((m) => String(m).toLowerCase()).filter(Boolean));
  const genericContainerTypes = new Set(['container-group', 'section']);
  const runErrors = [];
  const contrastAnalyzer = window.__contrastAnalyzer || null;

  const componentPriority = {
    section: 1, article: 1, nav: 1, main: 1,
    form: 2, table: 2, list: 2,
    figure: 3, image: 3, video: 3, svg: 3,
    heading: 4, paragraph: 4, quote: 4,
    button: 5, 'button-input': 5, link: 5, label: 5,
    'text-input': 5, 'search-input': 5, 'number-input': 5,
    'date-input': 5, 'file-input': 5, 'range-input': 5,
    'radio-input': 5, checkbox: 5, select: 5, textarea: 5,
    'container-group': 7,
  };

  const clipText = (v, max = 160) => {
    const t = String(v || '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  };

  const normalizeText = (el) => clipText(el?.textContent || '', 240);

  const matchesIgnoredMarker = (el) => {
    if (!(el instanceof Element) || !ignoredMarkerSet.size) return false;
    if (ignoredMarkerSet.has(el.tagName.toLowerCase())) return true;
    if (el.id && ignoredMarkerSet.has(el.id.toLowerCase())) return true;
    for (const cls of el.classList || []) {
      if (ignoredMarkerSet.has(cls.toLowerCase())) return true;
    }
    return false;
  };

  const isIgnored = (el) => {
    for (let c = el; c; c = c.parentElement) {
      if (matchesIgnoredMarker(c)) return true;
    }
    return false;
  };

  const getVisibility = (el) => {
    if (!(el instanceof Element)) return { state: 'unknown', visible: false };
    for (let c = el; c; c = c.parentElement) {
      const s = window.getComputedStyle(c);
      if (s.display === 'none') return { state: 'hidden', visible: false };
      if (s.visibility === 'hidden' || s.contentVisibility === 'hidden') return { state: 'hidden', visible: false };
      if (c.hasAttribute('hidden') || c.getAttribute('aria-hidden') === 'true') return { state: 'collapsed', visible: false };
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { state: 'collapsed', visible: false };
    return { state: 'visible', visible: true };
  };

  const summarizeRect = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });

  const buildSelectorHint = (el) => {
    if (!(el instanceof Element)) return '';
    const parts = [];
    let c = el;
    while (c && c !== document.body && parts.length < 5) {
      let p = c.tagName.toLowerCase();
      if (c.id) { p += `#${c.id}`; parts.unshift(p); break; }
      const cls = [...c.classList].slice(0, 2);
      if (cls.length) p += `.${cls.join('.')}`;
      parts.unshift(p);
      c = c.parentElement;
    }
    return parts.join(' > ');
  };

  const buildDomSelector = (el) => {
    if (!(el instanceof Element)) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let c = el;
    while (c && c !== document.documentElement) {
      const tag = c.tagName.toLowerCase();
      if (c.id) { parts.unshift(`#${CSS.escape(c.id)}`); break; }
      let idx = 1, sib = c.previousElementSibling;
      while (sib) { if (sib.tagName === c.tagName) idx++; sib = sib.previousElementSibling; }
      let same = 0;
      if (c.parentElement) for (const ch of c.parentElement.children) if (ch.tagName === c.tagName) same++;
      parts.unshift(same > 1 ? `${tag}:nth-of-type(${idx})` : tag);
      c = c.parentElement;
    }
    return parts.join(' > ');
  };

  const parseSourceLoc = (raw) => {
    if (!raw) return null;
    const lc = raw.lastIndexOf(':');
    if (lc === -1) return null;
    const before = raw.slice(0, lc);
    const col = parseInt(raw.slice(lc + 1), 10);
    const slc = before.lastIndexOf(':');
    if (slc === -1) return null;
    const fp = before.slice(0, slc);
    const line = parseInt(before.slice(slc + 1), 10);
    if (!fp || isNaN(line) || isNaN(col)) return null;
    return { filePath: fp, line, column: col };
  };

  const getDepth = (el) => {
    let d = 0, c = el;
    while (c && c !== document.body) { d++; c = c.parentElement; }
    return d;
  };

  const collectSourceCandidates = (el) => {
    if (!(el instanceof Element)) return [];
    const seen = new Set(), candidates = [];
    const push = (node, relation) => {
      if (!(node instanceof Element)) return;
      const loc = parseSourceLoc(node.getAttribute('data-source-loc'));
      if (!loc) return;
      const key = `${relation}:${loc.filePath}:${loc.line}:${loc.column}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ relation, selector: buildDomSelector(node), sourceLocation: loc });
    };
    push(el, 'self');
    for (const node of el.querySelectorAll('[data-source-loc]')) {
      push(node, node === el ? 'self' : 'descendant');
      if (candidates.length >= 6) return candidates;
    }
    if (!candidates.length) {
      let anc = el.parentElement;
      while (anc && candidates.length < 6) { push(anc, 'ancestor'); anc = anc.parentElement; }
    }
    return candidates;
  };

  const buildSourceMapping = (el) => {
    const candidates = collectSourceCandidates(el);
    const primary = candidates[0] || null;
    const strategy = primary?.relation || 'none';
    return {
      strategy,
      confidence: strategy === 'self' ? 'high' : strategy === 'descendant' ? 'medium' : strategy === 'ancestor' ? 'low' : 'none',
      sourceLocation: primary?.sourceLocation || null,
      matchedDomSelector: primary?.selector || '',
      candidateCount: candidates.length,
      candidates,
    };
  };

  const sharesSourceFile = (a, b) => {
    const af = a?.sourceLocation?.filePath || '';
    const bf = b?.sourceLocation?.filePath || '';
    return Boolean(af && bf && af === bf);
  };

  const getContrastFindings = (el, mapping) => {
    if (!(el instanceof Element) || typeof contrastAnalyzer?.analyzeArtifactContrast !== 'function') return [];
    try {
      return contrastAnalyzer.analyzeArtifactContrast(el, { sourceMapping: mapping, maxTextTargets: 24 });
    } catch (err) {
      runErrors.push({ kind: 'contrast', message: err?.message || String(err) });
      return [];
    }
  };

  const classifyComponent = (el) => {
    if (!(el instanceof Element)) return null;
    for (const rule of componentRules) {
      if (el.matches(rule.selector)) return rule.type;
    }
    const sig = [...new Set([...el.children].map((ch) => ch.tagName.toLowerCase()))].sort().join(', ');
    if (el.matches('div, span, section, nav, li, ul, button, table') && containerAllowlistSet.has(sig)) return 'container-group';
    const text = normalizeText(el);
    if ((text.length >= 40 || el.children.length >= 2) && el.matches('div, span')) return 'container-group';
    return null;
  };

  // ── Widget detection via ARIA roles and class patterns ──
  const widgetOwnerSet = new Set();
  const widgets = [];
  const typeCounters = new Map();

  const allElements = [...document.body.querySelectorAll('*')];

  for (const el of allElements) {
    if (!(el instanceof Element)) continue;
    if (ignoredTags.has(el.tagName)) continue;
    if (isIgnored(el)) continue;

    const role = (el.getAttribute('role') || '').toLowerCase();
    let widgetKind = null;

    // Check ARIA roles
    for (const rule of widgetAriaRules) {
      if (role === rule.role) { widgetKind = rule.kind; break; }
    }

    // Check class/id patterns
    if (!widgetKind) {
      const classId = `${el.className || ''} ${el.id || ''}`;
      for (const rule of widgetClassPatterns) {
        if (rule.pattern.test(classId)) { widgetKind = rule.kind; break; }
      }
    }

    // Check <dialog> element
    if (!widgetKind && el.tagName === 'DIALOG') widgetKind = 'dialog';

    if (!widgetKind) continue;

    const visibility = getVisibility(el);
    const counter = (typeCounters.get(widgetKind) || 0) + 1;
    typeCounters.set(widgetKind, counter);

    widgetOwnerSet.add(el);
    const sourceMapping = buildSourceMapping(el);

    widgets.push({
      id: `widget-${widgetKind}-${counter}`,
      index: counter,
      kind: widgetKind,
      selectorHint: buildSelectorHint(el),
      domSelector: buildDomSelector(el),
      rect: summarizeRect(el.getBoundingClientRect()),
      visibilityState: visibility.state,
      sourceMapping,
      contrastFindings: getContrastFindings(el, sourceMapping),
      labels: [],
    });
  }

  // ── Component classification ──
  const uncovered = allElements.filter((el) => {
    if (!(el instanceof Element)) return false;
    if (ignoredTags.has(el.tagName)) return false;
    if (isIgnored(el)) return false;
    if (widgetOwnerSet.has(el)) return false;
    if (!getVisibility(el).visible) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    if (/^(HTML|BODY)$/.test(el.tagName)) return false;
    return true;
  });

  const componentCandidates = uncovered
    .map((el) => {
      const type = classifyComponent(el);
      if (!type) return null;
      return { element: el, componentType: type, sourceMapping: buildSourceMapping(el) };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const pd = (componentPriority[a.componentType] || 99) - (componentPriority[b.componentType] || 99);
      if (pd !== 0) return pd;
      return getDepth(a.element) - getDepth(b.element);
    });

  const componentElements = [];
  for (const candidate of componentCandidates) {
    const covered = componentElements.some((entry) => {
      if (entry.element === candidate.element) return true;
      if (!entry.element.contains(candidate.element)) return false;
      if (entry.componentType === candidate.componentType) {
        if (genericContainerTypes.has(entry.componentType) && !sharesSourceFile(entry.sourceMapping, candidate.sourceMapping)) return false;
        return true;
      }
      if (genericContainerTypes.has(entry.componentType)) return false;
      return false;
    });
    if (!covered) componentElements.push(candidate);
  }

  const components = componentElements.map((entry, index) => {
    const visibility = getVisibility(entry.element);
    return {
      id: `component-${index + 1}`,
      index: index + 1,
      componentType: entry.componentType,
      text: normalizeText(entry.element),
      selectorHint: buildSelectorHint(entry.element),
      domSelector: buildDomSelector(entry.element),
      rect: summarizeRect(entry.element.getBoundingClientRect()),
      visibilityState: visibility.state,
      sourceMapping: entry.sourceMapping,
      contrastFindings: getContrastFindings(entry.element, entry.sourceMapping),
    };
  });

  const contrastFindings = [...widgets, ...components].flatMap((i) => i.contrastFindings || []);
  return {
    title: document.title,
    widgets,
    components,
    runErrors,
    contrastSummary: {
      findings: contrastFindings.length,
      failures: contrastFindings.filter((f) => f.passes === false).length,
    },
  };
}

// ── Main orchestration ──────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Step 1: Get project root
  let projectRoot = args.projectRoot;
  if (!projectRoot) {
    projectRoot = await ask('Enter the project path: ');
    if (!projectRoot) {
      console.error('No project path provided.');
      process.exitCode = 1;
      return;
    }
  }

  // Step 2: Detect project config
  let project;
  try {
    project = await resolveProjectConfig({
      projectRoot,
      startCommand: args.startCommand,
      url: args.url,
    });
  } catch (error) {
    console.error(`Failed to analyze project: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`[config] Framework: ${project.framework.runtime}`);
  console.log(`[config] Source dir: ${project.sourceDir}`);
  console.log(`[config] Start command: ${project.startCommand || '(none)'}`);
  console.log(`[config] Candidate URLs: ${project.candidateUrls.join(', ')}`);

  // Step 3: If we can't find a start command, ask user
  if (!args.skipServer && !project.startCommand) {
    const userCommand = await ask('Could not detect a start command. Enter the command to start the dev server (e.g. "npm run dev"): ');
    if (userCommand) {
      project = await resolveProjectConfig({
        projectRoot,
        startCommand: userCommand,
        url: args.url,
      });
    }
  }

  // Step 4: If still no start command and no URL, ask for URL (maybe server is already running)
  const resolvedUrl = args.url || project.candidateUrls[0];
  if (!args.skipServer && !project.startCommand) {
    const userUrl = await ask('No start command. Enter the URL of the already-running app (e.g. "http://localhost:3000"): ');
    if (userUrl) {
      args.url = userUrl;
      args.skipServer = true;
    } else {
      console.error('Cannot proceed without a start command or URL.');
      process.exitCode = 1;
      return;
    }
  }

  // Step 5: Determine output directory
  const outDir = args.outputDir
    ? path.resolve(args.outputDir)
    : path.resolve(projectRoot, 'wcag-report');
  await fs.mkdir(outDir, { recursive: true });

  // Step 6: Load contrast analyzer source
  const contrastSource = await fs.readFile(path.join(__dirname, 'contrast-analyzer.js'), 'utf8');

  // Step 7: Instrument, start server, launch browser, analyze
  const backupManager = new BackupManager(project.sourceDir);
  const serverRunner = args.skipServer
    ? null
    : new ServerRunner(project.startCommand, project.root, args.url ? [args.url] : project.candidateUrls, args.timeout);

  let browser = null;
  let page = null;

  try {
    await backupManager.backup();
    const instrumentedCount = await instrumentAllFiles(project.sourceDir);
    if (instrumentedCount === 0) {
      console.warn('[warn] No instrumentable files found.');
    }

    if (serverRunner) {
      await serverRunner.start();
    }

    const targetUrl = serverRunner?.resolvedUrl || args.url || resolvedUrl;
    console.log(`[browser] Navigating to ${targetUrl}`);

    browser = await chromium.launch({ headless: args.headless });
    page = await browser.newPage({ viewport: { width: 1440, height: 2400 } });

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout });
    await page.waitForLoadState('networkidle', { timeout: Math.min(args.timeout, 15_000) }).catch(() => {});
    await page.waitForTimeout(args.settleMs);

    // Inject contrast analyzer
    await page.addScriptTag({ content: contrastSource });

    // Run in-page analysis
    const rawReport = await page.evaluate(analyzeInPage, {
      componentRules: componentSelectorRules,
      widgetAriaRules,
      widgetClassPatterns: widgetClassPatterns.map((r) => ({ pattern: r.pattern.source, flags: r.pattern.flags, kind: r.kind })),
      containerAllowlist: [...containerSignatureAllowlist],
      ignoredMarkers: ignoredRootMarkers,
    });

    // Step 8: Map to files and generate report
    const catalog = await loadIssueCatalog(path.resolve(args.issueDataPath));
    const mapped = mapArtifactsToFiles({
      projectRoot: project.root,
      widgets: rawReport.widgets,
      components: rawReport.components,
      catalog,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      project: {
        root: project.root,
        framework: project.framework.runtime,
        url: targetUrl,
      },
      files: mapped.files,
      summary: mapped.summary,
    };

    const reportPath = path.join(outDir, 'report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log('\n✓ Analysis complete.');
    console.log(`  Report: ${reportPath}`);
    console.log(`  Files: ${report.summary.files}`);
    console.log(`  Unique guidelines: ${report.summary.uniqueGuidelines}`);
    console.log(`  Contrast failures: ${report.summary.contrastFailures}`);
  } finally {
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (serverRunner) await serverRunner.stop().catch(() => {});
    await backupManager.restore().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
