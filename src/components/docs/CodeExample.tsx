"use client";

import { useState } from "react";

const snippets = {
  JavaScript: `const response = await fetch(
  "https://api.agritrust.io/v1/provenance/batch_8K2P",
  { headers: { Authorization: "Bearer YOUR_API_KEY" } }
);
const batch = await response.json();`,
  Python: `import requests

response = requests.get(
  "https://api.agritrust.io/v1/provenance/batch_8K2P",
  headers={"Authorization": "Bearer YOUR_API_KEY"},
)
batch = response.json()`,
  Rust: `let batch = client
    .get("https://api.agritrust.io/v1/provenance/batch_8K2P")
    .bearer_auth(api_key)
    .send().await?
    .json::<Batch>().await?;`,
  cURL: `curl --request GET \\
  --url https://api.agritrust.io/v1/provenance/batch_8K2P \\
  --header 'Authorization: Bearer YOUR_API_KEY'`,
};

export function CodeExample() {
  const [language, setLanguage] = useState<keyof typeof snippets>("JavaScript");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(snippets[language]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <section className="doc-card code-example">
    <div className="section-heading"><div><p className="eyebrow">QUICK START</p><h2>Query a product&apos;s provenance</h2></div><span className="tag">GET</span></div>
    <p className="muted">Retrieve a complete, tamper-proof history for any registered batch.</p>
    <div className="code-tabs" role="tablist">
      {Object.keys(snippets).map((item) => <button key={item} onClick={() => setLanguage(item as keyof typeof snippets)} className={language === item ? "active" : ""}>{item}</button>)}
    </div>
    <div className="code-window"><button className="copy-button" onClick={copy}>{copied ? "Copied" : "Copy"}</button><pre><code>{snippets[language]}</code></pre></div>
  </section>;
}
