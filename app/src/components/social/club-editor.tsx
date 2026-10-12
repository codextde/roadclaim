import { useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Swatches } from '@/components/garage/swatches';
import { isOfflineError } from '@/components/states';
import { Button, Card, Field, Group, ToggleRow } from '@/components/ui';
import { useT } from '@/i18n';
import { space } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { remote, type Club } from '@/ui-lib/remote';

import { CLUB_COLORS } from './club-hex';

export function useClubColorOptions() {
  const { t } = useT();
  return CLUB_COLORS.map((x) => ({ value: x.hex, label: t(`social.clubColors.${x.id}`) }));
}

export function ClubEditor({ club, onDone }: { club: Club; onDone: (changed: boolean) => void }) {
  const { t } = useT();
  const colors = useClubColorOptions();
  const [name, setName] = useState(club.name);
  const [color, setColor] = useState(club.color);
  const [description, setDescription] = useState(club.description);
  const [isPublic, setPublic] = useState(club.isPublic);
  const [busy, setBusy] = useState(false);
  const nameOk = name.trim().length >= 2 && name.trim().length <= 30;

  const save = async () => {
    if (!nameOk) return;
    setBusy(true);
    try {
      await remote.updateClub(club.id, { name: name.trim(), color, description: description.trim(), isPublic });
      success();
      onDone(true);
    } catch (e) {
      failure();
      Alert.alert(isOfflineError(e) ? t('common.offlineTitle') : t('common.errorTitle'), isOfflineError(e) ? t('common.offlineBody') : t('common.errorBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={{ marginBottom: space.xl }}>
      <Card style={{ gap: space.lg }}>
        <Field label={t('social.clubName')} value={name} onChangeText={setName} maxLength={30} error={nameOk ? null : t('social.clubNameError')} autoCorrect={false} />
        <Swatches options={colors} value={color} onChange={setColor} size={32} showLabel />
        <Field label={t('social.clubDescription')} value={description} onChangeText={setDescription} maxLength={280} multiline style={{ minHeight: 72, textAlignVertical: 'top' }} />
      </Card>
      <Group style={{ marginTop: space.md, marginBottom: space.md }}>
        <ToggleRow icon="globe" title={t('social.clubPublic')} subtitle={t('social.clubPublicHint')} value={isPublic} onChange={setPublic} last />
      </Group>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title={t('common.cancel')} variant="secondary" onPress={() => onDone(false)} style={{ flex: 1 }} />
        <Button title={t('common.save')} variant="club" onPress={save} loading={busy} disabled={!nameOk} style={{ flex: 1 }} />
      </View>
    </Animated.View>
  );
}
