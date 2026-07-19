import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type { Cargo } from './types';
import { projectLatLngToPoint, getVisibleCargos } from './mapUtils';

interface CanvasCargoLayerProps {
  cargoData: Record<string, Cargo>;
  onSelect?: (cargoId: string) => void;
}

export const CanvasCargoLayer: React.FC<CanvasCargoLayerProps> = ({ cargoData, onSelect }) => {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement>(null);

  // Setup canvas size & position
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const updateSize = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.style.position = 'absolute';
      canvas.style.left = '0';
      canvas.style.top = '0';
    };
    updateSize();
    map.on('move zoom', updateSize);
    return () => {
      map.off('move zoom', updateSize);
    };
  }, [map]);

  // Render loop
  useEffect(() => {
    let animationFrame: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const offscreen = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const offCtx = offscreen.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const size = map.getSize();
      offscreen.width = size.x;
      offscreen.height = size.y;

      // Clear
      ctx.clearRect(0, 0, size.x, size.y);
      offCtx?.clearRect(0, 0, size.x, size.y);

      // Determine visible cargos via simple grid culling (implemented in mapUtils)
      const visible = getVisibleCargos(map, cargoData);

      visible.forEach((cargo) => {
        const point = projectLatLngToPoint(map, cargo.lat, cargo.lng);
        // Draw main circle
        ctx.beginPath();
        ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = cargo.status === 'warning' ? '#ff4d4f' : '#40a9ff';
        ctx.fill();

        // Velocity vector (scaled)
        const velScale = 0.05; // adjust as needed
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
        ctx.lineTo(point.x + cargo.velocityX * velScale, point.y + cargo.velocityY * velScale);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Temperature badge
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${cargo.temperature}°C`, point.x + 6, point.y - 6);

        // Offscreen for picking: encode id as unique color
        if (offCtx) {
          // Simple deterministic color from id (assumes numeric ids < 16777215)
          const colorId = Number(cargo.id);
          const r = (colorId >> 16) & 0xff;
          const g = (colorId >> 8) & 0xff;
          const b = colorId & 0xff;
          offCtx.fillStyle = `rgb(${r},${g},${b})`;
          offCtx.fillRect(point.x - 5, point.y - 5, 10, 10);
        }
      });

      animationFrame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [map, cargoData]);

  // Click handling for picking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // For simplicity, we re‑create the offscreen canvas here; a real implementation would reuse the offscreenRef.
      const offscreen = document.createElement('canvas');
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;
      const size = map.getSize();
      offscreen.width = size.x;
      offscreen.height = size.y;
      // Re‑draw picking surface (could be optimized by storing the previous frame)
      const visible = getVisibleCargos(map, cargoData);
      visible.forEach((cargo) => {
        const point = projectLatLngToPoint(map, cargo.lat, cargo.lng);
        const colorId = Number(cargo.id);
        const r = (colorId >> 16) & 0xff;
        const g = (colorId >> 8) & 0xff;
        const b = colorId & 0xff;
        offCtx.fillStyle = `rgb(${r},${g},${b})`;
        offCtx.fillRect(point.x - 5, point.y - 5, 10, 10);
      });
      const pixel = offCtx.getImageData(x, y, 1, 1).data;
      const id = (pixel[0] << 16) + (pixel[1] << 8) + pixel[2];
      if (onSelect && id !== 0) {
        onSelect(String(id));
      }
    };
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [cargoData, map, onSelect]);

  return <canvas ref={canvasRef} />;
};
