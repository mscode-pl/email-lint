import type { ClientSupport, Status } from '../core/clients.js';
import type { Issue, LintResult } from '../core/lint.js';
import { painter, type Paint } from './colors.js';

export interface FileResult extends LintResult {
  file: string;
}

export type Format = 'text' | 'json' | 'markdown' | 'github';
export const FORMATS: Format[] = ['text', 'json', 'markdown', 'github'];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function clientGroups(clients: ClientSupport[], status: Status): string[] {
  const byFamily = new Map<string, string[]>();
  for (const c of clients) {
    if (c.status !== status) continue;
    byFamily.set(c.familyName, [...(byFamily.get(c.familyName) ?? []), c.platformName]);
  }
  return [...byFamily].map(([family, platforms]) => `${family} (${platforms.join(', ')})`);
}

export function groupClients(clients: ClientSupport[], status: Status) {
  return clientGroups(clients, status).join(', ');
}

export function hasFindings(result: FileResult) {
  return result.issues.length > 0 || result.parseErrors.length > 0;
}

export function summary(results: FileResult[]) {
  const errors = results.reduce((n, r) => n + r.errors, 0);
  const warnings = results.reduce((n, r) => n + r.warnings, 0);
  if (!errors && !warnings) return `No issues in ${plural(results.length, 'file')}.`;
  const affected = results.filter(hasFindings).length;
  return `${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${affected} of ${plural(results.length, 'file')}.`;
}

export function fileSummary(result: FileResult) {
  if (!hasFindings(result)) return 'no issues';
  const parts = [plural(result.errors, 'error'), plural(result.warnings, 'warning')];
  if (result.parseErrors.length) parts.push(plural(result.parseErrors.length, 'parse error'));
  return parts.join(', ');
}

export function formatIssue(issue: Issue, paint: Paint = painter(), indent = '  '): string[] {
  const level = issue.level === 'error' ? paint('red', 'error  ') : paint('yellow', 'warning');
  const pad = `${indent}  `;
  const out = [
    `${indent}line ${issue.lines[0]}  ${level}  ${paint('bold', issue.title)} ${paint('dim', `(${issue.slug})`)}`,
  ];
  const unsupported = groupClients(issue.clients, 'unsupported');
  const partial = groupClients(issue.clients, 'partial');
  if (unsupported) out.push(`${pad}unsupported: ${unsupported}`);
  if (partial) out.push(`${pad}partial: ${partial}`);
  for (const note of new Set(issue.clients.flatMap((c) => c.notes))) {
    out.push(paint('dim', `${pad}note: ${note}`));
  }
  const rest = issue.lines.slice(1);
  if (rest.length) out.push(`${pad}also on ${rest.length === 1 ? 'line' : 'lines'} ${rest.join(', ')}`);
  out.push(paint('dim', `${pad}${issue.url}`));
  return out;
}

export interface TextOptions {
  verbose?: boolean;
  paint?: Paint;
}

function compactLines(result: FileResult, paint: Paint): string[] {
  const rows = [
    ...result.parseErrors.map((e) => ({
      line: String(e.line),
      level: paint('red', 'parse  '),
      title: e.message,
      groups: [] as string[],
      slug: '',
    })),
    ...result.issues.map((issue) => ({
      line: issue.lines.length > 1 ? `${issue.lines[0]} +${issue.lines.length - 1}` : String(issue.lines[0]),
      level: issue.level === 'error' ? paint('red', 'error  ') : paint('yellow', 'warning'),
      title: issue.title,
      groups: clientGroups(issue.clients, issue.level === 'error' ? 'unsupported' : 'partial'),
      slug: issue.slug,
    })),
  ];
  const lineWidth = Math.max(...rows.map((r) => r.line.length));
  const titleWidth = Math.min(28, Math.max(...rows.map((r) => r.title.length)));
  const indent = ' '.repeat(2 + lineWidth + 2 + 7 + 2 + titleWidth + 2);
  const room = Math.max(30, terminalWidth() - indent.length);

  return rows.map((r) => {
    const head = `  ${r.line.padStart(lineWidth)}  ${r.level}  ${paint('bold', r.title.padEnd(titleWidth))}`;
    const lines = wrapGroups(r.groups, room);
    if (r.slug) {
      const last = lines.length - 1;
      if (last >= 0 && lines[last].length + 2 + r.slug.length <= room) {
        lines[last] += `  ${paint('dim', r.slug)}`;
      } else {
        lines.push(paint('dim', r.slug));
      }
    }
    return lines.length ? `${head}  ${lines.join(`\n${indent}`)}` : head;
  });
}

function terminalWidth() {
  return Number(process.env.COLUMNS) || process.stdout.columns || 100;
}

function wrapGroups(groups: string[], width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const group of groups) {
    const next = current ? `${current}, ${group}` : group;
    if (current && next.length > width) {
      lines.push(`${current},`);
      current = group;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function formatText(results: FileResult[], options: TextOptions = {}): string {
  const paint = options.paint ?? painter();
  const out: string[] = [];
  for (const result of results.filter(hasFindings)) {
    out.push(paint('underline', result.file));
    if (options.verbose) {
      for (const e of result.parseErrors) out.push(`  line ${e.line}  ${paint('red', 'parse')}  ${e.message}`);
      for (const issue of result.issues) out.push(...formatIssue(issue, paint));
    } else {
      out.push(...compactLines(result, paint));
    }
    out.push('');
  }

  const found = results.some((r) => r.issues.length);
  out.push(found ? summary(results) : paint('green', summary(results)));
  if (found && !options.verbose) {
    out.push(paint('dim', 'Errors list clients without support, warnings list partial support. Add --verbose for notes and links.'));
  }
  return out.join('\n');
}

const cell = (text: string) => text.replaceAll('|', '\\|').replace(/\s*\n\s*/g, ' ');

export function formatMarkdown(results: FileResult[]): string {
  const out = ['# email-lint report', '', summary(results), ''];
  for (const result of results.filter(hasFindings)) {
    out.push(`## ${result.file}`, '');
    for (const e of result.parseErrors) out.push(`- Line ${e.line}: ${cell(e.message)}`);
    if (result.parseErrors.length) out.push('');
    if (result.issues.length) {
      out.push('| Line | Level | Feature | Unsupported | Partial |', '| --- | --- | --- | --- | --- |');
      for (const issue of result.issues) {
        out.push(
          `| ${issue.lines.join(', ')} | ${issue.level} | [${cell(issue.title)}](${issue.url}) | ${cell(groupClients(issue.clients, 'unsupported'))} | ${cell(groupClients(issue.clients, 'partial'))} |`,
        );
      }
      out.push('');
    }
  }
  return out.join('\n').trimEnd() + '\n';
}

// Workflow command escaping: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
const escapeData = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (s: string) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

export function formatGithub(results: FileResult[]): string {
  const out: string[] = [];
  for (const result of results) {
    const file = escapeProperty(result.file.replaceAll('\\', '/'));
    for (const e of result.parseErrors) {
      out.push(`::error file=${file},line=${e.line},title=email-lint::${escapeData(e.message)}`);
    }
    for (const issue of result.issues) {
      const unsupported = groupClients(issue.clients, 'unsupported');
      const partial = groupClients(issue.clients, 'partial');
      const message = [
        unsupported && `Not supported in ${unsupported}.`,
        partial && `Partial support in ${partial}.`,
        issue.url,
      ]
        .filter(Boolean)
        .join(' ');
      const title = escapeProperty(`email-lint: ${issue.title}`);
      for (const line of issue.lines) {
        out.push(`::${issue.level} file=${file},line=${line},title=${title}::${escapeData(message)}`);
      }
    }
  }
  out.push(summary(results));
  return out.join('\n');
}

export function render(results: FileResult[], format: Format, options: TextOptions = {}): string {
  if (format === 'json') return JSON.stringify(results, null, 2);
  if (format === 'markdown') return formatMarkdown(results);
  if (format === 'github') return formatGithub(results);
  return formatText(results, options);
}

export function onlyErrors(results: FileResult[]): FileResult[] {
  return results.map((r) => {
    const issues = r.issues.filter((i) => i.level === 'error');
    return { ...r, issues, warnings: 0 };
  });
}

export function formatFromPath(path: string): Format {
  if (/\.json$/i.test(path)) return 'json';
  if (/\.(md|markdown)$/i.test(path)) return 'markdown';
  return 'text';
}
