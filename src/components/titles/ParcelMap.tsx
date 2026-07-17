"use client";

import { useEffect, useRef, useState } from "react";
import type { LandTitle } from "./titleTypes";
import { titleStatus } from "./titleTypes";

export function ParcelMap({ parcels, selectedId, onSelect }: { parcels: LandTitle[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").Layer[]>([]);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: false }).setView([9.08, 8.68], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors" }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      leafletRef.current = L;
      mapRef.current = map;
      setIsReady(true);
    });
    return () => { active = false; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    layersRef.current.forEach((layer) => layer.remove());
    const newLayers: import("leaflet").Layer[] = [];
    parcels.forEach((parcel) => {
      const selected = parcel.tokenId === selectedId;
      const layer = leafletRef.current;
      if (!layer) return;
      const polygon = layer.polygon(parcel.coordinates, { color: selected ? "#064e3b" : titleStatus[parcel.status].color, fillColor: titleStatus[parcel.status].color, fillOpacity: selected ? 0.66 : 0.44, weight: selected ? 3 : 2 });
      polygon.bindTooltip(`<strong>${parcel.name}</strong><br/>${parcel.areaHectares} hectares`);
      polygon.on("click", () => onSelect(parcel.tokenId));
      polygon.addTo(map);
      newLayers.push(polygon);
    });
    layersRef.current = newLayers;
    const selected = parcels.find((parcel) => parcel.tokenId === selectedId);
    if (selected) map.fitBounds(selected.coordinates, { padding: [32, 32], maxZoom: 15 });
  }, [isReady, parcels, selectedId, onSelect]);

  return <div ref={containerRef} aria-label="Land parcel map" className="h-[440px] w-full overflow-hidden rounded-2xl bg-emerald-50" />;
}
