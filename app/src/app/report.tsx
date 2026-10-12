import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { isOfflineError } from '@/components/states';
import { Button, Field, Screen, SheetHeader, tap } from '@/components/ui';
import { useT } from '@/i18n';
import { radius, space, type, useColors } from '@/theme';
import { failure, success } from '@/ui-lib/haptics';
import { remote, type ReportReason } from '@/ui-lib/remote';

const REASONS = [
  { id: 'inappropriate_name', title: 'moderation.reasonInappropriateName', hint: 'moderation.reasonInappropriateNameHint' },
  { id: 'spam', title: 'moderation.reasonSpam', hint: 'moderation.reasonSpamHint' },
  { id: 'cheating', title: 'moderation.reasonCheating', hint: 'moderation.reasonCheatingHint' },
  { id: 'other', title: 'moderation.reasonOther', hint: 'moderation.reasonOtherHint' },
] as const;

export default function ReportScreen() {
  const c = useColors();
  const { t } = useT();
  const { kind, id, name } = useLocalSearchParams<{ kind: 'user' | 'club'; id: string; name: string }>();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reason || !id) return;
    setBusy(true);
    try {
      await remote.report({ kind: kind === 'club' ? 'club' : 'user', id }, reason, note.trim() || undefined);
      success();
      Alert.alert(t('moderation.sent'));
      router.back();
    } catch (e) {
      failure();
      Alert.alert(isOfflineError(e) ? t('common.offlineTitle') : t('common.errorTitle'), isOfflineError(e) ? t('common.offlineBody') : t('common.errorBody'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHeader
        title={kind === 'club' ? t('moderation.reportClub', { name: name ?? '' }) : t('moderation.reportUser', { name: name ?? '' })}
        onClose={() => router.back()}
        closeLabel={t('common.close')}
      />
      <Screen bottomInset={space.xxxl} contentContainerStyle={{ paddingTop: 0, gap: space.md }}>
        <Text style={[type.headline, { color: c.text }]}>{t('moderation.reportTitle')}</Text>
        <Text style={[type.callout, { color: c.textSecondary, marginBottom: space.xs }]}>{t('moderation.reportBody')}</Text>
        {REASONS.map((r, i) => {
          const active = reason === r.id;
          return (
            <Animated.View key={r.id} entering={FadeInDown.delay(i * 40).springify().damping(18)}>
              <PressableScale
                scaleTo={0.98}
                onPress={() => {
                  tap();
                  setReason(r.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.lg,
                  borderRadius: radius.md,
                  borderWidth: 1.5,
                  borderColor: active ? c.danger : c.border,
                  backgroundColor: active ? c.dangerSoft : c.surface,
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.bodyStrong, { color: c.text }]}>{t(r.title)}</Text>
                  <Text style={[type.caption, { color: c.textSecondary }]}>{t(r.hint)}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? c.danger : c.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.danger : 'transparent' }}>
                  {active ? <Icon name="check" size={12} color="#FFFFFF" /> : null}
                </View>
              </PressableScale>
            </Animated.View>
          );
        })}
        <Field label={t('moderation.note')} placeholder={t('moderation.notePlaceholder')} value={note} onChangeText={setNote} multiline maxLength={500} style={{ minHeight: 88, textAlignVertical: 'top' }} />
        <Button title={t('moderation.send')} onPress={send} disabled={!reason} loading={busy} large variant="danger" style={{ marginTop: space.sm }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
