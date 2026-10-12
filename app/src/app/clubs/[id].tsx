import { useLocalSearchParams } from 'expo-router';

import { ClubView } from '@/components/social/club-view';

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClubView id={id ?? ''} />;
}
