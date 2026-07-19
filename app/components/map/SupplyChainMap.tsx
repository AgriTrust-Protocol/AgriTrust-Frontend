import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CanvasCargoLayer } from './CanvasCargoLayer';
import { useCargoTelemetry } from '../../hooks/useCargoTelemetry';

export const SupplyChainMap: React.FC = () => {
  const { cargoData } = useCargoTelemetry();
  const center: [number, number] = [0, 0]; // default world center

  return (
    <MapContainer center={center} zoom={2} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <CanvasCargoLayer cargoData={cargoData} />
    </MapContainer>
  );
};
