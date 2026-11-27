import { describe, expect, it } from 'vitest';
import { formatGithub, formatMarkdown, formatText, lint, type FileResult } from '../src/index.js';
import { painter } from '../src/cli/colors.js';

const results: FileResult[] = [
  {
    file: 'emails\\welcome.html',
    ...lint('<div style="display:flex"></div>', { clients: ['outlook.windows'] }),
  },
  { file: 'emails/clean.html', ...lint('<p>Hi</p>', { clients: ['outlook.windows'] }) },
];

describe('formatters', () => {
  it('prints one line per issue without color codes when color is off', () => {
    const text = formatText(results, { paint: painter(false) });
    expect(text).toMatch(/^  1  error    display:flex +Outlook \(Windows\)  css-display-flex$/m);
    expect(text).not.toContain('\u001b[');
    expect(text).not.toContain('clean.html');
  });

  it('adds clients, notes and links in verbose mode', () => {
    const text = formatText(results, { paint: painter(false), verbose: true });
    expect(text).toContain('display:flex (css-display-flex)');
    expect(text).toContain('unsupported: Outlook (Windows)');
    expect(text).toContain('https://www.caniemail.com/features/css-display-flex/');
  });

  it('writes a Markdown table per file', () => {
    const md = formatMarkdown(results);
    expect(md).toContain('## emails\\welcome.html');
    expect(md).toContain('| 1 | error | [display:flex](https://www.caniemail.com/features/css-display-flex/) | Outlook (Windows) |');
  });

  it('writes GitHub annotations with escaped properties and forward slashes', () => {
    const lines = formatGithub(results).split('\n');
    expect(lines).toContainEqual(
      expect.stringMatching(/^::error file=emails\/welcome\.html,line=1,title=email-lint%3A display%3Aflex::Not supported in Outlook \(Windows\)\./),
    );
    expect(lines.at(-1)).toMatch(/^1 error, \d+ warnings? in 1 of 2 files\.$/);
  });
});
