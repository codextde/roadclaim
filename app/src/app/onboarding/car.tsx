import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import { OnboardingFrame, useFlow } from '@/components/onboarding-frame';
import { PressableScale } from '@/components/pressable-scale';
import { Swatches } from '@/components/profile-form';
import { EmptyState } from '@/components/states';
import { Button, Chip, Field, Label, SearchField, tap } from '@/components/ui';
import { type CatalogCar, searchCars } from '@/data/cars';
import { type GarageCar, useSettings } from '@/data/settings';
import { type Key, useT } from '@/i18n';
import { carColors, radius, space, type, useColors } from '@/theme';
import { remote, useLocalOnly, useSession } from '@/ui-lib/remote';

function yearsOf(car: CatalogCar) {
  const [from, to] = car.years;
  const last = to ?? new Date().getFullYear();
  const out: number[] = [];
  for (let y = last; y >= from; y--) out.push(y);
  return out;
}

function CarResult({ car, onPress }: { car: CatalogCar; onPress: () => void }) {
  const c = useColors();
  const [from, to] = car.years;
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${car.make} ${car.model}`}
      style={[styles.result, { borderBottomColor: c.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Label>{car.make}</Label>
        <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
          {car.model}
        </Text>
      </View>
      <Text style={[type.mono, { color: c.textTertiary }]}>
        {from}
        {'–'}
        {to ?? ''}
      </Text>
      <Icon name="chevronRight" size={12} color={c.textTertiary} />
    </PressableScale>
  );
}

export default function CarStep() {
  const c = useColors();
  const { t } = useT();
  const flow = useFlow('car');
  const { me } = useSession();
  const localOnly = useLocalOnly();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CatalogCar | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [color, setColor] = useState<string>(carColors[0].hex);
  const [nickname, setNickname] = useState('');
  const results = picked ? [] : searchCars(q.trim()).slice(0, 80);
  const last = flow.step === flow.total;

  function save() {
    if (!picked) return;
    const car: GarageCar = {
      id: Crypto.randomUUID(),
      catalogId: picked.id,
      make: picked.make,
      model: picked.model,
      color,
      ...(year ? { year } : {}),
      ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
    };
    useSettings.setState((s) => ({ cars: [...s.cars, car], activeCarId: car.id }));
    if (me && !localOnly) {
      remote.updateMe({ car: { id: car.catalogId, label: `${car.make} ${car.model}`, color } }).catch(() => undefined);
    }
    flow.next();
  }

  return (
    <OnboardingFrame
      step={flow.step}
      total={flow.total}
      title={t('onboarding.car.title')}
      body={t('onboarding.car.body')}
      scroll={false}
      footer={
        picked ? (
          <Button title={last ? t('onboarding.car.finish') : t('onboarding.car.use')} icon={last ? 'check' : 'arrowRight'} large onPress={save} />
        ) : (
          <Button title={t('onboarding.car.skip')} variant="secondary" onPress={flow.next} />
        )
      }>
      {picked ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.picked, { backgroundColor: c.surface, borderColor: c.border }]}>
            <HexMark size={52} color={color} icon="carSide" filled />
            <View style={{ flex: 1, gap: 2 }}>
              <Label>{picked.make}</Label>
              <Text style={[type.headline, { color: c.text }]} numberOfLines={2}>
                {picked.model}
              </Text>
              {year ? <Text style={[type.mono, { color: c.textSecondary }]}>{year}</Text> : null}
            </View>
            <Button title={t('onboarding.car.change')} variant="secondary" compact onPress={() => setPicked(null)} />
          </Animated.View>

          <View style={{ gap: space.md }}>
            <Label style={{ paddingHorizontal: space.xs }}>{t('onboarding.car.year')}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
              <View style={{ width: space.lg - space.sm }} />
              {yearsOf(picked).map((y) => (
                <Chip key={y} label={String(y)} active={year === y} onPress={() => setYear(year === y ? null : y)} />
              ))}
              <View style={{ width: space.lg - space.sm }} />
            </ScrollView>
          </View>

          <View style={{ gap: space.md }}>
            <Label style={{ paddingHorizontal: space.xs }}>{t('onboarding.car.color')}</Label>
            <Swatches colors={carColors.map((o) => ({ hex: o.hex, label: t(`onboarding.colors.${o.id}` as Key) }))} value={color} onChange={setColor} />
          </View>

          <Field
            label={`${t('onboarding.car.nickname')} (${t('common.optional')})`}
            value={nickname}
            onChangeText={setNickname}
            placeholder={t('onboarding.car.nicknamePlaceholder')}
            maxLength={32}
            returnKeyType="done"
          />
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <SearchField value={q} onChangeText={setQ} placeholder={t('onboarding.car.search')} />
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}
            renderItem={({ item }) => (
              <Animated.View entering={FadeIn.duration(180)}>
                <CarResult
                  car={item}
                  onPress={() => {
                    setPicked(item);
                    setYear(null);
                  }}
                />
              </Animated.View>
            )}
            ListEmptyComponent={q.trim() ? <EmptyState icon="car" title={t('onboarding.car.emptyTitle')} body={t('onboarding.car.emptyBody')} /> : null}
          />
        </View>
      )}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  picked: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
