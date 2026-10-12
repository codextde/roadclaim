import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { HexMark } from '@/components/hex';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { INVITE_BASE } from '@/ui-lib/remote';

export async function shareText(message: string, url?: string) {
  try {
    await Share.share(Platform.OS === 'ios' && url ? { message, url } : { message: url ? `${message} ${url}` : message });
  } catch {
    return;
  }
}

export function useCopy() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  return {
    copied,
    copy: async (text: string) => {
      await Clipboard.setStringAsync(text);
      success();
      setCopied(true);
    },
  };
}

export function InviteCard({ code, style }: { code: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { t } = useT();
  const { copied, copy } = useCopy();
  const url = `${INVITE_BASE}${code}`;
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.friendSoft }, style]}>
      <View style={styles.head}>
        <HexMark size={44} color={c.friend} icon="link" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.headline, { color: c.text }]}>{t('social.inviteTitle')}</Text>
          <Text style={[type.caption, { color: c.textSecondary }]}>{t('social.inviteBody')}</Text>
        </View>
      </View>
      <View style={[styles.link, { backgroundColor: c.surfaceSunken }]} accessible accessibilityLabel={url}>
        <Text style={[type.mono, { color: c.friend, flex: 1 }]} numberOfLines={1} selectable>
          {url.replace(/^https:\/\//, '')}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button title={t('common.share')} icon="share" variant="friend" onPress={() => shareText(t('social.inviteMessage'), url)} style={{ flex: 1 }} />
        <Button title={copied ? t('common.copied') : t('common.copy')} icon={copied ? 'check' : 'copy'} variant="secondary" onPress={() => copy(url)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.md },
  actions: { flexDirection: 'row', gap: space.sm },
});
