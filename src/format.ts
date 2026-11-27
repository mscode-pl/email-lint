import { styleText } from 'node:util';
import type { ClientSupport, Status } from './support.js';
import type { LintResult } from './lint.js';

export interface FileResult extends LintResult {
  file: string;
}

function groupClients(clients: ClientSupport[], status: Status) {
  const byFamily = new Map<string, string[]>();
  for (const c of clients.filter((c) => c.status === status)) {
    const [family, platform] = c.client.split(' (');
    const list = byFamily.get(family) ?? [];
    list.push(platform.replace(/\)$/, ''));
    byFamily.set(family, list);
  }
  return [...byFamily].map(([family, platforms]) => `${family} (${platforms.join(', ')})`).join(', ');
}

export function formatText(results: FileResult[]): string {
  const out: string[] = [];
  let errors = 0;
  let warnings = 0;
  let withIssues = 0;

  for (const result of results) {
    errors += result.errors;
    warnings += result.warnings;
    if (!result.issues.length && !result.parseErrors.length) continue;
    withIssues++;

    out.push(styleText('underline', result.file));
    for (const p of result.parseErrors) {
      out.push(`  line ${p.line}  ${styleText('red', 'parse')}  ${p.message}`);
    }
    for (const issue of result.issues) {
      const level =
        issue.level === 'error' ? styleText('red', 'error  ') : styleText('yellow', 'warning');
      out.push(
        `  line ${issue.lines[0]}  ${level}  ${styleText('bold', issue.title)} ${styleText('dim', `(${issue.slug})`)}`,
      );

      const unsupported = groupClients(issue.clients, 'unsupported');
      const partial = groupClients(issue.clients, 'partial');
      if (unsupported) out.push(`    unsupported: ${unsupported}`);
      if (partial) out.push(`    partial: ${partial}`);

      const notes = new Set(issue.clients.flatMap((c) => c.notes));
      for (const note of notes) out.push(styleText('dim', `    note: ${note}`));
      const rest = issue.lines.slice(1);
      if (rest.length) out.push(`    also on ${rest.length === 1 ? 'line' : 'lines'} ${rest.join(', ')}`);
      out.push(styleText('dim', `    ${issue.url}`));
    }
    out.push('');
  }

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (!errors && !warnings) {
    out.push(styleText('green', `No issues in ${plural(results.length, 'file')}.`));
  } else {
    out.push(
      `${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${withIssues} of ${plural(results.length, 'file')}.`,
    );
  }
  return out.join('\n');
}
