"use client";

import { useEffect, useMemo, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { ProvenanceEvent } from "./types";

const colors = { verified: "#16a34a", pending: "#d97706", failed: "#dc2626", in_transit: "#2563eb" };

export function ProvenanceMap({ events }: { events: ProvenanceEvent[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const route = useMemo(() => events.map((event) => [event.location.latitude, event.location.longitude] as [number, number]), [events]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (!containerRef.current || disposed) return;
      if (!mapRef.current) mapRef.current = L.map(containerRef.current).setView(route[0] ?? [0, 0], 5);
      const map = mapRef.current;
      if (!layerRef.current) L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;
      if (route.length > 1) L.polyline(route, { color: "#059669", weight: 4 }).addTo(layer);
      events.forEach((event) => {
        L.circleMarker([event.location.latitude, event.location.longitude], { radius: 8, color: colors[event.status], fillColor: colors[event.status], fillOpacity: 0.9 })
          .bindPopup(`<strong>${event.event_type}</strong><br />${event.location.name}<br />${event.custodian}`)
          .addTo(layer);
      });
      if (route.length) map.fitBounds(L.latLngBounds(route), { padding: [24, 24] });
    });
    return () => { disposed = true; layerRef.current?.remove(); layerRef.current = null; };
  }, [events, route]);

  return <div ref={containerRef} className="h-[420px] w-full rounded-2xl border border-zinc-200" role="img" aria-label="Supply chain route map" />;
}
