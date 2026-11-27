import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeSelector, lint } from '../src/index.js';

const fixture = readFileSync(new URL('./fixtures/newsletter.html', import.meta.url), 'utf8');
const slugs = (html: string, clients = ['all']) => lint(html, { clients }).issues.map((i) => i.slug);

describe('lint', () => {
  it('reports features from a realistic email', () => {
    const found = slugs(fixture);
    for (const slug of [
      'css-display-flex',
      'css-gap',
      'css-variables',
      'css-unit-calc',
      'css-at-media-prefers-color-scheme',
      'css-selector-child',
      'css-pseudo-class-hover',
      'html-svg',
      'image-webp',
    ]) {
      expect(found).toContain(slug);
    }
  });

  it('points at the line where a feature is used', () => {
    const flex = lint(fixture, { clients: ['all'] }).issues.find((i) => i.slug === 'css-display-flex');
    expect(flex?.lines).toEqual([18]);
  });

  it('marks unsupported features as errors and partial ones as warnings', () => {
    const result = lint('<div style="display:flex"></div>', { clients: ['outlook.windows'] });
    const flex = result.issues.find((i) => i.slug === 'css-display-flex');
    expect(flex?.level).toBe('error');
    expect(flex?.clients.every((c) => c.family === 'outlook' && c.platform === 'windows')).toBe(true);
  });

  it('skips features supported by every selected client', () => {
    expect(slugs('<p style="color:red">Hi</p>', ['apple-mail.ios'])).not.toContain('css-color');
  });

  it('respects the ignore list', () => {
    const result = lint('<div style="display:flex"></div>', {
      clients: ['all'],
      ignore: ['css-display-flex'],
    });
    expect(result.issues.map((i) => i.slug)).not.toContain('css-display-flex');
  });

  it('does not treat keyframe steps as selectors', () => {
    const found = slugs('<style>@keyframes a { from { opacity: 0 } 50% { opacity: 1 } }</style>');
    expect(found).not.toContain('css-selector-type');
  });

  it('does not report the wrapper used for inline styles', () => {
    expect(slugs('<p style="color:red"></p>')).not.toContain('css-selector-type');
  });

  it('detects base64 images with their format', () => {
    const found = slugs('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(found).toEqual(expect.arrayContaining(['image-base64']));
  });

  it('skips baseline features unless strict', () => {
    const html = '<!DOCTYPE html><html><body><p class="a">Hi</p></body></html>';
    expect(slugs(html)).not.toContain('html-doctype');
    expect(lint(html, { clients: ['all'], strict: true }).issues.map((i) => i.slug)).toContain(
      'html-doctype',
    );
  });

  it('skips Gmail in a mobile browser unless strict or named', () => {
    const html = '<style>.a > .b { opacity: 0.5 }</style>';
    const platforms = (options: Parameters<typeof lint>[1]) =>
      lint(html, options).issues.flatMap((i) => i.clients.map((c) => `${c.family}.${c.platform}`));

    expect(platforms({ clients: ['gmail'] })).not.toContain('gmail.mobile-webmail');
    expect(platforms({ clients: ['gmail'], strict: true })).toContain('gmail.mobile-webmail');
    expect(platforms({ clients: ['gmail.mobile-webmail'] })).toContain('gmail.mobile-webmail');
  });

  it('reports CSS that fails to parse instead of throwing', () => {
    const result = lint('<style>.a { color: red</style>');
    expect(result.parseErrors).toHaveLength(1);
  });
});

describe('analyzeSelector', () => {
  it('detects combinators', () => {
    expect(analyzeSelector('.a > .b + .c ~ .d .e')).toMatchObject({
      child: true,
      adjacent: true,
      generalSibling: true,
      descendant: true,
    });
  });

  it('ignores combinators inside pseudo-class arguments', () => {
    expect(analyzeSelector('p:not(.a > .b)')).toMatchObject({ child: false, type: true });
  });

  it('detects grouping and chaining', () => {
    expect(analyzeSelector('.a.b, #c')).toMatchObject({ grouping: true, chaining: true, id: true });
  });
});
