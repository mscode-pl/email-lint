#!/usr/bin/env node
import { glob, readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { lint } from './lint.js';
import { formatText, type FileResult } from './format.js';
import { DEFAULT_CLIENTS } from './support.js';
import { loadDataset } from './data.js';

const HELP = `Usage: email-lint [files, directories or globs...] [options]

Checks email HTML against caniemail.com support data.

Options:
  -c, --clients <list>   Comma-separated clients, e.g. gmail,outlook.windows or all
                         (default: ${DEFAULT_CLIENTS.join(',')})
  -i, --ignore <list>    Comma-separated feature slugs to skip
      --strict           Also report baseline features (doctype, <body>, <style>,
                         class selectors...) and Gmail in a mobile browser
  -f, --format <type>    text or json (default: text)
      --fail-on <level>  error, warning or never (default: error)
      --stdin            Read HTML from stdin
  -v, --version          Print version and data date
  -h, --help             Show this help

Examples:
  email-lint dist/emails
  email-lint "resources/views/emails/**/*.html" --clients gmail,outlook
  cat email.html | email-lint --stdin --format json`;

const list = (value: string | undefined) =>
  value?.split(',').map((s) => s.trim()).filter(Boolean);

async function resolveFiles(patterns: string[]): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of patterns) {
    const info = await stat(pattern).catch(() => undefined);
    if (info?.isFile()) {
      files.add(pattern);
      continue;
    }
    const source = info?.isDirectory() ? `${pattern.replace(/[\\/]+$/, '')}/**/*.{html,htm}` : pattern;
    for await (const file of glob(source.replaceAll('\\', '/'), {
      exclude: (f) => f.includes('node_modules'),
    })) {
      files.add(file);
    }
  }
  return [...files].sort();
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      clients: { type: 'string', short: 'c' },
      ignore: { type: 'string', short: 'i' },
      format: { type: 'string', short: 'f', default: 'text' },
      'fail-on': { type: 'string', default: 'error' },
      stdin: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(`${pkg.version} (caniemail data: ${loadDataset().last_update_date})`);
    return 0;
  }
  if (!['text', 'json'].includes(values.format)) {
    console.error(`Unknown format "${values.format}". Use text or json.`);
    return 2;
  }
  if (!['error', 'warning', 'never'].includes(values['fail-on'])) {
    console.error(`Unknown --fail-on "${values['fail-on']}". Use error, warning or never.`);
    return 2;
  }

  const options = {
    clients: list(values.clients),
    ignore: list(values.ignore),
    strict: values.strict,
  };
  const results: FileResult[] = [];

  if (values.stdin) {
    results.push({ file: '<stdin>', ...lint(await readStdin(), options) });
  } else {
    if (!positionals.length) {
      console.log(HELP);
      return 2;
    }
    const files = await resolveFiles(positionals);
    if (!files.length) {
      console.error(`No HTML files found for: ${positionals.join(' ')}`);
      return 2;
    }
    for (const file of files) {
      results.push({ file, ...lint(await readFile(file, 'utf8'), options) });
    }
  }

  console.log(values.format === 'json' ? JSON.stringify(results, null, 2) : formatText(results));

  const errors = results.reduce((n, r) => n + r.errors, 0);
  const warnings = results.reduce((n, r) => n + r.warnings, 0);
  if (values['fail-on'] === 'error' && errors) return 1;
  if (values['fail-on'] === 'warning' && (errors || warnings)) return 1;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  },
);
