import { locale, t } from '@/i18n';

export function dayKey(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthKey(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function previousMonthKey(d: Date = new Date()) {
  return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
}

export function dayLabel(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const k = dayKey(d);
  if (k === today) return t('common.today');
  if (k === yesterday) return t('common.yesterday');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function timeLabel(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
}

export function dateLabel(iso: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString(locale(), opts);
}

export function startOfWeek(d: Date = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
