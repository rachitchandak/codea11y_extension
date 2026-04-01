const TEMPLATE_DIR_HINTS = [
  '/views/',
  '/templates/',
  '/components/',
  '/layouts/',
  '/pages/',
  '/routes/',
  '/snippets/',
  '/fragments/',
  '/partials/',
];

export const INSTRUMENTATION_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.*/**',
  '**/.git/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.svelte-kit/**',
  '**/.astro/**',
  '**/.output/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/storybook-static/**',
  '**/vendor/**',
  '**/tmp/**',
  '**/temp/**',
];

export const INSTRUMENTATION_FILE_TYPES = [
  {
    mode: 'jsx-like',
    suffixes: ['.tsx', '.jsx', '.mts', '.cts', '.ts', '.mjs', '.cjs', '.js'],
  },
  {
    mode: 'vue-sfc',
    suffixes: ['.vue'],
  },
  {
    mode: 'glimmer-template',
    suffixes: ['.gts', '.gjs'],
  },
  {
    mode: 'astro-template',
    suffixes: ['.astro'],
  },
  {
    mode: 'svelte-template',
    suffixes: ['.svelte'],
  },
  {
    mode: 'marko-template',
    suffixes: ['.marko'],
  },
  {
    mode: 'html-like',
    suffixes: [
      '.blade.php',
      '.handlebars',
      '.mustache',
      '.jinja2',
      '.jinja',
      '.liquid',
      '.twig',
      '.html',
      '.htm',
      '.ejs',
      '.erb',
      '.hbs',
      '.njk',
      '.php',
      '.component',
    ],
    shouldInstrument(filePath) {
      if (!filePath.toLowerCase().endsWith('.php')) {
        return true;
      }
      const normalizedPath = normalizePath(filePath);
      return TEMPLATE_DIR_HINTS.some((hint) => normalizedPath.includes(hint));
    },
  },
];

const SORTED_FILE_TYPES = INSTRUMENTATION_FILE_TYPES
  .flatMap((fileType) => fileType.suffixes.map((suffix) => ({ ...fileType, suffix })))
  .sort((left, right) => right.suffix.length - left.suffix.length);

export function matchInstrumentationFileType(filePath) {
  const normalizedPath = normalizePath(filePath);
  for (const fileType of SORTED_FILE_TYPES) {
    if (!normalizedPath.endsWith(fileType.suffix)) continue;
    if (typeof fileType.shouldInstrument === 'function' && !fileType.shouldInstrument(normalizedPath)) continue;
    return fileType;
  }
  return null;
}

export function getInstrumentationGlobPatterns() {
  return [...new Set(SORTED_FILE_TYPES.map((ft) => `**/*${ft.suffix}`))];
}

function normalizePath(filePath) {
  return String(filePath || '').replace(/\\/g, '/').toLowerCase();
}
