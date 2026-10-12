import * as Location from 'expo-location';
import { router } from 'expo-router';
import { latLngToCell } from 'h3-js';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { type MapPressEvent, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { boundaryOf, inBbox, regionBbox, regionForPoints } from '@/components/map/cells';
import { Glass } from '@/components/map/glass';
import { HexLayer, type HexShape } from '@/components/map/hex-layer';
import { PressableScale } from '@/components/pressable-scale';
import { errorCode, isOfflineError, LocalOnlyState, OfflineBanner } from '@/components/states';
import { Button } from '@/components/ui';
import { useDrives } from '@/data/drives';
import { useT } from '@/i18n';
import { fonts, ownerColor, radius, space, type, useColors, useIsDark, withAlpha } from '@/theme';
import { tap } from '@/ui-lib/haptics';
import { darkMapStyle, lightMapStyle } from '@/ui-lib/map-style';
import { type CellOwner, fetchCells, useLocalOnly, useMyStats, useSession, useTerritoryMine } from '@/ui-lib/remote';
import { SCREENSHOTS } from '@/ui-lib/screenshot-driver';

type Mode = 'all' | 'mine' | 'club';
type Owner = CellOwner['owner'];
type Selection = { cell: string; owner: CellOwner } | { cell: string; held: boolean };

const MUNICH: Region = { latitude: 48.137, longitude: 11.575, latitudeDelta: 0.12, longitudeDelta: 0.12 };
const LOCAL_SPAN = 0.045;
const SCREENSHOT_REGION: Region = { latitude: 48.1575, longitude: 11.5855, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const MAX_SPAN = 0.6;
const MAX_SHAPES = 1500;
const MAX_CACHED = 30000;
const H3_RES = 9;
const android = Platform.OS === 'android';

export default function MapScreen() {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { t, plural } = useT();
  const localOnly = useLocalOnly();
  const { me, offline } = useSession();
  const clubId = me?.club?.id;
  const drives = useDrives();
  const mine = useTerritoryMine();
  const stats = useMyStats('season');
  const mapRef = useRef<MapView>(null);
  const userMoved = useRef(false);
  const located = useRef(false);
  const seq = useRef(0);

  const [initial] = useState<Region>(() => regionForPoints(drives[0]?.preview ?? []) ?? MUNICH);
  const [region, setRegion] = useState<Region>(initial);
  const [mode, setMode] = useState<Mode>('all');
  const [caches] = useState(() => new Map<string, Map<string, CellOwner>>());
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const [serverZoom, setServerZoom] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Selection | null>(null);

  const cacheKey = mode === 'club' ? `club:${clubId ?? ''}` : 'all';
  const tooWide = region.latitudeDelta > MAX_SPAN || region.longitudeDelta > MAX_SPAN;
  const serverMode = !localOnly && (mode === 'all' || (mode === 'club' && !!clubId));
  const showZoomHint = serverMode && (tooWide || serverZoom);

  const latestPreview = drives[0]?.preview;
  const [locating, setLocating] = useState(!SCREENSHOTS);
  const [mapReady, setMapReady] = useState(false);
  const [target, setTarget] = useState<Region | null>(SCREENSHOTS ? SCREENSHOT_REGION : null);

  useEffect(() => {
    if (SCREENSHOTS) return;
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then(async (p) => {
        if (!p.granted) return null;
        return (await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 })) ?? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      })
      .then((pos) => {
        if (cancelled || !pos) return;
        located.current = true;
        setTarget({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: LOCAL_SPAN, longitudeDelta: LOCAL_SPAN });
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLocating(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (locating || located.current || SCREENSHOTS || !latestPreview) return;
    const r = regionForPoints(latestPreview);
    if (r) setTarget(r);
  }, [latestPreview, locating]);

  useEffect(() => {
    if (!mapReady || !target || userMoved.current) return;
    mapRef.current?.animateToRegion(target, 500);
  }, [mapReady, target]);

  useEffect(() => {
    if (!serverMode || tooWide) return;
    const id = ++seq.current;
    const span = Math.max(region.latitudeDelta, region.longitudeDelta);
    const bbox = regionBbox(region, Math.max(0, Math.min(0.2, MAX_SPAN / span - 1.02)));
    const timer = setTimeout(() => {
      setStatus('loading');
      fetchCells(bbox, mode === 'club' ? clubId : undefined)
        .then(({ cells }) => {
          let cache = caches.get(cacheKey);
          if (!cache) {
            cache = new Map();
            caches.set(cacheKey, cache);
          }
          const fresh = new Set(cells.map((x) => x.cell));
          for (const cell of cache.keys()) if (!fresh.has(cell) && inBbox(cell, bbox)) cache.delete(cell);
          for (const x of cells) {
            cache.delete(x.cell);
            cache.set(x.cell, x);
          }
          for (const cell of cache.keys()) {
            if (cache.size <= MAX_CACHED) break;
            cache.delete(cell);
          }
          setVersion((v) => v + 1);
          if (id === seq.current) {
            setServerZoom(false);
            setStatus('idle');
          }
        })
        .catch((e: unknown) => {
          if (id !== seq.current) return;
          if (errorCode(e) === 'zoom_in') {
            setServerZoom(true);
            setStatus('idle');
          } else setStatus(isOfflineError(e) ? 'offline' : 'error');
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [region, serverMode, tooWide, mode, clubId, cacheKey, caches, attempt]);

  const palette = useMemo(() => {
    const shape = (owner: Owner) => ({ fill: withAlpha(ownerColor(c, owner), 0.35), stroke: withAlpha(ownerColor(c, owner), 0.8) });
    return {
      me: shape('me'),
      friend: shape('friend'),
      club: shape('club'),
      other: shape('other'),
      held: { fill: withAlpha(c.accent, 0.42), stroke: withAlpha(c.accentStrong, 0.95) },
      ever: { fill: withAlpha(c.accent, 0.07), stroke: withAlpha(c.accent, 0.45) },
    };
  }, [c]);

  const heldSet = useMemo(() => new Set<string>(mine.data?.held ?? []), [mine.data]);

  const shapes = useMemo<HexShape[]>(() => {
    if (localOnly) return [];
    const view = regionBbox(region, 0.3);
    const out: HexShape[] = [];
    if (mode === 'mine') {
      const ever: string[] = mine.data?.ever ?? [];
      for (const cell of heldSet) {
        if (out.length >= MAX_SHAPES) break;
        if (inBbox(cell, view)) out.push({ id: cell, coords: boundaryOf(cell), ...palette.held });
      }
      for (const cell of ever) {
        if (out.length >= MAX_SHAPES) break;
        if (!heldSet.has(cell) && inBbox(cell, view)) out.push({ id: cell, coords: boundaryOf(cell), ...palette.ever });
      }
      return out;
    }
    const cache = caches.get(cacheKey);
    if (!cache || !serverMode) return out;
    for (const x of cache.values()) {
      if (out.length >= MAX_SHAPES) break;
      if (inBbox(x.cell, view)) out.push({ id: x.cell, coords: boundaryOf(x.cell), ...palette[x.owner] });
    }
    return out;
  }, [localOnly, region, mode, mine.data, heldSet, caches, cacheKey, serverMode, palette, version]);

  const onRegionChangeComplete = (r: Region, details?: { isGesture?: boolean }) => {
    if (details?.isGesture) userMoved.current = true;
    setRegion(r);
  };

  const onMapPress = (e: MapPressEvent) => {
    if (localOnly) return;
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const cell = latLngToCell(latitude, longitude, H3_RES);
    let next: Selection | null = null;
    if (mode === 'mine') {
      if (heldSet.has(cell)) next = { cell, held: true };
      else if ((mine.data?.ever ?? []).includes(cell)) next = { cell, held: false };
    } else {
      const owner = caches.get(cacheKey)?.get(cell);
      if (owner) next = { cell, owner };
    }
    if (next) tap();
    setSelected(next);
  };

  const locate = async () => {
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('map.locationDeniedTitle'), t('map.locationDeniedBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const pos = (await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      userMoved.current = true;
      mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }, 600);
    } catch {
      Alert.alert(t('map.locationDeniedTitle'), t('map.locationDeniedBody'));
    }
  };

  const held: number | undefined = stats.data?.cellsHeld ?? mine.data?.held.length;
  const bottom = Platform.OS === 'ios' ? insets.bottom + 62 : space.lg;
  const top = insets.top + space.sm;

  const modes: { value: Mode; label: string }[] = [
    { value: 'all', label: t('map.modeAll') },
    { value: 'mine', label: t('map.modeMine') },
    { value: 'club', label: t('map.modeClub') },
  ];

  const legend =
    mode === 'mine'
      ? [
          { key: 'held', label: t('map.legendHeld'), fill: c.accent, outline: false },
          { key: 'ever', label: t('map.legendEver'), fill: c.accent, outline: true },
        ]
      : [
          { key: 'me', label: t('map.legendMe'), fill: c.accent, outline: false },
          { key: 'friend', label: t('map.legendFriends'), fill: c.friend, outline: false },
          { key: 'club', label: t('map.legendClub'), fill: c.club, outline: false },
          { key: 'other', label: t('map.legendOthers'), fill: c.other, outline: false },
        ];

  const pill =
    localOnly || mode === 'mine' ? null : showZoomHint ? (
      <StatusPill key="zoom" icon="search" text={t('map.zoomIn')} />
    ) : status === 'loading' ? (
      <StatusPill key="loading" spinner text={t('map.loading')} />
    ) : status === 'error' || status === 'offline' ? (
      <StatusPill
        key={status}
        icon={status === 'offline' ? 'offline' : 'refresh'}
        text={status === 'offline' ? t('common.offlineTitle') : t('map.loadError')}
        tone={status === 'error' ? 'danger' : undefined}
        onPress={() => setAttempt((a) => a + 1)}
      />
    ) : null;

  let overlay: ReactNode = null;
  if (localOnly) {
    overlay = (
      <Glass style={styles.centerCard}>
        <LocalOnlyState body={t('map.localOnlyBody')}>
          <Button title={t('common.localOnlyAction')} variant="secondary" compact onPress={() => router.push('/profile')} />
        </LocalOnlyState>
      </Glass>
    );
  } else if (mode === 'club' && !clubId) {
    overlay = (
      <Glass style={styles.centerCard}>
        <View style={styles.cta}>
          <HexMark size={56} color={c.club} icon="shield" />
          <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{t('map.noClubTitle')}</Text>
          <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center' }]}>{t('map.noClubBody')}</Text>
          <Button title={t('map.noClubAction')} variant="club" compact icon="search" onPress={() => router.push('/clubs')} style={{ marginTop: space.sm }} />
        </View>
      </Glass>
    );
  } else if (mode === 'mine' && mine.data && mine.data.ever.length === 0 && mine.data.held.length === 0) {
    overlay = (
      <Glass style={styles.centerCard}>
        <View style={styles.cta}>
          <HexMark size={56} color={c.accent} icon="hexagonOutline" />
          <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{t('map.mineEmptyTitle')}</Text>
          <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center' }]}>{t('map.mineEmptyBody')}</Text>
        </View>
      </Glass>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={android ? PROVIDER_GOOGLE : undefined}
        initialRegion={initial}
        onMapReady={() => setMapReady(true)}
        mapType={android ? 'standard' : 'mutedStandard'}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        customMapStyle={android ? (dark ? darkMapStyle : lightMapStyle) : undefined}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        mapPadding={{ top: top + 96, bottom, left: 0, right: 0 }}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
        accessibilityLabel={t('map.a11yMap')}>
        <HexLayer shapes={shapes} />
      </MapView>

      <View pointerEvents="box-none" style={[styles.top, { top }]}>
        <View style={styles.topRow}>
          <Glass style={{ flex: 1 }} round={radius.md + 2}>
            <View style={styles.segmented} accessibilityRole="tablist">
              {modes.map((m) => {
                const active = m.value === mode;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => {
                      if (active) return;
                      tap();
                      setSelected(null);
                      setMode(m.value);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={[styles.segment, active && { backgroundColor: m.value === 'club' ? c.club : c.accent }]}>
                    <Text style={[type.callout, { fontFamily: fonts.semibold, color: active ? (m.value === 'club' ? '#1A1100' : c.onAccent) : c.text }]} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Glass>
          <Glass round={22}>
            <PressableScale onPress={() => {
                tap();
                locate();
              }} accessibilityRole="button" accessibilityLabel={t('map.locate')} style={styles.locate} hitSlop={6}>
              <Icon name="locationNorth" size={18} color={c.accentStrong} />
            </PressableScale>
          </Glass>
        </View>
        <View style={styles.secondRow} pointerEvents="box-none">
          <View style={{ flex: 1, alignItems: 'flex-start' }} pointerEvents="box-none">
            {pill}
          </View>
          {!localOnly && held != null ? (
            <Animated.View entering={FadeIn.duration(250)}>
              <Glass round={radius.pill}>
                <View style={styles.statChip} accessible accessibilityLabel={plural('map.hexesHeld', held)}>
                  <Icon name="hexagon" size={13} color={c.accentStrong} />
                  <Text style={[type.callout, { color: c.text, fontFamily: fonts.numSemibold, fontSize: 15, fontVariant: ['tabular-nums'] }]}>{plural('map.hexesHeld', held)}</Text>
                </View>
              </Glass>
            </Animated.View>
          ) : null}
        </View>
        {offline && !localOnly ? <OfflineBanner style={{ marginTop: space.sm }} /> : null}
      </View>

      {overlay ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlayWrap]}>
          <Animated.View entering={FadeInDown.springify().damping(18)} key={mode + String(localOnly)}>
            {overlay}
          </Animated.View>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={[styles.bottom, { bottom }]}>
        {selected ? <SelectionCard key={selected.cell} selection={selected} onClose={() => setSelected(null)} /> : null}
        <View style={styles.bottomRow} pointerEvents="box-none">
          {!localOnly ? (
            <Animated.View layout={LinearTransition.springify().damping(20)}>
              <Glass round={radius.md}>
                <View style={styles.legend} accessible accessibilityLabel={`${t('map.legend')}: ${legend.map((l) => l.label).join(', ')}`}>
                  {legend.map((l) => (
                    <View key={l.key} style={styles.legendItem}>
                      <HexMark size={14} color={l.fill} filled={!l.outline} />
                      <Text style={[type.caption, { color: c.text }]}>{l.label}</Text>
                    </View>
                  ))}
                </View>
              </Glass>
            </Animated.View>
          ) : null}
          <Glass round={radius.pill}>
            <PressableScale
              onPress={() => {
                tap();
                router.push('/season');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('map.seasonBoards')}
              style={styles.seasonPill}>
              <Icon name="trophy" size={14} color={c.gold} />
              <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
                {t('map.seasonBoards')}
              </Text>
              <Icon name="chevronRight" size={11} color={c.textTertiary} />
            </PressableScale>
          </Glass>
        </View>
      </View>
    </View>
  );
}

function StatusPill({ text, icon, spinner, tone, onPress }: { text: string; icon?: IconName; spinner?: boolean; tone?: 'danger'; onPress?: () => void }) {
  const c = useColors();
  const color = tone === 'danger' ? c.danger : c.text;
  const content = (
    <View style={styles.statusPill}>
      {spinner ? <ActivityIndicator size="small" color={c.accent} /> : icon ? <Icon name={icon} size={13} color={tone === 'danger' ? c.danger : c.accentStrong} /> : null}
      <Text style={[type.caption, { color, fontFamily: fonts.semibold }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} exiting={FadeOut.duration(150)} style={{ maxWidth: '100%' }} accessibilityLiveRegion="polite">
      <Glass round={radius.pill}>
        {onPress ? (
          <PressableScale
            onPress={() => {
              tap();
              onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={text}>
            {content}
          </PressableScale>
        ) : (
          content
        )}
      </Glass>
    </Animated.View>
  );
}

function SelectionCard({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const c = useColors();
  const { t } = useT();
  let color: string;
  let title: string;
  let subtitle: string;
  let hint: string;
  if ('owner' in selection) {
    const o = selection.owner;
    color = ownerColor(c, o.owner);
    title = o.owner === 'me' ? t('map.heldByYou') : o.name;
    subtitle = { me: t('map.ownerMe'), friend: t('map.ownerFriend'), club: t('map.ownerClub'), other: t('map.ownerOther') }[o.owner];
    hint = o.owner === 'me' ? t('map.keepHint') : t('map.stealHint');
  } else {
    color = c.accent;
    title = selection.held ? t('map.heldByYou') : t('map.onceYours');
    subtitle = t('map.modeMine');
    hint = selection.held ? t('map.keepHint') : t('map.onceYoursHint');
  }
  const ownerDot = 'owner' in selection && selection.owner.owner !== 'me' ? selection.owner.color : null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)} style={{ marginBottom: space.sm }}>
      <Glass>
        <View style={styles.selection} accessible accessibilityLabel={`${title}. ${subtitle}. ${hint}`}>
          <HexMark size={42} color={color} icon={'owner' in selection && selection.owner.owner !== 'me' ? 'person' : 'hexagon'} filled={!('held' in selection) || selection.held} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {ownerDot ? <View style={[styles.dot, { backgroundColor: ownerDot }]} /> : null}
              <Text style={[type.bodyStrong, { color: c.text, flexShrink: 1 }]} numberOfLines={1}>
                {title}
              </Text>
            </View>
            <Text style={[type.caption, { color }]} numberOfLines={1}>
              {subtitle}
            </Text>
            <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={2}>
              {hint}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('map.closeCard')} style={[styles.close, { backgroundColor: c.surfacePressed }]}>
            <Icon name="close" size={11} color={c.textSecondary} />
          </Pressable>
        </View>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: space.lg, right: space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  segmented: { flexDirection: 'row', padding: 4, gap: 2 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: radius.sm + 1 },
  locate: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  secondRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.sm },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, height: 34 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, height: 34 },
  overlayWrap: { justifyContent: 'center', paddingHorizontal: space.xl },
  centerCard: { alignSelf: 'stretch' },
  cta: { alignItems: 'center', gap: space.sm, padding: space.xl },
  bottom: { position: 'absolute', left: space.lg, right: space.lg },
  bottomRow: { alignItems: 'flex-end', gap: space.sm },
  legend: { paddingHorizontal: space.md, paddingVertical: space.sm + 2, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seasonPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.lg, height: 44 },
  selection: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  close: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
