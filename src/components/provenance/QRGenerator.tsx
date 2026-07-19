"use client";

import { useEffect, useState } from "react";
import qrcode from "qrcode";

export function QRGenerator({ batchId }: { batchId: string }) {
  const [svg, setSvg] = useState("");
  const url = `https://agritrust.io/provenance/${encodeURIComponent(batchId)}`;

  useEffect(() => {
    qrcode.toString(url, { type: "svg", margin: 1, width: 180 }).then(setSvg).catch(() => setSvg(""));
  }, [url]);

  return (
    <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="font-bold text-zinc-900">Product label QR</h2>
      <p className="mt-1 break-all text-xs text-zinc-500">{url}</p>
      <div className="mt-4 inline-block rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code for ${batchId}`} />
      <a download={`${batchId}-provenance.svg`} href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} className="mt-3 block text-sm font-semibold text-emerald-700">Download SVG</a>
    </aside>
  );
}
