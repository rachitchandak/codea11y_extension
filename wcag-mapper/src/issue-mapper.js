import fs from 'node:fs/promises';
import path from 'node:path';

const widgetCategoryMap = {
  accordion: ['Dynamic Components', 'Keyboard', 'Interactive Elements'],
  breadcrumb: ['Navigation', 'Links'],
  carousel: ['Dynamic Components', 'Keyboard', 'Interactive Elements'],
  dialog: ['Dynamic Components', 'Keyboard', 'Interactive Elements'],
  feed: ['Dynamic Components', 'Page Structure'],
  grid: ['Dynamic Components', 'Tables', 'Keyboard', 'Interactive Elements'],
  'menu-bar': ['Navigation', 'Keyboard', 'Interactive Elements', 'Dynamic Components'],
  'progress-bar': ['Status Messages', 'Dynamic Components', 'Visual Controls'],
  slider: ['Forms', 'Keyboard', 'Interactive Elements', 'Visual Controls'],
  tabs: ['Navigation', 'Dynamic Components', 'Keyboard', 'Interactive Elements'],
  tooltip: ['Keyboard', 'Content Blocks', 'Dynamic Components'],
  'tree-view': ['Navigation', 'Dynamic Components', 'Keyboard', 'Interactive Elements'],
};

const componentCategoryMap = {
  article: ['Content Blocks', 'Page Structure'],
  button: ['Interactive Elements', 'Keyboard'],
  'button-input': ['Interactive Elements', 'Keyboard', 'Forms'],
  checkbox: ['Forms', 'Keyboard', 'Interactive Elements'],
  'container-group': ['Content Blocks', 'Page Structure'],
  'date-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  details: ['Interactive Elements', 'Keyboard', 'Content Blocks'],
  figure: ['Images', 'Content Blocks'],
  figcaption: ['Images', 'Content Blocks'],
  'file-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  form: ['Forms', 'Keyboard', 'Interactive Elements'],
  heading: ['Headings', 'Page Structure', 'Content Blocks'],
  iframe: ['Embedded Objects'],
  image: ['Images', 'Content Blocks'],
  'image-input': ['Images', 'Forms', 'Interactive Elements'],
  label: ['Forms', 'Content Blocks'],
  landmark: ['Page Structure', 'Navigation'],
  link: ['Links', 'Keyboard'],
  list: ['Lists', 'Content Blocks'],
  main: ['Page Structure'],
  nav: ['Navigation', 'Links'],
  'number-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  option: ['Forms', 'Interactive Elements'],
  output: ['Forms', 'Status Messages'],
  paragraph: ['Content Blocks'],
  preformatted: ['Content Blocks'],
  progress: ['Status Messages', 'Visual Controls'],
  quote: ['Content Blocks'],
  'radio-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  'range-input': ['Forms', 'Keyboard', 'Interactive Elements', 'Visual Controls'],
  'search-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  section: ['Content Blocks', 'Page Structure'],
  select: ['Forms', 'Keyboard', 'Interactive Elements'],
  svg: ['Images'],
  table: ['Tables', 'Content Blocks'],
  'table-cell': ['Tables', 'Content Blocks'],
  'table-row': ['Tables', 'Content Blocks'],
  textarea: ['Forms', 'Keyboard', 'Interactive Elements'],
  'text-input': ['Forms', 'Keyboard', 'Interactive Elements'],
  video: ['Media'],
};

const contrastScByTargetType = {
  text: 'WCAG 2.0 1.4.3 Contrast (Minimum)',
  'non-text': 'WCAG 2.1 1.4.11 Non-text Contrast',
};

export async function loadIssueCatalog(filePath) {
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const byCategory = new Map();
  const byScId = new Map();

  for (const [category, guidelines] of Object.entries(raw)) {
    if (category === 'Summary' || !Array.isArray(guidelines)) continue;

    const normalized = guidelines.map((g) => ({
      id: `${category}::${g.sc_id || ''}::${g.guideline || ''}`,
      category,
      scId: String(g.sc_id || '').trim(),
      title: String(g.guideline || '').replace(/\s+/g, ' ').trim(),
      level: g.level || '',
      description: g.description || '',
      checkCount: Array.isArray(g.checks) ? g.checks.length : 0,
    }));

    byCategory.set(category, normalized);
    for (const issue of normalized) {
      byScId.set(issue.scId, issue);
    }
  }

  return { byCategory, byScId };
}

export function mapArtifactsToFiles({ projectRoot, widgets, components, catalog }) {
  const artifacts = [
    ...widgets.map((item) => normalizeArtifact(item, 'widget', projectRoot)),
    ...components.map((item) => normalizeArtifact(item, 'component', projectRoot)),
  ].map((artifact) => attachIssues(artifact, catalog));

  const mappedArtifacts = artifacts.filter((a) => a.sourceFile);
  const files = new Map();

  for (const artifact of mappedArtifacts) {
    const existing = files.get(artifact.sourceFile) || {
      path: artifact.sourceFile,
      issues: [],
      contrastFindings: [],
    };

    existing.issues.push(...artifact.issues);
    existing.contrastFindings.push(...(artifact.contrastFindings || []));
    files.set(artifact.sourceFile, existing);
  }

  const fileList = [...files.values()]
    .map((file) => {
      const dedupedIssues = dedupeBy(file.issues, (i) => i.id);
      const dedupedContrast = dedupeContrastFindings(file.contrastFindings);
      const contrastFailures = dedupedContrast.filter((f) => f.passes === false);
      return {
        path: file.path,
        guidelines: dedupedIssues.map((i) => ({
          scId: i.scId,
          title: i.title,
          level: i.level,
          category: i.category,
        })),
        contrastFindings: dedupedContrast.map((f) => ({
          foreground: f.foreground,
          background: f.background,
          contrastRatio: f.contrastRatio,
          requiredRatio: f.requiredRatio,
          passes: f.passes,
          isLargeText: f.isLargeText,
          domSelector: f.domSelector || null,
          selectorHint: f.selectorHint || null,
          text: f.text || null,
        })),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const allIssues = new Set();
  let totalContrastFailures = 0;
  for (const f of fileList) {
    for (const g of f.guidelines) allIssues.add(g.scId);
    totalContrastFailures += f.contrastFindings.filter((c) => !c.passes).length;
  }

  return {
    files: fileList,
    summary: {
      files: fileList.length,
      uniqueGuidelines: allIssues.size,
      contrastFailures: totalContrastFailures,
    },
  };
}

function normalizeArtifact(item, artifactKind, projectRoot) {
  const detectedType = artifactKind === 'widget' ? item.kind : item.componentType;
  const sourceLocation = item.sourceMapping?.sourceLocation || null;
  const sourceFile = sourceLocation?.filePath
    ? normalizeRelativePath(projectRoot, sourceLocation.filePath)
    : '';

  return {
    artifactKind,
    detectedType,
    sourceFile,
    contrastFindings: item.contrastFindings || [],
  };
}

function attachIssues(artifact, catalog) {
  const categories = artifact.artifactKind === 'widget'
    ? widgetCategoryMap[artifact.detectedType] || []
    : componentCategoryMap[artifact.detectedType] || [];

  const issues = [];
  for (const category of categories) {
    issues.push(...(catalog.byCategory.get(category) || []));
  }

  for (const finding of artifact.contrastFindings) {
    if (finding.passes !== false) continue;
    const scId = contrastScByTargetType[finding.targetType];
    const issue = catalog.byScId.get(scId);
    if (issue) issues.push(issue);
  }

  return { ...artifact, issues: dedupeBy(issues, (i) => i.id) };
}

/**
 * Deduplicate contrast findings by creating a unique key from:
 * foreground color, background color, passes status, targetType, and requiredRatio.
 * When duplicates exist, keep the one with the lowest contrast ratio (worst case).
 */
function dedupeContrastFindings(findings) {
  const map = new Map();

  for (const finding of findings) {
    const key = `${finding.foreground}|${finding.background}|${finding.targetType}|${finding.requiredRatio}`;
    const existing = map.get(key);

    if (!existing || finding.contrastRatio < existing.contrastRatio) {
      map.set(key, finding);
    }
  }

  return [...map.values()];
}

function normalizeRelativePath(projectRoot, filePath) {
  const rel = path.relative(projectRoot, filePath);
  if (!rel || rel.startsWith('..')) return String(filePath || '').replace(/\\/g, '/');
  return rel.replace(/\\/g, '/');
}

function dedupeBy(items, getKey) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  return results;
}
