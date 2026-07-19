"use client";

import { useEffect, useRef, useState } from "react";
import { persistClaimMessage } from "@/src/hooks/useClaim";
import { type ClaimMessage } from "./claimTypes";

export function ClaimChat({ claimId, initialMessages }: { claimId: string; initialMessages: ClaimMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    socket.current = new WebSocket(`${protocol}://${location.host}/api/v1/claims/${claimId}/chat`);
    socket.current.onmessage = (event) => setMessages((current) => [...current, JSON.parse(event.data) as ClaimMessage]);
    return () => socket.current?.close();
  }, [claimId]);

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    const message: ClaimMessage = { id: crypto.randomUUID(), author: "farmer", body: body.trim(), createdAt: new Date().toISOString() };
    setMessages((current) => [...current, message]);
    socket.current?.readyState === WebSocket.OPEN ? socket.current.send(JSON.stringify(message)) : undefined;
    await persistClaimMessage(claimId, message);
    setBody("");
  }

  return <section className="rounded-2xl border bg-white p-4 shadow-sm"><h2 className="font-semibold">Adjuster messages</h2><div className="mt-3 max-h-72 space-y-3 overflow-auto">{messages.map((message) => <div key={message.id} className={`rounded-2xl px-3 py-2 text-sm ${message.author === "farmer" ? "ml-auto bg-emerald-700 text-white" : "mr-auto bg-zinc-100 text-zinc-900"}`}><p>{message.body}</p><time className="mt-1 block text-xs opacity-75">{new Date(message.createdAt).toLocaleTimeString()}</time></div>)}</div><form onSubmit={sendMessage} className="mt-4 flex gap-2"><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message your adjuster" className="flex-1 rounded-lg border px-3 py-2 text-sm"/><button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Send</button></form></section>;
}
