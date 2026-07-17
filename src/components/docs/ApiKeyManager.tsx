"use client";
import { useState } from "react";
export function ApiKeyManager() {
 const [revealed, setRevealed] = useState(false); const [revoked, setRevoked] = useState(false);
 return <section className="doc-card key-card"><div className="section-heading"><div><p className="eyebrow">ACCESS</p><h2>API keys</h2></div><button className="text-button">+ Create key</button></div><div className="key-row"><div className="key-mark">⌘</div><div><strong>Production integration</strong><small>Created Jul 12, 2026 · Full access</small></div><code>{revoked ? "Revoked" : revealed ? "ag_live_7rQ9pLm2xA6vN4" : "ag_live_••••••••••••N4"}</code>{!revoked && <button className="icon-button" aria-label="Show API key" onClick={() => setRevealed(!revealed)}>{revealed ? "◉" : "◌"}</button>}<button className="revoke" disabled={revoked} onClick={() => setRevoked(true)}>{revoked ? "Revoked" : "Revoke"}</button></div></section>
}
