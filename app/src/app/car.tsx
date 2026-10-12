import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { CarStage } from '@/components/garage/car-card';
import { carLabel, deleteCar, syncActiveCar } from '@/components/garage/cars';
import { Swatches } from '@/components/garage/swatches';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { confirm } from '@/components/social/action-menu';
import { useDebounced } from '@/components/social/hooks';
import { EmptyState } from '@/components/states';
import { Button, Chip, Field, Label, Screen, SearchField, SheetHeader } from '@/components/ui';
import { getCar, searchCars, type CatalogCar } from '@/data/cars';
import { useSettings, type GarageCar } from '@/data/settings';
import { useT } from '@/i18n';
import { carColors, fonts, radius, space, type, useColors } from '@/theme';
import { success, tap } from '@/ui-lib/haptics';
import { useLocalOnly } from '@/ui-lib/remote';

function yearsOf(car: CatalogCar | null, fallback?: number) {
  if (!car) return fallback ? [fallback] : [];
  const now = new Date().getFullYear();
  const to = car.years[1] ?? now;
  const out: number[] = [];
  for (let y = Math.min(to, now + 1); y >= car.years[0]; y--) out.push(y);
  return out;
}

export default function CarSheet() {
  const c = useColors();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useSettings((s) => s.cars.find((x) => x.id === id) ?? null);
  const localOnly = useLocalOnly();

  const [model, setModel] = useState<CatalogCar | null>(() => {
    if (!existing) return null;
    return getCar(existing.catalogId) ?? { id: existing.catalogId, make: existing.make, model: existing.model, years: [existing.year ?? new Date().getFullYear(), existing.year ?? null], body: '' };
  });
  const [year, setYear] = useState<number | undefined>(existing?.year);
  const [color, setColor] = useState<string>(existing?.color ?? carColors[0].hex);
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [photoUri, setPhotoUri] = useState<string | undefined>(existing?.photoUri);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 150);
  const results = query.length >= 1 ? searchCars(query).slice(0, 60) : [];

  const colorOptions = carColors.map((x) => ({ value: x.hex, label: t(`garage.colors.${x.id}`) }));

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      tap();
      setPhotoUri(res.assets[0].uri);
    }
  };

  const save = () => {
    if (!model) return;
    const { cars, activeCarId } = useSettings.getState();
    const car: GarageCar = {
      id: existing?.id ?? Crypto.randomUUID(),
      catalogId: model.id,
      make: model.make,
      model: model.model,
      year,
      color,
      nickname: nickname.trim() || undefined,
      photoUri,
    };
    const next = existing ? cars.map((x) => (x.id === car.id ? car : x)) : [...cars, car];
    const makeActive = !activeCarId || !cars.some((x) => x.id === activeCarId);
    useSettings.setState({ cars: next, ...(makeActive ? { activeCarId: car.id } : {}) });
    if (makeActive || activeCarId === car.id) syncActiveCar(car, localOnly);
    success();
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    confirm(t('garage.deleteCarTitle', { name: existing.nickname || carLabel(existing) }), t('garage.deleteCarBody'), t('common.delete'), () => {
      deleteCar(existing.id, localOnly);
      router.back();
    });
  };

  const title = existing ? t('garage.editCar') : t('garage.addCar');

  if (!model) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <SheetHeader title={title} onClose={() => router.back()} closeLabel={t('common.close')} />
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
          <SearchField value={q} onChangeText={setQ} placeholder={t('garage.searchCars')} />
        </View>
        <FlatList
          data={results}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxxl }}
          ListEmptyComponent={
            <EmptyState
              icon={query ? 'search' : 'car'}
              title={query ? t('garage.noCars') : t('garage.searchTitle')}
              body={query ? t('garage.noCarsBody', { q: query }) : t('garage.searchBody')}
            />
          }
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => {
                tap();
                setModel(item);
                const ys = yearsOf(item);
                setYear(ys[0]);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.make} ${item.model}`}
              style={({ pressed }) => [styles.result, { borderBottomColor: c.border, borderBottomWidth: index < results.length - 1 ? StyleSheet.hairlineWidth : 0 }, pressed && { backgroundColor: c.surfacePressed }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.label, { color: c.textTertiary }]}>{item.make}</Text>
                <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                  {item.model}
                </Text>
                <Text style={[type.caption, { color: c.textSecondary }]}>
                  {[item.body, `${item.years[0]}–${item.years[1] ?? t('garage.today')}`].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Icon name="chevronRight" size={12} color={c.textTertiary} />
            </Pressable>
          )}
        />
      </View>
    );
  }

  const years = yearsOf(model, existing?.year);
  const stageWidth = width - space.lg * 2;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHeader title={title} onClose={() => router.back()} closeLabel={t('common.close')} />
      <Screen bottomInset={space.xxxl} contentContainerStyle={{ paddingTop: 0, gap: space.xl }}>
        <Animated.View entering={FadeIn.duration(250)} style={[styles.preview, { borderColor: c.border }]}>
          <CarStage car={{ color, photoUri }} width={stageWidth} height={Math.round(stageWidth * 0.5)} />
          <View style={[styles.previewBody, { backgroundColor: c.surface }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.label, { color: c.textTertiary }]}>{model.make}</Text>
              <Text style={[type.headline, { color: c.text }]} numberOfLines={1}>
                {nickname.trim() || model.model}
              </Text>
            </View>
            <Button title={t('garage.change')} variant="secondary" compact onPress={() => setModel(null)} />
          </View>
        </Animated.View>

        {years.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(40).springify().damping(18)} style={{ gap: space.sm }}>
            <Label>{t('garage.year')}</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
              {years.map((y) => (
                <Chip key={y} label={String(y)} active={y === year} onPress={() => setYear(y === year ? undefined : y)} />
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={{ gap: space.sm }}>
          <Label>{t('garage.color')}</Label>
          <Swatches options={colorOptions} value={color} onChange={setColor} size={36} showLabel />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify().damping(18)}>
          <Field label={`${t('garage.nickname')} (${t('common.optional')})`} value={nickname} onChangeText={setNickname} placeholder={t('garage.nicknamePlaceholder')} maxLength={24} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).springify().damping(18)} style={{ gap: space.sm }}>
          <Label>{`${t('garage.photo')} (${t('common.optional')})`}</Label>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <PressableScale
              onPress={() => {
                tap();
                pickPhoto();
              }}
              accessibilityRole="button"
              accessibilityLabel={photoUri ? t('garage.changePhoto') : t('garage.addPhoto')}
              style={[styles.photo, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
              {photoUri ? <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Icon name="photo" size={22} color={c.textSecondary} />}
            </PressableScale>
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{photoUri ? t('garage.changePhoto') : t('garage.addPhoto')}</Text>
              <Text style={[type.caption, { color: c.textSecondary }]}>{t('garage.photoHint')}</Text>
              {photoUri ? (
                <Pressable onPress={() => setPhotoUri(undefined)} hitSlop={8} accessibilityRole="button">
                  <Text style={[type.caption, { color: c.danger, fontFamily: fonts.semibold }]}>{t('garage.removePhoto')}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <View style={{ gap: space.sm }}>
          <Button title={existing ? t('common.save') : t('garage.addToGarage')} icon="check" large onPress={save} />
          {existing ? <Button title={t('garage.deleteCar')} icon="trash" variant="danger" onPress={remove} /> : null}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.sm },
  preview: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  previewBody: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  photo: { width: 96, height: 72, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
