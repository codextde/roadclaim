import { useEffect, useRef, useState } from 'react';
import { Platform, type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import type { Drive, DriveEvent, DriveSummary } from '@/core/types';
import { useT } from '@/i18n';
import { type Palette, useColors, useIsDark } from '@/theme';
import { darkMapStyle, lightMapStyle } from '@/ui-lib/map-style';

import { speedPolyline, thin, toLatLng } from './route-math';

type Shown = Exclude<DriveEvent['kind'], 'stop'>;

const eventLook: Record<Shown, { icon: IconName; color: (c: Palette) => string }> = {
  brake: { icon: 'brake', color: (c) => c.danger },
  turn_left: { icon: 'turnLeft', color: (c) => c.friend },
  turn_right: { icon: 'turnRight', color: (c) => c.friend },
  lane_change: { icon: 'laneChange', color: (c) => c.club },
};

export function routeLine(drive: DriveSummary | Drive) {
  const fixes = 'fixes' in drive ? drive.fixes : null;
  if (fixes && fixes.length > 1) return speedPolyline(fixes);
  return { coords: drive.preview.map(([latitude, longitude]) => ({ latitude, longitude })), colors: null };
}

export function DriveMap({ drive, bottomInset = 0, style }: { drive: DriveSummary | Drive; bottomInset?: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const dark = useIsDark();
  const { t } = useT();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [track, setTrack] = useState(true);
  const line = routeLine(drive);
  const events = 'events' in drive ? thin(drive.events.filter((e): e is DriveEvent & { kind: Shown } => e.kind !== 'stop'), 160) : [];
  const start = line.coords[0];
  const end = line.coords[line.coords.length - 1];

  useEffect(() => {
    if (!ready || line.coords.length < 2) return;
    map.current?.fitToCoordinates(line.coords, { edgePadding: { top: 110, right: 48, bottom: 48 + bottomInset, left: 48 }, animated: false });
  }, [ready, line.coords.length, bottomInset]);

  useEffect(() => {
    setTrack(true);
    const id = setTimeout(() => setTrack(false), 700);
    return () => clearTimeout(id);
  }, [events.length]);

  return (
    <View style={[{ backgroundColor: dark ? '#121417' : '#E9EBEE' }, style]} accessibilityLabel={t('drives.detail.mapLabel')}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        onMapReady={() => setReady(true)}
        initialRegion={start ? { ...start, latitudeDelta: 0.08, longitudeDelta: 0.08 } : undefined}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={Platform.OS === 'android' ? (dark ? darkMapStyle : lightMapStyle) : undefined}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        loadingEnabled
        loadingBackgroundColor={dark ? '#121417' : '#E9EBEE'}
        loadingIndicatorColor={c.accent}>
        {line.coords.length > 1 ? (
          <>
            <Polyline coordinates={line.coords} strokeColor={dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)'} strokeWidth={8} lineCap="round" lineJoin="round" zIndex={1} />
            <Polyline
              coordinates={line.coords}
              strokeColor={c.accent}
              strokeColors={line.colors ?? undefined}
              strokeWidth={4.5}
              lineCap="round"
              lineJoin="round"
              zIndex={2}
            />
          </>
        ) : null}
        {events.map((e, i) => {
          const look = eventLook[e.kind];
          return (
            <Marker key={`${e.kind}${e.t}${i}`} coordinate={toLatLng(e)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={3}>
              <View style={[styles.event, { backgroundColor: look.color(c) }]}>
                <Icon name={look.icon} size={10} color="#FFFFFF" />
              </View>
            </Marker>
          );
        })}
        {start ? (
          <Marker coordinate={start} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={4}>
            <View style={[styles.start, { borderColor: c.accent }]} />
          </Marker>
        ) : null}
        {end && line.coords.length > 1 ? (
          <Marker coordinate={end} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track} zIndex={5}>
            <View style={[styles.end, { backgroundColor: c.accent }]}>
              <Icon name="flagCheckered" size={13} color="#FFFFFF" />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  event: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  start: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 4 },
  end: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
});
