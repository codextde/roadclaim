import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { CardFrame, type CardFormat, ExportActions, useCardExport } from '@/components/drive/card-export';
import { looks, ShareCard } from '@/components/drive/share-card';
import { LoadingState } from '@/components/states';
import { Group, Label, Segmented, SheetHeader, ToggleRow } from '@/components/ui';
import type { Drive, DriveSummary } from '@/core/types';
import { useDrive, useDrives } from '@/data/drives';
import { useSettings } from '@/data/settings';
import { useT } from '@/i18n';
import { space, useColors } from '@/theme';

export default function ShareSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const { t } = useT();
  const { width, height } = useWindowDimensions();
  const full: Drive | null | undefined = useDrive(id);
  const drives: DriveSummary[] = useDrives();
  const drive = full ?? drives.find((d) => d.id === id);
  const stored = useSettings((s) => s.cardStyle);
  const cardStyle = looks[stored] ? stored : 'dark';
  const [format, setFormat] = useState<CardFormat>('square');
  const [detailed, setDetailed] = useState(false);
  const ref = useRef<View>(null);
  const actions = useCardExport(ref, format, t('drives.share.dialogTitle'));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: space.xxxl }} showsVerticalScrollIndicator={false}>
      <SheetHeader title={t('drives.share.title')} onClose={() => router.back()} closeLabel={t('common.close')} />
      {!drive ? (
        <LoadingState />
      ) : (
        <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
          <CardFrame cardRef={ref} format={format} maxWidth={width - space.lg * 2} maxHeight={format === 'story' ? height * 0.5 : width} label={t('drives.share.preview')}>
            <ShareCard drive={drive} cardStyle={cardStyle} format={format} detailed={detailed} />
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
          <Group style={{ marginBottom: 0 }}>
            <ToggleRow icon="stack" title={t('drives.share.detailed')} subtitle={t('drives.share.detailedBody')} value={detailed} onChange={setDetailed} last />
          </Group>
          <ExportActions actions={actions} />
        </View>
      )}
    </ScrollView>
  );
}
