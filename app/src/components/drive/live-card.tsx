import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Animated, { Easing, FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Icon } from '@/components/icon';
import type { Fix } from '@/core/types';
import { PressableScale } from '@/components/pressable-scale';
import { Button, IconButton } from '@/components/ui';
import { discardCurrent, requestPermissions, setAutoDetect, startManual, stopManual, useAutoDetectIssue, useLiveFixes, usePermissions, useRecorder } from '@/tracking/recorder';
import { useT } from '@/i18n';
import { requestAutoDetect } from '@/ui-lib/auto-detect';
import { brand, fonts, radius, space, type, useColors } from '@/theme';
import { clock } from '@/ui-lib/date';
import { failure, impact, success, tap } from '@/ui-lib/haptics';
import { darkMapStyle } from '@/ui-lib/map-style';
import { useFormat } from '@/ui-lib/units';

import { hexGridPath, thin, toLatLng } from './route-math';

const ON_HERO = '#FFFFFF';
const ON_HERO_2 = 'rgba(255,255,255,0.62)';
const ON_HERO_3 = 'rgba(255,255,255,0.38)';

export function PulseDot({ color = brand.emerald, size = 10 }: { color?: string; size?: number }) {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  useEffect(() => {
    const loop = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    a.value = loop;
    b.value = withDelay(900, withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false));
  }, [a, b]);
  const ringA = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - a.value), transform: [{ scale: 1 + a.value * 2.4 }] }));
  const ringB = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - b.value), transform: [{ scale: 1 + b.value * 2.4 }] }));
  const ring = { position: 'absolute' as const, width: size, height: size, borderRadius: size / 2, backgroundColor: color };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[ring, ringA]} />
      <Animated.View style={[ring, ringB]} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function HeroTexture({ glow }: { glow?: boolean }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id="heroGlow" cx="88%" cy="0%" r="75%">
              <Stop offset="0" stopColor={brand.emerald} stopOpacity={glow ? 0.32 : 0.16} />
              <Stop offset="1" stopColor={brand.emerald} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={hexGridPath(size.w, size.h, 22)} stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1} fill="none" />
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#heroGlow)" />
        </Svg>
      ) : null}
    </View>
  );
}

function LiveMap() {
  const fixes: Fix[] = useLiveFixes();
  const { t } = useT();
  const map = useRef<MapView>(null);
  const last = fixes[fixes.length - 1];
  const coords = thin(fixes, 400).map(toLatLng);

  useEffect(() => {
    if (!last) return;
    map.current?.animateCamera({ center: toLatLng(last), zoom: 15.5, altitude: 1500, pitch: 0, heading: 0 }, { duration: 900 });
  }, [last]);

  if (!last) {
    return (
      <View style={[styles.map, styles.mapWaiting]}>
        <ActivityIndicator color={ON_HERO_2} />
        <Text style={[type.caption, { color: ON_HERO_2 }]}>{t('drives.hero.waitingGps')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.map} pointerEvents="none">
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialCamera={{ center: toLatLng(last), zoom: 15.5, altitude: 1500, pitch: 0, heading: 0 }}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        showsCompass={false}
        userInterfaceStyle="dark"
        customMapStyle={Platform.OS === 'android' ? darkMapStyle : undefined}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {coords.length > 1 ? (
          <>
            <Polyline coordinates={coords} strokeColor="rgba(16,185,129,0.28)" strokeWidth={10} lineCap="round" lineJoin="round" />
            <Polyline coordinates={coords} strokeColor={brand.emerald} strokeWidth={4} lineCap="round" lineJoin="round" />
          </>
        ) : null}
        <Marker coordinate={toLatLng(last)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={styles.liveDot} />
        </Marker>
      </MapView>
      <View style={styles.mapVignette} />
    </View>
  );
}

function Elapsed({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text style={[type.valueSmall, { color: ON_HERO }]}>{clock((now - new Date(startedAt).getTime()) / 1000)}</Text>;
}

function HeroLabel({ text, color = brand.emerald, live }: { text: string; color?: string; live?: boolean }) {
  return (
    <View style={styles.heroLabel}>
      {live ? <PulseDot color={color} size={8} /> : null}
      <Text style={[type.label, { color }]}>{text}</Text>
    </View>
  );
}

export function RecorderHero() {
  const state = useRecorder();
  const perms = usePermissions();
  const { t } = useT();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const issue = useAutoDetectIssue();

  const manualReason = state.status === 'idle' ? (!state.autoDetect ? 'off' : perms.location !== 'granted' ? 'permission' : null) : null;

  async function start() {
    impact('medium');
    let p = perms;
    if (p.location === 'undetermined') p = await requestPermissions('location-foreground');
    if (p.location === 'denied' || p.location === 'undetermined') {
      Alert.alert(t('drives.hero.locationDeniedTitle'), t('drives.hero.locationDeniedBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    setBusy(true);
    try {
      await startManual();
      success();
    } catch {
      failure();
      Alert.alert(t('common.errorTitle'), t('drives.hero.startFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function enableAuto() {
    if (perms.location === 'granted' && perms.motion !== 'undetermined') {
      await setAutoDetect(true);
      success();
      return;
    }
    if (perms.location === 'denied') {
      Linking.openSettings();
      return;
    }
    await requestAutoDetect();
  }

  function confirmStop() {
    impact('medium');
    Alert.alert(t('drives.hero.stopTitle'), t('drives.hero.stopBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('drives.hero.stop'), onPress: () => stopManual().catch(() => failure()) },
    ]);
  }

  function confirmDiscard() {
    impact('light');
    Alert.alert(t('drives.hero.discardTitle'), t('drives.hero.discardBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('drives.hero.discardConfirm'), style: 'destructive', onPress: () => discardCurrent().catch(() => failure()) },
    ]);
  }

  const mode = state.status === 'idle' ? (manualReason ? 'manual' : 'auto') : state.status;

  return (
    <Animated.View layout={LinearTransition.springify().damping(18)} style={[styles.hero, { backgroundColor: c.hero, shadowColor: c.shadow }]}>
      <HeroTexture glow={state.status === 'recording'} />
      {mode === 'auto' ? (
        <Animated.View key="auto" entering={FadeIn.duration(260).delay(80)} exiting={FadeOut.duration(140)} style={styles.body}>
          <HeroLabel text={t('drives.hero.autoTitle')} live />
          <Text style={[styles.heroTitle, { color: ON_HERO }]}>{t('drives.hero.autoBody')}</Text>
          <Text style={[type.callout, { color: ON_HERO_2 }]}>{t('drives.hero.autoHint')}</Text>
          {issue === 'motion' ? (
            <PressableScale
              onPress={() => {
                tap();
                requestAutoDetect();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('drives.hero.motionIssueAction')}
              style={styles.issue}>
              <Icon name="motion" size={15} color={brand.amber} />
              <Text style={[type.caption, { color: ON_HERO, flex: 1 }]}>{Platform.OS === 'android' ? t('drives.hero.motionIssueAndroid') : t('drives.hero.motionIssueIos')}</Text>
              <Text style={[type.caption, { color: brand.amber, fontFamily: fonts.semibold }]}>{t('drives.hero.motionIssueAction')}</Text>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => {
              tap();
              start();
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('drives.hero.startManually')}
            style={styles.ghostPill}>
            {busy ? <ActivityIndicator size="small" color={ON_HERO} /> : <Icon name="play" size={12} color={ON_HERO} />}
            <Text style={[type.callout, { color: ON_HERO, fontFamily: fonts.semibold }]}>{t('drives.hero.startManually')}</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      {mode === 'manual' ? (
        <Animated.View key="manual" entering={FadeIn.duration(260).delay(80)} exiting={FadeOut.duration(140)} style={styles.body}>
          <HeroLabel text={t('drives.hero.manualTitle')} color={ON_HERO_2} />
          <Text style={[type.callout, { color: ON_HERO_2 }]}>{manualReason === 'off' ? t('drives.hero.manualBodyOff') : t('drives.hero.manualBodyPermission')}</Text>
          <Button title={t('drives.hero.start')} icon="play" large loading={busy} onPress={start} style={{ marginTop: space.sm }} />
          <PressableScale
            onPress={() => {
              tap();
              enableAuto();
            }}
            accessibilityRole="button"
            style={{ alignSelf: 'center', paddingVertical: space.xs }}
            hitSlop={8}>
            <Text style={[type.callout, { color: brand.emerald, fontFamily: fonts.semibold }]}>
              {manualReason === 'off' ? t('drives.hero.enableAuto') : t('drives.hero.allowAlways')}
            </Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      {state.status === 'recording' ? (
        <Animated.View key="rec" entering={FadeIn.duration(300).delay(80)} exiting={FadeOut.duration(140)} style={[styles.body, { gap: space.lg }]}>
          <View style={styles.recTop}>
            <HeroLabel text={state.manual ? t('drives.hero.recordingManual') : t('drives.hero.recording')} live />
            <IconButton icon="trash" label={t('drives.hero.discard')} onPress={confirmDiscard} size={34} bg="rgba(255,255,255,0.1)" tint={ON_HERO_2} />
          </View>
          <LiveMap />
          <View style={styles.recNumbers}>
            <View style={{ flex: 1.4 }}>
              <BigDistance meters={state.distanceM} />
            </View>
            <View style={{ flex: 1, gap: space.md, paddingBottom: 6 }}>
              <MiniStat label={t('drives.hero.elapsed')}>
                <Elapsed startedAt={state.startedAt} />
              </MiniStat>
              <MiniStat label={t('drives.hero.speed')}>
                <SpeedValue mps={state.speedMps} />
              </MiniStat>
            </View>
          </View>
          <PressableScale onPress={confirmStop} accessibilityRole="button" accessibilityLabel={t('drives.hero.stop')} style={styles.stopButton}>
            <View style={styles.stopSquare} />
            <Text style={[type.headline, { color: '#0B0D10' }]}>{t('drives.hero.stop')}</Text>
          </PressableScale>
        </Animated.View>
      ) : null}

      {state.status === 'finishing' ? (
        <Animated.View key="fin" entering={FadeIn.duration(260).delay(80)} exiting={FadeOut.duration(140)} style={[styles.body, styles.finishing]}>
          <ActivityIndicator color={brand.emerald} size="large" />
          <Text style={[type.headline, { color: ON_HERO }]}>{t('drives.hero.finishing')}</Text>
          <Text style={[type.callout, { color: ON_HERO_2, textAlign: 'center' }]}>{t('drives.hero.finishingBody')}</Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function BigDistance({ meters }: { meters: number }) {
  const fmt = useFormat();
  const parts = fmt.distanceParts(meters);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text style={[type.hero, { color: ON_HERO }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
        {parts.value}
      </Text>
      <Text style={[type.unit, { fontSize: 22, color: ON_HERO_2 }]}>{parts.unit}</Text>
    </View>
  );
}

function SpeedValue({ mps }: { mps: number | null }) {
  const fmt = useFormat();
  const parts = mps == null ? { value: '–', unit: '' } : fmt.speedParts(mps);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text style={[type.valueSmall, { color: ON_HERO }]}>{parts.value}</Text>
      <Text style={[type.unit, { fontSize: 12.5, color: ON_HERO_2 }]}>{parts.unit}</Text>
    </View>
  );
}

function MiniStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.label, { color: ON_HERO_3, fontSize: 10 }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  issue: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: 12, backgroundColor: 'rgba(245,158,11,0.12)' },
  hero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  body: { padding: space.xl, gap: space.md },
  heroLabel: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  heroTitle: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 31, letterSpacing: -0.7 },
  ghostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    marginTop: space.sm,
    height: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  recTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  map: { height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#121417' },
  mapWaiting: { alignItems: 'center', justifyContent: 'center', gap: space.sm },
  mapVignette: { ...StyleSheet.absoluteFill, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  liveDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: brand.emerald, borderWidth: 3, borderColor: '#FFFFFF' },
  recNumbers: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  stopButton: {
    height: 56,
    borderRadius: radius.lg - 2,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm + 2,
  },
  stopSquare: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#F2555A' },
  finishing: { alignItems: 'center', paddingVertical: space.xxxl },
});
