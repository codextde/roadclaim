import type { GarageCar } from '@/data/settings';
import { useSettings } from '@/data/settings';
import { t } from '@/i18n';
import { carColors } from '@/theme';
import { remote } from '@/ui-lib/remote';

export type CarColorId = (typeof carColors)[number]['id'];

export function carLabel(car: Pick<GarageCar, 'make' | 'model'>) {
  return `${car.make} ${car.model}`;
}

export function carColorId(hex: string): CarColorId | null {
  return carColors.find((x) => x.hex.toLowerCase() === hex.toLowerCase())?.id ?? null;
}

export function carColorName(hex: string) {
  const id = carColorId(hex);
  return id ? t(`garage.colors.${id}`) : hex.toUpperCase();
}

export function carColorEnglish(hex: string) {
  return carColorId(hex) ?? undefined;
}

export function syncActiveCar(car: GarageCar | null, localOnly: boolean) {
  if (localOnly) return;
  remote.updateMe({ car: car ? { id: car.catalogId, label: carLabel(car), color: car.color } : null }).catch(() => undefined);
}

export function setActiveCar(car: GarageCar, localOnly: boolean) {
  useSettings.setState({ activeCarId: car.id });
  syncActiveCar(car, localOnly);
}

export function deleteCar(id: string, localOnly: boolean) {
  const { cars, activeCarId } = useSettings.getState();
  const rest = cars.filter((x) => x.id !== id);
  if (activeCarId === id) {
    const next = rest[0] ?? null;
    useSettings.setState({ cars: rest, activeCarId: next?.id ?? null });
    syncActiveCar(next, localOnly);
  } else {
    useSettings.setState({ cars: rest });
  }
}
