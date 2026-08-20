"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { ClaimMessage } from "@/src/hooks/useClaim";

export function ClaimChat({ claimId, messages, onSend }: { claimId: string; messages: ClaimMessage[]; onSend: (message: ClaimMessage) => void }) {
  const [draft, setDraft] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_CLAIMS_WS_URL;
    if (!endpoint) return;
    const socket = new WebSocket(`${endpoint}?claimId=${encodeURIComponent(claimId)}`);
    socketRef.current = socket;
    socket.onmessage = (event) => { try { onSend(JSON.parse(event.data) as ClaimMessage); } catch {} };
    return () => socket.close();
  }, [claimId, onSend]);
  function submit(event: FormEvent) { event.preventDefault(); const body = draft.trim(); if (!body) return; const message = { id: crypto.randomUUID(), sender: "farmer" as const, body, createdAt: new Date().toISOString() }; socketRef.current?.send(JSON.stringify(message)); onSend(message); setDraft(""); }
  return <div className="space-y-3"><div className="max-h-64 space-y-3 overflow-y-auto rounded-lg bg-zinc-50 p-4">{messages.length ? messages.map((message) => <div key={message.id} className={`flex ${message.sender === "farmer" ? "justify-end" : "justify-start"}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${message.sender === "farmer" ? "rounded-br-sm bg-emerald-700 text-white" : "rounded-bl-sm bg-white text-zinc-800 shadow-sm"}`}><p>{message.body}</p><time className="mt-1 block text-[10px] opacity-70">{new Date(message.createdAt).toLocaleString()}</time></div></div>) : <p className="text-sm text-zinc-500">Your adjuster will appear here after assignment.</p>}</div><form onSubmit={submit} className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message your adjuster" className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm" /><button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">Send</button></form></div>;
}