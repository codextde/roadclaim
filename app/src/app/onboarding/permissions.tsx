import { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import type { IconName } from '@/components/icon-names';
import { OnboardingFrame, useFlow } from '@/components/onboarding-frame';
import { Button, Notice, Pill } from '@/components/ui';
import type { Permissions } from '@/core/types';
import { useT } from '@/i18n';
import { radius, space, type, useColors, withAlpha } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { requestPermissions, setAutoDetect, usePermissions } from '@/tracking/recorder';
import { requestAutoDetect } from '@/ui-lib/auto-detect';

type Status = 'granted' | 'partial' | 'denied' | 'undetermined' | 'unavailable';

function PermissionCard({
  index,
  icon,
  title,
  body,
  hint,
  status,
  action,
  partialLabel,
  onPress,
  busy,
}: {
  index: number;
  icon: IconName;
  title: string;
  body: string;
  hint?: string;
  status: Status;
  action: string;
  partialLabel?: string;
  onPress: () => void;
  busy: boolean;
}) {
  const c = useColors();
  const { t } = useT();
  const granted = status === 'granted';
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18).delay(100 + index * 80)}
      layout={LinearTransition.springify().damping(20)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: granted ? withAlpha(c.accent, 0.45) : c.border }]}>
      <View style={styles.cardHead}>
        <HexMark size={44} color={granted ? c.accent : c.textSecondary} icon={granted ? 'check' : icon} filled={granted} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[type.bodyStrong, { color: c.text }]}>{title}</Text>
          {status === 'partial' && partialLabel ? <Pill text={partialLabel} color={c.warn} bg={c.warnSoft} /> : null}
          {status === 'denied' ? <Pill text={t('onboarding.permissions.denied')} color={c.danger} bg={c.dangerSoft} /> : null}
          {status === 'unavailable' ? <Pill text={t('onboarding.permissions.unavailable')} color={c.textSecondary} bg={c.otherSoft} /> : null}
          {granted ? <Pill text={t('onboarding.permissions.allowed')} icon="check" color={c.accentStrong} bg={c.accentSoft} /> : null}
        </View>
      </View>
      <Text style={[type.callout, { color: c.textSecondary }]}>{body}</Text>
      {!granted && status !== 'unavailable' ? (
        <View style={{ gap: space.sm }}>
          {hint ? <Text style={[type.caption, { color: c.textTertiary }]}>{hint}</Text> : null}
          <Button title={action} onPress={onPress} loading={busy} variant={status === 'denied' ? 'secondary' : 'primary'} compact style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function PermissionsStep() {
  const { t } = useT();
  const flow = useFlow('permissions');
  const perms = usePermissions();
  const [busy, setBusy] = useState<keyof Permissions | null>(null);
  const [asked, setAsked] = useState(false);

  async function run(kind: keyof Permissions, fn: () => Promise<Permissions | void>) {
    setBusy(kind);
    try {
      const next = await fn();
      if (next && next[kind] === 'granted') success();
    } catch {
      failure();
    } finally {
      setBusy(null);
    }
  }

  const askLocation = () =>
    run('location', async () => {
      setAsked(true);
      if (perms.location === 'denied') return void Linking.openSettings();
      await requestAutoDetect();
    });

  const askOrSettings = (kind: 'motion' | 'notifications') =>
    run(kind, async () => {
      if (perms[kind] === 'denied') return void Linking.openSettings();
      if (kind === 'motion') {
        await requestAutoDetect();
        return;
      }
      return requestPermissions(kind);
    });

  const location: Status = perms.location === 'foreground' ? 'partial' : perms.location;
  const fallback = perms.location === 'denied' || perms.location === 'foreground' || (asked && perms.location !== 'granted');
  const openSettings = t('common.openSettings');

  async function onContinue() {
    await setAutoDetect(perms.location === 'granted').catch(() => undefined);
    flow.next();
  }

  return (
    <OnboardingFrame
      step={flow.step}
      total={flow.total}
      title={t('onboarding.permissions.title')}
      body={t('onboarding.permissions.body')}
      footer={<Button title={t('common.continue')} icon="arrowRight" large onPress={onContinue} />}>
      <View style={{ gap: space.md }}>
        <PermissionCard
          index={0}
          icon="location"
          title={t('onboarding.permissions.locationTitle')}
          body={t('onboarding.permissions.locationBody')}
          hint={Platform.OS === 'ios' ? t('onboarding.permissions.locationHintIos') : t('onboarding.permissions.locationHintAndroid')}
          status={location}
          partialLabel={t('onboarding.permissions.whileUsing')}
          action={location === 'denied' ? openSettings : location === 'partial' ? t('onboarding.permissions.allowAlways') : t('onboarding.permissions.allow')}
          onPress={askLocation}
          busy={busy === 'location'}
        />
        {fallback ? (
          <Animated.View entering={FadeInDown.springify().damping(18)} layout={LinearTransition}>
            <Notice
              tone="warn"
              icon="hand"
              title={t('onboarding.permissions.manualTitle')}
              body={t('onboarding.permissions.manualBody')}
              action={openSettings}
              onAction={() => Linking.openSettings()}
            />
          </Animated.View>
        ) : null}
        <PermissionCard
          index={1}
          icon="motion"
          title={Platform.OS === 'ios' ? t('onboarding.permissions.motionTitle') : t('onboarding.permissions.motionTitleAndroid')}
          body={t('onboarding.permissions.motionBody')}
          status={perms.motion}
          action={perms.motion === 'denied' ? openSettings : t('onboarding.permissions.allow')}
          onPress={() => askOrSettings('motion')}
          busy={busy === 'motion'}
        />
        <PermissionCard
          index={2}
          icon="bell"
          title={t('onboarding.permissions.notificationsTitle')}
          body={t('onboarding.permissions.notificationsBody')}
          status={perms.notifications}
          action={perms.notifications === 'denied' ? openSettings : t('onboarding.permissions.allow')}
          onPress={() => askOrSettings('notifications')}
          busy={busy === 'notifications'}
        />
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
