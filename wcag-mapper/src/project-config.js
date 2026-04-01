import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import {
  getInstrumentationGlobPatterns,
  INSTRUMENTATION_IGNORE_PATTERNS,
} from './dom-source-map/file-types.js';

export const DEFAULT_PORTS = {
  angular: 4200, astro: 4321, ember: 4200, gatsby: 8000,
  vite: 5173, next: 3000, nuxt: 3000, express: 3000,
  react: 3000, svelte: 5173, vue: 5173, marko: 3000,
  remix: 3000, solid: 3000, qwik: 5173, custom: 3000, fallback: 3000,
};

const SOURCE_ROOT_CANDIDATES = [
  'src', 'app', 'client', 'frontend', 'web', 'views', 'public',
  'pages', 'components', 'layouts', 'routes', 'templates',
  'resources/views', 'app/components', 'app/templates', 'src/routes',
  'src/lib', 'client/src', 'web/src', 'frontend/src', 'src/components',
  'src/views', 'src/pages',
];

const FRAMEWORK_SOURCE_ROOT_PREFERENCES = {
  angular: ['src', 'projects'],
  astro: ['src', 'src/pages', 'src/components'],
  ember: ['app', 'app/templates', 'app/components'],
  express: ['src', 'views', 'templates', 'resources/views', 'app', 'public'],
  gatsby: ['src', 'pages'],
  marko: ['src', 'components', 'pages'],
  next: ['src', 'app', 'src/app', 'pages', 'src/pages'],
  nuxt: ['app', 'pages', 'components', 'src'],
  qwik: ['src', 'src/routes', 'routes', 'src/components'],
  react: ['src', 'app', 'client/src', 'frontend/src', 'web/src'],
  remix: ['app', 'src', 'routes'],
  solid: ['src', 'app', 'src/routes'],
  svelte: ['src', 'src/routes', 'src/lib', 'routes'],
  vite: ['src', 'app', 'client/src', 'frontend/src', 'web/src'],
  vue: ['src', 'app', 'pages', 'components', 'src/components'],
  custom: ['src', 'app', 'views', 'templates', 'components', 'pages'],
  fallback: ['src', 'app', 'views', 'templates', 'components', 'pages'],
};

const GENERATED_SOURCE_ROOTS = new Set([
  'public', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', '.astro', '.output', 'coverage',
]);

export async function detectProject(projectRoot) {
  const root = path.resolve(projectRoot);
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};
  const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

  const packageManager = await detectPackageManager(root);
  const framework = inferFramework(dependencies, scripts);
  const startScript = inferStartScript(framework, scripts);

  const scriptText = startScript ? (scripts[startScript] || '') : '';
  const startCommand = startScript ? buildRunCommand(packageManager, startScript) : '';
  const explicitUrls = extractUrlsFromText(scriptText);
  const port = extractPort(scriptText) || DEFAULT_PORTS[framework.runtime] || DEFAULT_PORTS.fallback;
  const sourceRoots = await findSourceRoots(root);
  const sourceDir = await detectSourceDir(root, framework.runtime, sourceRoots);

  return {
    root,
    packageJson,
    packageManager,
    framework,
    startScript,
    startCommand,
    sourceDir,
    sourceRoots,
    candidateUrls: prioritizeCandidateUrls([
      ...explicitUrls,
      ...buildCandidateUrls(port),
    ]),
    detectedPort: port,
  };
}

export async function resolveProjectConfig({ projectRoot, sourceDir = '', startCommand = '', url = '' }) {
  const root = path.resolve(projectRoot || sourceDir || '.');
  let detected = null;

  try {
    detected = await detectProject(root);
  } catch (error) {
    if (error?.code !== 'ENOENT' || !/package\.json/i.test(error?.path || error?.message || '')) {
      throw error;
    }
  }

  const resolvedSourceDir = sourceDir ? path.resolve(sourceDir) : (detected?.sourceDir || root);
  const framework = detected?.framework || { runtime: 'custom', ui: 'unknown', bundler: 'custom', styling: 'standard' };
  const effectiveStartCommand = startCommand || detected?.startCommand || '';
  const port = extractPort(url)
    || extractPort(effectiveStartCommand)
    || detected?.detectedPort
    || DEFAULT_PORTS[framework.runtime]
    || DEFAULT_PORTS.custom;

  const candidateUrls = prioritizeCandidateUrls([
    url,
    ...(detected?.candidateUrls || []),
    ...buildCandidateUrls(port),
  ]);

  const relSourceDir = normalizeRelativePath(root, resolvedSourceDir);

  return {
    root,
    sourceDir: resolvedSourceDir,
    packageManager: detected?.packageManager || 'custom',
    framework,
    startScript: detected?.startScript || (effectiveStartCommand ? 'custom' : ''),
    startCommand: effectiveStartCommand,
    sourceRoots: dedupe([...(detected?.sourceRoots || []), relSourceDir]),
    candidateUrls,
    detectedPort: port,
  };
}

async function detectPackageManager(root) {
  const candidates = [
    ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'], ['bun.lock', 'bun'], ['package-lock.json', 'npm'],
  ];
  for (const [file, mgr] of candidates) {
    try { await fs.access(path.join(root, file)); return mgr; } catch { /* next */ }
  }
  return 'npm';
}

function inferFramework(dependencies, scripts) {
  const scriptText = Object.values(scripts || {}).join(' ').toLowerCase();
  const has = (name) => Object.prototype.hasOwnProperty.call(dependencies, name);

  const usesNext = has('next') || /\bnext\b/.test(scriptText);
  const usesGatsby = has('gatsby') || /\bgatsby\b/.test(scriptText);
  const usesNuxt = has('nuxt') || has('nuxi');
  const usesAstro = has('astro') || /\bastro\b/.test(scriptText);
  const usesSvelte = has('svelte') || has('@sveltejs/kit');
  const usesAngular = has('@angular/core') || has('@angular/cli');
  const usesEmber = has('ember-source') || has('ember-cli');
  const usesMarko = has('marko') || has('@marko/compiler');
  const usesQwik = has('@builder.io/qwik');
  const usesRemix = has('@remix-run/react') || has('@remix-run/dev');
  const usesSolid = has('solid-js');
  const usesVite = has('vite') || /\bvite\b/.test(scriptText);
  const usesVue = has('vue') || has('@vitejs/plugin-vue');
  const usesReact = has('react') || has('@vitejs/plugin-react') || has('react-scripts');
  const usesExpress = has('express');
  const usesTailwind = has('tailwindcss') || has('@tailwindcss/vite') || has('@tailwindcss/postcss');

  let runtime = 'fallback';
  if (usesNext) runtime = 'next';
  else if (usesGatsby) runtime = 'gatsby';
  else if (usesNuxt) runtime = 'nuxt';
  else if (usesAstro) runtime = 'astro';
  else if (usesSvelte) runtime = 'svelte';
  else if (usesAngular) runtime = 'angular';
  else if (usesEmber) runtime = 'ember';
  else if (usesMarko) runtime = 'marko';
  else if (usesQwik) runtime = 'qwik';
  else if (usesRemix) runtime = 'remix';
  else if (usesSolid) runtime = 'solid';
  else if (usesVite && usesVue) runtime = 'vue';
  else if (usesVite && usesReact) runtime = 'vite';
  else if (usesExpress) runtime = 'express';
  else if (usesReact) runtime = 'react';
  else if (usesVue) runtime = 'vue';

  return {
    runtime,
    ui: inferUiFramework({ usesNext, usesGatsby, usesNuxt, usesAstro, usesSvelte, usesAngular, usesEmber, usesMarko, usesQwik, usesRemix, usesSolid, usesReact, usesVue, usesExpress }),
    bundler: inferBundler({ usesNext, usesGatsby, usesNuxt, usesAstro, usesAngular, usesEmber, usesMarko, usesRemix, usesVite, usesExpress }),
    styling: usesTailwind ? 'tailwind' : 'standard',
  };
}

function inferStartScript(framework, scripts) {
  const available = Object.keys(scripts || {});
  const preference = framework.runtime === 'express'
    ? ['dev', 'start', 'serve']
    : ['dev', 'start', 'serve', 'preview'];
  for (const name of preference) {
    if (available.includes(name)) return name;
  }
  const fuzzy = preference.map((p) => new RegExp(`^${p}(?::|$)`, 'i'));
  for (const pattern of fuzzy) {
    const match = available.find((n) => pattern.test(n));
    if (match) return match;
  }
  return '';
}

function buildRunCommand(packageManager, scriptName) {
  switch (packageManager) {
    case 'pnpm': return `pnpm ${scriptName}`;
    case 'yarn': return `yarn ${scriptName}`;
    case 'bun': return `bun run ${scriptName}`;
    default: return `npm run ${scriptName}`;
  }
}

export function extractPort(text) {
  const clean = stripAnsi(text);
  const patterns = [
    /https?:\/\/[^\s"']+:(\d{2,5})/i,
    /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/i,
    /(?:^|\s)-p(?:=|\s+)(\d{2,5})(?:\s|$)/i,
    /--port(?:=|\s+)(\d{2,5})/i,
    /PORT=(\d{2,5})/i,
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) return Number.parseInt(m[1], 10);
  }
  return null;
}

export function extractUrlsFromText(text, options = {}) {
  const { includeLoopbackVariants = true } = options;
  const raw = stripAnsi(text);
  const matches = raw.match(/(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{2,5})(?:\/[^\s"']*)?/gi) || [];
  const urls = matches.flatMap((v) => expandCandidateUrl(v, { includeLoopbackVariants }));
  return prioritizeCandidateUrls(urls);
}

function buildCandidateUrls(port) {
  return [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
}

async function findSourceRoots(root) {
  const found = [];
  for (const candidate of SOURCE_ROOT_CANDIDATES) {
    try {
      const stats = await fs.stat(path.join(root, candidate));
      if (stats.isDirectory()) found.push(candidate.replace(/\\/g, '/'));
    } catch { /* skip */ }
  }
  return dedupe(found);
}

async function detectSourceDir(root, runtime, sourceRoots) {
  if (!sourceRoots.length) return root;
  const prefs = FRAMEWORK_SOURCE_ROOT_PREFERENCES[runtime] || FRAMEWORK_SOURCE_ROOT_PREFERENCES.fallback;
  const scored = await Promise.all(sourceRoots.map(async (rel) => {
    const abs = path.join(root, rel);
    const count = await countInstrumentableFiles(abs);
    const prefIdx = prefs.indexOf(rel);
    const prefScore = prefIdx === -1 ? 0 : (prefs.length - prefIdx) * 100;
    const depthPenalty = rel.split('/').length * 5;
    return { rel, abs, score: (count * 1000) + prefScore - depthPenalty, count };
  }));
  const filtered = scored.filter((e) => !GENERATED_SOURCE_ROOTS.has(e.rel.split('/')[0]));
  const effective = filtered.length ? filtered : scored;
  effective.sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel));
  const winner = effective[0];
  if (!winner || winner.count === 0) {
    const preferred = prefs.find((c) => sourceRoots.includes(c));
    return preferred ? path.join(root, preferred) : root;
  }
  return winner.abs;
}

async function countInstrumentableFiles(baseDir) {
  const patterns = getInstrumentationGlobPatterns();
  let total = 0;
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd: baseDir, nodir: true, ignore: INSTRUMENTATION_IGNORE_PATTERNS });
    total += matches.length;
    if (total >= 250) return total;
  }
  return total;
}

export function prioritizeCandidateUrls(values) {
  return dedupe(values.map(normalizeCandidateUrl)).sort((a, b) => scoreCandidateUrl(b) - scoreCandidateUrl(a));
}

function normalizeCandidateUrl(value) {
  const raw = String(value || '').trim().replace(/[),.;]+$/, '');
  if (!raw) return '';
  const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProto);
    const hostname = parsed.hostname === '0.0.0.0' ? 'localhost' : parsed.hostname;
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    return `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ''}${pathname}${parsed.search || ''}`;
  } catch { return ''; }
}

function expandCandidateUrl(value, options = {}) {
  const normalized = normalizeCandidateUrl(value);
  if (!normalized) return [];
  const variants = [normalized];
  if (!options.includeLoopbackVariants) return variants;
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname === 'localhost') {
      variants.push(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`);
    }
  } catch { /* ignore */ }
  return variants;
}

function scoreCandidateUrl(value) {
  if (!value) return 0;
  try {
    const parsed = new URL(value);
    let score = 0;
    if (parsed.hostname === 'localhost') score += 20;
    if (parsed.hostname === '127.0.0.1') score += 10;
    if (parsed.pathname && parsed.pathname !== '/') score += 100 + parsed.pathname.length;
    return score;
  } catch { return 0; }
}

function normalizeRelativePath(root, target) {
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..')) return '';
  return rel.replace(/\\/g, '/');
}

function dedupe(arr) { return [...new Set(arr.filter(Boolean))]; }

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, '');
}

function inferUiFramework(f) {
  if (f.usesNext || f.usesReact || f.usesRemix || f.usesGatsby) return 'react';
  if (f.usesNuxt || f.usesVue) return 'vue';
  if (f.usesSvelte) return 'svelte';
  if (f.usesAngular) return 'angular';
  if (f.usesEmber) return 'ember';
  if (f.usesAstro) return 'astro';
  if (f.usesMarko) return 'marko';
  if (f.usesQwik) return 'qwik';
  if (f.usesSolid) return 'solid';
  if (f.usesExpress) return 'server-rendered';
  return 'unknown';
}

function inferBundler(f) {
  if (f.usesNext) return 'next';
  if (f.usesGatsby) return 'gatsby';
  if (f.usesNuxt) return 'nuxt';
  if (f.usesAstro) return 'astro';
  if (f.usesAngular) return 'angular-cli';
  if (f.usesEmber) return 'ember-cli';
  if (f.usesMarko) return 'marko';
  if (f.usesRemix) return 'remix';
  if (f.usesVite) return 'vite';
  if (f.usesExpress) return 'node';
  return 'unknown';
}
