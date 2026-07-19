export type DeadLetterReason = "non_retryable" | "retry_exhausted" | "handler_error" | "expired";

export interface FailedMessage<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  occurredAt: string;
  attempts: number;
  lastError: string;
  reason: DeadLetterReason;
  source: string;
  correlationId?: string;
  replayable: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface DeadLetterStore<TPayload = unknown> {
  put(message: FailedMessage<TPayload>): Promise<void>;
  get(id: string): Promise<FailedMessage<TPayload> | undefined>;
  list(): Promise<FailedMessage<TPayload>[]>;
  delete(id: string): Promise<void>;
}

export interface DeadLetterMetric {
  name: "dead_letter_message_stored" | "dead_letter_message_replayed" | "dead_letter_message_discarded";
  value: number;
  tags: Record<string, string | number | boolean>;
}

export interface DeadLetterQueueOptions<TPayload = unknown> {
  store?: DeadLetterStore<TPayload>;
  now?: () => number;
  onMetric?: (metric: DeadLetterMetric) => void;
}

export class InMemoryDeadLetterStore<TPayload = unknown> implements DeadLetterStore<TPayload> {
  private readonly messages = new Map<string, FailedMessage<TPayload>>();

  async put(message: FailedMessage<TPayload>): Promise<void> {
    this.messages.set(message.id, { ...message });
  }

  async get(id: string): Promise<FailedMessage<TPayload> | undefined> {
    const message = this.messages.get(id);
    return message ? { ...message } : undefined;
  }

  async list(): Promise<FailedMessage<TPayload>[]> {
    return Array.from(this.messages.values(), (message) => ({ ...message }));
  }

  async delete(id: string): Promise<void> {
    this.messages.delete(id);
  }
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown message processing failure";
}

export class DeadLetterQueue<TPayload = unknown> {
  private readonly store: DeadLetterStore<TPayload>;
  private readonly now: () => number;
  private readonly onMetric?: (metric: DeadLetterMetric) => void;

  constructor(options: DeadLetterQueueOptions<TPayload> = {}) {
    this.store = options.store ?? new InMemoryDeadLetterStore<TPayload>();
    this.now = options.now ?? Date.now;
    this.onMetric = options.onMetric;
  }

  async enqueue(input: Omit<FailedMessage<TPayload>, "occurredAt" | "lastError"> & { error: unknown }): Promise<FailedMessage<TPayload>> {
    const { error, ...failedMessage } = input;
    const message: FailedMessage<TPayload> = {
      ...failedMessage,
      occurredAt: new Date(this.now()).toISOString(),
      lastError: safeErrorMessage(error),
    };
    await this.store.put(message);
    this.onMetric?.({
      name: "dead_letter_message_stored",
      value: 1,
      tags: { source: message.source, type: message.type, reason: message.reason, replayable: message.replayable },
    });
    return message;
  }

  async replay(id: string, handler: (message: FailedMessage<TPayload>) => Promise<void>): Promise<boolean> {
    const message = await this.store.get(id);
    if (!message || !message.replayable) return false;
    await handler(message);
    await this.store.delete(id);
    this.onMetric?.({ name: "dead_letter_message_replayed", value: 1, tags: { source: message.source, type: message.type } });
    return true;
  }

  async discard(id: string): Promise<boolean> {
    const message = await this.store.get(id);
    if (!message) return false;
    await this.store.delete(id);
    this.onMetric?.({ name: "dead_letter_message_discarded", value: 1, tags: { source: message.source, type: message.type, reason: message.reason } });
    return true;
  }

  list(): Promise<FailedMessage<TPayload>[]> {
    return this.store.list();
  }
}
