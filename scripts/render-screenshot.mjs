import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const COMMAND = 'npx @mscode-pl/email-lint examples';
const FONT_SIZE = 14;
const LINE_HEIGHT = 21;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const PADDING = 24;

const COLORS = {
  background: '#0d1117',
  text: '#e6edf3',
  dim: '#8b949e',
  red: '#ff7b72',
  yellow: '#e3b341',
  green: '#3fb950',
};

function run() {
  try {
    return execFileSync(process.execPath, ['dist/cli/main.js', 'examples'], {
      env: { ...process.env, FORCE_COLOR: '1', COLUMNS: '100' },
      encoding: 'utf8',
    });
  } catch (error) {
    // Exit code 1 only means the example has errors, which is the point of the screenshot.
    return error.stdout;
  }
}

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toSpans(line) {
  const spans = [];
  const state = { bold: false, dim: false, underline: false, color: null };
  for (const part of line.split(/(\u001b\[\d+m)/)) {
    const code = part.match(/^\u001b\[(\d+)m$/)?.[1];
    if (code) {
      const n = Number(code);
      if (n === 1) state.bold = true;
      if (n === 2) state.dim = true;
      if (n === 22) state.bold = state.dim = false;
      if (n === 4) state.underline = true;
      if (n === 24) state.underline = false;
      if (n === 31) state.color = 'red';
      if (n === 32) state.color = 'green';
      if (n === 33) state.color = 'yellow';
      if (n === 39) state.color = null;
      continue;
    }
    if (!part) continue;
    const fill = COLORS[state.color ?? (state.dim ? 'dim' : 'text')];
    const attrs = [`fill="${fill}"`];
    if (state.bold) attrs.push('font-weight="700"');
    if (state.underline) attrs.push('text-decoration="underline"');
    spans.push(`<tspan ${attrs.join(' ')}>${escapeXml(part)}</tspan>`);
  }
  return spans.join('');
}

const output = run().replaceAll('\\', '/').trimEnd();
const lines = [`\u001b[2m$\u001b[22m ${COMMAND}`, '', ...output.split('\n')];
const visible = (s) => s.replace(/\u001b\[\d+m/g, '');
const width = Math.ceil(Math.max(...lines.map((l) => visible(l).length)) * CHAR_WIDTH + PADDING * 2);
const height = lines.length * LINE_HEIGHT + PADDING * 2 - (LINE_HEIGHT - FONT_SIZE);

const text = lines
  .map((line, i) => {
    const y = PADDING + FONT_SIZE + i * LINE_HEIGHT;
    return `  <text x="${PADDING}" y="${y}" xml:space="preserve">${toSpans(line)}</text>`;
  })
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="email-lint output for an example email">
  <rect width="100%" height="100%" rx="10" fill="${COLORS.background}"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="${FONT_SIZE}">
${text}
  </g>
</svg>
`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/screenshot.svg', svg);
console.log(`docs/screenshot.svg ${width}x${height}`);
