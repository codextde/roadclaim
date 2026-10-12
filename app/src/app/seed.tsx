import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { LoadingState } from '@/components/states';
import { searchCars } from '@/data/cars';
import { seedDemoData } from '@/data/drives';
import type { GarageCar } from '@/data/settings';
import { useSettings } from '@/data/settings';
import { useColors } from '@/theme';

export default function Seed() {
  const c = useColors();
  useEffect(() => {
    seedDemoData()
      .catch(() => undefined)
      .finally(() => {
        useSettings.setState({ onboarded: true, localOnly: false, cars: demoCars(), activeCarId: 'demo-car-1' });
        router.replace('/');
      });
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: c.background, justifyContent: 'center' }}>
      <LoadingState />
    </View>
  );
}

function demoCars(): GarageCar[] {
  const pick = (q: string, id: string, year: number, color: string, nickname?: string): GarageCar | null => {
    const car = searchCars(q, 1)[0];
    return car ? { id, catalogId: car.id, make: car.make, model: car.model, year, color, nickname } : null;
  };
  return [pick('BMW M3', 'demo-car-1', 2023, '#1E4FD8', 'Blue Thunder'), pick('Porsche 911', 'demo-car-2', 1997, '#F5F5F5'), pick('Golf', 'demo-car-3', 2019, '#C81E1E')].filter(
    (c): c is GarageCar => c !== null,
  );
}
