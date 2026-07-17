import { Map as LeafletMap } from 'leaflet';
import type { Cargo } from './types';

/**
 * Projects latitude and longitude to canvas point coordinates using Leaflet's
 * `latLngToContainerPoint` method.
 */
export const projectLatLngToPoint = (map: LeafletMap, lat: number, lng: number) => {
  const point = map.latLngToContainerPoint([lat, lng]);
  return { x: point.x, y: point.y };
};

/** Simple grid spatial index for visibility culling.
 *  Cell size is 50km approximated in latitude degrees (≈0.45°) which is acceptable
 *  for a basic demo. Returns cargos whose projected point lies within the map
 *  viewport.
 */
export const getVisibleCargos = (map: LeafletMap, cargos: Record<string, Cargo>): Cargo[] => {
  const bounds = map.getBounds();
  const visible: Cargo[] = [];
  for (const id in cargos) {
    const c = cargos[id];
    if (bounds.contains([c.lat, c.lng])) {
      visible.push(c);
    }
  }
  return visible;
};
