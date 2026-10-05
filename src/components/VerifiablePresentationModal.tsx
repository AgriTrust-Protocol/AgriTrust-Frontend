'use client';

import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { VerifiablePresentationPayload, downloadJsonFile } from '@/utils/vpBundler';

interface VPModalProps {
  isOpen: boolean;
  onClose: () => void;
  vpPayload: VerifiablePresentationPayload | null;
}

export default function VerifiablePresentationModal({
  isOpen,
  onClose,
  vpPayload,
}: VPModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !vpPayload) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(vpPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = `agritrust-vp-${vpPayload.provenanceGraph.targetNodeId}.json`;
    downloadJsonFile(filename, vpPayload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                W3C Verifiable Presentation Bundle
              </h3>
              <p className="text-[11px] font-mono text-slate-400">
                {vpPayload.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 border-b border-slate-800 bg-slate-950/60 px-6 py-3 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Sub-Graph Nodes</span>
            <p className="font-semibold text-slate-200">
              {vpPayload.provenanceGraph.nodes.length} Nodes ({vpPayload.provenanceGraph.lineageEdges.length} Transitions)
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Enclosed VCs</span>
            <p className="font-semibold text-emerald-400">
              {vpPayload.verifiableCredential.length} Signed Credentials
            </p>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase">Merkle Proof Digest</span>
            <p className="truncate font-mono text-slate-300">
              {vpPayload.provenanceGraph.subgraphDigest}
            </p>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden p-6">
          <div className="h-full overflow-y-auto rounded-xl border border-slate-800/80 bg-slate-950 p-4 font-mono text-[11px] leading-relaxed text-slate-300 shadow-inner">
            <pre>{JSON.stringify(vpPayload, null, 2)}</pre>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Cryptographically sealed (Ed25519)</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy JSON'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors shadow-lg"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Bundle</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
