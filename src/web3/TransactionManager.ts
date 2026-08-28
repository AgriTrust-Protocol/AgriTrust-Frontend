import EventEmitter from "eventemitter3";
import { createPublicClient, http, type PublicClient } from "viem";
import type { ContractCall, Eip1193Provider, EvmChainId, TrackedTransaction } from "./types";
import { getEvmChain } from "./chains";
import { estimateBatchGas, buildBatchTransaction } from "./multicall";
import { mapWeb3Error } from "./errorMapper";

/** Blocks after confirmation before a transaction is considered safe from reorg. */
const DEFAULT_FINALITY_CONFIRMATIONS = 12;
const CONFIRMATION_POLL_INTERVAL_MS = 4_000;

export interface TransactionManagerOptions {
  provider: Eip1193Provider;
  chainId: EvmChainId;
  finalityConfirmations?: number;
  pollIntervalMs?: number;
  /** Injectable for tests; defaults to a real viem HTTP public client for `chainId`. */
  publicClient?: PublicClient;
}

/**
 * `pending -> submitted -> confirmed -> finalized`, with `reorged` (when a
 * confirmed block gets replaced — detected by polling the receipt and
 * comparing `blockHash`, since `block.number` alone doesn't reveal a
 * reorg if the replacement block happens to be the same height) and
 * `failed` as the two terminal error states.
 *
 * Emits `"update"` with every status change (and `` `update:${id}` `` for a
 * specific transaction) so a UI can subscribe without polling this class
 * itself — `useTrade`/`WalletProvider` are the intended consumers.
 */
export class TransactionManager extends EventEmitter {
  private readonly provider: Eip1193Provider;
  private readonly chainId: EvmChainId;
  private readonly publicClient: PublicClient;
  private readonly finalityConfirmations: number;
  private readonly pollIntervalMs: number;
  private readonly transactions = new Map<string, TrackedTransaction>();
  private readonly cancelWatch = new Map<string, () => void>();

  constructor(options: TransactionManagerOptions) {
    super();
    this.provider = options.provider;
    this.chainId = options.chainId;
    this.finalityConfirmations = options.finalityConfirmations ?? DEFAULT_FINALITY_CONFIRMATIONS;
    this.pollIntervalMs = options.pollIntervalMs ?? CONFIRMATION_POLL_INTERVAL_MS;
    this.publicClient =
      options.publicClient ?? (createPublicClient({ chain: getEvmChain(options.chainId), transport: http() }) as PublicClient);
  }

  get(id: string): TrackedTransaction | undefined {
    return this.transactions.get(id);
  }

  list(): TrackedTransaction[] {
    return [...this.transactions.values()];
  }

  /**
   * Submits up to 5 contract calls as a single multicall3 transaction (see
   * multicall.ts) and tracks it through the full lifecycle. Returns the
   * internal tracking id immediately after submission attempt — subscribe
   * to `"update"` / `` `update:${id}` `` for status changes rather than
   * awaiting finality here.
   */
  async submitBatch(from: `0x${string}`, calls: ContractCall[]): Promise<string> {
    const id = crypto.randomUUID();
    const tx: TrackedTransaction = {
      id,
      hash: null,
      chainId: this.chainId,
      status: "pending",
      calls,
      submittedAt: Date.now(),
      confirmedBlockNumber: null,
      confirmedBlockHash: null,
      retries: 0,
    };
    this.transactions.set(id, tx);
    this.emitUpdate(tx);

    try {
      const gasEstimate = await estimateBatchGas(this.provider, from, calls);
      const request = await buildBatchTransaction(this.provider, from, calls);

      const hash = (await this.provider.request({
        method: "eth_sendTransaction",
        params: [{ ...request, gas: `0x${gasEstimate.toString(16)}` }],
      })) as `0x${string}`;

      tx.hash = hash;
      tx.status = "submitted";
      this.emitUpdate(tx);
      this.watchConfirmation(tx);
    } catch (error) {
      tx.status = "failed";
      tx.error = mapWeb3Error(error);
      this.emitUpdate(tx);
    }

    return id;
  }

  private watchConfirmation(tx: TrackedTransaction): void {
    if (!tx.hash) return;
    let cancelled = false;
    this.cancelWatch.set(tx.id, () => {
      cancelled = true;
    });

    const scheduleNext = () => {
      if (cancelled) return;
      const handle = setTimeout(tick, this.pollIntervalMs);
      this.cancelWatch.set(tx.id, () => {
        cancelled = true;
        clearTimeout(handle);
      });
    };

    const tick = async () => {
      if (cancelled) return;

      try {
        const receipt = await this.publicClient.getTransactionReceipt({ hash: tx.hash! });

        if (receipt.status === "reverted") {
          tx.status = "failed";
          tx.error = "Transaction reverted on-chain.";
          this.emitUpdate(tx);
          this.cancelWatch.delete(tx.id);
          return;
        }

        const isFirstConfirmation = tx.confirmedBlockHash === null;
        const reorgedAwayFromKnownBlock =
          !isFirstConfirmation && receipt.blockHash !== tx.confirmedBlockHash;

        if (isFirstConfirmation) {
          tx.status = "confirmed";
        } else if (reorgedAwayFromKnownBlock) {
          tx.status = "reorged";
        }

        if (isFirstConfirmation || reorgedAwayFromKnownBlock) {
          tx.confirmedBlockNumber = receipt.blockNumber;
          tx.confirmedBlockHash = receipt.blockHash;
          this.emitUpdate(tx);
          scheduleNext(); // keep watching — need `finalityConfirmations` more blocks from here
          return;
        }

        // Steady state: still sitting in the same block we last saw. Check finality.
        const currentBlock = await this.publicClient.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber;
        if (confirmations >= BigInt(this.finalityConfirmations)) {
          tx.status = "finalized";
          this.emitUpdate(tx);
          this.cancelWatch.delete(tx.id);
          return;
        }
      } catch {
        // Receipt not found yet (not yet mined) or a transient RPC hiccup —
        // keep polling; only an explicit "reverted" status is a failure.
      }

      scheduleNext();
    };

    void tick();
  }

  /** Stops watching a specific transaction (e.g. component unmount) without affecting others. */
  stopWatching(id: string): void {
    this.cancelWatch.get(id)?.();
    this.cancelWatch.delete(id);
  }

  private emitUpdate(tx: TrackedTransaction): void {
    const snapshot = { ...tx };
    this.emit("update", snapshot);
    this.emit(`update:${tx.id}`, snapshot);
  }

  destroy(): void {
    for (const id of [...this.cancelWatch.keys()]) this.stopWatching(id);
    this.removeAllListeners();
  }
}
