export interface Cargo {
  id: string; // numeric string identifier for picking
  lat: number;
  lng: number;
  velocityX: number;
  velocityY: number;
  temperature: number;
  status: 'idle' | 'moving' | 'warning';
}
