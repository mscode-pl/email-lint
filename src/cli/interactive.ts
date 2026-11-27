import { access, readFile, writeFile } from 'node:fs/promises';
import * as p from '@clack/prompts';
import { DEFAULT_CLIENTS } from '../core/clients.js';
import { loadDataset } from '../core/data.js';
import { lint } from '../core/lint.js';
import { painter } from './colors.js';
import { CONFIG_FILE } from './config.js';
import { findCandidates, resolveFiles } from './files.js';
import {
  fileSummary,
  formatIssue,
  hasFindings,
  render,
  summary,
  type FileResult,
  type Format,
} from './format.js';

const POPULAR = ['gmail', 'outlook', 'apple-mail', 'yahoo', 'samsung-email', 'thunderbird'];
const MANUAL = '<manual>';

function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(130);
  }
  return value as Exclude<T, symbol>;
}

async function askForFiles(): Promise<{ pattern: string; files: string[] }> {
  const spin = p.spinner();
  spin.start('Looking for email templates');
  const candidates = await findCandidates();
  spin.stop(
    candidates.length
      ? `Found HTML in ${candidates.length} ${candidates.length === 1 ? 'folder' : 'folders'}`
      : 'No HTML files found in this folder',
  );

  while (true) {
    let pattern: string = MANUAL;
    if (candidates.length) {
      pattern = answer(
        await p.select<string>({
          message: 'Which emails should be checked?',
          options: [
            ...candidates.slice(0, 8).map((c) => ({
              value: c.pattern,
              label: c.label,
              hint: `${c.count} ${c.count === 1 ? 'file' : 'files'}`,
            })),
            { value: MANUAL, label: 'Enter a path or glob' },
          ],
        }),
      );
    }
    if (pattern === MANUAL) {
      pattern = answer(
        await p.text({
          message: 'Path, folder or glob',
          placeholder: 'emails/**/*.html',
          validate: (v) => (v?.trim() ? undefined : 'Enter a path'),
        }),
      ).trim();
    }

    const files = await resolveFiles([pattern]);
    if (files.length) return { pattern, files };
    p.log.warn(`No HTML files match "${pattern}". Try another path.`);
  }
}

async function askForClients(): Promise<string[]> {
  const { family } = loadDataset().nicenames;
  const ordered = [...POPULAR, ...Object.keys(family).filter((f) => !POPULAR.includes(f))];
  return answer(
    await p.multiselect({
      message: 'Which email clients matter to you?',
      options: ordered.map((f) => ({ value: f, label: family[f] ?? f })),
      initialValues: DEFAULT_CLIENTS,
      required: true,
    }),
  );
}

function showDetails(result: FileResult) {
  const paint = painter();
  const lines = [
    paint('underline', result.file),
    '',
    ...result.parseErrors.map((e) => `line ${e.line}  ${paint('red', 'parse')}  ${e.message}`),
    ...result.issues.flatMap((issue) => [...formatIssue(issue, paint, ''), '']),
  ];
  p.log.message(lines.join('\n').trimEnd());
}

async function saveReport(results: FileResult[]) {
  const format = answer(
    await p.select<Format>({
      message: 'Report format',
      options: [
        { value: 'markdown', label: 'Markdown', hint: 'for a pull request or an issue' },
        { value: 'json', label: 'JSON', hint: 'for scripts' },
        { value: 'text', label: 'Plain text' },
      ],
    }),
  );
  const extension = { markdown: 'md', json: 'json', text: 'txt', github: 'txt' }[format];
  const path = answer(
    await p.text({
      message: 'Save as',
      initialValue: `email-lint-report.${extension}`,
      validate: (v) => (v?.trim() ? undefined : 'Enter a file name'),
    }),
  ).trim();
  await writeFile(path, render(results, format, { paint: painter(false), verbose: true }));
  p.log.success(`Saved ${path}`);
}

async function saveConfig(pattern: string, clients: string[]) {
  const exists = await access(CONFIG_FILE).then(
    () => true,
    () => false,
  );
  if (exists) {
    const overwrite = answer(await p.confirm({ message: `${CONFIG_FILE} exists. Overwrite it?` }));
    if (!overwrite) return;
  }
  await writeFile(CONFIG_FILE, `${JSON.stringify({ files: [pattern], clients }, null, 2)}\n`);
  p.log.success(`Saved ${CONFIG_FILE}. Running email-lint with no arguments in CI now uses it.`);
}

function command(pattern: string, clients: string[]) {
  const isDefault =
    clients.length === DEFAULT_CLIENTS.length && DEFAULT_CLIENTS.every((c) => clients.includes(c));
  const quoted = /[\s*?{}]/.test(pattern) ? `"${pattern}"` : pattern;
  return ['npx @mscode-pl/email-lint', quoted, ...(isDefault ? [] : [`--clients ${clients.join(',')}`])].join(' ');
}

export async function runInteractive(): Promise<number> {
  p.intro('email-lint');

  const { pattern, files } = await askForFiles();
  const clients = await askForClients();

  const spin = p.spinner();
  spin.start(`Checking ${files.length} ${files.length === 1 ? 'file' : 'files'}`);
  const results: FileResult[] = [];
  for (const file of files) {
    results.push({ file, ...lint(await readFile(file, 'utf8'), { clients }) });
  }
  spin.stop(summary(results));

  const withFindings = results.filter(hasFindings);
  if (withFindings.length) {
    p.log.message(results.map((r) => `${r.file}  ${fileSummary(r)}`).join('\n'));
  }

  while (true) {
    const action = answer(
      await p.select({
        message: 'What next?',
        options: [
          ...(withFindings.length > 1 ? [{ value: 'file', label: 'Show details for one file' }] : []),
          ...(withFindings.length
            ? [{ value: 'all', label: withFindings.length > 1 ? 'Show details for all files' : 'Show details' }]
            : []),
          ...(withFindings.length ? [{ value: 'report', label: 'Save the report to a file' }] : []),
          { value: 'config', label: `Save these settings to ${CONFIG_FILE}` },
          { value: 'done', label: 'Done' },
        ],
      }),
    );

    if (action === 'done') break;
    if (action === 'all') withFindings.forEach(showDetails);
    if (action === 'report') await saveReport(results);
    if (action === 'config') await saveConfig(pattern, clients);
    if (action === 'file') {
      const file = answer(
        await p.select({
          message: 'Which file?',
          options: withFindings.map((r) => ({ value: r.file, label: r.file, hint: fileSummary(r) })),
        }),
      );
      showDetails(withFindings.find((r) => r.file === file)!);
    }
  }

  p.note(command(pattern, clients), 'The same check as one command');
  p.outro('Done');
  return 0;
}
