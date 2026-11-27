import type { Dataset, Feature } from './data.js';

export const DEFAULT_CLIENTS = [
  'gmail',
  'outlook',
  'apple-mail',
  'yahoo',
  'samsung-email',
  'thunderbird',
];

export type Status = 'unsupported' | 'partial';

export interface ClientSupport {
  family: string;
  platform: string;
  client: string;
  status: Status;
  notes: string[];
}

// Gmail in a mobile browser drops `<style>`, so it would flag nearly every email.
export const SKIPPED_PLATFORMS = ['gmail.mobile-webmail'];

export interface ClientFilter {
  family: string;
  platform?: string;
}

export interface ClientSelection {
  include: ClientFilter[] | 'all';
  exclude: Set<string>;
}

export function parseClients(input: string[] | undefined, strict = false): ClientSelection {
  const list = (input?.length ? input : DEFAULT_CLIENTS).map((e) => e.trim().toLowerCase());
  const exclude = new Set(strict ? [] : SKIPPED_PLATFORMS.filter((p) => !list.includes(p)));
  if (list.includes('all')) return { include: 'all', exclude };
  const include = list.map((entry) => {
    const [family, platform] = entry.split('.');
    return { family, platform };
  });
  return { include, exclude };
}

function matchesFilter(selection: ClientSelection, family: string, platform: string) {
  if (selection.exclude.has(`${family}.${platform}`)) return false;
  if (selection.include === 'all') return true;
  return selection.include.some(
    (f) => f.family === family && (!f.platform || f.platform === platform),
  );
}

// Only the newest tested version of each platform counts.
export function unsupportedClients(
  feature: Feature,
  dataset: Dataset,
  selection: ClientSelection,
): ClientSupport[] {
  const result: ClientSupport[] = [];
  for (const [family, platforms] of Object.entries(feature.stats)) {
    for (const [platform, versions] of Object.entries(platforms)) {
      if (!matchesFilter(selection, family, platform)) continue;
      const values = Object.values(versions);
      const latest = values[values.length - 1];
      if (!latest) continue;

      const [flag, ...rest] = latest.trim().split(/\s+/);
      const status: Status | undefined =
        flag === 'n' ? 'unsupported' : flag === 'a' ? 'partial' : undefined;
      if (!status) continue;

      const notes = rest
        .map((ref) => feature.notes_by_num?.[ref.replace('#', '')])
        .filter((n): n is string => Boolean(n));

      result.push({
        family,
        platform,
        client: `${dataset.nicenames.family[family] ?? family} (${dataset.nicenames.platform[platform] ?? platform})`,
        status,
        notes,
      });
    }
  }
  return result;
}
