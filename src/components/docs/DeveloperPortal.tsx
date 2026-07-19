"use client";
import { useState } from "react";
import Link from "next/link";
import { ApiPlayground } from "./ApiPlayground";
import { CodeExample } from "./CodeExample";
import { WebhookTester } from "./WebhookTester";
import { ApiKeyManager } from "./ApiKeyManager";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const sections = ["Getting started", "Authentication", "Provenance API", "Oracle data", "Settlement events", "Webhooks"];
export function DeveloperPortal({ version }: { version: string }) {
 const [search, setSearch] = useState(""); const [active, setActive] = useState("Getting started");
 return <main className="developer-portal"><header className="portal-header"><Link href="/" className="brand"><span className="brand-leaf">⌁</span><span>agritrust</span><b>DEVELOPERS</b></Link><nav><a href="#documentation">Documentation</a><a href="#api-reference">API reference</a><a href="#guides">Guides</a><a href="#status">Status <i /></a></nav><button className="sign-in">Sign in <span>→</span></button></header>
 <div className="portal-shell"><aside><div className="version-switch"><span>API {version.toUpperCase()}</span><span>⌄</span></div><div className="side-label">DOCUMENTATION</div>{sections.map((section) => <button key={section} className={active === section ? "selected" : ""} onClick={() => setActive(section)}>{section}{section === "Provenance API" && <b>›</b>}</button>)}<div className="side-label resources">RESOURCES</div><button>Changelog <b>›</b></button><button>Migration guide <b>›</b></button><button>SDKs & libraries <b>›</b></button><div className="help-box"><span>✦</span><strong>Need help?</strong><p>Talk to our developer support team.</p><a href="mailto:developers@agritrust.io">Contact support →</a></div></aside>
 <div className="content"><div className="crumb">Documentation <span>/</span> Getting started</div><div className="hero"><p className="eyebrow">AGRI TRUST API</p><h1>Build trusted food systems.</h1><p>Everything you need to integrate verifiable provenance, real-time market data, and automated settlement into your product.</p><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documentation..." /><kbd>⌘ K</kbd></div></div><div className="notice"><span>✦</span><p><b>New in {version.toUpperCase()}</b> — Enhanced batch traceability and improved webhook delivery. <a href="#changelog">Read the changelog →</a></p></div><div className="content-grid" id="documentation"><CodeExample /><ApiPlayground version={version} /><WebhookTester /><ApiKeyManager /><AnalyticsDashboard /></div></div></div></main>
}
