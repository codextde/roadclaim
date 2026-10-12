import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { type ReactNode, type RefObject, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, useColors } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';

export type CardFormat = 'square' | 'story';
export const CARD_W = 360;
export const cardHeight = (f: CardFormat) => (f === 'story' ? 640 : 360);
const EXPORT_W = 1080;

export function CardFrame({
  cardRef,
  format,
  maxWidth,
  maxHeight,
  label,
  children,
}: {
  cardRef: RefObject<View | null>;
  format: CardFormat;
  maxWidth: number;
  maxHeight: number;
  label: string;
  children: ReactNode;
}) {
  const c = useColors();
  const h = cardHeight(format);
  const scale = Math.min(maxWidth / CARD_W, maxHeight / h);
  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20)}
      style={[styles.frame, { width: CARD_W * scale, height: h * scale, borderColor: c.border }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}>
      <View style={{ width: CARD_W, height: h, transformOrigin: 'top left', transform: [{ scale }] }}>
        <View ref={cardRef} collapsable={false} style={{ width: CARD_W, height: h }}>
          {children}
        </View>
      </View>
    </Animated.View>
  );
}

export function useCardExport(ref: RefObject<View | null>, format: CardFormat, dialogTitle: string) {
  const { t } = useT();
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [saved, setSaved] = useState(false);

  async function capture() {
    return captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: EXPORT_W,
      height: (EXPORT_W * cardHeight(format)) / CARD_W,
      useRenderInContext: Platform.OS === 'ios',
    });
  }

  async function share() {
    if (busy) return;
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(t('drives.share.unavailable'));
      return;
    }
    setBusy('share');
    let uri: string;
    try {
      uri = await capture();
    } catch {
      failure();
      setBusy(null);
      Alert.alert(t('common.errorTitle'), t('drives.share.failed'));
      return;
    }
    try {
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
      success();
    } catch {
      return;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (busy) return;
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
      const uri = await capture();
      await MediaLibrary.Asset.create(uri);
      success();
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      failure();
      Alert.alert(t('common.errorTitle'), t('drives.share.failed'));
    } finally {
      setBusy(null);
    }
  }

  return { share, save, busy, saved };
}

export function ExportActions({ actions }: { actions: ReturnType<typeof useCardExport> }) {
  const { t } = useT();
  return (
    <View style={styles.actions}>
      <Button title={t('common.share')} icon="share" large loading={actions.busy === 'share'} onPress={actions.share} style={{ flex: 1 }} />
      <Button
        title={actions.saved ? t('common.savedToPhotos') : t('common.saveToPhotos')}
        icon={actions.saved ? 'check' : 'download'}
        variant="secondary"
        large
        loading={actions.busy === 'save'}
        onPress={actions.save}
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: 'row', gap: space.sm },
});
