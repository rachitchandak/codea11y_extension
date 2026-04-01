(function initContrastAnalyzer() {
  const SKIP_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const FALLBACK_BG = { r: 255, g: 255, b: 255, a: 1 };

  function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }
  function clampCh(v) { return Math.max(0, Math.min(255, Math.round(v))); }
  function clampA(v) { return Math.max(0, Math.min(1, v)); }

  function colorToCss(c) {
    if (!c) return 'rgba(0,0,0,0)';
    const r = clampCh(c.r), g = clampCh(c.g), b = clampCh(c.b);
    const a = clampA(Number.isFinite(c.a) ? c.a : 1);
    return a >= 0.999 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${round(a, 3)})`;
  }

  function parseCssColor(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'transparent') return { ...FALLBACK_BG, a: 0 };
    if (raw.startsWith('#')) {
      const hex = raw.slice(1);
      if (![3,4,6,8].includes(hex.length)) return { ...FALLBACK_BG, a: 0 };
      const expand = (s) => s.length === 1 ? s + s : s;
      const read = (s) => Number.parseInt(expand(s), 16);
      if (hex.length <= 4) {
        return { r: read(hex[0]), g: read(hex[1]), b: read(hex[2]), a: hex.length === 4 ? round(read(hex[3]) / 255, 3) : 1 };
      }
      return { r: read(hex.slice(0,2)), g: read(hex.slice(2,4)), b: read(hex.slice(4,6)), a: hex.length === 8 ? round(read(hex.slice(6,8)) / 255, 3) : 1 };
    }
    const m = raw.match(/rgba?\(([^)]+)\)/);
    if (!m) return { ...FALLBACK_BG, a: 0 };
    const parts = m[1].split(',').map((p) => p.trim());
    if (parts.length < 3) return { ...FALLBACK_BG, a: 0 };
    const toCh = (p) => p.endsWith('%') ? clampCh((parseFloat(p) / 100) * 255) : clampCh(parseFloat(p));
    return { r: toCh(parts[0]), g: toCh(parts[1]), b: toCh(parts[2]), a: parts[3] == null ? 1 : clampA(parseFloat(parts[3])) };
  }

  function composite(fg, bg) {
    const fa = clampA(Number.isFinite(fg?.a) ? fg.a : 1);
    const ba = clampA(Number.isFinite(bg?.a) ? bg.a : 1);
    const oa = fa + ba * (1 - fa);
    if (oa <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (fg.r * fa + bg.r * ba * (1 - fa)) / oa,
      g: (fg.g * fa + bg.g * ba * (1 - fa)) / oa,
      b: (fg.b * fa + bg.b * ba * (1 - fa)) / oa,
      a: oa,
    };
  }

  function srgbToLinear(v) {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  }

  function luminance(c) {
    return 0.2126 * srgbToLinear(clampCh(c.r)) + 0.7152 * srgbToLinear(clampCh(c.g)) + 0.0722 * srgbToLinear(clampCh(c.b));
  }

  function contrastRatio(fg, bg) {
    const l1 = luminance(fg), l2 = luminance(bg);
    return round((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05), 2);
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    for (let c = el; c; c = c.parentElement) {
      const s = window.getComputedStyle(c);
      if (s.display === 'none' || s.visibility === 'hidden' || s.contentVisibility === 'hidden') return false;
      if (c.hasAttribute('hidden') || c.getAttribute('aria-hidden') === 'true') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }

  function buildSelector(el) {
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
  }

  function selectorHint(el) {
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
  }

  function parseSourceLoc(raw) {
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
  }

  function resolveSourceMapping(el, fallback) {
    let c = el;
    while (c) {
      const loc = parseSourceLoc(c.getAttribute('data-source-loc'));
      if (loc) {
        const rel = c === el ? 'self' : 'ancestor';
        return { strategy: rel, confidence: rel === 'self' ? 'high' : 'medium', sourceLocation: loc, matchedDomSelector: buildSelector(c) };
      }
      c = c.parentElement;
    }
    if (fallback?.sourceLocation) return { ...fallback, strategy: 'artifact-fallback', confidence: fallback.confidence === 'high' ? 'medium' : (fallback.confidence || 'low') };
    return { strategy: 'none', confidence: 'none', sourceLocation: null, matchedDomSelector: '' };
  }

  function resolveBackground(el) {
    const layers = [];
    let c = el;
    while (c) {
      if (c instanceof Element) {
        const color = parseCssColor(window.getComputedStyle(c).backgroundColor);
        if (color.a > 0) layers.push({ hint: selectorHint(c), selector: buildSelector(c), color });
      }
      c = c.parentElement;
    }
    let resolved = { ...FALLBACK_BG };
    const applied = [];
    for (let i = layers.length - 1; i >= 0; i--) {
      resolved = composite(layers[i].color, resolved);
      applied.unshift({ selectorHint: layers[i].hint, domSelector: layers[i].selector, color: colorToCss(layers[i].color) });
      if (resolved.a >= 0.98) break;
    }
    return { color: resolved, cssText: colorToCss(resolved), layers: applied };
  }

  function isLargeText(px, weight) {
    if (px >= 24) return true;
    return weight >= 700 && px >= 18.66;
  }

  function clipText(v, max) {
    const t = String(v || '').replace(/\s+/g, ' ').trim();
    return t.length <= max ? t : t.slice(0, max - 1) + '…';
  }

  function collectTextTargets(root, max) {
    if (!(root instanceof Element)) return [];
    const seen = new Set(), targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!(node.parentElement instanceof Element)) return NodeFilter.FILTER_REJECT;
        if (SKIP_TEXT_PARENTS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
        if (!String(node.textContent || '').trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (targets.length < max) {
      const node = walker.nextNode();
      if (!node) break;
      const parent = node.parentElement;
      if (!parent || !isVisible(parent)) continue;
      const key = buildSelector(parent);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      targets.push(parent);
    }
    return targets;
  }

  function analyzeTextTarget(el, fallbackMapping) {
    if (!(el instanceof Element) || !isVisible(el)) return null;
    const style = window.getComputedStyle(el);
    const rawFg = parseCssColor(style.color);
    const opacity = clampA(parseFloat(style.opacity || '1'));
    const bg = resolveBackground(el);
    const fgA = clampA(rawFg.a * opacity);
    const effectiveFg = fgA >= 0.999 ? { ...rawFg, a: 1 } : composite({ ...rawFg, a: fgA }, bg.color);
    const fontSize = round(parseFloat(style.fontSize || '0'), 2);
    const fontWeight = style.fontWeight === 'bold' ? 700 : (style.fontWeight === 'normal' ? 400 : (parseInt(style.fontWeight, 10) || 400));
    const large = isLargeText(fontSize, fontWeight);
    const required = large ? 3 : 4.5;
    const ratio = contrastRatio(effectiveFg, bg.color);
    const passes = ratio >= required;
    const mapping = resolveSourceMapping(el, fallbackMapping);

    return {
      targetType: 'text',
      text: clipText(el.textContent, 160),
      selectorHint: selectorHint(el),
      domSelector: buildSelector(el),
      contrastRatio: ratio,
      requiredRatio: required,
      passes,
      foreground: colorToCss(effectiveFg),
      background: bg.cssText,
      fontSizePx: fontSize,
      fontWeight,
      isLargeText: large,
      opacity: round(opacity, 3),
      reason: passes ? 'passes' : (large ? 'large-text-below-threshold' : 'normal-text-below-threshold'),
      sourceMapping: mapping,
      backgroundLayers: bg.layers,
    };
  }

  function analyzeArtifactContrast(root, options) {
    const max = options?.maxTextTargets ?? 24;
    const fallback = options?.sourceMapping || null;
    return collectTextTargets(root, max).map((t) => analyzeTextTarget(t, fallback)).filter(Boolean);
  }

  window.__contrastAnalyzer = { analyzeArtifactContrast };
}());
