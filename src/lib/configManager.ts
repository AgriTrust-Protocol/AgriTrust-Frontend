import { z } from "@/src/lib/zod";

export const CONFIG_RELOAD_P99_TARGET_MS = 100;
export const CONFIG_SCHEMA_VERSION = "2026-07-19";

const namePattern = /^[a-z][a-z0-9._-]{0,63}$/;

export const runtimeConfigSchema = z.object({
  schemaVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(CONFIG_SCHEMA_VERSION),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  releaseColor: z.enum(["blue", "green"]).default("blue"),
  capacityLevel: z.enum(["normal", "constrained", "critical"]).default("normal"),
  criticalPathP99TargetMs: z.number().int().min(1).max(CONFIG_RELOAD_P99_TARGET_MS).default(CONFIG_RELOAD_P99_TARGET_MS),
  featureFlags: z.record(z.boolean()).default({}),
});

export type RuntimeConfig = ReturnType<typeof runtimeConfigSchema.parse>;
export type ConfigSource<T> = () => Promise<unknown> | unknown;
export type ConfigListener<T> = (snapshot: ConfigSnapshot<T>) => void;

export interface ConfigSnapshot<T> {
  value: T;
  version: number;
  loadedAt: Date;
}

export interface ConfigValidationFailure {
  message: string;
  receivedAt: Date;
}

export interface ConfigReloadReport<T> {
  accepted: boolean;
  durationMs: number;
  snapshot: ConfigSnapshot<T>;
  failure?: ConfigValidationFailure;
}

export interface ConfigManagerOptions<T> {
  schema: { parse(value: unknown): T };
  source: ConfigSource<T>;
  initialConfig: unknown;
  onValidationFailure?: (failure: ConfigValidationFailure) => void;
  now?: () => Date;
}

export class ConfigManager<T> {
  private snapshot: ConfigSnapshot<T>;
  private failure?: ConfigValidationFailure;
  private readonly listeners = new Set<ConfigListener<T>>();
  private readonly now: () => Date;

  constructor(private readonly options: ConfigManagerOptions<T>) {
    this.now = options.now ?? (() => new Date());
    this.snapshot = {
      value: options.schema.parse(options.initialConfig),
      version: 1,
      loadedAt: this.now(),
    };
  }

  getSnapshot(): ConfigSnapshot<T> {
    return this.snapshot;
  }

  getLastValidationFailure(): ConfigValidationFailure | undefined {
    return this.failure;
  }

  subscribe(listener: ConfigListener<T>): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async reload(): Promise<ConfigReloadReport<T>> {
    const startedAt = performance.now();
    try {
      const candidate = await this.options.source();
      const value = this.options.schema.parse(candidate);
      this.failure = undefined;
      this.snapshot = {
        value,
        version: this.snapshot.version + 1,
        loadedAt: this.now(),
      };
      for (const listener of this.listeners) listener(this.snapshot);
      return { accepted: true, durationMs: performance.now() - startedAt, snapshot: this.snapshot };
    } catch (error) {
      const failure = {
        message: error instanceof Error ? error.message : "Unknown configuration validation error",
        receivedAt: this.now(),
      };
      this.failure = failure;
      this.options.onValidationFailure?.(failure);
      return {
        accepted: false,
        durationMs: performance.now() - startedAt,
        snapshot: this.snapshot,
        failure,
      };
    }
  }
}

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  const config = runtimeConfigSchema.parse(input);
  for (const name of Object.keys(config.featureFlags)) {
    if (!namePattern.test(name)) {
      throw new Error("featureFlags keys must be lowercase names using letters, numbers, dot, underscore, or hyphen");
    }
  }
  return config;
}

export function createRuntimeConfigManager(
  initialConfig: unknown,
  source: ConfigSource<RuntimeConfig>,
  onValidationFailure?: (failure: ConfigValidationFailure) => void,
): ConfigManager<RuntimeConfig> {
  return new ConfigManager({
    schema: { parse: parseRuntimeConfig },
    source,
    initialConfig,
    onValidationFailure,
  });
}
