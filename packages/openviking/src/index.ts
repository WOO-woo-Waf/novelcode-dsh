import { openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

export interface OpenVikingClientOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions { signal?: AbortSignal }
export interface AddResourceOptions extends RequestOptions {
  targetUri?: string;
  parentUri?: string;
  wait?: boolean;
  timeoutSeconds?: number;
  reason?: string;
  instruction?: string;
}
export interface OpenVikingMatch {
  uri: string;
  abstract: string;
  context_type: string;
  score: number;
  level?: number;
}
export interface IngestionResult {
  state: 'pending' | 'ready' | 'cancelled';
  root_uri?: string;
  task_id?: string;
}
export interface OpenVikingHealth { healthy: boolean; version?: string }

export class OpenVikingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'OpenVikingError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpenVikingError('Invalid OpenViking response: expected an object');
  }
  return value as Record<string, unknown>;
}

function errorMessage(value: Record<string, unknown>): string {
  const error = value.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  if (typeof value.message === 'string') return value.message;
  if (Array.isArray(value.errors)) return value.errors.map(String).join('; ');
  return 'OpenViking operation failed';
}

/** Thin independently authored HTTP adapter, not a fork of the AGPL server.
 * Contract baseline: OpenViking checkout openviking-20260907, routers/resources,
 * search, content, tasks and system; source commit is pinned in research sources.lock.
 */
export class OpenVikingClient {
  private readonly endpoint: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly apiKey: string | undefined;

  constructor(options: OpenVikingClientOptions) {
    const endpoint = new URL(options.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new TypeError('Expected HTTP(S) endpoint');
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new TypeError('timeoutMs must be positive');
    this.apiKey = options.apiKey;
  }

  private async request(path: string, init: RequestInit = {}, options: RequestOptions = {}, unwrap = true): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    signal.throwIfAborted();
    const headers = new Headers(init.headers);
    if (this.apiKey) headers.set('X-API-Key', this.apiKey);
    const response = await this.fetcher(`${this.endpoint}${path}`, { ...init, headers, signal });
    let value: Record<string, unknown>;
    try {
      value = record(await response.json());
    } catch (error) {
      signal.throwIfAborted();
      throw new OpenVikingError(`OpenViking HTTP ${response.status}: invalid JSON response`, response.status);
    }
    if (!response.ok || value.status === 'error') {
      throw new OpenVikingError(`OpenViking HTTP ${response.status}: ${errorMessage(value)}`, response.status);
    }
    if (!unwrap) return value;
    if (value.status !== 'ok' || !('result' in value)) throw new OpenVikingError('Invalid OpenViking response envelope');
    const result = value.result;
    if (result && typeof result === 'object' && 'status' in result && result.status === 'error') {
      throw new OpenVikingError(errorMessage(record(result)), response.status);
    }
    return result;
  }

  private post(path: string, body: Record<string, unknown>, options: RequestOptions): Promise<unknown> {
    return this.request(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, options);
  }

  async health(options: RequestOptions = {}): Promise<OpenVikingHealth> {
    const result = record(await this.request('/health', {}, options, false));
    return { healthy: result.healthy === true, ...(typeof result.version === 'string' ? { version: result.version } : {}) };
  }

  /** HTTP local inputs must be uploaded, never interpreted as server filesystem paths. */
  async upload(localFile: string, options: RequestOptions = {}): Promise<{ temp_file_id: string }> {
    options.signal?.throwIfAborted();
    if (!(await stat(localFile)).isFile()) throw new TypeError('Upload expects one file; sync directories file by file');
    const form = new FormData();
    form.append('file', await openAsBlob(localFile), basename(localFile));
    const result = record(await this.request('/api/v1/resources/temp_upload', { method: 'POST', body: form }, options));
    if (typeof result.temp_file_id !== 'string' || !result.temp_file_id) throw new OpenVikingError('Upload returned no temp_file_id');
    return { temp_file_id: result.temp_file_id };
  }

  async addResource(path: string, options: AddResourceOptions = {}): Promise<IngestionResult> {
    if (options.targetUri && options.parentUri) throw new TypeError('Specify targetUri or parentUri, not both');
    const source = /^https?:\/\//i.test(path)
      ? { path }
      : { ...(await this.upload(path, options)), source_name: basename(path) };
    const result = record(await this.post('/api/v1/resources', {
      ...source,
      ...(options.targetUri ? { to: options.targetUri } : {}),
      ...(options.parentUri ? { parent: options.parentUri } : {}),
      create_parent: true,
      wait: options.wait ?? false,
      ...(options.timeoutSeconds !== undefined ? { timeout: options.timeoutSeconds } : {}),
      ...(options.reason !== undefined ? { reason: options.reason } : {}),
      ...(options.instruction !== undefined ? { instruction: options.instruction } : {}),
    }, options));
    const root_uri = typeof result.root_uri === 'string' && result.root_uri ? result.root_uri : undefined;
    const task_id = typeof result.task_id === 'string' && result.task_id ? result.task_id : undefined;
    // Upstream wait=true returns completed task.result without task_id. A queued
    // result also says status=success, so that status alone cannot imply readiness.
    const successful = result.status === undefined || result.status === 'success' || result.status === 'ok';
    const state = result.status === 'cancelled' ? 'cancelled'
      : options.wait && successful && root_uri && !task_id ? 'ready' : 'pending';
    return { state, ...(root_uri ? { root_uri } : {}), ...(task_id ? { task_id } : {}) };
  }

  async resourceStatus(taskId: string, options: RequestOptions = {}): Promise<IngestionResult> {
    const task = record(await this.request(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {}, options));
    if (task.status === 'failed') throw new OpenVikingError(errorMessage(task));
    const result = task.result && typeof task.result === 'object' ? record(task.result) : {};
    if (result.status === 'error') throw new OpenVikingError(errorMessage(result));
    const root_uri = typeof result.root_uri === 'string' ? result.root_uri
      : typeof task.resource_id === 'string' ? task.resource_id : undefined;
    return {
      state: task.status === 'completed' && root_uri ? 'ready' : task.status === 'cancelled' ? 'cancelled' : 'pending',
      task_id: taskId,
      ...(root_uri ? { root_uri } : {}),
    };
  }

  async find(query: string, targetUri: string, limit = 5, options: RequestOptions = {}): Promise<OpenVikingMatch[]> {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be a positive integer');
    const result = record(await this.post('/api/v1/search/find', { query, target_uri: targetUri, limit }, options));
    const matches: OpenVikingMatch[] = [];
    for (const key of ['memories', 'resources', 'skills']) {
      const values = result[key];
      if (values !== undefined && !Array.isArray(values)) throw new OpenVikingError(`Invalid search bucket: ${key}`);
      for (const value of (values ?? []) as unknown[]) {
        const hit = record(value);
        if (typeof hit.uri !== 'string' || typeof hit.score !== 'number' || !Number.isFinite(hit.score)) {
          throw new OpenVikingError('Invalid search match');
        }
        matches.push({ uri: hit.uri, score: hit.score,
          abstract: typeof hit.abstract === 'string' ? hit.abstract : '',
          context_type: typeof hit.context_type === 'string' ? hit.context_type : key.replace(/s$/, ''),
          ...(typeof hit.level === 'number' ? { level: hit.level } : {}),
        });
      }
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async read(uri: string, options: RequestOptions & { offset?: number; limit?: number } = {}): Promise<string> {
    const params = new URLSearchParams({ uri, offset: String(options.offset ?? 0), limit: String(options.limit ?? -1) });
    const result = await this.request(`/api/v1/content/read?${params}`, {}, options);
    if (typeof result !== 'string') throw new OpenVikingError('Invalid OpenViking content: expected text');
    return result;
  }
}
