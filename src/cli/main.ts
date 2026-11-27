#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DEFAULT_CLIENTS } from '../core/clients.js';
import { loadDataset } from '../core/data.js';
import { lint, type LintOptions } from '../core/lint.js';
import { painter } from './colors.js';
import { CONFIG_FILE, FAIL_ON, loadConfig, type FailOn } from './config.js';
import { resolveFiles } from './files.js';
import { FORMATS, formatFromPath, onlyErrors, render, type FileResult, type Format } from './format.js';
import { runInteractive } from './interactive.js';

const HELP = `Usage: email-lint [files, folders or globs...] [options]

Checks email HTML against caniemail.com support data.
Run without arguments in a terminal for an interactive mode.

Options:
  -c, --clients <list>   Clients to check, e.g. gmail,outlook.windows or all
                         (default: ${DEFAULT_CLIENTS.join(',')})
  -i, --ignore <list>    Feature slugs to skip, e.g. css-display-flex
      --strict           Also report baseline features (doctype, <body>, <style>,
                         class selectors) and Gmail in a mobile browser
  -f, --format <type>    ${FORMATS.join(', ')} (default: text)
  -o, --output <file>    Also save the report; format follows the extension
                         (.json, .md, anything else is plain text)
      --verbose          Show caniemail notes and links for every issue
  -q, --quiet            Report errors only
      --fail-on <level>  ${FAIL_ON.join(', ')} (default: error)
      --config <file>    Config file (default: ${CONFIG_FILE} if present)
      --stdin            Read HTML from stdin
  -v, --version          Print version and data date
  -h, --help             Show this help

Examples:
  email-lint dist/emails
  email-lint "resources/views/emails/**/*.html" --clients gmail,outlook
  email-lint emails -o email-report.md
  cat email.html | email-lint --stdin --format json`;

const list = (value: string | undefined) =>
  value?.split(',').map((s) => s.trim()).filter(Boolean);

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function version() {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  return `${pkg.version} (caniemail data: ${loadDataset().last_update_date})`;
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      clients: { type: 'string', short: 'c' },
      ignore: { type: 'string', short: 'i' },
      strict: { type: 'boolean' },
      verbose: { type: 'boolean', default: false },
      quiet: { type: 'boolean', short: 'q', default: false },
      format: { type: 'string', short: 'f', default: 'text' },
      output: { type: 'string', short: 'o' },
      'fail-on': { type: 'string' },
      config: { type: 'string' },
      stdin: { type: 'boolean', default: false },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(version());
    return 0;
  }

  const config = await loadConfig(values.config);
  const patterns = positionals.length ? positionals : (config.files ?? []);

  if (!patterns.length && !values.stdin) {
    if (process.stdin.isTTY && process.stdout.isTTY) return runInteractive();
    console.log(HELP);
    return 2;
  }

  const format = values.format as Format;
  if (!FORMATS.includes(format)) {
    console.error(`Unknown format "${values.format}". Use ${FORMATS.join(', ')}.`);
    return 2;
  }
  const failOn = (values['fail-on'] ?? config.failOn ?? 'error') as FailOn;
  if (!FAIL_ON.includes(failOn)) {
    console.error(`Unknown --fail-on "${failOn}". Use ${FAIL_ON.join(', ')}.`);
    return 2;
  }

  const options: LintOptions = {
    clients: list(values.clients) ?? config.clients,
    ignore: list(values.ignore) ?? config.ignore,
    strict: values.strict ?? config.strict,
  };

  let results: FileResult[] = [];
  if (values.stdin) {
    results.push({ file: '<stdin>', ...lint(await readStdin(), options) });
  } else {
    const files = await resolveFiles(patterns);
    if (!files.length) {
      console.error(`No HTML files found for: ${patterns.join(' ')}`);
      return 2;
    }
    for (const file of files) {
      results.push({ file, ...lint(await readFile(file, 'utf8'), options) });
    }
  }

  if (values.quiet) results = onlyErrors(results);

  console.log(render(results, format, { verbose: values.verbose }));
  if (values.output) {
    const report = render(results, formatFromPath(values.output), { paint: painter(false), verbose: true });
    await writeFile(values.output, report);
    if (format === 'text') console.log(`Report saved to ${values.output}`);
  }

  const errors = results.reduce((n, r) => n + r.errors, 0);
  const warnings = results.reduce((n, r) => n + r.warnings, 0);
  if (failOn === 'error' && errors) return 1;
  if (failOn === 'warning' && (errors || warnings)) return 1;
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
