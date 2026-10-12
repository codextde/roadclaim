export type CatalogCar = { id: string; make: string; model: string; years: [number, number | null]; body: string };

const FALLBACK: CatalogCar[] = [
  { id: 'volkswagen-golf', make: 'Volkswagen', model: 'Golf', years: [1974, null], body: 'hatchback' },
  { id: 'bmw-3-series', make: 'BMW', model: '3 Series', years: [1975, null], body: 'sedan' },
  { id: 'mercedes-benz-c-class', make: 'Mercedes-Benz', model: 'C-Class', years: [1993, null], body: 'sedan' },
  { id: 'audi-a4', make: 'Audi', model: 'A4', years: [1994, null], body: 'sedan' },
  { id: 'porsche-911', make: 'Porsche', model: '911', years: [1964, null], body: 'coupe' },
  { id: 'tesla-model-3', make: 'Tesla', model: 'Model 3', years: [2017, null], body: 'sedan' },
  { id: 'toyota-corolla', make: 'Toyota', model: 'Corolla', years: [1966, null], body: 'sedan' },
  { id: 'ford-mustang', make: 'Ford', model: 'Mustang', years: [1964, null], body: 'coupe' },
];

let catalog: CatalogCar[] | null = null;

function load(): CatalogCar[] {
  if (catalog) return catalog;
  try {
    const data = require('../../assets/data/cars.json') as CatalogCar[];
    catalog = Array.isArray(data) && data.length ? data : FALLBACK;
  } catch {
    catalog = FALLBACK;
  }
  return catalog;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function searchCars(q: string, limit = 50): CatalogCar[] {
  const words = norm(q).split(' ').filter(Boolean);
  const cars = load();
  if (!words.length) return cars.slice(0, limit);
  const scored: { car: CatalogCar; score: number }[] = [];
  for (const car of cars) {
    const make = norm(car.make);
    const model = norm(car.model);
    const text = `${make} ${model}`;
    if (!words.every((w) => text.includes(w))) continue;
    const first = words[0];
    const score = (make.startsWith(first) ? 0 : model.startsWith(first) ? 1 : 2) * 1000 + text.length;
    scored.push({ car, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.car);
}

export function getCar(id: string): CatalogCar | null {
  return load().find((c) => c.id === id) ?? null;
}

export function carLabel(car: { make: string; model: string; year?: number }) {
  return car.year ? `${car.make} ${car.model} (${car.year})` : `${car.make} ${car.model}`;
}
