/* Authorized Protocol Quality Assurance & Formal Verification Test Suite */
'use client';

import React, { useMemo, useState } from 'react';
import { CustodyEvent } from '../../types/provenance';

interface ProvenanceMapProps {
  events: CustodyEvent[];
  selectedEventId?: string | null;
  onSelectEvent?: (eventId: string) => void;
  className?: string;
}

const MARKER_COLORS: Record<string, string> = {
  harvest: '#059669', // Emerald
  processing: '#2563eb', // Blue
  storage: '#4f46e5', // Indigo
  transit: '#d97706', // Amber
  inspection: '#7c3aed', // Purple
  retail: '#0d9488', // Teal
};

export const ProvenanceMap: React.FC<ProvenanceMapProps> = ({
  events,
  selectedEventId,
  onSelectEvent,
  className = '',
}) => {
  const [hoveredEvent, setHoveredEvent] = useState<CustodyEvent | null>(null);

  // Normalize bounds for SVG / geographic rendering
  const { points, bounds } = useMemo(() => {
    if (!events.length) {
      return {
        points: [],
        bounds: { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 },
      };
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    events.forEach((e) => {
      if (e.location.lat < minLat) minLat = e.location.lat;
      if (e.location.lat > maxLat) maxLat = e.location.lat;
      if (e.location.lng < minLng) minLng = e.location.lng;
      if (e.location.lng > maxLng) maxLng = e.location.lng;
    });

    // Add padding to bounds
    const latSpan = Math.max(maxLat - minLat, 0.05);
    const lngSpan = Math.max(maxLng - minLng, 0.05);
    const pad = 0.2;

    const b = {
      minLat: minLat - latSpan * pad,
      maxLat: maxLat + latSpan * pad,
      minLng: minLng - lngSpan * pad,
      maxLng: maxLng + lngSpan * pad,
    };

    // Project lat/lng to normalized 0..1000 coordinate space
    const pts = events.map((e) => {
      const x = ((e.location.lng - b.minLng) / (b.maxLng - b.minLng)) * 800 + 100;
      const y = (1 - (e.location.lat - b.minLat) / (b.maxLat - b.minLat)) * 400 + 50;
      return { event: e, x, y };
    });

    return { points: pts, bounds: b };
  }, [events]);

  const polylinePath = useMemo(() => {
    if (points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [points]);

  return (
    <div
      className={`relative w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-md ${className}`}
      data-testid="provenance-map-container"
    >
      {/* Top Overlay Bar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 pointer-events-auto">
          <span className="text-xs font-semibold text-slate-200">
            Route Verification & Custody Markers
          </span>
          <span className="text-[11px] text-emerald-400 block">
            {events.length} waypoints registered on-chain
          </span>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-[10px] text-slate-300 pointer-events-auto">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Farm
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Processing
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> Transit
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-teal-500" /> Retail
          </span>
        </div>
      </div>

      {/* SVG Canvas Map & Polyline Route */}
      <svg
        viewBox="0 0 1000 500"
        className="w-full h-auto min-h-[300px] max-h-[480px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 select-none"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>

          {/* Grid pattern for terrain simulation */}
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" strokeOpacity="0.4" />
          </pattern>
        </defs>

        <rect width="1000" height="500" fill="url(#grid)" />

        {/* Connected Route Polyline */}
        {polylinePath && (
          <>
            <path
              d={polylinePath}
              fill="none"
              stroke="#0f172a"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={polylinePath}
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="3.5"
              strokeDasharray="6 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-pulse"
            />
          </>
        )}

        {/* Event Waypoint Markers */}
        {points.map(({ event, x, y }, idx) => {
          const isSelected = selectedEventId === event.id;
          const isHovered = hoveredEvent?.id === event.id;
          const color = MARKER_COLORS[event.event_type] || '#10b981';

          return (
            <g
              key={event.id}
              className="cursor-pointer transition-transform duration-200"
              onClick={() => onSelectEvent?.(event.id)}
              onMouseEnter={() => setHoveredEvent(event)}
              onMouseLeave={() => setHoveredEvent(null)}
              data-testid={`map-marker-${event.id}`}
            >
              {/* Outer halo */}
              {(isSelected || isHovered) && (
                <circle cx={x} cy={y} r="18" fill={color} fillOpacity="0.25" className="animate-ping" />
              )}

              {/* Marker pin circle */}
              <circle
                cx={x}
                cy={y}
                r={isSelected || isHovered ? "12" : "9"}
                fill={color}
                stroke="#ffffff"
                strokeWidth="2.5"
                filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.5))"
              />

              {/* Waypoint step number */}
              <text
                x={x}
                y={y + 3.5}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
                className="pointer-events-none"
              >
                {idx + 1}
              </text>

              {/* Label */}
              <text
                x={x}
                y={y - 15}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="10"
                fontWeight="500"
                className="pointer-events-none drop-shadow"
              >
                {event.location.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover / Selection Popup Details */}
      {(hoveredEvent || selectedEventId) && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm bg-slate-900/95 backdrop-blur-md border border-slate-700 p-3 rounded-xl text-xs text-slate-200 z-10 shadow-lg">
          {(() => {
            const ev = hoveredEvent || events.find((e) => e.id === selectedEventId);
            if (!ev) return null;
            return (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-white truncate">{ev.title}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-emerald-400">
                    {ev.event_type}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px]">
                  {ev.location.name} • {new Date(ev.timestamp).toLocaleDateString()}
                </p>
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Custodian: {ev.custodian.name}</span>
                  <span className="font-mono text-emerald-400">Proof: Verified</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
