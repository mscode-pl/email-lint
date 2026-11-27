import type { Feature } from './data.js';
import type { SelectorInfo } from './selectors.js';

export interface Declaration {
  prop: string;
  value: string;
  important: boolean;
}

export interface AtRule {
  name: string;
  params: string;
}

export interface Element {
  tag: string;
  attrs: Record<string, string>;
}

export interface Rule {
  decl?: (d: Declaration) => boolean;
  atRule?: (a: AtRule) => boolean;
  selector?: (s: SelectorInfo) => boolean;
  element?: (e: Element) => boolean;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const props = (...names: string[]) => (d: Declaration) => names.includes(d.prop);
const propMatch = (re: RegExp) => (d: Declaration) => re.test(d.prop);
const valueMatch = (re: RegExp) => (d: Declaration) => re.test(d.value);
const declValue = (prop: string, re: RegExp) => (d: Declaration) =>
  d.prop === prop && re.test(d.value);
const media = (re: RegExp) => (a: AtRule) => a.name === 'media' && re.test(a.params);
const tags = (...names: string[]) => (e: Element) => names.includes(e.tag);
const hasAttr = (...names: string[]) => (e: Element) => names.some((n) => n in e.attrs);
const inputType = (tag: string, type: string) => (e: Element) =>
  e.tag === tag && (e.attrs.type ?? '').toLowerCase() === type;
const hrefStarts = (prefix: string) => (e: Element) =>
  e.tag === 'a' && (e.attrs.href ?? '').trim().toLowerCase().startsWith(prefix);
const keyword = (words: string) => new RegExp(`(?<![\\w-])(${words})(?![\\w-])`, 'i');
const fn = (names: string) => new RegExp(`(?<![\\w-])(${names})\\(`, 'i');

const manual: Record<string, Rule> = {
  'css-at-font-face': { atRule: (a) => a.name === 'font-face' },
  'css-at-import': { atRule: (a) => a.name === 'import' },
  'css-at-keyframes': { atRule: (a) => /^(-webkit-)?keyframes$/.test(a.name) },
  'css-at-media': { atRule: (a) => a.name === 'media' },
  'css-at-supports': { atRule: (a) => a.name === 'supports' },
  'css-at-media-device-pixel-ratio': { atRule: media(/device-pixel-ratio/i) },
  'css-at-media-hover': { atRule: media(/\((any-)?hover\b/i) },
  'css-at-media-orientation': { atRule: media(/\borientation\b/i) },
  'css-at-media-prefers-color-scheme': { atRule: media(/prefers-color-scheme/i) },
  'css-at-media-prefers-reduced-motion': { atRule: media(/prefers-reduced-motion/i) },

  'css-block-inline-size': { decl: props('block-size', 'inline-size') },
  'css-inline-size': { decl: props('inline-size') },
  'css-border-inline-block': { decl: props('border-inline', 'border-block') },
  'css-border-inline-block-longhand': {
    decl: propMatch(/^border-(inline|block)-(width|style|color)$/),
  },
  'css-border-inline-block-individual': {
    decl: propMatch(/^border-(inline|block)-(start|end)(-(width|style|color))?$/),
  },
  'css-border-radius-logical': { decl: propMatch(/^border-(start|end)-(start|end)-radius$/) },
  'css-color-scheme': { decl: props('color-scheme') },
  'css-column-layout-properties': {
    decl: propMatch(/^(columns|column-(width|span|fill|rule(-width|-style|-color)?))$/),
  },
  'css-display-flex': { decl: declValue('display', keyword('flex|inline-flex')) },
  'css-display-grid': { decl: declValue('display', keyword('grid|inline-grid')) },
  'css-display-none': { decl: declValue('display', keyword('none')) },
  'css-flex-direction': { decl: props('flex-direction') },
  'css-flex-wrap': { decl: declValue('flex-wrap', keyword('wrap|wrap-reverse')) },
  'css-font': { decl: props('font') },
  'css-gap': { decl: props('gap', 'column-gap', 'row-gap', 'grid-gap') },
  'css-grid-template': { decl: propMatch(/^grid-template/) },
  'css-important': { decl: (d) => d.important },
  'css-intrinsic-size': { decl: valueMatch(keyword('fit-content|min-content|max-content')) },
  'css-left-right-top-bottom': { decl: props('left', 'right', 'top', 'bottom') },
  'css-margin-block-start-end': { decl: props('margin-block-start', 'margin-block-end') },
  'css-margin-inline-block': { decl: props('margin-inline', 'margin-block') },
  'css-margin-inline-start-end': { decl: props('margin-inline-start', 'margin-inline-end') },
  'css-padding-block-start-end': { decl: props('padding-block-start', 'padding-block-end') },
  'css-padding-inline-block': { decl: props('padding-inline', 'padding-block') },
  'css-padding-inline-start-end': {
    decl: props('padding-inline-start', 'padding-inline-end'),
  },
  'css-modern-color': { decl: valueMatch(fn('lch|oklch|lab|oklab')) },
  'css-sytem-ui': {
    decl: valueMatch(keyword('system-ui|ui-serif|ui-sans-serif|ui-rounded|ui-monospace')),
  },
  'css-unit-calc': { decl: valueMatch(fn('calc')) },
  'css-variables': { decl: (d) => d.prop.startsWith('--') || fn('var').test(d.value) },
  'css-unit-initial': { decl: valueMatch(keyword('initial')) },

  'css-selector-grouping': { selector: (s) => s.grouping },
  'css-selector-child': { selector: (s) => s.child },
  'css-selector-adjacent-sibling': { selector: (s) => s.adjacent },
  'css-selector-general-sibling': { selector: (s) => s.generalSibling },
  'css-selector-descendant': { selector: (s) => s.descendant },
  'css-selector-type': { selector: (s) => s.type },
  'css-selector-universal': { selector: (s) => s.universal },
  'css-selector-class': { selector: (s) => s.cls },
  'css-selector-id': { selector: (s) => s.id },
  'css-selector-attribute': { selector: (s) => s.attribute },
  'css-selector-chaining': { selector: (s) => s.chaining },

  'html-address': { element: tags('address') },
  'html-base': { element: tags('base') },
  'html-h1-h6': { element: tags('h1', 'h2', 'h3', 'h4', 'h5', 'h6') },
  'html-lists': { element: tags('ul', 'ol', 'dl') },
  'html-svg': { element: tags('svg') },
  'html-semantics': {
    element: tags(
      'article', 'aside', 'details', 'figcaption', 'figure', 'footer',
      'header', 'main', 'mark', 'nav', 'section', 'summary', 'time',
    ),
  },
  'html-image-maps': { element: (e) => e.tag === 'map' || 'usemap' in e.attrs },
  'html-anchor-links': { element: hrefStarts('#') },
  'html-mailto-links': { element: hrefStarts('mailto:') },
  'html-meta-color-scheme': {
    element: (e) =>
      e.tag === 'meta' && /^(color-scheme|supported-color-schemes)$/i.test(e.attrs.name ?? ''),
  },
  'html-srcset': { element: hasAttr('srcset', 'sizes') },
  'html-command-attribute': { element: hasAttr('command', 'commandfor') },
  'html-button-reset': { element: inputType('button', 'reset') },
  'html-button-submit': { element: inputType('button', 'submit') },
  'html-input-checkbox': { element: inputType('input', 'checkbox') },
  'html-input-hidden': { element: inputType('input', 'hidden') },
  'html-input-radio': { element: inputType('input', 'radio') },
  'html-input-reset': { element: inputType('input', 'reset') },
  'html-input-submit': { element: inputType('input', 'submit') },
  'html-input-text': { element: inputType('input', 'text') },
  amp: { element: (e) => e.tag === 'html' && ('⚡4email' in e.attrs || 'amp4email' in e.attrs) },
};

const UNIT_PREFIX = String.raw`(?<![\w#.-])-?(?:\d+\.?\d*|\.\d+)`;

function autoRule(feature: Feature): Rule | undefined {
  const title = feature.title.trim();

  if (feature.category === 'css') {
    let m: RegExpMatchArray | null;
    if ((m = title.match(/^([a-z-]+)(?: property)?$/))) {
      if (m[1] === 'inert') return { element: hasAttr('inert') };
      return { decl: props(m[1]) };
    }
    if ((m = title.match(/^(::?)([a-z-]+)(\(\))?$/))) {
      const name = escape(m[2]) + (m[3] ? String.raw`\(` : '(?![\\w-])');
      // `::before` also has a legacy single-colon form.
      const re = m[1] === '::' ? new RegExp(`::?${name}`) : new RegExp(`(?<!:):${name}`);
      return { selector: (s) => re.test(s.raw) };
    }
    if (title === 'lang()') {
      return { selector: (s) => /:lang\(/.test(s.raw) };
    }
    if ((m = title.match(/^([a-z-]+)\(\)$/))) {
      return { decl: valueMatch(fn(escape(m[1]))) };
    }
    if ((m = title.match(/^([a-z%]+) unit$/))) {
      const re = new RegExp(`${UNIT_PREFIX}${escape(m[1])}${m[1] === '%' ? '' : '(?![\\w-])'}`, 'i');
      return { decl: valueMatch(re) };
    }
  }

  if (feature.category === 'html') {
    let m: RegExpMatchArray | null;
    if ((m = title.match(/^<([a-z0-9]+)> element$/))) return { element: tags(m[1]) };
    if ((m = title.match(/^([a-z-]+) attribute$/))) return { element: hasAttr(m[1]) };
  }

  return undefined;
}

export function buildRules(features: Feature[]): Map<string, Rule> {
  const rules = new Map<string, Rule>();
  for (const feature of features) {
    const rule = manual[feature.slug] ?? autoRule(feature);
    if (rule) rules.set(feature.slug, rule);
  }
  return rules;
}

export const DOCUMENT_FEATURES = new Set([
  'css-comments',
  'css-nesting',
  'html-comments',
  'html-doctype',
  'image-apng',
  'image-avif',
  'image-base64',
  'image-bmp',
  'image-gif',
  'image-heif',
  'image-ico',
  'image-jpg',
  'image-mp4',
  'image-png',
  'image-svg',
  'image-tiff',
  'image-webp',
]);
