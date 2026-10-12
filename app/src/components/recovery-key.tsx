import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { fonts, radius, space, type, useColors } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { remote, useSession } from '@/ui-lib/remote';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { ErrorState, isOfflineError, Skeleton } from './states';
import { Button, Field, Notice, tap } from './ui';

export function keyChunks(key: string) {
  const clean = key.trim();
  if (/[-\s]/.test(clean)) return clean.split(/[-\s]+/).filter(Boolean);
  return clean.match(/.{1,4}/g) ?? [];
}

export function RecoveryKeyCard({
  value,
  loading,
  error,
  onRetry,
  hidden,
  onToggle,
}: {
  value: string | null | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  hidden?: boolean;
  onToggle?: () => void;
}) {
  const c = useColors();
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(id);
  }, [copied]);

  if (error && !value) return <ErrorState error={error} onRetry={onRetry} />;

  const chunks = value ? keyChunks(value) : [];
  return (
    <View style={[styles.card, { backgroundColor: c.hero }]}>
      <View style={styles.head}>
        <Icon name="key" size={14} color={c.accentStrong} />
        <Text style={[type.label, { color: c.onHeroSecondary, flex: 1 }]}>{t('profile.recovery.label')}</Text>
        {onToggle && value ? (
          <PressableScale
            onPress={() => {
              tap();
              onToggle();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t('profile.recovery.reveal') : t('profile.recovery.hide')}
            style={styles.toggle}>
            <Icon name={hidden ? 'eye' : 'eyeSlash'} size={14} color="#FFFFFF" />
            <Text style={[type.caption, { color: '#FFFFFF', fontFamily: fonts.semibold }]}>{hidden ? t('profile.recovery.reveal') : t('profile.recovery.hide')}</Text>
          </PressableScale>
        ) : null}
      </View>

      {loading && !value ? (
        <View style={{ gap: space.sm }}>
          <Skeleton height={26} style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <Skeleton height={26} width="70%" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </View>
      ) : (
        <Animated.View key={hidden ? 'h' : 'v'} entering={FadeIn.duration(220)} style={styles.chunks} accessible accessibilityLabel={hidden ? t('profile.recovery.hiddenHint') : chunks.join(' ')}>
          {chunks.map((chunk, i) => (
            <View key={i} style={styles.chunk}>
              <Text style={styles.chunkText} allowFontScaling={false} selectable={!hidden}>
                {hidden ? '•'.repeat(chunk.length) : chunk}
              </Text>
            </View>
          ))}
        </Animated.View>
      )}

      {hidden ? <Text style={[type.caption, { color: c.onHeroSecondary }]}>{t('profile.recovery.hiddenHint')}</Text> : null}

      <Button
        title={copied ? t('profile.recovery.copied') : t('profile.recovery.copy')}
        icon={copied ? 'check' : 'copy'}
        variant={copied ? 'primary' : 'glass'}
        disabled={!value}
        onPress={() => {
          if (!value) return;
          Clipboard.setStringAsync(value)
            .then(() => {
              success();
              setCopied(true);
            })
            .catch(() => failure());
        }}
      />
    </View>
  );
}

export function RestoreForm({ onRestored, showReplaceNotice }: { onRestored: () => void; showReplaceNotice?: boolean }) {
  const c = useColors();
  const { t } = useT();
  const session = useSession();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = key.trim();

  async function paste() {
    const text = await Clipboard.getStringAsync().catch(() => '');
    if (text) {
      setKey(text.trim());
      setError(null);
    }
  }

  async function submit() {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await remote.restore(trimmed);
      await session.refresh().catch(() => undefined);
      success();
      onRestored();
    } catch (e) {
      failure();
      setError(isOfflineError(e) ? t('common.offlineBody') : t('profile.restore.invalid'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: space.lg }}>
      <Field
        value={key}
        onChangeText={(v) => {
          setKey(v);
          setError(null);
        }}
        placeholder={t('profile.restore.placeholder')}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        multiline
        error={error}
        style={[type.mono, { fontSize: 17, minHeight: 64, textAlignVertical: 'top', color: c.text }]}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        onSubmitEditing={submit}
        accessibilityLabel={t('profile.restore.placeholder')}
        right={
          trimmed ? null : (
            <Button title={t('profile.restore.paste')} icon="doc" variant="secondary" compact onPress={paste} />
          )
        }
      />
      {showReplaceNotice ? <Notice tone="warn" icon="warning" title={t('profile.restore.replaceNotice')} /> : null}
      <Button title={t('profile.restore.submit')} icon="restore" large loading={busy} disabled={trimmed.length < 8} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)' },
  chunks: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chunk: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  chunkText: { fontFamily: fonts.numSemibold, fontSize: 22, lineHeight: 26, letterSpacing: 2.5, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
});
