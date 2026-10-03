/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRGeneratorProps {
  batchId: string;
  size?: number;
  baseUrl?: string;
  showUrlText?: boolean;
}

export const QRGenerator: React.FC<QRGeneratorProps> = ({
  batchId,
  size = 180,
  baseUrl = 'https://agritrust.io/provenance',
  showUrlText = true,
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fullUrl = `${baseUrl}/${batchId}`;

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(fullUrl, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (isMounted) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to render QR code');
        }
      });

    return () => {
      isMounted = false;
    };
  }, [fullUrl, size]);

  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `agritrust-qr-${batchId}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col items-center text-center space-y-3"
      data-testid="qr-generator-container"
    >
      <div className="relative p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center">
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR Code for batch ${batchId}`}
            width={size}
            height={size}
            className="rounded-md"
            data-testid="provenance-qr-image"
          />
        ) : error ? (
          <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-rose-500">
            {error}
          </div>
        ) : (
          <div className="w-[180px] h-[180px] flex items-center justify-center text-xs text-slate-400 animate-pulse">
            Generating Label QR...
          </div>
        )}
      </div>

      {showUrlText && (
        <div className="w-full">
          <span className="text-[11px] font-mono text-slate-500 block truncate max-w-[240px] mx-auto bg-slate-50 px-2 py-1 rounded border border-slate-200">
            {fullUrl}
          </span>
        </div>
      )}

      <div className="flex gap-2 w-full justify-center">
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{copied ? 'Copied URL!' : 'Copy Link'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={!dataUrl}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Download Label</span>
        </button>
      </div>
    </div>
  );
};
