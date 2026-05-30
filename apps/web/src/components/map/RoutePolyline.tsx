import { Polyline } from 'react-leaflet';

export function RoutePolyline({ points }: { points: [number, number][] }) {
  return <Polyline positions={points} pathOptions={{ color: '#22d3ee' }} />;
}
