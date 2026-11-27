import { readFile } from 'node:fs/promises';

export const CONFIG_FILE = 'email-lint.config.json';

export type FailOn = 'error' | 'warning' | 'never';
export const FAIL_ON: FailOn[] = ['error', 'warning', 'never'];

export interface Config {
  files?: string[];
  clients?: string[];
  ignore?: string[];
  strict?: boolean;
  failOn?: FailOn;
}

const KEYS = ['files', 'clients', 'ignore', 'strict', 'failOn'];

function stringList(value: unknown, key: string, path: string) {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${path}: "${key}" must be an array of strings.`);
  }
  return value as string[];
}

export async function loadConfig(path?: string): Promise<Config> {
  const file = path ?? CONFIG_FILE;
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (!path && (error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Cannot read config ${file}: ${(error as Error).message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file} must contain a JSON object.`);
  }

  const obj = data as Record<string, unknown>;
  const unknown = Object.keys(obj).filter((k) => !KEYS.includes(k));
  if (unknown.length) {
    throw new Error(`${file}: unknown option ${unknown.join(', ')}. Allowed: ${KEYS.join(', ')}.`);
  }

  const config: Config = {};
  if (obj.files !== undefined) config.files = stringList(obj.files, 'files', file);
  if (obj.clients !== undefined) config.clients = stringList(obj.clients, 'clients', file);
  if (obj.ignore !== undefined) config.ignore = stringList(obj.ignore, 'ignore', file);
  if (obj.strict !== undefined) {
    if (typeof obj.strict !== 'boolean') throw new Error(`${file}: "strict" must be true or false.`);
    config.strict = obj.strict;
  }
  if (obj.failOn !== undefined) {
    if (!FAIL_ON.includes(obj.failOn as FailOn)) {
      throw new Error(`${file}: "failOn" must be one of ${FAIL_ON.join(', ')}.`);
    }
    config.failOn = obj.failOn as FailOn;
  }
  return config;
}
