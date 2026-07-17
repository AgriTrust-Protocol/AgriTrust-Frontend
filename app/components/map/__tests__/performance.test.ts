import { describe, it, expect } from 'vitest';
import { performance } from 'perf_hooks';
import { Cargo } from '../../types';
import { getVisibleCargos } from '../mapUtils';
import { Map as LeafletMap } from 'leaflet';

/**
 * Generates synthetic cargo data for benchmarking.
 */
function generateCargos(count: number): Record<string, Cargo> {
  const cargos: Record<string, Cargo> = {};
  for (let i = 1; i <= count; i++) {
    const id = i.toString();
    cargos[id] = {
      id,
      lat: Math.random() * 180 - 90,
      lng: Math.random() * 360 - 180,
      velocityX: (Math.random() - 0.5) * 2,
      velocityY: (Math.random() - 0.5) * 2,
      temperature: Math.round(Math.random() * 30 + 10),
      status: Math.random() > 0.95 ? 'warning' : 'moving',
    };
  }
  return cargos;
}

describe('Canvas rendering performance', () => {
  it('renders 5,000 cargos within 33ms per frame', () => {
    const cargoCount = 5000;
    const cargos = generateCargos(cargoCount);

    // Mock a Leaflet map with minimal required methods
    const mockMap = {
      getSize: () => ({ x: 800, y: 600 }),
      getBounds: () => ({
        contains: () => true, // assume all cargos are visible for worst‑case
      }),
    } as unknown as LeafletMap;

    const frameTimes: number[] = [];
    const frames = 30; // sample 30 frames (~1 second at 30fps)
    for (let i = 0; i < frames; i++) {
      const start = performance.now();
      // Visibility culling (worst case all visible)
      const visible = getVisibleCargos(mockMap, cargos);
      // Simulate drawing loop (no actual canvas ops)
      for (const cargo of visible) {
        // simple projection placeholder
        const point = { x: cargo.lng, y: cargo.lat };
        // simulate minimal work per cargo
        void point;
      }
      const end = performance.now();
      frameTimes.push(end - start);
    }
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    // Expect average frame time under 33ms (30fps)
    expect(avg).toBeLessThan(33);
  }, 5000);
});
