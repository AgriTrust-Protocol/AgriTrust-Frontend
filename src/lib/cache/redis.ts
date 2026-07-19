export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface RedisReply<T> { result?: T; error?: string; }

/** Minimal Redis REST adapter, compatible with Upstash's TLS REST endpoint. */
export class RedisRestStore implements CacheStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async get(key: string): Promise<string | null> {
    const result = await this.command<string | null>(["GET", key]);
    return result ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.command(["SET", key, value, "EX", String(ttlSeconds)]);
  }

  async delete(key: string): Promise<void> {
    await this.command(["DEL", key]);
  }

  private async command<T = unknown>(command: string[]): Promise<T> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Redis request failed with status ${response.status}`);
    const body = (await response.json()) as RedisReply<T>;
    if (body.error) throw new Error(`Redis request failed: ${body.error}`);
    return body.result as T;
  }
}
