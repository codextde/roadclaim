import * as Haptics from 'expo-haptics';

export function tap() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function impact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
  const map = {
    light: Haptics.ImpactFeedbackStyle.Light,
    medium: Haptics.ImpactFeedbackStyle.Medium,
    heavy: Haptics.ImpactFeedbackStyle.Heavy,
    rigid: Haptics.ImpactFeedbackStyle.Rigid,
    soft: Haptics.ImpactFeedbackStyle.Soft,
  };
  Haptics.impactAsync(map[style]).catch(() => undefined);
}

export function success() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

export function warning() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

export function failure() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}
