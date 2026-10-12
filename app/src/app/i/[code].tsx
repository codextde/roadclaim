import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { HexMark } from '@/components/hex';
import { Icon } from '@/components/icon';
import { errorCode, isOfflineError } from '@/components/states';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';
import { space, spring, type, useColors } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { remote, useLocalOnly, useSession, type PublicUser } from '@/ui-lib/remote';

type Problem = 'invalid' | 'own' | 'offline' | 'localOnly' | 'generic';
type State = { kind: 'loading' } | { kind: 'done'; friend: PublicUser } | { kind: 'error'; problem: Problem };

export default function InviteSheet() {
  const c = useColors();
  const { t } = useT();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? '').trim().toUpperCase();
  const { me, ready } = useSession();
  const localOnly = useLocalOnly();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (!ready || started.current === attempt) return;
    if (localOnly) return setState({ kind: 'error', problem: 'localOnly' });
    if (!code) return setState({ kind: 'error', problem: 'invalid' });
    if (me && me.inviteCode.toUpperCase() === code) return setState({ kind: 'error', problem: 'own' });
    started.current = attempt;
    setState({ kind: 'loading' });
    remote
      .acceptInvite(code)
      .then(({ friend }) => {
        success();
        setState({ kind: 'done', friend });
      })
      .catch((e: unknown) => {
        failure();
        const ec = errorCode(e);
        setState({
          kind: 'error',
          problem: isOfflineError(e) ? 'offline' : ec === 'own_invite' ? 'own' : ec === 'invalid_invite' || ec === 'not_found' ? 'invalid' : ec === 'local_only' ? 'localOnly' : 'generic',
        });
      });
  }, [ready, localOnly, code, me, attempt]);

  return (
    <View style={[styles.wrap, { backgroundColor: c.background }]}>
      {state.kind === 'loading' ? (
        <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={t('social.inviteLoading')}>
          <ActivityIndicator color={c.friend} size="large" />
          <Text style={[type.callout, { color: c.textSecondary }]}>{t('social.inviteLoading')}</Text>
        </View>
      ) : state.kind === 'done' ? (
        <Success friend={state.friend} />
      ) : (
        <ProblemView problem={state.problem} onRetry={() => setAttempt((a) => a + 1)} />
      )}
    </View>
  );
}

function Success({ friend }: { friend: PublicUser }) {
  const c = useColors();
  const { t } = useT();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(180, withSpring(1, spring.bouncy));
  }, [pop]);
  const check = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: Math.min(1, pop.value * 2) }));
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.center}>
      <View>
        <Avatar name={friend.displayName} color={friend.avatarColor} size={88} ring={c.friend} />
        <Animated.View style={[styles.check, { backgroundColor: c.friend, borderColor: c.background }, check]}>
          <Icon name="check" size={16} color="#FFFFFF" weight="bold" />
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={{ alignItems: 'center', gap: 4 }}>
        <Text style={[type.title, { color: c.text, textAlign: 'center' }]} numberOfLines={1}>
          {friend.displayName}
        </Text>
        <Text style={[type.callout, { color: c.textSecondary }]}>@{friend.username}</Text>
        <Text style={[type.headline, { color: c.friend, marginTop: space.sm }]} accessibilityLiveRegion="polite">
          {t('social.nowFriends')}
        </Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(220).springify().damping(18)} style={styles.actions}>
        <Button title={t('common.done')} variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title={t('social.viewProfile')} variant="friend" onPress={() => router.replace(`/user/${friend.id}`)} style={{ flex: 1 }} />
      </Animated.View>
    </Animated.View>
  );
}

function ProblemView({ problem, onRetry }: { problem: Problem; onRetry: () => void }) {
  const c = useColors();
  const { t } = useT();
  const copy = {
    invalid: { icon: 'link', title: t('social.inviteInvalidTitle'), body: t('social.inviteInvalidBody') },
    own: { icon: 'personCheck', title: t('social.inviteOwnTitle'), body: t('social.inviteOwnBody') },
    offline: { icon: 'offline', title: t('common.offlineTitle'), body: t('social.inviteOfflineBody') },
    localOnly: { icon: 'lock', title: t('common.localOnlyTitle'), body: t('social.inviteLocalOnlyBody') },
    generic: { icon: 'warning', title: t('common.errorTitle'), body: t('common.errorBody') },
  } as const;
  const p = copy[problem];
  const retry = problem === 'offline' || problem === 'generic';
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.center}>
      <HexMark size={72} color={problem === 'own' ? c.friend : problem === 'invalid' || problem === 'generic' ? c.danger : c.textSecondary} icon={p.icon} />
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[type.headline, { color: c.text, textAlign: 'center' }]}>{p.title}</Text>
        <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 320 }]}>{p.body}</Text>
      </View>
      <View style={styles.actions}>
        {problem === 'localOnly' ? (
          <Button title={t('common.localOnlyAction')} variant="secondary" onPress={() => router.replace('/profile')} style={{ flex: 1 }} />
        ) : problem === 'own' ? (
          <Button title={t('social.openFriends')} variant="secondary" onPress={() => router.replace('/friends')} style={{ flex: 1 }} />
        ) : null}
        {retry ? <Button title={t('common.retry')} variant="secondary" icon="refresh" onPress={onRetry} style={{ flex: 1 }} /> : null}
        <Button title={t('common.done')} variant={retry ? 'ghost' : 'friend'} onPress={() => router.back()} style={{ flex: 1 }} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  check: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 3 },
  actions: { flexDirection: 'row', gap: space.sm, alignSelf: 'stretch', marginTop: space.sm },
});
