import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import * as t from '@babel/types';
import {
  getInstrumentationGlobPatterns,
  INSTRUMENTATION_IGNORE_PATTERNS,
  matchInstrumentationFileType,
} from './file-types.js';

const traverse = traverseModule.default;
const generate = generateModule.default;
const ATTR_NAME = 'data-source-loc';

const SKIP_HTML_TAGS = new Set([
  'script', 'style', 'link', 'meta', 'title', 'head', 'template', 'slot', '!doctype',
]);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const TEMPLATE_NAMESPACE_PREFIXES = ['svelte:', 'astro:'];
const TEMPLATE_BLOCK_MARKERS = [['<?', '?>'], ['<%', '%>']];
const SKIP_JSX_NAMES = new Set(['Fragment']);

const INTRINSIC_ELEMENT_NAMES = new Set([
  'a','abbr','address','area','article','aside','audio','b','base','bdi','bdo',
  'blockquote','body','br','button','canvas','caption','cite','code','col','colgroup',
  'data','datalist','dd','del','details','dfn','dialog','div','dl','dt','em','embed',
  'fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6',
  'head','header','hgroup','hr','html','i','iframe','img','input','ins','kbd','label',
  'legend','li','main','map','mark','menu','menuitem','meta','meter','nav','noscript',
  'object','ol','optgroup','option','output','p','param','picture','pre','progress',
  'q','rp','rt','ruby','s','samp','script','section','select','small','source','span',
  'strong','style','sub','summary','sup','svg','table','tbody','td','template','textarea',
  'tfoot','th','thead','time','title','tr','track','u','ul','var','video','wbr',
]);

function isIntrinsicJsxElementName(name) {
  if (t.isJSXIdentifier(name)) {
    return name.name.includes('-') || INTRINSIC_ELEMENT_NAMES.has(name.name);
  }
  return false;
}

export async function instrumentAllFiles(sourceDir) {
  const resolvedDir = path.resolve(sourceDir);
  console.log(`[instrumenter] Scanning: ${resolvedDir}`);

  const patterns = getInstrumentationGlobPatterns();
  const files = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: resolvedDir, absolute: true, nodir: true, ignore: INSTRUMENTATION_IGNORE_PATTERNS,
    });
    files.push(...matches);
  }

  const uniqueFiles = [...new Set(files)].filter((f) => !!matchInstrumentationFileType(f));
  console.log(`[instrumenter] Found ${uniqueFiles.length} file(s) to instrument.`);

  let instrumented = 0;
  for (const filePath of uniqueFiles) {
    try {
      const fileType = matchInstrumentationFileType(filePath);
      if (!fileType) continue;

      switch (fileType.mode) {
        case 'vue-sfc':
          await instrumentVueFile(filePath);
          break;
        case 'glimmer-template':
          await instrumentGlimmerTemplateFile(filePath);
          break;
        case 'astro-template':
          await instrumentAstroFile(filePath);
          break;
        case 'svelte-template':
        case 'marko-template':
        case 'html-like':
          await instrumentMarkupFile(filePath);
          break;
        default:
          await instrumentJSXLikeFile(filePath);
          break;
      }
      instrumented += 1;
    } catch (error) {
      console.warn(`[instrumenter] Skipping (parse error): ${filePath} — ${error.message}`);
    }
  }

  console.log(`[instrumenter] Instrumented ${instrumented}/${uniqueFiles.length} file(s).`);
  return instrumented;
}

async function instrumentJSXLikeFile(filePath) {
  const code = await fs.promises.readFile(filePath, 'utf8');
  const isTS = /\.(?:tsx|ts|mts|cts)$/i.test(filePath);

  const ast = parse(code, {
    sourceType: 'unambiguous',
    plugins: [
      'jsx',
      ...(isTS ? ['typescript'] : []),
      'decorators-legacy',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'optionalChaining',
      'nullishCoalescingOperator',
      'dynamicImport',
      'importAttributes',
      'topLevelAwait',
    ],
  });

  const normPath = filePath.replace(/\\/g, '/');

  traverse(ast, {
    JSXOpeningElement(nodePath) {
      const { node } = nodePath;
      if (t.isJSXFragment(nodePath.parent)) return;
      if (t.isJSXIdentifier(node.name) && SKIP_JSX_NAMES.has(node.name.name)) return;
      if (t.isJSXMemberExpression(node.name) && t.isJSXIdentifier(node.name.property) && SKIP_JSX_NAMES.has(node.name.property.name)) return;
      if (!isIntrinsicJsxElementName(node.name)) return;

      const alreadyHas = node.attributes.some((a) => t.isJSXAttribute(a) && a.name.name === ATTR_NAME);
      if (alreadyHas) return;

      const line = node.loc?.start.line ?? 0;
      const col = node.loc?.start.column ?? 0;
      node.attributes.push(
        t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), t.stringLiteral(`${normPath}:${line}:${col}`)),
      );
    },
  });

  const output = generate(ast, { retainLines: true }, code);
  if (output.code !== code) {
    await fs.promises.writeFile(filePath, output.code, 'utf8');
  }
}

async function instrumentMarkupFile(filePath) {
  const html = await fs.promises.readFile(filePath, 'utf8');
  const normPath = filePath.replace(/\\/g, '/');
  const result = instrumentMarkupSnippet(html, normPath, 0);
  if (result !== html) {
    await fs.promises.writeFile(filePath, result, 'utf8');
  }
}

async function instrumentVueFile(filePath) {
  const source = await fs.promises.readFile(filePath, 'utf8');
  const normPath = filePath.replace(/\\/g, '/');
  const updated = replaceTagBlockContents(source, 'template', (content, lineOffset) =>
    instrumentMarkupSnippet(content, normPath, lineOffset),
  );
  if (updated !== source) {
    await fs.promises.writeFile(filePath, updated, 'utf8');
  }
}

async function instrumentGlimmerTemplateFile(filePath) {
  const source = await fs.promises.readFile(filePath, 'utf8');
  const normPath = filePath.replace(/\\/g, '/');
  const updated = replaceTagBlockContents(source, 'template', (content, lineOffset) =>
    instrumentMarkupSnippet(content, normPath, lineOffset),
  );
  if (updated !== source) {
    await fs.promises.writeFile(filePath, updated, 'utf8');
  }
}

async function instrumentAstroFile(filePath) {
  const source = await fs.promises.readFile(filePath, 'utf8');
  const normPath = filePath.replace(/\\/g, '/');
  const fm = splitAstroFrontmatter(source);
  const instrumented = instrumentMarkupSnippet(fm.template, normPath, fm.lineOffset);
  const updated = `${fm.prefix}${instrumented}`;
  if (updated !== source) {
    await fs.promises.writeFile(filePath, updated, 'utf8');
  }
}

function instrumentMarkupSnippet(source, normPath, lineOffset) {
  const lineLookup = createLineLookup(source);
  let result = '';
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      const stop = end === -1 ? source.length : end + 3;
      result += source.slice(index, stop);
      index = stop;
      continue;
    }

    if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9);
      const stop = end === -1 ? source.length : end + 3;
      result += source.slice(index, stop);
      index = stop;
      continue;
    }

    const blockMarker = TEMPLATE_BLOCK_MARKERS.find(([open]) => source.startsWith(open, index));
    if (blockMarker) {
      const end = source.indexOf(blockMarker[1], index + blockMarker[0].length);
      const stop = end === -1 ? source.length : end + blockMarker[1].length;
      result += source.slice(index, stop);
      index = stop;
      continue;
    }

    if (source[index] !== '<') {
      result += source[index];
      index += 1;
      continue;
    }

    if (index + 1 >= source.length || ['/','!','?','%'].includes(source[index + 1])) {
      result += source[index];
      index += 1;
      continue;
    }

    const tagNameStart = index + 1;
    let tagNameEnd = tagNameStart;
    while (tagNameEnd < source.length && /[A-Za-z0-9:_-]/.test(source[tagNameEnd])) tagNameEnd += 1;

    if (tagNameEnd === tagNameStart) {
      result += source[index];
      index += 1;
      continue;
    }

    const tagName = source.slice(tagNameStart, tagNameEnd);
    const tagNameLower = tagName.toLowerCase();
    const tagEnd = findTagEnd(source, tagNameEnd);

    if (tagEnd === -1) {
      result += source.slice(index);
      break;
    }

    const originalTag = source.slice(index, tagEnd + 1);
    const shouldInstrument = isInstrumentableMarkupTag(tagNameLower, originalTag);
    const { line, column } = lineLookup(index);
    const location = `${normPath}:${line + lineOffset}:${column}`;
    const updatedTag = shouldInstrument
      ? injectAttributeIntoTag(originalTag, `${ATTR_NAME}="${location}"`)
      : originalTag;

    result += updatedTag;
    index = tagEnd + 1;

    if (RAW_TEXT_TAGS.has(tagNameLower) && !/\/\s*>$/.test(originalTag)) {
      const closeTag = `</${tagNameLower}`;
      const closeIndex = source.toLowerCase().indexOf(closeTag, index);
      if (closeIndex === -1) {
        result += source.slice(index);
        break;
      }
      result += source.slice(index, closeIndex);
      index = closeIndex;
    }
  }

  return result;
}

function replaceTagBlockContents(source, tagName, transform) {
  const pattern = new RegExp(`(<${tagName}\\b[^>]*>)([\\s\\S]*?)(<\\/${tagName}>)`, 'gi');
  return source.replace(pattern, (full, openTag, content, closeTag, offset) => {
    const contentOffset = offset + openTag.length;
    const lineOffset = source.slice(0, contentOffset).split(/\r?\n/).length - 1;
    return `${openTag}${transform(content, lineOffset)}${closeTag}`;
  });
}

function splitAstroFrontmatter(source) {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return { prefix: '', template: source, lineOffset: 0 };
  return {
    prefix: match[0],
    template: source.slice(match[0].length),
    lineOffset: match[0].split(/\r?\n/).length - 1,
  };
}

function createLineLookup(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (starts[mid] <= offset) lo = mid + 1;
      else hi = mid - 1;
    }
    const lineIndex = Math.max(0, hi);
    return { line: lineIndex + 1, column: offset - starts[lineIndex] };
  };
}

function findTagEnd(source, startIndex) {
  let quote = '';
  let braceDepth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; continue; }
    if (ch === '{') { braceDepth++; continue; }
    if (ch === '}') { braceDepth = Math.max(0, braceDepth - 1); continue; }
    if (ch === '>' && braceDepth === 0) return i;
  }
  return -1;
}

function isInstrumentableMarkupTag(tagName, tagSource) {
  if (!tagName) return false;
  if (SKIP_HTML_TAGS.has(tagName)) return false;
  if (TEMPLATE_NAMESPACE_PREFIXES.some((p) => tagName.startsWith(p))) return false;
  if (!/^[a-z]/.test(tagName)) return false;
  if (new RegExp(`\\b${ATTR_NAME}\\s*=`, 'i').test(tagSource)) return false;
  return true;
}

function injectAttributeIntoTag(tagSource, attrSource) {
  if (/\/\s*>$/.test(tagSource)) {
    return tagSource.replace(/\s*\/\s*>$/, ` ${attrSource} />`);
  }
  return tagSource.replace(/>$/, ` ${attrSource}>`);
}
