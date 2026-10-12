import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Swatches } from '@/components/garage/swatches';
import { showError } from '@/components/social/action-menu';
import { useClubColorOptions } from '@/components/social/club-editor';
import { ClubHex } from '@/components/social/club-hex';
import { LocalOnlyState } from '@/components/states';
import { Button, Field, Group, Label, Notice, Pill, Screen, SheetHeader, ToggleRow } from '@/components/ui';
import { useT } from '@/i18n';
import { brand, radius, space, type, useColors, withAlpha } from '@/theme';
import { success } from '@/ui-lib/haptics';
import { remote, useLocalOnly, useMyClub } from '@/ui-lib/remote';

export default function CreateClubSheet() {
  const c = useColors();
  const { t } = useT();
  const localOnly = useLocalOnly();
  const current = useMyClub().data?.club ?? null;
  const colors = useClubColorOptions();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(brand.amber);
  const [description, setDescription] = useState('');
  const [isPublic, setPublic] = useState(true);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 30;

  const create = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      await remote.createClub({ name: trimmed, color, description: description.trim() || undefined, isPublic });
      success();
      router.dismissTo('/clubs');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHeader title={t('social.createTitle')} onClose={() => router.back()} closeLabel={t('common.close')} />
      {localOnly ? (
        <LocalOnlyState />
      ) : (
        <Screen bottomInset={space.xxxl} contentContainerStyle={{ paddingTop: 0 }}>
          <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.preview, { backgroundColor: c.surface, borderColor: withAlpha(color, 0.35) }]}>
            <View style={[styles.glow, { backgroundColor: withAlpha(color, 0.12) }]} />
            <ClubHex name={trimmed || t('social.clubNamePlaceholder')} color={color} size={84} halo />
            <Text style={[type.headline, { color: trimmed ? c.text : c.textTertiary, textAlign: 'center' }]} numberOfLines={1}>
              {trimmed || t('social.clubNamePlaceholder')}
            </Text>
            <Pill text={isPublic ? t('social.public') : t('social.private')} icon={isPublic ? 'globe' : 'lock'} color={c.textSecondary} bg={c.surfaceRaised} style={{ alignSelf: 'center' }} />
          </Animated.View>

          <View style={{ gap: space.lg, marginTop: space.xl }}>
            <Field
              label={t('social.clubName')}
              value={name}
              onChangeText={setName}
              placeholder={t('social.clubNamePlaceholder')}
              maxLength={30}
              autoCorrect={false}
              error={touched && !valid ? t('social.clubNameError') : null}
              hint={t('social.clubNameHint', { n: trimmed.length })}
              returnKeyType="next"
            />
            <View style={{ gap: space.sm }}>
              <Label>{t('social.clubColor')}</Label>
              <Swatches options={colors} value={color} onChange={setColor} size={34} showLabel />
            </View>
            <Field
              label={`${t('social.clubDescription')} (${t('common.optional')})`}
              value={description}
              onChangeText={setDescription}
              placeholder={t('social.clubDescriptionPlaceholder')}
              maxLength={280}
              multiline
              style={{ minHeight: 84, textAlignVertical: 'top' }}
            />
            <Group style={{ marginBottom: 0 }}>
              <ToggleRow icon="globe" title={t('social.clubPublic')} subtitle={t('social.clubPublicHint')} value={isPublic} onChange={setPublic} last />
            </Group>
            {current ? <Notice tone="warn" icon="warning" title={t('social.leaveWarnTitle', { name: current.name })} body={t('social.leaveWarnCreate')} /> : null}
            <Button title={t('social.createClub')} icon="plus" variant="club" large onPress={create} loading={busy} disabled={touched && !valid} />
          </View>
        </Screen>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.lg, borderWidth: 1, paddingVertical: space.xl, alignItems: 'center', gap: space.md, overflow: 'hidden' },
  glow: { position: 'absolute', top: -100, width: 300, height: 200, borderRadius: 150, alignSelf: 'center' },
});
