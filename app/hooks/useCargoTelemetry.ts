import { useEffect, useState } from 'react';
import { Cargo } from '../components/map/types';

/**
 * Mock telemetry hook that generates synthetic cargo data.
 * Generates `NUM_CARGOS` items with random positions and updates
 * their location, velocity, and temperature every 100ms.
 */
export const useCargoTelemetry = () => {
  const NUM_CARGOS = 5000;
  const [cargoData, setCargoData] = useState<Record<string, Cargo>>({});

  // Initialize cargos once
  useEffect(() => {
    const initial: Record<string, Cargo> = {};
    for (let i = 1; i <= NUM_CARGOS; i++) {
      const id = i.toString();
      initial[id] = {
        id,
        lat: Math.random() * 180 - 90, // -90 to +90
        lng: Math.random() * 360 - 180, // -180 to +180
        velocityX: (Math.random() - 0.5) * 2,
        velocityY: (Math.random() - 0.5) * 2,
        temperature: Math.round(Math.random() * 30 + 10), // 10-40°C
        status: Math.random() > 0.95 ? 'warning' : 'moving',
      };
    }
    setCargoData(initial);
  }, []);

  // Update positions at 10Hz (100ms)
  useEffect(() => {
    const interval = setInterval(() => {
      setCargoData((prev) => {
        const updated: Record<string, Cargo> = {};
        for (const id in prev) {
          const c = prev[id];
          // Move based on velocity, wrap around globe
          let newLat = c.lat + c.velocityY * 0.1; // latitude changes with Y velocity
          let newLng = c.lng + c.velocityX * 0.1; // longitude changes with X velocity
          if (newLat > 90) newLat = -90 + (newLat - 90);
          if (newLat < -90) newLat = 90 - (-90 - newLat);
          if (newLng > 180) newLng = -180 + (newLng - 180);
          if (newLng < -180) newLng = 180 - (-180 - newLng);
          updated[id] = { ...c, lat: newLat, lng: newLng };
        }
        return updated;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return { cargoData };
};
