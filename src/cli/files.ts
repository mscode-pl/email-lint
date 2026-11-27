import { glob, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const SKIP_DIRS = /(^|[\\/])(node_modules|vendor|\.git|coverage)([\\/]|$)/;

const toPosix = (p: string) => p.replaceAll('\\', '/');

export async function resolveFiles(patterns: string[]): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of patterns) {
    const info = await stat(pattern).catch(() => undefined);
    if (info?.isFile()) {
      files.add(pattern);
      continue;
    }
    const source = info?.isDirectory()
      ? `${toPosix(pattern).replace(/\/+$/, '')}/**/*.{html,htm}`
      : toPosix(pattern);
    for await (const file of glob(source, { exclude: (f) => SKIP_DIRS.test(f) })) {
      files.add(file);
    }
  }
  return [...files].sort();
}

export interface Candidate {
  pattern: string;
  label: string;
  count: number;
}

export async function findCandidates(cwd = '.'): Promise<Candidate[]> {
  const byDir = new Map<string, number>();
  for await (const file of glob('**/*.{html,htm}', { cwd, exclude: (f) => SKIP_DIRS.test(f) })) {
    const dir = toPosix(dirname(file));
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }

  const candidates: Candidate[] = [...byDir].map(([dir, count]) => ({
    pattern: dir,
    label: dir === '.' ? './' : `${dir}/`,
    count,
  }));

  let blade = 0;
  for await (const _ of glob('resources/views/react-email/**/*.blade.php', { cwd })) blade++;
  if (blade) {
    candidates.push({
      pattern: 'resources/views/react-email/**/*.blade.php',
      label: 'resources/views/react-email/ (laravel-react-email build)',
      count: blade,
    });
  }

  return candidates.sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern));
}
