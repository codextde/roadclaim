import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, SectionList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DriveRow } from '@/components/drive/drive-row';
import { RecorderHero } from '@/components/drive/live-card';
import { RecapBanner } from '@/components/drive/recap-banner';
import { WeekStrip } from '@/components/drive/week-strip';
import { Icon } from '@/components/icon';
import { EmptyState } from '@/components/states';
import { Button, IconButton, SectionTitle } from '@/components/ui';
import type { DriveSummary, RecorderState } from '@/core/types';
import { deleteDrive, loadSampleDrives, removeSampleDrives, useDrives, useHasSampleDrives } from '@/data/drives';
import { useRecorder } from '@/tracking/recorder';
import { useT } from '@/i18n';
import { fonts, radius, space, type, useColors, useIsDark } from '@/theme';
import { dayKey, dayLabel } from '@/ui-lib/date';
import { failure, success } from '@/ui-lib/haptics';
import { useFormat } from '@/ui-lib/units';

type Section = { key: string; title: string; meters: number; data: DriveSummary[] };

function groupByDay(drives: DriveSummary[]): Section[] {
  const out: Section[] = [];
  for (const d of drives) {
    const key = dayKey(d.startedAt);
    let s = out[out.length - 1];
    if (!s || s.key !== key) {
      s = { key, title: dayLabel(d.startedAt), meters: 0, data: [] };
      out.push(s);
    }
    s.data.push(d);
    s.meters += d.distanceM;
  }
  return out;
}

function SamplesBanner() {
  const c = useColors();
  const { t } = useT();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const remove = () =>
    Alert.alert(t('drives.samples.removeTitle'), t('drives.samples.removeBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('drives.samples.remove'), style: 'destructive', onPress: () => removeSampleDrives().then(success, failure) },
    ]);
  return (
    <Animated.View exiting={FadeOut.duration(160)} style={[styles.samples, { backgroundColor: c.friendSoft }]}>
      <Icon name="sparkles" size={16} color={c.friend} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.callout, { color: c.text, fontFamily: fonts.semibold }]}>{t('drives.samples.bannerTitle')}</Text>
        <Text style={[type.caption, { color: c.textSecondary }]}>{t('drives.samples.bannerBody')}</Text>
        <Text onPress={remove} accessibilityRole="button" style={[type.callout, { color: c.friend, fontFamily: fonts.semibold, marginTop: 4, alignSelf: 'flex-start' }]}>
          {t('drives.samples.remove')}
        </Text>
      </View>
      <IconButton icon="close" label={t('common.close')} onPress={() => setHidden(true)} size={28} bg="transparent" tint={c.textSecondary} />
    </Animated.View>
  );
}

function Empty({ recorder }: { recorder: RecorderState }) {
  const c = useColors();
  const { t } = useT();
  const [loading, setLoading] = useState(false);
  const manual = recorder.status === 'idle' && !recorder.autoDetect;
  return (
    <View style={{ alignItems: 'center' }}>
      <EmptyState icon="route" title={t('drives.empty.title')} body={manual ? t('drives.empty.manualBody') : t('drives.empty.body')} style={{ paddingBottom: space.lg }} />
      <Button
        title={t('drives.samples.explore')}
        icon="sparkles"
        variant="secondary"
        compact
        loading={loading}
        onPress={() => {
          setLoading(true);
          loadSampleDrives()
            .then(success, failure)
            .finally(() => setLoading(false));
        }}
      />
      <Text style={[type.caption, { color: c.textTertiary, marginTop: space.md }]}>{t('drives.hero.autoHint')}</Text>
    </View>
  );
}

export default function DrivesScreen() {
  const c = useColors();
  const dark = useIsDark();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const fmt = useFormat();
  const drives: DriveSummary[] = useDrives();
  const hasSamples: boolean = useHasSampleDrives();
  const recorder = useRecorder();
  const sections = groupByDay(drives);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setIntro(false), 1400);
    return () => clearTimeout(id);
  }, []);

  function confirmDelete(d: DriveSummary) {
    Alert.alert(t('drives.list.deleteTitle'), t('drives.list.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteDrive(d.id).then(success, failure) },
    ]);
  }

  const order = new Map(drives.map((d, i) => [d.id, i]));
  const enter = (i: number) => (intro && i < 8 ? FadeInDown.springify().damping(18).delay(160 + i * 45) : undefined);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(d) => d.id}
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled={false}
      style={{ flex: 1, backgroundColor: c.background }}
      indicatorStyle={dark ? 'white' : 'black'}
      contentContainerStyle={{
        paddingHorizontal: space.lg,
        paddingTop: Platform.OS === 'ios' ? space.sm : space.md,
        paddingBottom: Platform.OS === 'ios' ? 120 : insets.bottom + 110,
      }}
      ListHeaderComponent={
        <View style={{ gap: space.lg, marginBottom: drives.length ? space.sm : 0 }}>
          <Animated.View entering={FadeInDown.springify().damping(18)}>
            <RecorderHero />
          </Animated.View>
          {hasSamples ? <SamplesBanner /> : null}
          <RecapBanner />
          {drives.length > 0 ? (
            <Animated.View entering={FadeInDown.springify().damping(18).delay(80)} layout={LinearTransition.springify().damping(18)}>
              <WeekStrip drives={drives} />
            </Animated.View>
          ) : null}
        </View>
      }
      ListEmptyComponent={<Empty recorder={recorder} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <SectionTitle title={section.title} style={{ marginBottom: 0, flex: 1 }} />
          <Text style={[type.mono, { color: c.textTertiary, fontSize: 13 }]}>{fmt.distance(section.meters)}</Text>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
      renderItem={({ item }) => (
        <Animated.View entering={enter(order.get(item.id) ?? 99)} layout={LinearTransition.springify().damping(18)}>
          <DriveRow drive={item} onPress={() => router.push(`/drive/${item.id}`)} onLongPress={() => confirmDelete(item)} />
        </Animated.View>
      )}
      initialNumToRender={10}
      windowSize={11}
    />
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: space.xl, paddingBottom: space.sm, paddingRight: space.xs },
  samples: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md + 2, paddingRight: space.sm, borderRadius: radius.md },
});
