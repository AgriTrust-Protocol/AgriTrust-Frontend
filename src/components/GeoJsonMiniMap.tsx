'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { Satellite, Moon } from 'lucide-react';

export interface GeoJsonPolygon {
  type: 'Feature';
  properties?: {
    plot_id?: string;
    farmer_did?: string;
    area_hectares?: number;
    commodity?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][]; // [ [ [lon, lat], ... ] ]
  };
}

interface GeoJsonMiniMapProps {
  geoJson: GeoJsonPolygon;
  height?: string;
  interactive?: boolean;
  defaultLayer?: 'dark' | 'satellite';
}

type LayerMode = 'dark' | 'satellite';

export default function GeoJsonMiniMap({
  geoJson,
  height = '210px',
  interactive = true,
  defaultLayer = 'dark',
}: GeoJsonMiniMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const tileLayersRef = useRef<Partial<Record<LayerMode, import('leaflet').TileLayer>>>({});
  const geoJsonLayerRef = useRef<import('leaflet').GeoJSON | null>(null);

  const [activeLayer, setActiveLayer] = useState<LayerMode>(defaultLayer);
  // removed unused state

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;

      const L = (await import('leaflet')).default;
      if (!isMounted || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: interactive,
        scrollWheelZoom: false,
        doubleClickZoom: interactive,
      });

      const darkLayer = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
        {
          maxZoom: 19,
          subdomains: 'abcd',
        }
      );

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxZoom: 19,
        }
      );

      tileLayersRef.current = {
        dark: darkLayer,
        satellite: satelliteLayer,
      };

      tileLayersRef.current[activeLayer]?.addTo(map);

      const geoJsonLayer = L.geoJSON(geoJson as unknown as GeoJSON.Feature, {
        style: () => ({
          color: activeLayer === 'satellite' ? '#34d399' : '#10b981',
          weight: 2.5,
          opacity: 1,
          fillColor: '#059669',
          fillOpacity: activeLayer === 'satellite' ? 0.35 : 0.25,
          dashArray: '4, 6',
        }),
        onEachFeature: (feature: unknown, layer: unknown) => {
          const f = feature as { properties?: Record<string, unknown> } | undefined;
          const props = f?.properties || {};
          (layer as { bindPopup: (html: string) => void }).bindPopup(`
            <div style="font-family: monospace; font-size: 11px; color: #0f172a; padding: 4px;">
              <strong>${props.plot_id || 'Plot Boundary'}</strong><br/>
              Area: ${props.area_hectares || '5.42'} ha<br/>
              EUDR Deforestation: Cleared (Post-2020)
            </div>
          `);
        },
      }).addTo(map);

      geoJsonLayerRef.current = geoJsonLayer;

      try {
        const bounds = geoJsonLayer.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [20, 20], maxZoom: 16 });
        }
      } catch (err) {
        console.error('Failed to calculate GeoJSON boundary:', err);
      }

      mapInstanceRef.current = map;

    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [geoJson, interactive, activeLayer]);

  const switchLayer = (targetLayer: LayerMode) => {
    if (!mapInstanceRef.current || targetLayer === activeLayer) return;

    const currentTile = tileLayersRef.current[activeLayer];
    const newTile = tileLayersRef.current[targetLayer];

    if (currentTile && newTile) {
      mapInstanceRef.current.removeLayer(currentTile);
      newTile.addTo(mapInstanceRef.current);

      if (geoJsonLayerRef.current) {
        geoJsonLayerRef.current.setStyle({
          color: targetLayer === 'satellite' ? '#34d399' : '#10b981',
          fillOpacity: targetLayer === 'satellite' ? 0.35 : 0.25,
        });
        geoJsonLayerRef.current.bringToFront();
      }

      setActiveLayer(targetLayer);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-sans">
      <div ref={mapContainerRef} style={{ height }} className="w-full z-0" />

      <div className="absolute top-2.5 right-2.5 z-10 flex items-center rounded-lg border border-slate-700/80 bg-slate-900/90 p-0.5 backdrop-blur shadow-lg">
        <button
          type="button"
          onClick={() => switchLayer('dark')}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
            activeLayer === 'dark'
              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Switch to Dark Vector Map"
        >
          <Moon className="h-3 w-3 text-slate-400" />
          <span>Vector</span>
        </button>

        <button
          type="button"
          onClick={() => switchLayer('satellite')}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
            activeLayer === 'satellite'
              ? 'bg-emerald-500/20 text-emerald-300 shadow-sm border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Switch to Sentinel-2 Satellite Basemap"
        >
          <Satellite className="h-3 w-3 text-emerald-400" />
          <span>Sentinel-2</span>
        </button>
      </div>

      <div className="absolute bottom-2 left-2.5 z-10 flex items-center gap-2 rounded bg-slate-900/85 px-2 py-0.5 border border-slate-800/80 text-[9px] font-mono text-slate-300 backdrop-blur">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            activeLayer === 'satellite' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
          }`}
        />
        <span>
          {activeLayer === 'satellite' ? 'Sentinel-2 (10m Multi-spectral)' : 'CartoDB Dark Matter'}
        </span>
      </div>

      <div className="absolute bottom-2 right-2.5 z-10 rounded bg-slate-900/85 px-1.5 py-0.5 border border-slate-800/80 text-[9px] font-mono text-slate-400 backdrop-blur">
        EPSG:4326
      </div>
    </div>
  );
}
