import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { HexMark } from '@/components/hex';
import { showError } from '@/components/social/action-menu';
import { errorCode, LocalOnlyState } from '@/components/states';
import { Button, Field, Notice, Screen, SheetHeader } from '@/components/ui';
import { useT } from '@/i18n';
import { fonts, space, type, useColors } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { remote, useLocalOnly, useMyClub } from '@/ui-lib/remote';

export default function JoinClubSheet() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const current = useMyClub().data?.club ?? null;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.replace(/[^A-Z0-9]/g, '');
  const valid = clean.length >= 4;

  const join = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await remote.joinClubByCode(clean);
      success();
      router.dismissTo('/clubs');
    } catch (e) {
      const ec = errorCode(e);
      if (ec === 'invalid_invite' || ec === 'not_found' || ec === 'invalid_request') {
        failure();
        setError(t('social.codeInvalid'));
      } else showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHeader title={t('social.joinTitle')} onClose={() => router.back()} closeLabel={t('common.close')} />
      {localOnly ? (
        <LocalOnlyState />
      ) : (
        <Screen bottomInset={space.xxxl} contentContainerStyle={{ paddingTop: space.md, gap: space.xl }}>
          <Animated.View entering={FadeInDown.springify().damping(18)} style={{ alignItems: 'center', gap: space.md }}>
            <HexMark size={72} color={c.club} icon="key" />
            <Text style={[type.callout, { color: c.textSecondary, textAlign: 'center', maxWidth: 300 }]}>{t('social.joinBody')}</Text>
          </Animated.View>
          <Field
            value={code}
            onChangeText={(v) => {
              setCode(v.toUpperCase());
              setError(null);
            }}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            maxLength={20}
            returnKeyType="join"
            onSubmitEditing={join}
            error={error}
            accessibilityLabel={t('social.inviteCode')}
            style={{ fontFamily: fonts.numBold, fontSize: 28, letterSpacing: 6, textAlign: 'center' }}
          />
          {current ? (
            <View>
              <Notice tone="warn" icon="warning" title={t('social.leaveWarnTitle', { name: current.name })} body={t('social.leaveWarnJoin')} />
            </View>
          ) : null}
          <Button title={t('social.joinClub')} variant="club" large onPress={join} loading={busy} disabled={!valid} />
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}
