import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { confirmBlock, moderationMenu, openReport } from '@/components/moderation';
import { ErrorState, LocalOnlyState, OfflineBanner, Skeleton, SkeletonList } from '@/components/states';
import { Button, Card, Group, IconButton, Label, Notice, Pill, Row, Screen, Value } from '@/components/ui';
import { formatInt, useT } from '@/i18n';
import { fonts, radius, space, type, useColors, withAlpha } from '@/theme';
import { impact, success } from '@/ui-lib/haptics';
import { remote, useClub, useLocalOnly, useMyClub, useSession, type Club, type ClubMember } from '@/ui-lib/remote';
import { useFormat } from '@/ui-lib/units';

import { actionMenu, confirm, showError } from './action-menu';
import { ClubEditor } from './club-editor';
import { ClubHex } from './club-hex';
import { shareText, useCopy } from './invite-card';

export function ClubView({ id, onGone }: { id: string; onGone?: () => void }) {
  const c = useColors();
  const { t, plural } = useT();
  const localOnly = useLocalOnly();
  const { me, offline } = useSession();
  const { data, error, loading, reload } = useClub(id);
  const myClub = useMyClub();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'join' | 'leave' | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const fmt = useFormat();
  const { copied, copy } = useCopy();

  const gone = () => (onGone ? onGone() : router.back());

  if (localOnly) {
    return (
      <Screen>
        <LocalOnlyState />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        {loading ? (
          <View style={{ gap: space.md }}>
            <Skeleton height={220} radius={radius.lg} />
            <SkeletonList rows={4} height={58} />
          </View>
        ) : (
          <ErrorState error={error} onRetry={reload} />
        )}
      </Screen>
    );
  }

  const { club } = data;
  const isOwner = !!me && club.ownerId === me.id;
  const isMember = !!me && data.members.some((m) => m.user.id === me.id);
  const members = data.members.filter((m) => !removed.includes(m.user.id)).sort((a, b) => b.distanceM - a.distanceM);
  const tint = club.color;

  const leave = () => {
    const alone = members.length <= 1;
    confirm(t('social.leaveTitle', { name: club.name }), isOwner ? (alone ? t('social.leaveOwnerAlone') : t('social.leaveOwner')) : t('social.leaveBody'), t('social.leave'), async () => {
      setBusy('leave');
      try {
        await remote.leaveClub(club.id);
        impact('medium');
        myClub.reload();
        gone();
      } catch (e) {
        showError(e);
      } finally {
        setBusy(null);
      }
    });
  };

  const join = () => {
    const doJoin = async () => {
      setBusy('join');
      try {
        await remote.joinClub(club.id);
        success();
        myClub.reload();
        reload();
      } catch (e) {
        showError(e);
      } finally {
        setBusy(null);
      }
    };
    const current = myClub.data?.club;
    if (current && current.id !== club.id) confirm(t('social.switchTitle'), t('social.switchBody', { name: current.name }), t('social.join'), doJoin, false);
    else doJoin();
  };

  const deleteClub = () => {
    confirm(t('social.deleteTitle', { name: club.name }), t('social.deleteBody'), t('common.delete'), () =>
      confirm(t('social.deleteConfirmTitle'), t('social.deleteConfirmBody', { n: club.memberCount }), t('social.deleteForGood'), async () => {
        try {
          await remote.deleteClub(club.id);
          impact('heavy');
          myClub.reload();
          gone();
        } catch (e) {
          showError(e);
        }
      }),
    );
  };

  const headerMenu = () => {
    if (isOwner) {
      actionMenu(club.name, [
        { text: t('social.editClub'), onPress: () => setEditing(true) },
        { text: t('social.deleteClub'), destructive: true, onPress: deleteClub },
      ]);
    } else {
      moderationMenu({ kind: 'club', id: club.id, name: club.name });
    }
  };

  const memberMenu = (m: ClubMember) => {
    if (!me || m.user.id === me.id) return;
    impact('light');
    const actions = [
      ...(isOwner
        ? [
            {
              text: t('social.removeMember'),
              destructive: true,
              onPress: () =>
                confirm(t('social.removeMemberTitle', { name: m.user.displayName }), t('social.removeMemberBody'), t('common.remove'), async () => {
                  setRemoved((r) => [...r, m.user.id]);
                  try {
                    await remote.removeMember(club.id, m.user.id);
                    success();
                    reload();
                  } catch (e) {
                    setRemoved((r) => r.filter((x) => x !== m.user.id));
                    showError(e);
                  }
                }),
            },
          ]
        : []),
      { text: t('moderation.report'), onPress: () => openReport('user', m.user.id, m.user.displayName) },
      { text: t('moderation.block'), destructive: true, onPress: () => confirmBlock(m.user, reload) },
    ];
    actionMenu(m.user.displayName, actions);
  };

  const turf = formatInt(club.cellsHeld);

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="more" label={t('social.clubMenu')} onPress={headerMenu} size={34} bg="transparent" />,
        }}
      />
      {offline ? <OfflineBanner style={{ marginBottom: space.md }} /> : null}

      <Animated.View entering={FadeInDown.springify().damping(18)}>
        <Card style={[styles.hero, { borderColor: withAlpha(tint, 0.28) }]}>
          <View style={[styles.heroGlow, { backgroundColor: withAlpha(tint, 0.1) }]} />
          <ClubHex name={club.name} color={tint} size={92} halo />
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Text style={[type.title, { color: c.text, textAlign: 'center' }]} accessibilityRole="header">
              {club.name}
            </Text>
            {club.description ? <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 320 }]}>{club.description}</Text> : null}
          </View>
          <View style={styles.pills}>
            <Pill text={club.isPublic ? t('social.public') : t('social.private')} icon={club.isPublic ? 'globe' : 'lock'} color={c.textSecondary} bg={c.surfaceRaised} />
            {isOwner ? <Pill text={t('social.owner')} icon="crown" color={c.club} bg={c.clubSoft} /> : isMember ? <Pill text={t('social.member')} icon="checkCircle" color={c.club} bg={c.clubSoft} /> : null}
          </View>
          <View style={[styles.stats, { borderTopColor: c.border }]}>
            <View style={styles.stat} accessible accessibilityLabel={`${plural('social.members', club.memberCount)}`}>
              <Value value={formatInt(club.memberCount)} size="display" />
              <Label>{t('social.membersLabel')}</Label>
            </View>
            <View style={[styles.statDivider, { backgroundColor: c.border }]} />
            <View style={styles.stat} accessible accessibilityLabel={`${turf} ${t('social.turfLabel')}`}>
              <Value value={turf} size="display" color={tint} />
              <Label>{t('social.turfLabel')}</Label>
            </View>
          </View>
        </Card>
      </Animated.View>

      {editing ? (
        <View style={{ marginTop: space.xl }}>
          <ClubEditor
            club={club}
            onDone={(changed) => {
              setEditing(false);
              if (changed) {
                reload();
                myClub.reload();
              }
            }}
          />
        </View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={{ marginTop: space.xl }}>
        {!isMember ? (
          club.isPublic ? (
            <Button title={t('social.joinClub')} icon="plus" variant="club" large onPress={join} loading={busy === 'join'} style={{ marginBottom: space.xl }} />
          ) : (
            <Notice tone="info" icon="lock" title={t('social.privateTitle')} body={t('social.privateBody')} style={{ marginBottom: space.xl }} />
          )
        ) : null}

        <Group>
          <Row icon="map" iconColor={c.club} iconBg={c.clubSoft} title={t('social.turfOnMap')} subtitle={plural('social.turfOnMapHint', club.cellsHeld)} onPress={() => router.push('/map')} last />
        </Group>

        {isMember && club.inviteCode ? <InviteCode club={club} copied={copied} onCopy={() => copy(club.inviteCode ?? '')} /> : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).springify().damping(18)}>
        <Group title={t('social.board')} footer={isOwner ? t('social.boardOwnerHint') : t('social.boardHint')}>
          {members.map((m, i) => {
            const mine = m.user.id === me?.id;
            const d = fmt.distanceParts(m.distanceM);
            return (
              <Animated.View key={m.user.id} layout={LinearTransition.springify().damping(20)}>
                <Pressable
                  onPress={() => router.push(`/user/${m.user.id}`)}
                  onLongPress={() => memberMenu(m)}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${m.user.displayName}, ${fmt.distance(m.distanceM)}`}
                  accessibilityHint={!mine ? t('social.memberHint') : undefined}
                  style={({ pressed }) => [styles.member, mine && { backgroundColor: c.clubSoft }, pressed && { backgroundColor: c.surfacePressed }]}>
                  <Text style={[type.valueSmall, styles.rank, { color: i < 3 ? tint : c.textTertiary }]}>{i + 1}</Text>
                  <View>
                    <Avatar name={m.user.displayName} color={m.user.avatarColor} size={38} />
                    {m.role === 'owner' ? (
                      <View style={[styles.crown, { backgroundColor: c.surface, borderColor: c.border }]}>
                        <Icon name="crown" size={10} color={c.club} />
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.memberBody, i < members.length - 1 && { borderBottomColor: c.borderStrong, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <View style={{ flex: 1, gap: 1 }}>
                      <Text style={[type.bodyStrong, { color: c.text }]} numberOfLines={1}>
                        {mine ? `${m.user.displayName} (${t('common.you')})` : m.user.displayName}
                      </Text>
                      <Text style={[type.caption, { color: c.textSecondary }]} numberOfLines={1}>
                        @{m.user.username}
                        {m.user.car ? ` · ${m.user.car.label}` : ''}
                      </Text>
                    </View>
                    <Value value={d.value} unit={d.unit} size="valueSmall" />
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </Group>
      </Animated.View>

      {isMember ? (
        <Button title={t('social.leaveClub')} icon="leave" variant="danger" onPress={leave} loading={busy === 'leave'} />
      ) : null}
    </Screen>
  );
}

function InviteCode({ club, copied, onCopy }: { club: Club; copied: boolean; onCopy: () => void }) {
  const c = useColors();
  const { t } = useT();
  const code = club.inviteCode ?? '';
  return (
    <Card style={{ marginBottom: space.xl, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>{t('social.inviteCode')}</Label>
        <Icon name="key" size={14} color={c.club} />
      </View>
      <Text style={[type.display, { color: c.text, fontFamily: fonts.numBold, letterSpacing: 6 }]} selectable accessibilityLabel={code.split('').join(' ')}>
        {code}
      </Text>
      <Text style={[type.caption, { color: c.textSecondary }]}>{t('social.inviteCodeHint')}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title={t('common.share')} icon="share" variant="club" onPress={() => shareText(t('social.clubShareMessage', { name: club.name, code }))} style={{ flex: 1 }} />
        <Button title={copied ? t('common.copied') : t('common.copy')} icon={copied ? 'check' : 'copy'} variant="secondary" onPress={onCopy} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.lg, paddingTop: space.xxl, borderWidth: 1 },
  heroGlow: { position: 'absolute', top: -120, width: 320, height: 240, borderRadius: 160, alignSelf: 'center' },
  pills: { flexDirection: 'row', gap: space.sm },
  stats: { flexDirection: 'row', alignSelf: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.lg, marginTop: space.xs },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: space.xs },
  member: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, gap: space.md },
  rank: { width: 26, textAlign: 'center' },
  crown: { position: 'absolute', right: -4, bottom: -3, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  memberBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingRight: space.lg, minHeight: 60 },
});
