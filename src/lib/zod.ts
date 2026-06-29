type Issue = string;

class ZodSchema<T> {
  constructor(private readonly validator: (value: unknown, path: string) => T) {}
  parse(value: unknown): T { return this.validator(value, "value"); }
  optional(): ZodSchema<T | undefined> { return new ZodSchema((value, path) => value === undefined ? undefined : this.validator(value, path)); }
  default(defaultValue: T): ZodSchema<T> { return new ZodSchema((value, path) => value === undefined ? defaultValue : this.validator(value, path)); }
}

class ZodString extends ZodSchema<string> {
  constructor(checks: Array<(value: string) => Issue | null> = []) {
    super((value, path) => {
      if (typeof value !== "string") throw new Error(`${path} must be a string`);
      for (const check of checks) {
        const issue = check(value);
        if (issue) throw new Error(`${path} ${issue}`);
      }
      return value;
    });
    this.checks = checks;
  }
  private readonly checks: Array<(value: string) => Issue | null>;
  min(length: number): ZodString { return new ZodString([...this.checks, (value) => value.length >= length ? null : `must contain at least ${length} character(s)`]); }
  url(): ZodString { return new ZodString([...this.checks, (value) => { try { new URL(value); return null; } catch { return "must be a valid URL"; } }]); }
  regex(pattern: RegExp): ZodString { return new ZodString([...this.checks, (value) => pattern.test(value) ? null : "has an invalid format"]); }
}

type InferObject<T extends Record<string, ZodSchema<unknown>>> = { [K in keyof T]: T[K] extends ZodSchema<infer U> ? U : never };

export type ZodType<T = unknown> = ZodSchema<T>;

export const z = {
  string: () => new ZodString(),
  enum: <T extends readonly [string, ...string[]]>(values: T) => new ZodSchema<T[number]>((value, path) => {
    if (typeof value !== "string" || !values.includes(value)) throw new Error(`${path} must be one of: ${values.join(", ")}`);
    return value;
  }),
  array: <T>(schema: ZodSchema<T>) => new ZodSchema<T[]>((value, path) => {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    return value.map((item) => schema.parse(item));
  }),
  object: <T extends Record<string, ZodSchema<unknown>>>(shape: T) => new ZodSchema<InferObject<T>>((value, path) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path} must be an object`);
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.parse(source[key])])) as InferObject<T>;
  }),
};
