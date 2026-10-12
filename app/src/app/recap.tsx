import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { CardFrame, type CardFormat, ExportActions, useCardExport } from '@/components/drive/card-export';
import { type Recap, RecapCard } from '@/components/drive/recap-card';
import { looks } from '@/components/drive/share-card';
import { EmptyState, LoadingState } from '@/components/states';
import { Label, Segmented, SheetHeader } from '@/components/ui';
import { useMonthlyRecap } from '@/data/drives';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';
import { monthLabel, previousMonthKey } from '@/ui-lib/date';

export default function RecapSheet() {
  const params = useLocalSearchParams<{ month?: string }>();
  const month = params.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : previousMonthKey();
  const c = useColors();
  const { t } = useT();
  const { width, height } = useWindowDimensions();
  const recap: Recap | null | undefined = useMonthlyRecap(month);
  const stored = useSettings((s) => s.cardStyle);
  const cardStyle = looks[stored] ? stored : 'dark';
  const [format, setFormat] = useState<CardFormat>('square');
  const ref = useRef<View>(null);
  const actions = useCardExport(ref, format, t('drives.recap.dialogTitle'));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
      <SheetHeader title={`${t('drives.recap.title')} · ${monthLabel(month)}`} onClose={() => router.back()} closeLabel={t('common.close')} />
      {!recap ? (
        <LoadingState />
      ) : recap.stats.drives === 0 ? (
        <EmptyState icon="calendar" title={t('drives.recap.emptyTitle')} body={t('drives.recap.emptyBody')} />
      ) : (
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <CardFrame cardRef={ref} format={format} maxWidth={width - space.lg * 2} maxHeight={format === 'story' ? height * 0.52 : width} label={t('drives.share.preview')}>
            <RecapCard month={month} recap={recap} look={looks[cardStyle]} format={format} />
          </CardFrame>
          <View style={{ gap: space.sm }}>
            <Label style={{ marginLeft: space.xs }}>{t('drives.share.style')}</Label>
            <Segmented
              value={cardStyle}
              onChange={(v) => useSettings.setState({ cardStyle: v })}
              options={[
                { value: 'dark', label: t('drives.share.styleDark') },
                { value: 'light', label: t('drives.share.styleLight') },
                { value: 'minimal', label: t('drives.share.styleMinimal') },
              ]}
            />
          </View>
          <View style={{ gap: space.sm }}>
            <Label style={{ marginLeft: space.xs }}>{t('drives.share.format')}</Label>
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'square', label: t('drives.share.square') },
                { value: 'story', label: t('drives.share.story') },
              ]}
            />
          </View>
          <ExportActions actions={actions} />
        </View>
      )}
    </ScrollView>
  );
}
