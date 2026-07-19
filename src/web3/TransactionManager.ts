import EventEmitter from "eventemitter3";
import { mapWeb3Error } from "./errorMapper";
import { submitMulticallBatch, type ContractCall } from "./multicall";
import type { Eip1193Provider } from "./types";

export type TransactionStatus = "pending" | "submitted" | "confirmed" | "finalized" | "failed" | "reorged";

export interface ManagedTransaction {
  id: string;
  status: TransactionStatus;
  hash?: string;
  blockNumber?: number;
  confirmations: number;
  retries: number;
  error?: string;
}

export interface TransactionManagerOptions {
  provider: Eip1193Provider;
  confirmationsToFinalize?: number;
  maxRetries?: number;
  pollIntervalMs?: number;
}

export class TransactionManager extends EventEmitter<{ status: (tx: ManagedTransaction) => void }> {
  private readonly provider: Eip1193Provider;
  private readonly confirmationsToFinalize: number;
  private readonly maxRetries: number;
  private readonly pollIntervalMs: number;
  private readonly transactions = new Map<string, ManagedTransaction>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: TransactionManagerOptions) {
    super();
    this.provider = options.provider;
    this.confirmationsToFinalize = options.confirmationsToFinalize ?? 12;
    this.maxRetries = options.maxRetries ?? 3;
    this.pollIntervalMs = options.pollIntervalMs ?? 12_000;
  }

  getTransaction(id: string): ManagedTransaction | undefined {
    return this.transactions.get(id);
  }

  async submitBatch(calls: ContractCall[], options: { from: `0x${string}`; multicallAddress: `0x${string}` }): Promise<ManagedTransaction> {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const tx: ManagedTransaction = { id, status: "pending", confirmations: 0, retries: 0 };
    this.set(tx);

    while (tx.retries <= this.maxRetries) {
      try {
        tx.status = "submitted";
        tx.hash = await submitMulticallBatch(this.provider, calls, { ...options, gasBufferPercent: 20 + tx.retries * 30 });
        this.set(tx);
        this.startTracking();
        return tx;
      } catch (error) {
        tx.retries += 1;
        const message = mapWeb3Error(error);
        if (tx.retries > this.maxRetries || !/gas|intrinsic|fee/i.test(message + String((error as Error)?.message))) {
          tx.status = "failed";
          tx.error = message;
          this.set(tx);
          return tx;
        }
      }
    }
    return tx;
  }

  private async tick(): Promise<void> {
    const blockHex = await this.provider.request<string>({ method: "eth_blockNumber" });
    const currentBlock = Number(BigInt(blockHex));
    for (const tx of this.transactions.values()) {
      if (!tx.hash || (tx.status !== "submitted" && tx.status !== "confirmed")) continue;
      const receipt = await this.provider.request<{ blockNumber?: `0x${string}`; status?: `0x${string}` } | null>({ method: "eth_getTransactionReceipt", params: [tx.hash] });
      if (!receipt) continue;
      if (receipt.status === "0x0") {
        tx.status = "failed";
        tx.error = "Transaction reverted on-chain.";
      } else if (!receipt.blockNumber && tx.blockNumber) {
        tx.status = "reorged";
      } else {
        tx.blockNumber = Number(BigInt(receipt.blockNumber ?? "0x0"));
        tx.confirmations = Math.max(0, currentBlock - tx.blockNumber + 1);
        tx.status = tx.confirmations >= this.confirmationsToFinalize ? "finalized" : "confirmed";
      }
      this.set(tx);
    }
  }

  private startTracking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.pollIntervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private set(tx: ManagedTransaction): void {
    this.transactions.set(tx.id, { ...tx });
    this.emit("status", { ...tx });
  }
}
