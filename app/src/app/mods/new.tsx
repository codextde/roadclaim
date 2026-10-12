import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { carColorEnglish, carLabel } from '@/components/garage/cars';
import { MOD_STYLES, PresetTile, type ModStyle } from '@/components/garage/mod-presets';
import { ModProgress } from '@/components/garage/mod-progress';
import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { showError } from '@/components/social/action-menu';
import { EmptyState, errorCode, LocalOnlyState } from '@/components/states';
import { Button, ChipRow, Field, Label, Notice, Pill, Screen } from '@/components/ui';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type, useColors } from '@/theme';
import { failure, impact, success, tap } from '@/ui-lib/haptics';
import { remote, useConfig, useLocalOnly, useMods } from '@/ui-lib/remote';

type Blocker = 'limit' | 'disabled' | null;

export default function NewModScreen() {
  const c = useColors();
  const { t } = useT();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ style?: string }>();
  const cars = useSettings((s) => s.cars);
  const activeId = useSettings((s) => s.activeCarId);
  const localOnly = useLocalOnly();
  const config = useConfig();
  const enabled = !localOnly && !!config.data?.features.aiMods;
  const mods = useMods(enabled);

  const [carId, setCarId] = useState<string | null>(activeId ?? cars[0]?.id ?? null);
  const [style, setStyle] = useState<ModStyle>(MOD_STYLES.includes(params.style as ModStyle) ? (params.style as ModStyle) : 'widebody');
  const [prompt, setPrompt] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocker, setBlocker] = useState<Blocker>(null);

  const car = cars.find((x) => x.id === carId) ?? cars[0] ?? null;
  const left = mods.data?.remainingToday ?? null;
  const tile = (width - space.lg * 2 - space.md) / 2;
  const needsPrompt = style === 'custom' && prompt.trim().length < 3;
  const outOfMods = left === 0 || blocker === 'limit';

  const pick = async (source: 'camera' | 'library') => {
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 };
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert(t('garage.cameraDenied'));
    }
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (!res.canceled && res.assets[0]) {
      tap();
      setPhoto(res.assets[0].uri);
    }
  };

  const choosePhoto = () =>
    Alert.alert(t('garage.photoSource'), undefined, [
      { text: t('garage.takePhoto'), onPress: () => pick('camera') },
      { text: t('garage.chooseLibrary'), onPress: () => pick('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  const generate = async () => {
    if (!car || needsPrompt || outOfMods) return;
    impact('medium');
    setBusy(true);
    const form = new FormData();
    form.append('style', style);
    if (style === 'custom' || prompt.trim()) form.append('prompt', prompt.trim());
    form.append('carLabel', [car.year, carLabel(car)].filter(Boolean).join(' '));
    const colorName = carColorEnglish(car.color);
    if (colorName && !photo) form.append('color', colorName);
    if (photo) form.append('photo', { uri: photo, name: 'car.jpg', type: 'image/jpeg' } as unknown as Blob);
    try {
      const res = await remote.createMod(form);
      success();
      mods.reload();
      router.replace({ pathname: '/mods/[id]', params: { id: res.id, imageUrl: res.imageUrl, createdAt: res.createdAt, style, carLabel: carLabel(car) } });
    } catch (e) {
      setBusy(false);
      const ec = errorCode(e);
      if (ec === 'limit_reached') {
        failure();
        setBlocker('limit');
        mods.reload();
      } else if (ec === 'disabled') {
        failure();
        setBlocker('disabled');
      } else showError(e);
    }
  };

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState body={t('garage.modsLocalOnly')} />
      </Screen>
    );
  }

  if (busy) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center', paddingBottom: space.xxxl }}>
        <Stack.Screen options={{ gestureEnabled: false, headerBackVisible: false, title: '' }} />
        <ModProgress color={car?.color ?? brand.emerald} />
      </View>
    );
  }

  if (!car) {
    return (
      <Screen>
        <EmptyState icon="car" title={t('garage.modsNoCar')} body={t('garage.modsNoCarBody')} action={t('garage.addCar')} onAction={() => router.push('/car')} />
      </Screen>
    );
  }

  if (blocker === 'disabled' || (config.data && !config.data.features.aiMods)) {
    return (
      <Screen>
        <EmptyState icon="sparkles" tint={c.textSecondary} title={t('garage.modsDisabled')} body={t('garage.modsDisabledBody')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: true, headerBackVisible: true, title: t('garage.modsNewTitle') }} />
      {left != null ? (
        <Animated.View entering={FadeIn.duration(250)} style={{ flexDirection: 'row', marginBottom: space.lg }}>
          <Pill text={t('garage.remaining', { n: left, max: config.data?.modsPerDay ?? left })} icon="sparkles" color={left > 0 ? c.accentStrong : c.textSecondary} bg={left > 0 ? c.accentSoft : c.surfaceRaised} />
        </Animated.View>
      ) : null}

      {outOfMods ? <Notice tone="warn" icon="clock" title={t('garage.limitTitle')} body={t('garage.limitBody')} style={{ marginBottom: space.xl }} /> : null}

      <Animated.View entering={FadeInDown.springify().damping(18)} style={{ gap: space.sm, marginBottom: space.xl }}>
        <Label>{t('garage.stepCar')}</Label>
        <ChipRow
          options={cars.map((x) => ({ value: x.id, label: x.nickname || carLabel(x), icon: 'car' as const }))}
          value={car.id}
          onChange={setCarId}
          style={{ marginHorizontal: -space.lg }}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={{ gap: space.sm, marginBottom: space.xl }}>
        <Label>{t('garage.stepStyle')}</Label>
        <View style={styles.grid}>
          {MOD_STYLES.map((s) => (
            <PresetTile key={s} style={s} width={tile} selected={s === style} onPress={() => setStyle(s)} />
          ))}
        </View>
      </Animated.View>

      {style === 'custom' ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} layout={LinearTransition} style={{ marginBottom: space.xl }}>
          <Field
            label={t('garage.promptLabel')}
            value={prompt}
            onChangeText={setPrompt}
            placeholder={t('garage.promptPlaceholder')}
            maxLength={200}
            multiline
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            hint={`${prompt.length} / 200`}
          />
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} layout={LinearTransition} style={{ gap: space.sm, marginBottom: space.xxl }}>
        <Label>{`${t('garage.stepPhoto')} (${t('common.optional')})`}</Label>
        <View style={[styles.photoRow, { backgroundColor: c.surface, borderColor: c.border }]}>
          <PressableScale
            onPress={() => {
              tap();
              choosePhoto();
            }}
            accessibilityRole="button"
            accessibilityLabel={photo ? t('garage.changePhoto') : t('garage.addPhoto')}
            style={[styles.photo, { backgroundColor: c.surfaceSunken, borderColor: c.borderStrong }]}>
            {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <Icon name="camera" size={22} color={c.textSecondary} />}
          </PressableScale>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{photo ? t('garage.photoReady') : t('garage.photoTitle')}</Text>
            <Text style={[type.caption, { color: c.textSecondary }]}>{t('garage.modPhotoHint')}</Text>
            {photo ? (
              <Pressable onPress={() => setPhoto(null)} hitSlop={8} accessibilityRole="button">
                <Text style={[type.caption, { color: c.danger, fontFamily: fonts.semibold }]}>{t('garage.removePhoto')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Animated.View>

      <Button title={t('garage.generate')} icon="sparkles" large onPress={generate} disabled={needsPrompt || outOfMods} />
      <Text style={[type.caption, { color: c.textTertiary, textAlign: 'center', marginTop: space.md }]}>{t('garage.generateHint')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  photo: { width: 88, height: 66, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
