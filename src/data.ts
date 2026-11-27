import { readFileSync } from 'node:fs';

export type SupportValue = string;

export interface Feature {
  slug: string;
  title: string;
  category: 'css' | 'html' | 'image' | 'others';
  url: string;
  /** family -> platform -> version -> support value ("y", "n", "a #1", "u") */
  stats: Record<string, Record<string, Record<string, SupportValue>>>;
  notes_by_num: Record<string, string> | null;
}

export interface Dataset {
  source: string;
  last_update_date: string;
  nicenames: {
    family: Record<string, string>;
    platform: Record<string, string>;
  };
  data: Feature[];
}

let cached: Dataset | undefined;

export function loadDataset(): Dataset {
  cached ??= JSON.parse(
    readFileSync(new URL('../data/caniemail.json', import.meta.url), 'utf8'),
  ) as Dataset;
  return cached;
}
