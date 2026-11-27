import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseFixes } from '../src/mcp/fixes.js';
import { handle, handleLine, PROTOCOL_VERSIONS, serve } from '../src/mcp/server.js';

const FLEX = '<table><tr><td><div style="display:flex">Hi</div></td></tr></table>';

async function call(name: string, args: Record<string, unknown>) {
  const response = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  if (!response || Array.isArray(response)) throw new Error('expected a single response');
  return response;
}

async function callText(name: string, args: Record<string, unknown>) {
  const response = await call(name, args);
  if (!('result' in response)) throw new Error(response.error.message);
  const result = response.result as { content: { text: string }[]; isError?: boolean };
  return { text: result.content[0].text, isError: result.isError ?? false };
}

describe('mcp server', () => {
  it('answers initialize with the requested protocol version and tool capability', async () => {
    const response = await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    expect(response).toMatchObject({
      id: 1,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'email-lint' } },
    });
  });

  it('falls back to its newest protocol version for an unknown one', async () => {
    const response = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(response).toMatchObject({ result: { protocolVersion: PROTOCOL_VERSIONS[0] } });
  });

  it('does not answer notifications', async () => {
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
  });

  it('lists both tools with input schemas', async () => {
    const response = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const tools = (response as { result: { tools: { name: string; inputSchema: object }[] } }).result.tools;
    expect(tools.map((t) => t.name)).toEqual(['lint_email', 'explain_feature']);
    for (const tool of tools) expect(tool.inputSchema).toMatchObject({ type: 'object' });
  });

  it('lints HTML passed inline', async () => {
    const { text, isError } = await callText('lint_email', { html: FLEX, clients: ['outlook'] });
    expect(isError).toBe(false);
    expect(text).toContain('css-display-flex');
    expect(text).toMatch(/line 1 +error/);
  });

  it('lints files from a path', async () => {
    const { text } = await callText('lint_email', { path: 'tests/fixtures/newsletter.html', clients: ['all'] });
    expect(text).toContain('tests/fixtures/newsletter.html');
    expect(text).toContain('image-webp');
  });

  it('returns tool errors the agent can act on', async () => {
    expect(await callText('lint_email', { html: FLEX, path: 'x.html' })).toMatchObject({ isError: true });
    expect(await callText('lint_email', { path: 'does-not-exist/**/*.html' })).toMatchObject({
      isError: true,
      text: expect.stringContaining('No HTML files found'),
    });
    expect(await callText('lint_email', { html: FLEX, clients: ['outlok'] })).toMatchObject({
      isError: true,
      text: expect.stringContaining('Unknown client'),
    });
  });

  it('explains a feature with its fix', async () => {
    const { text } = await callText('explain_feature', { slug: 'css-display-flex', clients: ['outlook'] });
    expect(text).toContain('Not supported: Outlook');
    expect(text).toContain('Must fix');
    expect(text).toContain('<table role="presentation">');
  });

  it('marks decoration as acceptable degradation and matches wildcard slugs', async () => {
    expect((await callText('explain_feature', { slug: 'css-border-radius' })).text).toContain('Acceptable degradation');
    expect((await callText('explain_feature', { slug: 'html-input-checkbox' })).text).toContain('hosted form');
  });

  it('suggests similar slugs for an unknown feature', async () => {
    const { text, isError } = await callText('explain_feature', { slug: 'css-flex' });
    expect(isError).toBe(true);
    expect(text).toContain('css-display-flex');
  });

  it('reports protocol errors as JSON-RPC errors', async () => {
    expect(await call('no_such_tool', {})).toMatchObject({ error: { code: -32602 } });
    expect(await handle({ jsonrpc: '2.0', id: 3, method: 'resources/list' })).toMatchObject({ error: { code: -32601 } });
    expect(await handleLine('{not json')).toMatchObject({ id: null, error: { code: -32700 } });
    expect(await handle({ id: 4 })).toMatchObject({ id: 4, error: { code: -32600 } });
  });

  it('serves newline-delimited JSON over streams', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.on('data', (chunk) => (written += chunk));

    const done = serve(input, output);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })}\n`);
    await done;

    const lines = written.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.id).sort()).toEqual([1, 2]);
  });
});

describe('fix table', () => {
  it('reads slugs and sections from the markdown', () => {
    const table = parseFixes(
      ['## Must fix', '| Slug | Fix |', '| --- | --- |', '| `a-b`, `c-*` | Do X. |', '## Acceptable degradation', '| `d` | Fine. |', '## Anything not listed', '', 'Read the notes.'].join('\n'),
    );
    expect(table.rows.map((r) => [r.pattern.source, r.fix.kind])).toEqual([
      ['^a-b$', 'must-fix'],
      ['^c-.*$', 'must-fix'],
      ['^d$', 'degradation'],
    ]);
    expect(table.fallback).toBe('Read the notes.');
  });
});
