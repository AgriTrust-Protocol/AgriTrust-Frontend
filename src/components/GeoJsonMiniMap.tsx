"use client";

// Imported statically rather than inside the effect: the bundler must see this
// specifier to emit the stylesheet, and the component only ever reaches the
// browser through `next/dynamic` with `ssr: false`.
import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";

import type { CredentialStatus, PlotFeatureCollection } from "@/lib/types";

interface GeoJsonMiniMapProps {
  readonly geoJson: PlotFeatureCollection;
  /** Representative point used to centre the map before bounds are computed. */
  readonly center: readonly [number, number];
  readonly status: CredentialStatus;
  readonly height?: number;
  readonly className?: string;
}

/** Dark basemap, matching the portal surface palette. */
const BASEMAP_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const STATUS_COLOR: Record<CredentialStatus, string> = {
  valid: "#34d399",
  unverified: "#f59e0b",
  expired: "#fb7185",
  revoked: "#881337",
};

/**
 * Leaflet plot renderer with EUDR status overlay.
 *
 * Imported client-side only: Leaflet reads `window` during module evaluation, so
 * this component is always reached through `next/dynamic` with `ssr: false`.
 *
 * The plot is drawn with a `GeoJSON` layer and a `circleMarker` rather than the
 * default `L.Marker`, because Leaflet's bundled marker icons are resolved as
 * runtime image URLs that bundlers cannot fingerprint — the circle variant has no
 * asset dependency and renders identically here.
 */
export default function GeoJsonMiniMap({
  geoJson,
  center,
  status,
  height = 280,
  className = "",
}: GeoJsonMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null || mapRef.current !== null) return;

    let cancelled = false;
    let map: L.Map | undefined;

    // Leaflet's JS is loaded lazily so it only reaches the browser bundle.
    void (async () => {
      const leaflet = (await import("leaflet")).default;
      if (cancelled || containerRef.current === null) return;

      map = leaflet.map(containerRef.current, {
        center: [center[0], center[1]],
        zoom: 15,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });

      leaflet
        .tileLayer(BASEMAP_URL, {
          attribution: BASEMAP_ATTRIBUTION,
          maxZoom: 19,
          subdomains: "abcd",
        })
        .addTo(map);

      const color = STATUS_COLOR[status];

      // Leaflet's own GeoJSON typing expects its GeoJSON typings; the AgriTrust
      // `PlotFeatureCollection` is a structurally compatible RFC 7946 subset.
      const layer = leaflet.geoJSON(geoJson as unknown as GeoJSON.GeoJsonObject, {
        style: {
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.18,
        },
      });

      layer.addTo(map);

      leaflet
        .circleMarker([center[0], center[1]], {
          radius: 5,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        })
        .addTo(map)
        .bindTooltip("Production plot centroid", { direction: "top" });

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.35));
      }

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // The layer is rebuilt whenever the plotted geometry or status changes.
  }, [center, geoJson, status]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={`w-full overflow-hidden rounded-lg border border-line bg-surface-2 ${className}`}
      role="img"
      aria-label={`Production plot boundary, EUDR status: ${status}`}
    />
  );
}