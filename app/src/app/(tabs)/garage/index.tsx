import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AddCarTile, CarCard } from '@/components/garage/car-card';
import { carLabel, deleteCar, setActiveCar } from '@/components/garage/cars';
import { MOD_STYLES, PresetTile } from '@/components/garage/mod-presets';
import { HexMark } from '@/components/hex';
import { PressableScale } from '@/components/pressable-scale';
import { actionMenu, confirm } from '@/components/social/action-menu';
import { useRefreshOnFocus } from '@/components/social/hooks';
import { EmptyState, ErrorState, Skeleton } from '@/components/states';
import { Button, Screen, SectionTitle } from '@/components/ui';
import { useSettings, type GarageCar } from '@/data/settings';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type, useColors, withAlpha } from '@/theme';
import { impact, success, tap } from '@/ui-lib/haptics';
import { useConfig, useLocalOnly, useMods } from '@/ui-lib/remote';

export default function GarageScreen() {
  const { width } = useWindowDimensions();
  const c = useColors();
  const { t } = useT();
  const cars = useSettings((s) => s.cars);
  const activeId = useSettings((s) => s.activeCarId);
  const localOnly = useLocalOnly();
  const inner = width - space.lg * 2;
  const half = (inner - space.md) / 2;

  const active = cars.find((x) => x.id === activeId) ?? null;
  const others = cars.filter((x) => x !== active);

  const menu = (car: GarageCar) => {
    impact('light');
    const isActive = car.id === active?.id;
    actionMenu(car.nickname || carLabel(car), [
      ...(isActive
        ? []
        : [
            {
              text: t('garage.setActive'),
              onPress: () => {
                setActiveCar(car, localOnly);
                success();
              },
            },
          ]),
      { text: t('garage.editCar'), onPress: () => router.push(`/car?id=${car.id}`) },
      {
        text: t('garage.deleteCar'),
        destructive: true,
        onPress: () => confirm(t('garage.deleteCarTitle', { name: car.nickname || carLabel(car) }), t('garage.deleteCarBody'), t('common.delete'), () => deleteCar(car.id, localOnly)),
      },
    ]);
  };

  return (
    <Screen>
      <SectionTitle title={t('garage.myCars')} action={cars.length ? t('garage.addCar') : undefined} onAction={() => router.push('/car')} />
      {cars.length === 0 ? (
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          <View style={[styles.empty, { borderColor: c.borderStrong, backgroundColor: c.surface }]}>
            <EmptyState icon="car" title={t('garage.emptyTitle')} body={t('garage.emptyBody')} action={t('garage.addCar')} onAction={() => router.push('/car')} />
          </View>
        </Animated.View>
      ) : (
        <View style={{ gap: space.md }}>
          {active ? (
            <Animated.View entering={FadeInDown.springify().damping(18)}>
              <CarCard car={active} active hero width={inner} onPress={() => router.push(`/car?id=${active.id}`)} onLongPress={() => menu(active)} />
            </Animated.View>
          ) : null}
          <View style={styles.grid}>
            {others.map((car, i) => (
              <Animated.View key={car.id} entering={FadeInDown.delay(60 + i * 40).springify().damping(18)}>
                <CarCard car={car} active={false} width={half} onPress={() => router.push(`/car?id=${car.id}`)} onLongPress={() => menu(car)} />
              </Animated.View>
            ))}
            <Animated.View entering={FadeInDown.delay(60 + others.length * 40).springify().damping(18)}>
              <AddCarTile width={half} height={others.length ? Math.round(half * 0.62) + 58 : 96} onPress={() => router.push('/car')} />
            </Animated.View>
          </View>
          {cars.length > 1 ? <Text style={[type.caption, { color: c.textTertiary, marginHorizontal: space.xs }]}>{t('garage.longPressHint')}</Text> : null}
        </View>
      )}

      <ModsSection width={inner} localOnly={localOnly} />
    </Screen>
  );
}

function ModsSection({ width, localOnly }: { width: number; localOnly: boolean }) {
  const c = useColors();
  const { t, plural } = useT();
  const config = useConfig();
  const enabled = !localOnly && !!config.data?.features.aiMods;
  const mods = useMods(enabled);
  useRefreshOnFocus(() => {
    if (enabled) mods.reload();
  });

  if (localOnly) {
    return <Text style={[type.caption, { color: c.textTertiary, marginTop: space.xxl, marginHorizontal: space.xs }]}>{t('garage.modsLocalOnly')}</Text>;
  }
  if (!enabled) return null;

  const perDay = config.data?.modsPerDay ?? 0;
  const left = mods.data?.remainingToday ?? null;
  const tile = Math.round((width - space.sm * 2) / 3);
  const preset = 150;

  return (
    <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={{ marginTop: space.xxl }}>
      <View style={[styles.hero, { backgroundColor: c.hero }]}>
        <LinearGradient colors={[withAlpha(brand.emerald, 0.28), withAlpha(brand.emerald, 0)]} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 0.9 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroHead}>
          <HexMark size={40} color={brand.emerald} icon="sparkles" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.headline, { color: c.onHero }]}>{t('garage.modsTitle')}</Text>
            <Text style={[type.caption, { color: c.onHeroSecondary }]}>{t('garage.modsBody')}</Text>
          </View>
        </View>
        <FlatList
          horizontal
          data={MOD_STYLES}
          keyExtractor={(s) => s}
          showsHorizontalScrollIndicator={false}
          snapToInterval={preset + space.sm}
          decelerationRate="fast"
          contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}
          renderItem={({ item }) => (
            <PresetTile style={item} width={preset} showBody={false} onPress={() => router.push(`/mods/new?style=${item}`)} containerStyle={{ backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.08)' }} dark />
          )}
        />
        <View style={styles.heroFoot}>
          {left != null ? (
            <View style={{ flex: 1, gap: 6 }} accessible accessibilityLabel={t('garage.remaining', { n: left, max: perDay })}>
              <Text style={[type.mono, { color: c.onHero }]}>
                <Text style={{ fontFamily: fonts.numBold, color: left > 0 ? brand.emerald : c.onHeroSecondary }}>{left}</Text>
                <Text style={{ color: c.onHeroSecondary }}> / {perDay}</Text>
              </Text>
              <Text style={[type.caption, { color: c.onHeroSecondary }]}>{t('garage.leftToday')}</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button title={t('garage.modCta')} icon="sparkles" onPress={() => router.push('/mods/new')} disabled={left === 0} />
        </View>
      </View>

      <SectionTitle title={mods.data?.items.length ? plural('garage.galleryCount', mods.data.items.length) : t('garage.gallery')} style={{ marginTop: space.xl }} />
      {mods.loading && !mods.data ? (
        <View style={styles.gallery}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width={tile} height={tile} radius={radius.md} />
          ))}
        </View>
      ) : mods.error && !mods.data ? (
        <ErrorState error={mods.error} onRetry={mods.reload} />
      ) : !mods.data?.items.length ? (
        <EmptyState icon="photo" title={t('garage.galleryEmpty')} body={t('garage.galleryEmptyBody')} />
      ) : (
        <View style={styles.gallery}>
          {mods.data.items.map((m, i) => (
            <Animated.View key={m.id} entering={FadeInDown.delay(Math.min(i, 12) * 30).springify().damping(18)}>
              <PressableScale
                scaleTo={0.95}
                onPress={() => {
                  tap();
                  router.push(`/mods/${m.id}`);
                }}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${m.carLabel}, ${m.style}`}
                style={[styles.thumb, { width: tile, height: tile, backgroundColor: c.surfaceRaised }]}>
                <Image source={{ uri: m.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} recyclingKey={m.id} />
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  hero: { borderRadius: radius.xl, overflow: 'hidden', paddingVertical: space.lg, gap: space.lg },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  gallery: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { borderRadius: radius.md, overflow: 'hidden' },
});
