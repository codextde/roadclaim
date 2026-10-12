import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { Pill } from '@/components/ui';
import type { GarageCar } from '@/data/settings';
import { useT } from '@/i18n';
import { tap } from '@/ui-lib/haptics';
import { fonts, radius, space, type, useColors, withAlpha } from '@/theme';

import { CarSilhouette } from './car-silhouette';
import { carColorName, carLabel } from './cars';

export function CarStage({ car, height, width, style }: { car: Pick<GarageCar, 'color' | 'photoUri'>; height: number; width: number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const carWidth = Math.min(width * 0.78, height * 1.9);
  return (
    <View style={[{ height, backgroundColor: c.hero, overflow: 'hidden' }, style]}>
      {car.photoUri ? (
        <Image source={{ uri: car.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <>
          <LinearGradient colors={[withAlpha(car.color, 0.32), withAlpha(car.color, 0)]} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0.1 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.floor, { backgroundColor: withAlpha('#FFFFFF', 0.05) }]} />
          <CarSilhouette color={car.color} width={carWidth} style={{ alignSelf: 'center', marginTop: height * 0.8 - carWidth * 0.36 }} />
        </>
      )}
    </View>
  );
}

export function CarCard({
  car,
  active,
  hero,
  width,
  onPress,
  onLongPress,
}: {
  car: GarageCar;
  active: boolean;
  hero?: boolean;
  width: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const sub = [car.year, carColorName(car.color)].filter(Boolean).join(' · ');
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => {
        tap();
        onPress();
      }}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${car.nickname ?? carLabel(car)}, ${sub}${active ? `, ${t('garage.active')}` : ''}`}
      accessibilityHint={t('garage.carHint')}
      style={[
        styles.card,
        { width, backgroundColor: c.surface, borderColor: active ? c.accent : c.border, borderWidth: active ? 1.5 : StyleSheet.hairlineWidth },
        active && { shadowColor: c.accent, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
      ]}>
      <CarStage car={car} width={width} height={hero ? Math.round(width * 0.5) : Math.round(width * 0.62)} />
      {active ? <Pill text={t('garage.active')} icon="checkCircle" color={c.onAccent} bg={c.accent} style={styles.pill} /> : null}
      <View style={[styles.body, hero && { padding: space.lg }]}>
        <Text style={[hero ? type.headline : type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {car.nickname || carLabel(car)}
        </Text>
        <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
          {car.nickname ? `${carLabel(car)} · ${sub}` : sub}
        </Text>
      </View>
    </PressableScale>
  );
}

export function AddCarTile({ width, height, onPress }: { width: number; height: number; onPress: () => void }) {
  const c = useColors();
  const { t } = useT();
  return (
    <PressableScale
      scaleTo={0.97}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('garage.addCar')}
      style={[styles.add, { width, height, borderColor: c.borderStrong }]}>
      <View style={[styles.addIcon, { backgroundColor: c.accentSoft }]}>
        <Icon name="plus" size={18} color={c.accentStrong} />
      </View>
      <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{t('garage.addCar')}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden' },
  floor: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%' },
  pill: { position: 'absolute', top: space.md, left: space.md },
  body: { padding: space.md, gap: 2 },
  add: { borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  addIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
