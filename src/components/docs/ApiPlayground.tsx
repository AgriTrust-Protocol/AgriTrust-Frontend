"use client";

import { useState } from "react";

export function ApiPlayground({ version }: { version: string }) {
  const [key, setKey] = useState(""); const [result, setResult] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const send = () => { setLoading(true); window.setTimeout(() => { setResult(JSON.stringify({ id: "batch_8K2P", product: "Single-origin arabica", origin: "Kilimanjaro, Tanzania", verified: true, harvest_date: "2026-06-14" }, null, 2)); setLoading(false); }, 500); };
  return <section className="doc-card playground"><div className="section-heading"><div><p className="eyebrow">INTERACTIVE API</p><h2>Try the API</h2></div><span className="live-dot">Live sandbox</span></div><p className="muted">Make a live request with your sandbox API key. No setup required.</p>
    <div className="request-row"><span className="method">GET</span><code>https://api.agritrust.io/{version}/provenance/batch_8K2P</code></div>
    <label className="input-label">Authorization <span>optional</span><input value={key} onChange={(event) => setKey(event.target.value)} placeholder="Bearer YOUR_API_KEY" /></label>
    <button className="run-button" onClick={send} disabled={loading}>{loading ? "Sending request…" : "Send request"}<span>→</span></button>
    {result && <div className="response"><div><span>RESPONSE</span><b>200 OK</b></div><pre>{result}</pre></div>}
  </section>;
}
