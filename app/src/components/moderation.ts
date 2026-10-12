import { Alert } from 'react-native';
import { router } from 'expo-router';

import { t } from '@/i18n';
import { failure, success } from '@/ui-lib/haptics';
import { remote } from '@/ui-lib/remote';

export function openReport(kind: 'user' | 'club', id: string, name: string) {
  router.push({ pathname: '/report', params: { kind, id, name } });
}

export function confirmBlock(user: { id: string; displayName: string }, onDone?: () => void) {
  Alert.alert(t('moderation.blockTitle', { name: user.displayName }), t('moderation.blockBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('moderation.block'),
      style: 'destructive',
      onPress: () => {
        remote
          .block(user.id)
          .then(() => {
            success();
            onDone?.();
          })
          .catch((e: unknown) => {
            failure();
            Alert.alert(t('common.errorTitle'), e instanceof Error ? e.message : t('common.errorBody'));
          });
      },
    },
  ]);
}

export function confirmUnblock(user: { id: string; displayName: string }, onDone?: () => void) {
  Alert.alert(t('moderation.unblockTitle', { name: user.displayName }), t('moderation.unblockBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    {
      text: t('moderation.unblock'),
      onPress: () => {
        remote
          .unblock(user.id)
          .then(() => {
            success();
            onDone?.();
          })
          .catch(() => {
            failure();
            Alert.alert(t('common.errorTitle'), t('common.errorBody'));
          });
      },
    },
  ]);
}

export function moderationMenu(opts: { kind: 'user' | 'club'; id: string; name: string; blocked?: boolean; onBlockChange?: () => void }) {
  const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
    { text: t('moderation.report'), onPress: () => openReport(opts.kind, opts.id, opts.name) },
  ];
  if (opts.kind === 'user') {
    const user = { id: opts.id, displayName: opts.name };
    buttons.push(
      opts.blocked
        ? { text: t('moderation.unblock'), onPress: () => confirmUnblock(user, opts.onBlockChange) }
        : { text: t('moderation.block'), style: 'destructive', onPress: () => confirmBlock(user, opts.onBlockChange) },
    );
  }
  buttons.push({ text: t('common.cancel'), style: 'cancel' });
  Alert.alert(opts.name, undefined, buttons);
}
