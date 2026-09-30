import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig, CONFIG } from '../config/env';

export type OllamaFailure = 'timeout' | 'unreachable' | 'bad_response' | 'model_missing';

export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaFailure,
    message: string,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}

export interface ChatJsonResult {
  value: unknown;
  latencyMs: number;
  /** Kept for logging when the safety gate rejects the output. */
  raw: string;
}

/**
 * Thin client for a local Ollama daemon.
 *
 * There is no API key in this file because there is no API key: the daemon
 * runs on the host and nothing leaves the machine. What this class does care
 * about is failing fast and failing legibly — a timeout, a refused connection
 * and a malformed reply are three different problems and the tutor handles
 * them the same way (fall back) but reports them separately.
 */
@Injectable()
export class OllamaClient {
  private readonly logger = new Logger(OllamaClient.name);

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  private get tutor() {
    return this.config.tutor;
  }

  private async request(path: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    const url = `${this.tutor.baseUrl}${path}`;
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs ?? this.tutor.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new OllamaError('timeout', `${path} exceeded ${timeoutMs ?? this.tutor.timeoutMs}ms`);
      }
      throw new OllamaError('unreachable', `cannot reach ${url}: ${(err as Error).message}`);
    }
  }

  async version(): Promise<string | null> {
    try {
      const res = await this.request('/api/version', undefined, 3000);
      if (!res.ok) return null;
      const body = (await res.json()) as { version?: string };
      return body.version ?? null;
    } catch {
      return null;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await this.request('/api/tags', undefined, 4000);
      if (!res.ok) return [];
      const body = (await res.json()) as { models?: { name?: string }[] };
      return (body.models ?? []).map((m) => m.name ?? '').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Loads the model into memory at boot.
   *
   * Ollama unloads after five idle minutes; the next request then pays a full
   * load, which for a 9 GB model is twenty seconds or more and reads as a hang.
   * Paying it once at startup, where nobody is waiting, is the whole trick.
   */
  async warmup(): Promise<boolean> {
    try {
      const res = await this.request(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: this.tutor.model,
            stream: false,
            keep_alive: this.tutor.keepAlive,
            think: false,
            options: { num_predict: 1 },
            messages: [{ role: 'user', content: 'hi' }],
          }),
        },
        // A cold load of a large model legitimately takes far longer than a
        // hint call, so warmup gets its own generous budget.
        120_000,
      );
      if (!res.ok) {
        this.logger.warn(`warmup returned ${res.status} — tutor will fall back until it recovers`);
        return false;
      }
      this.logger.log(`model ${this.tutor.model} warm, kept alive for ${this.tutor.keepAlive}`);
      return true;
    } catch (err) {
      this.logger.warn(
        `warmup failed (${(err as Error).message}) — static hints will be used until Ollama is reachable`,
      );
      return false;
    }
  }

  /**
   * One chat call constrained to a JSON schema.
   *
   * `format` makes the daemon constrain decoding, so the model *cannot* emit a
   * reply that violates the shape. That removes parse failures as a class and
   * lets the safety gate spend its effort on meaning instead of brackets.
   */
  async chatJson(system: string, user: string, schema: unknown): Promise<ChatJsonResult> {
    const startedAt = Date.now();

    const res = await this.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.tutor.model,
        stream: false,
        keep_alive: this.tutor.keepAlive,
        format: schema,
        // Suppresses chain-of-thought on reasoning models. Harmless elsewhere.
        think: false,
        options: {
          temperature: this.tutor.temperature,
          num_predict: this.tutor.numPredict,
        },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (res.status === 404) {
      throw new OllamaError(
        'model_missing',
        `model "${this.tutor.model}" is not pulled — run: ollama pull ${this.tutor.model}`,
      );
    }
    if (!res.ok) {
      throw new OllamaError('bad_response', `ollama returned ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { message?: { content?: string } };
    const raw = body.message?.content ?? '';
    if (!raw.trim()) {
      throw new OllamaError('bad_response', 'ollama returned an empty message');
    }

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new OllamaError('bad_response', `reply was not JSON: ${raw.slice(0, 200)}`);
    }

    return { value, latencyMs: Date.now() - startedAt, raw };
  }
}
