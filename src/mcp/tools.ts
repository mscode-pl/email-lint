import { readFile } from 'node:fs/promises';
import { painter } from '../cli/colors.js';
import { loadConfig } from '../cli/config.js';
import { resolveFiles } from '../cli/files.js';
import { formatText, groupClients, type FileResult } from '../cli/format.js';
import { DEFAULT_CLIENTS, parseClients, unsupportedClients } from '../core/clients.js';
import { loadDataset } from '../core/data.js';
import { lint, type LintOptions } from '../core/lint.js';
import { fallbackAdvice, findFix } from './fixes.js';

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export class ToolInputError extends Error {}

const CLIENTS_DESCRIPTION =
  'Email clients to check: a family (gmail, outlook, apple-mail, yahoo, samsung-email, thunderbird, protonmail, wp-pl, ...), a family and platform (outlook.windows) or "all". Defaults to email-lint.config.json, then to ' +
  `${DEFAULT_CLIENTS.join(', ')}. Pass only clients the audience of the email uses.`;

export const TOOLS = [
  {
    name: 'lint_email',
    title: 'Lint email HTML',
    description:
      'Check email HTML against caniemail.com support data and list the CSS and HTML features that Outlook, Gmail, Apple Mail and other clients do not support, with line numbers, affected clients and caniemail notes. Pass rendered HTML (React Email, MJML and Maizzle must be built first; laravel-react-email Blade output and plain HTML can be linted directly). With neither html nor path, lints the files from email-lint.config.json. Follow up with explain_feature for a fix.',
    inputSchema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Email HTML to check. Use this or path.' },
        path: {
          type: 'string',
          description:
            'File, folder or glob relative to the working directory, e.g. "emails/out" or "resources/views/react-email/**/*.blade.php". Folders are searched for .html and .htm files. Use this or html.',
        },
        clients: { type: 'array', items: { type: 'string' }, description: CLIENTS_DESCRIPTION },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Feature slugs to skip, e.g. ["css-border-radius"].',
        },
        strict: {
          type: 'boolean',
          description:
            'Also report baseline features every email needs (doctype, <style>, class selectors) and Gmail in a mobile browser. Leave off unless a full audit is asked for.',
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'explain_feature',
    title: 'Explain an email feature',
    description:
      'Explain one feature reported by lint_email: which clients lack support, the caniemail notes, whether it breaks the email (must fix) or only drops decoration (acceptable degradation), and how to fix it.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Feature slug from lint_email, e.g. "css-display-flex".' },
        clients: { type: 'array', items: { type: 'string' }, description: CLIENTS_DESCRIPTION },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

const text = (value: string, extra: Partial<ToolResult> = {}): ToolResult => ({
  content: [{ type: 'text', text: value }],
  ...extra,
});

function optionalString(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new ToolInputError(`"${key}" must be a non-empty string.`);
  return value;
}

function optionalList(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ToolInputError(`"${key}" must be an array of strings.`);
  }
  return value as string[];
}

async function lintEmail(args: Record<string, unknown>): Promise<ToolResult> {
  const html = optionalString(args, 'html');
  const path = optionalString(args, 'path');
  if (html && path) throw new ToolInputError('Pass either "html" or "path", not both.');
  if (args.strict !== undefined && typeof args.strict !== 'boolean') {
    throw new ToolInputError('"strict" must be true or false.');
  }

  const config = await loadConfig();
  const options: LintOptions = {
    clients: optionalList(args, 'clients') ?? config.clients,
    ignore: optionalList(args, 'ignore') ?? config.ignore,
    strict: (args.strict as boolean | undefined) ?? config.strict,
  };

  const results: FileResult[] = [];
  if (html) {
    results.push({ file: '<html>', ...lint(html, options) });
  } else {
    const patterns = path ? [path] : (config.files ?? []);
    if (!patterns.length) {
      throw new ToolInputError('Pass "html" or "path". There is no email-lint.config.json with "files" to fall back on.');
    }
    const files = await resolveFiles(patterns);
    if (!files.length) {
      throw new ToolInputError(`No HTML files found for ${patterns.join(' ')} in ${process.cwd()}.`);
    }
    for (const file of files) results.push({ file, ...lint(await readFile(file, 'utf8'), options) });
  }

  return text(formatText(results, { verbose: true, paint: painter(false) }));
}

async function explainFeature(args: Record<string, unknown>): Promise<ToolResult> {
  const slug = optionalString(args, 'slug');
  if (!slug) throw new ToolInputError('"slug" is required.');

  const dataset = loadDataset();
  const feature = dataset.data.find((f) => f.slug === slug);
  if (!feature) {
    const words = slug.split('-').filter((w) => w.length > 2 && !['css', 'html'].includes(w));
    const similar = dataset.data
      .filter((f) => words.some((w) => f.slug.includes(w)))
      .slice(0, 8)
      .map((f) => f.slug);
    throw new ToolInputError(
      `Unknown feature "${slug}".${similar.length ? ` Similar: ${similar.join(', ')}.` : ''}`,
    );
  }

  const config = await loadConfig();
  const selection = parseClients(optionalList(args, 'clients') ?? config.clients, dataset, config.strict);
  const clients = unsupportedClients(feature, dataset, selection);
  const unsupported = groupClients(clients, 'unsupported');
  const partial = groupClients(clients, 'partial');
  const notes = [...new Set(clients.flatMap((c) => c.notes))];
  const fix = findFix(slug);

  const out = [`${feature.title.trim()} (${slug})`, feature.url, ''];
  if (!clients.length) out.push('Supported in every selected client.');
  if (unsupported) out.push(`Not supported: ${unsupported}`);
  if (partial) out.push(`Partial support: ${partial}`);
  if (notes.length) out.push('', 'Notes:', ...notes.map((n) => `- ${n}`));
  out.push('');
  if (fix?.kind === 'must-fix') out.push('Must fix: the email breaks or loses content without support.', fix.text);
  else if (fix) out.push('Acceptable degradation: only decoration is lost without support.', fix.text);
  else out.push('No stock fix for this feature.', fallbackAdvice());

  return text(out.join('\n'));
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    if (name === 'lint_email') return await lintEmail(args);
    if (name === 'explain_feature') return await explainFeature(args);
  } catch (error) {
    return text(error instanceof Error ? error.message : String(error), { isError: true });
  }
  throw new ToolInputError(`Unknown tool "${name}".`);
}
