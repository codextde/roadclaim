import { BlurView } from 'expo-blur';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { presetIcon, useStyleLabel } from '@/components/garage/mod-presets';
import { Icon } from '@/components/icon';
import type { IconName } from '@/components/icon-names';
import { PressableScale } from '@/components/pressable-scale';
import { confirm, showError } from '@/components/social/action-menu';
import { isOfflineError } from '@/components/states';
import { Button, IconButton } from '@/components/ui';
import { useT } from '@/i18n';
import { brand, fonts, radius, space, type } from '@/theme';
import { dateLabel } from '@/ui-lib/date';
import { failure, success, tap } from '@/ui-lib/haptics';
import { remote, useMods, type Mod } from '@/ui-lib/remote';

const WHITE = '#FFFFFF';
const WHITE_2 = 'rgba(255,255,255,0.62)';

async function download(mod: Pick<Mod, 'id' | 'imageUrl'>) {
  const file = new File(Paths.cache, `roadclaim-mod-${mod.id}.png`);
  if (file.exists) return file;
  return File.downloadFileAsync(mod.imageUrl, file, { idempotent: true });
}

export default function ModViewer() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const styleLabel = useStyleLabel();
  const params = useLocalSearchParams<{ id: string; imageUrl?: string; createdAt?: string; style?: string; carLabel?: string }>();
  const mods = useMods();
  const found = mods.data?.items.find((m) => m.id === params.id);
  const mod: Mod | null =
    found ?? (params.imageUrl ? { id: params.id, imageUrl: params.imageUrl, createdAt: params.createdAt ?? new Date().toISOString(), style: params.style ?? 'custom', carLabel: params.carLabel ?? '', prompt: '' } : null);
  const [chrome, setChrome] = useState(true);
  const [busy, setBusy] = useState<'save' | 'share' | 'delete' | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!mod) return;
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!perm.granted) {
        failure();
        Alert.alert(t('common.permissionPhotos'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const file = await download(mod);
      await MediaLibrary.Asset.create(file.uri);
      success();
      setSaved(true);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    if (!mod) return;
    setBusy('share');
    try {
      const file = await download(mod);
      await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('garage.shareMod') });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    if (!mod) return;
    confirm(t('garage.deleteModTitle'), t('garage.deleteModBody'), t('common.delete'), async () => {
      setBusy('delete');
      try {
        await remote.deleteMod(mod.id);
        success();
        mods.reload();
        router.back();
      } catch (e) {
        setBusy(null);
        showError(e);
      }
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {mod ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            tap();
            setChrome((v) => !v);
          }}
          accessibilityRole="image"
          accessibilityLabel={`${styleLabel(mod.style)}, ${mod.carLabel}`}>
          <Image source={{ uri: mod.imageUrl }} style={StyleSheet.absoluteFill} contentFit="contain" transition={300} recyclingKey={mod.id} />
        </Pressable>
      ) : mods.loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={WHITE} />
        </View>
      ) : (
        <View style={[styles.center, { gap: space.md, paddingHorizontal: space.xxl }]}>
          <Icon name={mods.error && isOfflineError(mods.error) ? 'offline' : 'photo'} size={28} color={WHITE_2} />
          <Text style={[type.callout, { color: WHITE_2, textAlign: 'center' }]}>
            {mods.error ? (isOfflineError(mods.error) ? t('common.offlineBody') : t('common.errorBody')) : t('garage.modMissing')}
          </Text>
          {mods.error ? <Button title={t('common.retry')} variant="glass" compact icon="refresh" onPress={mods.reload} /> : null}
        </View>
      )}

      {chrome ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[styles.top, { top: insets.top + space.sm }]}>
          <IconButton icon="close" label={t('common.close')} onPress={() => router.back()} bg="rgba(0,0,0,0.45)" tint={WHITE} size={40} />
        </Animated.View>
      ) : null}

      {chrome && mod ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOut.duration(160)} style={[styles.bar, { bottom: insets.bottom + space.md }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.meta}>
            <View style={styles.styleTag}>
              <Icon name={presetIcon(mod.style)} size={12} color={brand.emerald} />
              <Text style={[type.label, { color: brand.emerald }]}>{styleLabel(mod.style)}</Text>
            </View>
            <Text style={[type.headline, { color: WHITE }]} numberOfLines={1}>
              {mod.carLabel}
            </Text>
            <Text style={[type.caption, { color: WHITE_2 }]} numberOfLines={2}>
              {mod.prompt ? `${dateLabel(mod.createdAt)} · ${mod.prompt}` : dateLabel(mod.createdAt)}
            </Text>
          </View>
          <View style={styles.actions}>
            <Action icon={saved ? 'check' : 'download'} label={saved ? t('common.savedToPhotos') : t('common.saveToPhotos')} busy={busy === 'save'} onPress={save} />
            <Action icon="share" label={t('common.share')} busy={busy === 'share'} onPress={share} />
            <Action icon="trash" label={t('common.delete')} busy={busy === 'delete'} onPress={remove} danger />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Action({ icon, label, onPress, busy, danger }: { icon: IconName; label: string; onPress: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <PressableScale
      onPress={() => {
        if (busy) return;
        tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy }}
      style={styles.action}>
      <View style={[styles.actionIcon, { backgroundColor: danger ? 'rgba(242,85,90,0.18)' : 'rgba(255,255,255,0.12)' }]}>
        {busy ? <ActivityIndicator color={WHITE} size="small" /> : <Icon name={icon} size={18} color={danger ? '#FF7A7E' : WHITE} />}
      </View>
      <Text style={[type.caption, { color: danger ? '#FF7A7E' : WHITE_2, fontFamily: fonts.medium }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', right: space.lg },
  bar: { position: 'absolute', left: space.md, right: space.md, borderRadius: radius.xl, overflow: 'hidden', padding: space.lg, gap: space.lg, backgroundColor: 'rgba(18,20,23,0.55)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  meta: { gap: 3 },
  styleTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 6, minWidth: 84 },
  actionIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
