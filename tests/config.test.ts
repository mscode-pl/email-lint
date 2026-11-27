import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/cli/config.js';

async function configFile(content: string) {
  const dir = await mkdtemp(join(tmpdir(), 'email-lint-'));
  const path = join(dir, 'email-lint.config.json');
  await writeFile(path, content);
  return path;
}

describe('loadConfig', () => {
  it('reads a valid config', async () => {
    const path = await configFile('{"files":["emails"],"clients":["gmail"],"failOn":"warning"}');
    expect(await loadConfig(path)).toEqual({
      files: ['emails'],
      clients: ['gmail'],
      failOn: 'warning',
    });
  });

  it('rejects unknown keys and wrong types', async () => {
    await expect(loadConfig(await configFile('{"client":["gmail"]}'))).rejects.toThrow(
      /unknown option client/,
    );
    await expect(loadConfig(await configFile('{"clients":"gmail"}'))).rejects.toThrow(
      /array of strings/,
    );
    await expect(loadConfig(await configFile('{"failOn":"always"}'))).rejects.toThrow(/failOn/);
  });

  it('fails on a missing file only when the path was given', async () => {
    await expect(loadConfig(join(tmpdir(), 'missing-email-lint.json'))).rejects.toThrow(/Cannot read/);
  });
});
