"use client";

import { useState } from "react";

type Event = { type: string; time: string; status: string };
export function WebhookTester() {
 const [events, setEvents] = useState<Event[]>([{ type: "settlement.completed", time: "Just now", status: "200" }, { type: "oracle.price.updated", time: "2 min ago", status: "200" }]);
 const sendTest = async () => { await fetch("/api/dev/webhook-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "provenance.updated", batch: "batch_8K2P" }) }); setEvents((current) => [{ type: "provenance.updated", time: "Just now", status: "200" }, ...current]); };
 return <section className="doc-card webhook-card"><div className="section-heading"><div><p className="eyebrow">DEVELOPER TOOLS</p><h2>Webhook tester</h2></div><span className="connected"><i /> Connected</span></div><p className="muted">Send a sample event to your endpoint and inspect deliveries in real time.</p><div className="webhook-url"><span>POST</span><code>https://webhook.site/your-endpoint</code><button onClick={sendTest}>Send test</button></div><div className="event-list">{events.map((event, index) => <div className="event" key={`${event.type}-${index}`}><div className="event-icon">⌁</div><div><strong>{event.type}</strong><small>{event.time}</small></div><b>{event.status}</b></div>)}</div></section>
}
