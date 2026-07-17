import type { TransferRecord } from "./titleTypes";

const shorten = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

export function OwnershipTimeline({ history }: { history: TransferRecord[] }) {
  return (
    <ol className="relative ml-2 border-l border-emerald-100 pl-6">
      {history.map((event) => (
        <li key={event.txHash} className="relative pb-6 last:pb-0">
          <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-600" />
          <p className="text-sm font-semibold text-zinc-900">Title transferred</p>
          <p className="mt-1 text-xs text-zinc-500">{new Date(event.timestamp).toLocaleDateString(undefined, { dateStyle: "medium" })}</p>
          <p className="mt-2 text-sm text-zinc-600"><span className="font-mono">{shorten(event.from)}</span> → <span className="font-mono">{shorten(event.to)}</span></p>
          <a className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline" href={`https://sepolia.etherscan.io/tx/${event.txHash}`} target="_blank" rel="noreferrer">View transaction {shorten(event.txHash)}</a>
        </li>
      ))}
    </ol>
  );
}
