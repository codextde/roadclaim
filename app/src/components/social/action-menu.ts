import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { isOfflineError } from '@/components/states';
import { t } from '@/i18n';
import { failure } from '@/ui-lib/haptics';

export type MenuAction = { text: string; destructive?: boolean; onPress: () => void };

export function actionMenu(title: string, actions: MenuAction[], message?: string) {
  if (Platform.OS === 'ios') {
    const options = [...actions.map((a) => a.text), t('common.cancel')];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options,
        cancelButtonIndex: actions.length,
        destructiveButtonIndex: actions.flatMap((a, i) => (a.destructive ? [i] : [])),
      },
      (i) => actions[i]?.onPress(),
    );
    return;
  }
  const buttons = actions.slice(0, 3).map((a) => ({ text: a.text, style: a.destructive ? ('destructive' as const) : undefined, onPress: a.onPress }));
  if (buttons.length < 3) buttons.unshift({ text: t('common.cancel'), style: undefined, onPress: () => undefined });
  Alert.alert(title, message, buttons, { cancelable: true });
}

export function confirm(title: string, message: string, action: string, onConfirm: () => void, destructive = true) {
  Alert.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: action, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function showError(e: unknown) {
  failure();
  const offline = isOfflineError(e);
  Alert.alert(offline ? t('common.offlineTitle') : t('common.errorTitle'), offline ? t('common.offlineBody') : e instanceof Error && e.message && !/^\w+_\w+$/.test(e.message) ? e.message : t('common.errorBody'));
}
