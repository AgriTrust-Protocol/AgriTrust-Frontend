/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
'use client';

import React, { useState } from 'react';
import { CustodyEvent } from '../../types/provenance';
import { VerificationBadge } from './VerificationBadge';

interface EventCardProps {
  event: CustodyEvent;
  isExpandedInitial?: boolean;
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; text: string; badgeBg: string; border: string }> = {
  harvest: { bg: 'bg-emerald-50', text: 'text-emerald-700', badgeBg: 'bg-emerald-100', border: 'border-emerald-200' },
  processing: { bg: 'bg-blue-50', text: 'text-blue-700', badgeBg: 'bg-blue-100', border: 'border-blue-200' },
  storage: { bg: 'bg-indigo-50', text: 'text-indigo-700', badgeBg: 'bg-indigo-100', border: 'border-indigo-200' },
  transit: { bg: 'bg-amber-50', text: 'text-amber-700', badgeBg: 'bg-amber-100', border: 'border-amber-200' },
  inspection: { bg: 'bg-purple-50', text: 'text-purple-700', badgeBg: 'bg-purple-100', border: 'border-purple-200' },
  retail: { bg: 'bg-teal-50', text: 'text-teal-700', badgeBg: 'bg-teal-100', border: 'border-teal-200' },
};

export const EventCard: React.FC<EventCardProps> = ({ event, isExpandedInitial = false }) => {
  const [expanded, setExpanded] = useState<boolean>(isExpandedInitial);
  const style = EVENT_TYPE_STYLES[event.event_type] || EVENT_TYPE_STYLES.harvest;

  return (
    <div
      className={`rounded-xl border ${style.border} bg-white shadow-xs transition-all duration-200 overflow-hidden`}
      data-testid={`event-card-${event.id}`}
    >
      {/* Header bar */}
      <div
        className="p-4 cursor-pointer hover:bg-slate-50/75 flex flex-col md:flex-row md:items-center justify-between gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider ${style.badgeBg} ${style.text}`}
          >
            {event.event_type}
          </span>
          <div>
            <h4 className="font-semibold text-slate-900 text-sm md:text-base leading-tight">
              {event.title}
            </h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {new Date(event.timestamp).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {event.location.name}
              </span>
              <span className="text-slate-400">•</span>
              <span className="font-medium text-slate-700">
                Custodian: {event.custodian.name} ({event.custodian.role})
              </span>
            </div>
          </div>
        </div>

        {/* Right side verification & collapse trigger */}
        <div className="flex items-center gap-2.5 self-end md:self-center">
          <VerificationBadge eventId={event.id} merkleProof={event.merkle_proof} />
          <button
            type="button"
            aria-label={expanded ? 'Collapse event details' : 'Expand event details'}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4 text-xs md:text-sm">
          {event.notes && (
            <div>
              <span className="font-semibold text-slate-700 block mb-1">Operational Notes:</span>
              <p className="text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                {event.notes}
              </p>
            </div>
          )}

          {/* Location & Custodian details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
            <div>
              <span className="font-semibold text-slate-700 block mb-1">Facility Coordinates:</span>
              <p className="text-slate-600 font-mono text-xs">
                {event.location.lat.toFixed(5)}, {event.location.lng.toFixed(5)}
              </p>
              {event.location.address && (
                <p className="text-slate-500 text-xs mt-0.5">{event.location.address}</p>
              )}
            </div>
            <div>
              <span className="font-semibold text-slate-700 block mb-1">Signer Key / On-Chain Identity:</span>
              <p className="text-slate-600 font-mono text-xs break-all">
                {event.custodian.address}
              </p>
            </div>
          </div>

          {/* Environmental / Temperature Telemetry */}
          {event.temperature_logs && event.temperature_logs.length > 0 && (
            <div>
              <span className="font-semibold text-slate-700 block mb-1.5">
                Cold-Chain Temperature & Environment Telemetry:
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {event.temperature_logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 rounded-md bg-white border border-slate-200 shadow-2xs whitespace-nowrap"
                  >
                    <span className="text-[11px] text-slate-400 block">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span
                      className={`font-semibold text-xs ${
                        log.temp_celsius > 8 ? 'text-rose-600' : 'text-blue-600'
                      }`}
                    >
                      {log.temp_celsius.toFixed(1)} °C
                    </span>
                    {log.humidity_percent !== undefined && (
                      <span className="text-slate-500 text-[11px] ml-1.5">
                        ({log.humidity_percent}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certificates & Lab Results */}
          {event.certificates && event.certificates.length > 0 && (
            <div>
              <span className="font-semibold text-slate-700 block mb-1.5">
                Verified Certificates & Inspection Reports:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {event.certificates.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="truncate">
                        <span className="font-medium text-slate-800 text-xs block truncate">{cert.name}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">Hash: {cert.content_hash.slice(0, 14)}...</span>
                      </div>
                    </div>
                    <a
                      href={cert.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-[11px] font-medium text-slate-700 transition-colors"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Merkle Cryptographic Proof Details */}
          <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Merkle Root:</span>
              <span className="text-emerald-400 truncate max-w-[250px]">{event.merkle_proof.root}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Leaf Hash:</span>
              <span className="text-cyan-400 truncate max-w-[250px]">{event.merkle_proof.leaf}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Proof Elements:</span>
              <span className="text-slate-300">{event.merkle_proof.proof.length} nodes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
