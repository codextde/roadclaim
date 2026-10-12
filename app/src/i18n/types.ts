import type { en } from './en';

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

export type Dict = Widen<typeof en>;

type Path<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Key = Path<Dict>;

export type Lang = 'en' | 'de';
