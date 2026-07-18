"use client";

import { FormEvent, useState } from "react";

const ERC721_TRANSFER_ABI = [{ type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] }] as const;

export function TitleTransferModal({ tokenId, owner, onClose }: { tokenId: string; owner: string; onClose: () => void }) {
  const [recipient, setRecipient] = useState(""); const [status, setStatus] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) { setStatus("Enter a valid EVM wallet address."); return; }
    if (!window.ethereum) { setStatus("Connect an EVM wallet to transfer this title."); return; }
    try {
      setBusy(true); setStatus("Requesting wallet approval…");
      const contract = process.env.NEXT_PUBLIC_TITLE_NFT_ADDRESS;
      if (!contract) throw new Error("NEXT_PUBLIC_TITLE_NFT_ADDRESS is not configured.");
      const { encodeFunctionData } = await import("viem");
      const hash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from: owner, to: contract, data: encodeFunctionData({ abi: ERC721_TRANSFER_ABI, functionName: "safeTransferFrom", args: [owner as `0x${string}`, recipient as `0x${string}`, BigInt(tokenId)] }) }] });
      setStatus(`Transfer submitted: ${String(hash)}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Transfer could not be submitted."); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="transfer-title"><form onSubmit={submit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><div><h2 id="transfer-title" className="text-xl font-bold text-zinc-900">Send title</h2><p className="mt-1 text-sm text-zinc-500">Transfer NFT #{tokenId} using your connected wallet.</p></div><button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-900" aria-label="Close">✕</button></div><label className="mt-6 block text-sm font-medium text-zinc-700">Recipient wallet address<input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-600" /></label>{status && <p className="mt-3 break-all rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">{status}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-600">Cancel</button><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Submitting…" : "Send title"}</button></div></form></div>;
}
