import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { type Camera, Polyline } from 'react-native-maps';
import Animated, { FadeIn, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RateChips, type Rate, Scrubber } from '@/components/drive/replay-controls';
import { lerpAngle, placeLine, resample, type Sample, toLatLng } from '@/components/drive/route-math';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { IconButton } from '@/components/ui';
import type { Drive } from '@/core/types';
import { useDrive } from '@/data/drives';
import { useT } from '@/i18n';
import { brand, radius, space, type } from '@/theme';
import { clock } from '@/ui-lib/date';
import { impact } from '@/ui-lib/haptics';
import { useFormat } from '@/ui-lib/units';

const DURATION_MS = 30_000;
const UI_HZ_MS = 33;
const BG = '#07090A';

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const drive: Drive | null | undefined = useDrive(id);
  const samples = drive ? resample(drive.fixes, 700) : [];

  if (!drive || samples.length < 2) {
    return (
      <View style={styles.center}>
        <StatusBar hidden />
        <CloseButton />
        {drive ? (
          <Text style={[type.callout, { color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingHorizontal: space.xxl }]}>{t('drives.replay.tooShort')}</Text>
        ) : (
          <>
            <ActivityIndicator color={brand.emerald} />
            <Text style={[type.caption, { color: 'rgba(255,255,255,0.6)' }]}>{t('drives.replay.loading')}</Text>
          </>
        )}
      </View>
    );
  }
  return <Player drive={drive} samples={samples} />;
}

function CloseButton() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  return (
    <View style={[styles.close, { top: insets.top + space.sm }]}>
      <IconButton icon="close" label={t('drives.replay.close')} onPress={() => router.back()} bg="rgba(20,22,25,0.7)" tint="#FFFFFF" size={40} />
    </View>
  );
}

function Player({ drive, samples }: { drive: Drive; samples: Sample[] }) {
  const { t } = useT();
  const fmt = useFormat();
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const progress = useSharedValue(0);
  const p = useRef(0);
  const heading = useRef(samples[0].heading);
  const playingRef = useRef(false);
  const wasPlaying = useRef(false);
  const raf = useRef<number | null>(null);
  const last = useRef(0);
  const lastUi = useRef(0);
  const rateRef = useRef<Rate>(1);
  const [ui, setUi] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState<Rate>(1);
  const [ready, setReady] = useState(false);

  const n = samples.length;
  const total = samples[n - 1].d;
  const km = total / 1000;
  const altitude = Math.max(260, Math.min(2400, 240 + km * 14));
  const zoom = Math.max(14, Math.min(17.6, 17.6 - Math.log2(Math.max(1, km / 8))));
  const coords = samples.map(toLatLng);

  function at(q: number) {
    const f = q * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const k = f - i;
    const a = samples[i];
    const b = samples[i + 1];
    return {
      i,
      lat: a.lat + (b.lat - a.lat) * k,
      lng: a.lng + (b.lng - a.lng) * k,
      heading: lerpAngle(a.heading, b.heading, k),
      d: a.d + (b.d - a.d) * k,
      t: a.t + (b.t - a.t) * k,
      speed: a.speed + (b.speed - a.speed) * k,
    };
  }

  function camera(q: number, snap: boolean): Camera {
    const s = at(q);
    heading.current = snap ? s.heading : lerpAngle(heading.current, s.heading, 0.14);
    return { center: { latitude: s.lat, longitude: s.lng }, heading: heading.current, pitch: 60, altitude, zoom };
  }

  function apply(q: number, snap: boolean, now: number) {
    p.current = q;
    progress.value = q;
    map.current?.setCamera(camera(q, snap));
    if (snap || now - lastUi.current > UI_HZ_MS) {
      lastUi.current = now;
      setUi(q);
    }
  }

  function tick(ts: number) {
    if (!playingRef.current) return;
    const dt = last.current ? Math.min(64, ts - last.current) : 16;
    last.current = ts;
    const q = Math.min(1, p.current + (dt * rateRef.current) / DURATION_MS);
    apply(q, false, ts);
    if (q >= 1) {
      stop();
      setUi(1);
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }

  function play() {
    if (playingRef.current) return;
    if (p.current >= 1) apply(0, true, performance.now());
    playingRef.current = true;
    last.current = 0;
    setPlaying(true);
    raf.current = requestAnimationFrame(tick);
  }

  function stop() {
    playingRef.current = false;
    setPlaying(false);
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }

  useEffect(() => () => {
    playingRef.current = false;
    if (raf.current != null) cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => {
    if (!ready) return;
    map.current?.animateCamera(camera(0, true), { duration: 1600 });
    const id = setTimeout(play, 1700);
    return () => clearTimeout(id);
  }, [ready]);

  const cur = at(ui);
  const cut = Math.min(n - 1, Math.max(1, cur.i + 1));
  const driven = [...coords.slice(0, cut), { latitude: cur.lat, longitude: cur.lng }];
  const rest = [{ latitude: cur.lat, longitude: cur.lng }, ...coords.slice(cut)];
  const dist = fmt.distanceParts(cur.d);
  const speed = fmt.speedParts(cur.speed);
  const ended = ui >= 1 && !playing;
  const mid = samples[Math.floor(n / 2)];

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <StatusBar hidden />
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        mapType={Platform.OS === 'ios' ? 'satelliteFlyover' : 'hybrid'}
        initialCamera={{ center: toLatLng(mid), heading: 0, pitch: 0, altitude: Math.max(3000, total * 1.8), zoom: 12 }}
        onMapReady={() => setReady(true)}
        showsBuildings
        showsCompass={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        userInterfaceStyle="dark"
        loadingEnabled
        loadingBackgroundColor={BG}
        loadingIndicatorColor={brand.emerald}>
        <Polyline coordinates={rest} strokeColor="rgba(255,255,255,0.42)" strokeWidth={3} lineCap="round" lineJoin="round" zIndex={1} />
        <Polyline coordinates={driven} strokeColor="rgba(16,185,129,0.35)" strokeWidth={12} lineCap="round" lineJoin="round" zIndex={2} />
        <Polyline coordinates={driven} strokeColor="#34D399" strokeWidth={5} lineCap="round" lineJoin="round" zIndex={3} />
      </MapView>

      <View style={styles.carWrap} pointerEvents="none">
        <View style={styles.carGlow} />
        <View style={styles.car}>
          <Icon name="locationNorth" size={15} color="#FFFFFF" />
        </View>
      </View>

      <CloseButton />
      <Animated.View entering={FadeIn.delay(300).duration(400)} style={[styles.titleWrap, { top: insets.top + space.sm + 4 }]} pointerEvents="none">
        <Text style={[type.callout, styles.title]} numberOfLines={1}>
          {placeLine(drive) ?? ''}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(200).duration(400)} style={[styles.panelWrap, { paddingBottom: insets.bottom + space.md }]}>
        <BlurView tint="dark" intensity={50} style={styles.panel}>
          <View style={styles.stats}>
            <Readout label={t('drives.replay.distance')} value={dist.value} unit={dist.unit} big />
            <Readout label={t('drives.replay.time')} value={clock((cur.t - samples[0].t) / 1000)} />
            <Readout label={t('drives.replay.speed')} value={speed.value} unit={speed.unit} />
          </View>
          <Scrubber
            progress={progress}
            value={ui}
            onStart={() => {
              wasPlaying.current = playingRef.current;
              stop();
            }}
            onSeek={(q) => apply(q, true, performance.now())}
            onEnd={() => {
              if (wasPlaying.current && p.current < 1) play();
            }}
          />
          <View style={styles.controls}>
            <PressableScale
              onPress={() => {
                impact('light');
                if (playing) stop();
                else play();
              }}
              accessibilityRole="button"
              accessibilityLabel={ended ? t('drives.replay.again') : playing ? t('drives.replay.pause') : t('drives.replay.play')}
              style={styles.playBtn}>
              <Icon name={ended ? 'restore' : playing ? 'pause' : 'play'} size={20} color="#03140D" />
            </PressableScale>
            <RateChips
              value={rate}
              onChange={(r) => {
                rateRef.current = r;
                setRate(r);
              }}
            />
          </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

function Readout({ label, value, unit, big }: { label: string; value: string; unit?: string; big?: boolean }) {
  return (
    <View style={{ flex: big ? 1.3 : 1, gap: 2 }} accessible accessibilityLabel={`${label} ${value} ${unit ?? ''}`}>
      <Text style={[type.label, { color: 'rgba(255,255,255,0.5)', fontSize: 10 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={[big ? type.value : type.valueSmall, { color: '#FFFFFF' }]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={[type.unit, { fontSize: big ? 14 : 12, color: 'rgba(255,255,255,0.6)' }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center', gap: space.md },
  close: { position: 'absolute', left: space.lg, zIndex: 10 },
  titleWrap: { position: 'absolute', left: 72, right: 72, alignItems: 'center', height: 32, justifyContent: 'center' },
  title: { color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } },
  carWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  carGlow: { position: 'absolute', width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(16,185,129,0.28)' },
  car: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: brand.emerald,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  panelWrap: { position: 'absolute', left: space.md, right: space.md, bottom: 0 },
  panel: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    gap: space.md,
    backgroundColor: Platform.OS === 'android' ? 'rgba(12,14,16,0.86)' : 'rgba(12,14,16,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  stats: { flexDirection: 'row', gap: space.md },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: brand.emerald, alignItems: 'center', justifyContent: 'center' },
});
