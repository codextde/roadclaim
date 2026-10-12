import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { fonts, radius, space, type, useColors } from '@/theme';

import { Icon } from './icon';
import type { IconName } from './icon-names';

type Toast = { id: number; title: string; body?: string; icon: IconName };

const useToasts = create<{ toast: Toast | null }>(() => ({ toast: null }));

let seq = 0;

export function showToast(title: string, opts: { body?: string; icon?: IconName } = {}) {
  useToasts.setState({ toast: { id: ++seq, title, body: opts.body, icon: opts.icon ?? 'info' } });
}

export function ToastHost() {
  const toast = useToasts((s) => s.toast);
  const insets = useSafeAreaInsets();
  const c = useColors();

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => {
      if (useToasts.getState().toast?.id === toast.id) useToasts.setState({ toast: null });
    }, 3800);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space.sm, alignItems: 'center' }]}>
      <Animated.View
        key={toast.id}
        entering={FadeInUp.springify().damping(18)}
        exiting={FadeOutUp.duration(180)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[styles.toast, { backgroundColor: c.surfaceRaised, borderColor: c.borderStrong, shadowColor: c.shadow }]}>
        <Icon name={toast.icon} size={17} color={c.warn} />
        <View style={{ flexShrink: 1, gap: 1 }}>
          <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{toast.title}</Text>
          {toast.body ? <Text style={[type.caption, { color: c.textSecondary }]}>{toast.body}</Text> : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    maxWidth: '92%',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
