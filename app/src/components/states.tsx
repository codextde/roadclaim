import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';

import { HexMark } from './hex';
import { Icon } from './icon';
import type { IconName } from './icon-names';
import { Button } from './ui';

export function EmptyState({
  icon = 'hexagonOutline',
  title,
  body,
  action,
  onAction,
  tint,
  style,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const color = tint ?? c.accent;
  return (
    <Animated.View entering={FadeIn.duration(300)} style={[{ alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl, gap: space.md }, style]}>
      <HexMark size={64} color={color} icon={icon} />
      <View style={{ gap: 6, alignItems: 'center', marginTop: space.xs }}>
        <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{title}</Text>
        {body ? <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 300 }]}>{body}</Text> : null}
      </View>
      {action && onAction ? <Button title={action} onPress={onAction} compact style={{ marginTop: space.sm }} /> : null}
    </Animated.View>
  );
}

export function ErrorState({ error, onRetry, style }: { error?: unknown; onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { t } = useT();
  const offline = isOfflineError(error);
  return (
    <View style={[{ alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.md }, style]}>
      <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: offline ? c.surfaceRaised : c.dangerSoft }}>
        <Icon name={offline ? 'offline' : 'warning'} size={22} color={offline ? c.textSecondary : c.danger} />
      </View>
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Text style={[type.bodyStrong, { color: c.text, textAlign: 'center' }]}>{offline ? t('common.offlineTitle') : t('common.errorTitle')}</Text>
        <Text style={[type.caption, { color: c.textSecondary, textAlign: 'center', maxWidth: 280 }]}>{offline ? t('common.offlineBody') : errorMessage(error, t('common.errorBody'))}</Text>
      </View>
      {onRetry ? <Button title={t('common.retry')} onPress={onRetry} variant="secondary" compact icon="refresh" /> : null}
    </View>
  );
}

export function LoadingState({ style, label }: { style?: StyleProp<ViewStyle>; label?: string }) {
  const c = useColors();
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxxl, gap: space.md }, style]}>
      <ActivityIndicator color={c.accent} />
      {label ? <Text style={[type.caption, { color: c.textSecondary }]}>{label}</Text> : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style, radius: r = radius.sm }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle>; radius?: number }) {
  const c = useColors();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 850 }), -1, true);
  }, [pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ height, width, borderRadius: r, backgroundColor: c.surfaceRaised }, animated, style]} />;
}

export function SkeletonList({ rows = 5, height = 64 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} radius={radius.md} />
      ))}
    </View>
  );
}

export function OfflineBanner({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { t } = useT();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm + 2, borderRadius: radius.md, backgroundColor: c.surfaceRaised }, style]}>
      <Icon name="offline" size={14} color={c.textSecondary} />
      <Text style={[type.caption, { color: c.textSecondary, flex: 1 }]}>{t('common.offlineBanner')}</Text>
    </View>
  );
}

export function LocalOnlyState({ title, body, children }: { title?: string; body?: string; children?: ReactNode }) {
  const { t } = useT();
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space.xxxl, paddingHorizontal: space.xl, gap: space.md }}>
      <HexMark size={64} color={c.textSecondary} icon="lock" />
      <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{title ?? t('common.localOnlyTitle')}</Text>
      <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 300 }]}>{body ?? t('common.localOnlyBody')}</Text>
      {children}
    </View>
  );
}

export function isOfflineError(error: unknown) {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  const status = typeof error === 'object' && error && 'status' in error ? (error as { status: unknown }).status : null;
  return status === 0 || code === 'offline' || /network request failed|offline|timed? ?out|aborted/i.test(msg);
}

export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error && 'code' in error) return String((error as { code: unknown }).code);
  return null;
}

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message && !/^\w+_\w+$/.test(error.message)) return error.message;
  return fallback;
}
