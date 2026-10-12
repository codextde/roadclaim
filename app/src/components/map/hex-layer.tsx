import { memo } from 'react';
import { type LatLng, Polygon } from 'react-native-maps';

export type HexShape = { id: string; coords: LatLng[]; fill: string; stroke: string };

const Hex = memo(function Hex({ coords, fill, stroke }: { coords: LatLng[]; fill: string; stroke: string }) {
  return <Polygon coordinates={coords} fillColor={fill} strokeColor={stroke} strokeWidth={1} />;
});

export const HexLayer = memo(function HexLayer({ shapes }: { shapes: HexShape[] }) {
  return (
    <>
      {shapes.map((s) => (
        <Hex key={s.id} coords={s.coords} fill={s.fill} stroke={s.stroke} />
      ))}
    </>
  );
});
