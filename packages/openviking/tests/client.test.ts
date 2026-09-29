import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenVikingClient, OpenVikingError } from '../src/index.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
function ok(result: unknown): Response { return Response.json({ status: 'ok', result }); }
const endpoint = 'http://127.0.0.1:19339';
const root = 'viking://resources/novel-synthetic/source/abc';
const mockClient = (...results: Response[]) => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of results) fetch.mockResolvedValueOnce(response);
  return { client: new OpenVikingClient({ endpoint, fetch }), fetch };
};

describe('OpenViking HTTP adapter', () => {
  it('uploads a synthetic local file then ingests using temp_file_id and exact target', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'novel-ov-http-'));
    roots.push(dir);
    const source = join(dir, 'chapter.md');
    await writeFile(source, '合成小说：阿岚在城门等待。');
    const { client, fetch } = mockClient(ok({ temp_file_id: 'upload-test' }), ok({ status: 'success', root_uri: root, task_id: 'task-test' }));
    const result = await client.addResource(source, { targetUri: root });
    expect(result).toEqual({ state: 'pending', root_uri: root, task_id: 'task-test' });
    expect(fetch.mock.calls[0]?.[0]).toBe(`${endpoint}/api/v1/resources/temp_upload`);
    const form = fetch.mock.calls[0]?.[1]?.body as FormData;
    const blob = form.get('file') as Blob;
    expect(await blob.text()).toBe('合成小说：阿岚在城门等待。');
    const init = fetch.mock.calls[1]?.[1];
    expect(JSON.parse(String(init?.body))).toEqual({ temp_file_id: 'upload-test', source_name: 'chapter.md', to: root, create_parent: true, wait: false });
  });

  it('remote resources skip upload and wait=true completion requires completed result', async () => {
    const { client, fetch } = mockClient(ok({ status: 'success', root_uri: root }));
    expect(await client.addResource('https://example.test/synthetic.md', { parentUri: root, wait: true, timeoutSeconds: 12 })).toEqual({ state: 'ready', root_uri: root });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toMatchObject({ path: 'https://example.test/synthetic.md', parent: root, wait: true, timeout: 12 });
  });

  it('does not call an accepted task ready even when wait was requested', async () => {
    const { client } = mockClient(ok({ status: 'success', task_id: 'still-pending', root_uri: root }), ok({ status: 'cancelled' }), ok({}));
    expect((await client.addResource('https://example.test/source', { wait: true })).state).toBe('pending');
    expect((await client.addResource('https://example.test/source', { wait: true })).state).toBe('cancelled');
    expect((await client.addResource('https://example.test/source', { wait: true })).state).toBe('pending');
  });

  it('queries task status for completion and surfaces failure', async () => {
    const { client, fetch } = mockClient(ok({ status: 'running', resource_id: root }), ok({ status: 'completed', result: { root_uri: root } }), ok({ status: 'failed', error: 'embedding failed' }));
    expect((await client.resourceStatus('task/1')).state).toBe('pending');
    expect(fetch.mock.calls[0]?.[0]).toBe(`${endpoint}/api/v1/tasks/task%2F1`);
    expect(await client.resourceStatus('task/1')).toEqual({ state: 'ready', root_uri: root, task_id: 'task/1' });
    await expect(client.resourceStatus('task/1')).rejects.toThrow('embedding failed');
  });

  it('uses exact search contract, ranks compact matches and reads encoded URI', async () => {
    const { client, fetch } = mockClient(ok({ resources: [
      { uri: `${root}/b.md`, abstract: '旧约定', context_type: 'resource', score: 0.7, level: 2, unused: 'drop' },
      { uri: `${root}/a.md`, abstract: '人物目标', context_type: 'resource', score: 0.9, level: 2 },
    ], memories: [], skills: [], total: 2 }), ok('人物表现原文'));
    expect(await client.find('人物目标', root, 1)).toEqual([{ uri: `${root}/a.md`, abstract: '人物目标', context_type: 'resource', score: 0.9, level: 2 }]);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ query: '人物目标', target_uri: root, limit: 1 });
    expect(await client.read(`${root}/a.md`, { offset: 3, limit: 8 })).toBe('人物表现原文');
    const url = new URL(String(fetch.mock.calls[1]?.[0]));
    expect(url.pathname).toBe('/api/v1/content/read');
    expect(Object.fromEntries(url.searchParams)).toEqual({ uri: `${root}/a.md`, offset: '3', limit: '8' });
  });

  it('health is unwrapped and API key uses upstream header', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ status: 'ok', healthy: true, version: 'synthetic' }));
    const client = new OpenVikingClient({ endpoint: `${endpoint}/`, apiKey: 'synthetic-test-key', fetch });
    expect(await client.health()).toEqual({ healthy: true, version: 'synthetic' });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-API-Key')).toBe('synthetic-test-key');
  });

  it.each([
    Response.json({ status: 'error', error: { message: 'unavailable' } }, { status: 503 }),
    Response.json({ status: 'error', error: { message: 'failed despite HTTP 200' } }),
    ok({ status: 'error', errors: ['nested processing failure'] }),
    new Response('<html>not JSON</html>', { status: 502 }),
    Response.json({ unexpected: true }),
  ])('rejects transport, envelope and nested errors', async (response) => {
    const { client } = mockClient(response);
    await expect(client.read(root)).rejects.toBeInstanceOf(OpenVikingError);
  });

  it('rejects contradictory targets before sending any requests', async () => {
    const { client, fetch } = mockClient();
    await expect(client.addResource('https://example.test/source', { targetUri: root, parentUri: root })).rejects.toThrow('not both');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honors caller cancellation before sending', async () => {
    const { client, fetch } = mockClient();
    const controller = new AbortController();
    controller.abort();
    await expect(client.health({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('combines request timeout with cancellation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const client = new OpenVikingClient({ endpoint, timeoutMs: 10, fetch });
    await expect(client.health()).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});
