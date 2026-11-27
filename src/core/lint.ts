import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element as DomElement } from 'domhandler';
import postcss, { type AtRule as AtRuleNode, type ChildNode as CssNode, type Root } from 'postcss';
import { BASELINE_FEATURES } from './baseline.js';
import { loadDataset, type Feature } from './data.js';
import { buildRules, type Rule } from './rules.js';
import { analyzeSelector } from './selectors.js';
import { parseClients, unsupportedClients, type ClientSupport } from './clients.js';

export interface LintOptions {
  clients?: string[];
  ignore?: string[];
  strict?: boolean;
}

export interface Issue {
  slug: string;
  title: string;
  url: string;
  category: Feature['category'];
  level: 'error' | 'warning';
  lines: number[];
  clients: ClientSupport[];
}

export interface ParseError {
  line: number;
  message: string;
}

export interface LintResult {
  issues: Issue[];
  errors: number;
  warnings: number;
  parseErrors: ParseError[];
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  apng: 'image-apng',
  avif: 'image-avif',
  bmp: 'image-bmp',
  gif: 'image-gif',
  heic: 'image-heif',
  heif: 'image-heif',
  ico: 'image-ico',
  jpg: 'image-jpg',
  jpeg: 'image-jpg',
  mp4: 'image-mp4',
  png: 'image-png',
  svg: 'image-svg',
  tif: 'image-tiff',
  tiff: 'image-tiff',
  webp: 'image-webp',
};

// Outlook for Windows renders with Word and skips everything between these two comments.
const WORD_PLATFORMS = new Set(['outlook.windows', 'outlook.windows-mail']);
const NOT_MSO_START = /^\[if\s+!mso\]>\s*<!/i;
const NOT_MSO_END = /^\s*<!\[endif\]\s*$/i;

let rulesCache: Map<string, Rule> | undefined;

export function lint(html: string, options: LintOptions = {}): LintResult {
  const dataset = loadDataset();
  rulesCache ??= buildRules(dataset.data);
  const rules = [...rulesCache];
  const selection = parseClients(options.clients, dataset, options.strict);

  const unknown = (options.ignore ?? []).filter((slug) => !dataset.data.some((f) => f.slug === slug));
  if (unknown.length) {
    throw new Error(`Unknown feature slug in ignore list: ${unknown.join(', ')}.`);
  }
  const ignored = new Set([...(options.ignore ?? []), ...(options.strict ? [] : BASELINE_FEATURES)]);

  const hits = new Map<string, { lines: Set<number>; seenByWord: boolean }>();
  const parseErrors: ParseError[] = [];
  const lineOf = lineLocator(html);
  let hiddenFromWord = false;

  const hit = (slug: string, line: number) => {
    if (ignored.has(slug)) return;
    let entry = hits.get(slug);
    if (!entry) hits.set(slug, (entry = { lines: new Set(), seenByWord: false }));
    entry.lines.add(line);
    if (!hiddenFromWord) entry.seenByWord = true;
  };

  const checkUrl = (url: string, line: number) => {
    const value = url.trim().replace(/^['"]|['"]$/g, '');
    const dataUri = value.match(/^data:image\/([a-z0-9.+-]+)[;,]/i);
    if (dataUri) {
      hit('image-base64', line);
      const format = IMAGE_EXTENSIONS[dataUri[1].toLowerCase().replace('+xml', '')];
      if (format) hit(format, line);
      return;
    }
    const ext = value.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (ext && IMAGE_EXTENSIONS[ext]) hit(IMAGE_EXTENSIONS[ext], line);
  };

  const checkCss = (root: Root, baseLine: number, inline: boolean) => {
    const lineFor = (node: CssNode) => baseLine + (node.source?.start?.line ?? 1) - 1;

    root.walk((node) => {
      const line = lineFor(node);
      if (node.type === 'comment') {
        hit('css-comments', line);
      } else if (node.type === 'atrule') {
        const at = { name: node.name.toLowerCase(), params: node.params };
        for (const [slug, rule] of rules) if (rule.atRule?.(at)) hit(slug, line);
      } else if (node.type === 'rule') {
        if (node.parent?.type === 'rule') hit('css-nesting', line);
        if (inline || insideKeyframes(node)) return;
        const info = analyzeSelector(node.selector);
        for (const [slug, rule] of rules) if (rule.selector?.(info)) hit(slug, line);
      } else if (node.type === 'decl') {
        const decl = {
          prop: node.prop.toLowerCase().replace(/^-(webkit|moz|ms|o)-/, ''),
          value: stripStrings(node.value),
          important: node.important === true,
        };
        for (const [slug, rule] of rules) if (rule.decl?.(decl)) hit(slug, line);
        for (const match of node.value.matchAll(/url\(([^)]*)\)/gi)) checkUrl(match[1], line);
      }
    });
  };

  const parseCss = (css: string, baseLine: number, inline: boolean) => {
    try {
      // Inline styles are wrapped so postcss sees a rule; the wrapper selector is never checked.
      const root = postcss.parse(inline ? `x{${css}}` : css);
      checkCss(root, baseLine, inline);
    } catch (error) {
      const err = error as { line?: number; reason?: string; message: string };
      parseErrors.push({
        line: baseLine + (err.line ?? 1) - 1,
        message: `CSS: ${err.reason ?? err.message}`,
      });
    }
  };

  const walk = (nodes: ChildNode[]) => {
    for (const node of nodes) {
      const line = lineOf(node.startIndex ?? 0);

      if (node.type === 'comment') {
        if (NOT_MSO_START.test(node.data)) hiddenFromWord = true;
        else if (NOT_MSO_END.test(node.data)) hiddenFromWord = false;
        hit('html-comments', line);
        continue;
      }
      if (node.type === 'directive') {
        if (/^!doctype\s+html\s*$/i.test(node.data)) hit('html-doctype', line);
        continue;
      }
      if (node.type !== 'tag' && node.type !== 'style' && node.type !== 'script') continue;

      const el = node as DomElement;
      const element = { tag: el.name.toLowerCase(), attrs: el.attribs };
      for (const [slug, rule] of rules) if (rule.element?.(element)) hit(slug, line);

      if (element.attrs.style) parseCss(element.attrs.style, line, true);
      if (element.tag === 'img' && element.attrs.src) checkUrl(element.attrs.src, line);
      if (element.attrs.background) checkUrl(element.attrs.background, line);
      if (element.attrs.srcset) {
        for (const candidate of element.attrs.srcset.split(',')) {
          checkUrl(candidate.trim().split(/\s+/)[0], line);
        }
      }

      if (element.tag === 'style') {
        const text = el.children.map((c) => ('data' in c ? c.data : '')).join('');
        const start = el.children[0]?.startIndex ?? el.startIndex ?? 0;
        parseCss(text, lineOf(start), false);
        continue;
      }
      walk(el.children);
    }
  };

  walk(parseDocument(html, { withStartIndices: true }).children);

  const issues: Issue[] = [];
  for (const [slug, { lines, seenByWord }] of hits) {
    const feature = dataset.data.find((f) => f.slug === slug);
    if (!feature) continue;
    const clients = unsupportedClients(feature, dataset, selection).filter(
      (c) => seenByWord || !WORD_PLATFORMS.has(`${c.family}.${c.platform}`),
    );
    if (!clients.length) continue;
    issues.push({
      slug,
      title: feature.title.trim(),
      url: feature.url,
      category: feature.category,
      level: clients.some((c) => c.status === 'unsupported') ? 'error' : 'warning',
      lines: [...lines].sort((a, b) => a - b),
      clients,
    });
  }
  issues.sort((a, b) => a.lines[0] - b.lines[0] || a.slug.localeCompare(b.slug));

  return {
    issues,
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
    parseErrors,
  };
}

function lineLocator(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (index: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function insideKeyframes(node: CssNode): boolean {
  const parent = node.parent;
  if (!parent || parent.type === 'root' || parent.type === 'document') return false;
  if (parent.type === 'atrule' && /keyframes$/i.test((parent as AtRuleNode).name)) return true;
  return insideKeyframes(parent as CssNode);
}

function stripStrings(value: string) {
  return value.replace(/"[^"]*"|'[^']*'/g, '""').replace(/url\([^)]*\)/gi, 'url()');
}
