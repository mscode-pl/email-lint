import { readFileSync } from 'node:fs';

export type FixKind = 'must-fix' | 'degradation';

export interface Fix {
  kind: FixKind;
  text: string;
}

interface FixTable {
  rows: { pattern: RegExp; fix: Fix }[];
  fallback: string;
}

let cached: FixTable | undefined;

export function parseFixes(markdown: string): FixTable {
  const rows: FixTable['rows'] = [];
  const fallback: string[] = [];
  let section: FixKind | 'fallback' | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^## (.+)$/);
    if (heading) {
      const title = heading[1].toLowerCase();
      section = title.startsWith('must fix')
        ? 'must-fix'
        : title.startsWith('acceptable')
          ? 'degradation'
          : title.startsWith('anything not listed')
            ? 'fallback'
            : undefined;
      continue;
    }
    if (section === 'fallback') {
      if (line.trim()) fallback.push(line.trim());
      continue;
    }
    if (!section || !line.startsWith('|')) continue;

    const [first, ...rest] = line.slice(1, line.lastIndexOf('|')).split('|');
    const slugs = [...first.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const text = rest.join('|').trim();
    if (!slugs.length || !text) continue;
    for (const slug of slugs) {
      const source = slug.replace(/[.+?^${}()[\]\\]/g, '\\$&').replaceAll('*', '.*');
      rows.push({ pattern: new RegExp(`^${source}$`), fix: { kind: section, text } });
    }
  }
  return { rows, fallback: fallback.join(' ') };
}

function table(): FixTable {
  cached ??= parseFixes(
    readFileSync(new URL('../../skills/email-lint/references/fixes.md', import.meta.url), 'utf8'),
  );
  return cached;
}

export function findFix(slug: string): Fix | undefined {
  return table().rows.find((row) => row.pattern.test(slug))?.fix;
}

export function fallbackAdvice(): string {
  return table().fallback;
}
