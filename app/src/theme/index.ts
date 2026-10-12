import { useColorScheme, type TextStyle } from 'react-native';

const dark = {
  background: '#090A0C',
  surface: '#121417',
  surfaceRaised: '#1A1D21',
  surfaceSunken: '#0D0F11',
  surfacePressed: '#22262B',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#F3F5F4',
  textSecondary: '#9BA3A0',
  textTertiary: '#5F6764',
  accent: '#10B981',
  accentStrong: '#34D399',
  accentSoft: 'rgba(16,185,129,0.14)',
  accentGlow: 'rgba(16,185,129,0.35)',
  onAccent: '#03140D',
  club: '#F59E0B',
  clubSoft: 'rgba(245,158,11,0.15)',
  friend: '#3B82F6',
  friendSoft: 'rgba(59,130,246,0.16)',
  other: '#6B7280',
  otherSoft: 'rgba(107,114,128,0.2)',
  danger: '#F2555A',
  dangerSoft: 'rgba(242,85,90,0.14)',
  warn: '#F59E0B',
  warnSoft: 'rgba(245,158,11,0.14)',
  bronze: '#C98A5A',
  silver: '#B9C2CC',
  gold: '#F2C14E',
  scrim: 'rgba(0,0,0,0.6)',
  hero: '#111316',
  onHero: '#FFFFFF',
  onHeroSecondary: 'rgba(255,255,255,0.62)',
  mapScrim: 'rgba(9,10,12,0.72)',
  shadow: '#000000',
};

export type Palette = typeof dark;

const light: Palette = {
  background: '#F2F3F5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#E9EBEE',
  surfacePressed: '#E2E5E9',
  border: 'rgba(12,16,20,0.06)',
  borderStrong: 'rgba(12,16,20,0.13)',
  text: '#0B0D10',
  textSecondary: '#59616B',
  textTertiary: '#8C939C',
  accent: '#059669',
  accentStrong: '#047857',
  accentSoft: 'rgba(5,150,105,0.11)',
  accentGlow: 'rgba(5,150,105,0.25)',
  onAccent: '#FFFFFF',
  club: '#D97706',
  clubSoft: 'rgba(217,119,6,0.12)',
  friend: '#2563EB',
  friendSoft: 'rgba(37,99,235,0.1)',
  other: '#6B7280',
  otherSoft: 'rgba(107,114,128,0.14)',
  danger: '#DC3B40',
  dangerSoft: 'rgba(220,59,64,0.1)',
  warn: '#D97706',
  warnSoft: 'rgba(217,119,6,0.12)',
  bronze: '#A86A3D',
  silver: '#8792A0',
  gold: '#C9971C',
  scrim: 'rgba(11,13,16,0.4)',
  hero: '#0E1013',
  onHero: '#FFFFFF',
  onHeroSecondary: 'rgba(255,255,255,0.62)',
  mapScrim: 'rgba(255,255,255,0.82)',
  shadow: '#0B0D10',
};

export const palettes = { light, dark };

export function useIsDark() {
  return useColorScheme() !== 'light';
}

export function useColors(): Palette {
  return useIsDark() ? dark : light;
}

export const brand = {
  emerald: '#10B981',
  amber: '#F59E0B',
  blue: '#3B82F6',
  ink: '#090A0C',
} as const;

export const avatarColors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316', '#84CC16', '#64748B'] as const;

export const carColors = [
  { id: 'black', hex: '#111111' },
  { id: 'white', hex: '#F5F5F5' },
  { id: 'silver', hex: '#B8BDC2' },
  { id: 'grey', hex: '#6B7075' },
  { id: 'blue', hex: '#1E4FD8' },
  { id: 'red', hex: '#C81E1E' },
  { id: 'green', hex: '#1F7A4D' },
  { id: 'yellow', hex: '#F2C230' },
  { id: 'orange', hex: '#F07C1B' },
  { id: 'brown', hex: '#6B4A2F' },
  { id: 'beige', hex: '#D8C9A8' },
  { id: 'purple', hex: '#5B3FA0' },
] as const;

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  numMedium: 'BarlowSemiCondensed_500Medium',
  numSemibold: 'BarlowSemiCondensed_600SemiBold',
  numBold: 'BarlowSemiCondensed_700Bold',
} as const;

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  hero: { fontFamily: fonts.numBold, fontSize: 76, lineHeight: 78, letterSpacing: -1.5, fontVariant: tabular },
  display: { fontFamily: fonts.numBold, fontSize: 48, lineHeight: 52, letterSpacing: -0.8, fontVariant: tabular },
  value: { fontFamily: fonts.numSemibold, fontSize: 30, lineHeight: 34, letterSpacing: -0.2, fontVariant: tabular },
  valueSmall: { fontFamily: fonts.numSemibold, fontSize: 22, lineHeight: 26, fontVariant: tabular },
  unit: { fontFamily: fonts.numMedium, fontSize: 15, lineHeight: 18, letterSpacing: 0.2 },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.9 },
  headline: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 23, letterSpacing: -0.35 },
  body: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 22, letterSpacing: -0.15 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, letterSpacing: -0.05 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' },
  mono: { fontFamily: fonts.numMedium, fontSize: 14, lineHeight: 18, letterSpacing: 0.3, fontVariant: tabular },
} satisfies Record<string, TextStyle>;

export const spring = {
  snappy: { damping: 18, stiffness: 320, mass: 0.8 },
  soft: { damping: 22, stiffness: 160 },
  bouncy: { damping: 11, stiffness: 180 },
} as const;

export function tierColor(c: Palette, tier: number) {
  if (tier >= 3) return c.gold;
  if (tier === 2) return c.silver;
  if (tier === 1) return c.bronze;
  return c.textTertiary;
}

export function ownerColor(c: Palette, owner: 'me' | 'friend' | 'club' | 'other') {
  if (owner === 'me') return c.accent;
  if (owner === 'friend') return c.friend;
  if (owner === 'club') return c.club;
  return c.other;
}

export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${full}${a}`;
}
