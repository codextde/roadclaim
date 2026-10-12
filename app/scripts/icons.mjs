import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#090A0C';
const BG_TOP = '#14181B';
const ACCENT = '#10B981';
const ACCENT_LIGHT = '#34D399';

const cx = 50;
const cy = 50;
const r = 33;
const v = Array.from({ length: 6 }, (_, i) => {
  const a = ((60 * i - 90) * Math.PI) / 180;
  return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)];
});
const hexD = `M${v.map((p) => p.join(',')).join(' L')} Z`;
const roadD = 'M12,90 C34,74 26,56 48,51 C70,46 64,28 90,12';

const mark = ({ fg = ACCENT, mono = false, id = 'm' } = {}) => `
  <defs>
    <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <path d="${hexD}" fill="#fff" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>
      <path d="${roadD}" fill="none" stroke="#000" stroke-width="13.5" stroke-linecap="butt"/>
    </mask>
    <clipPath id="${id}c"><path d="${hexD}"/></clipPath>
  </defs>
  <rect width="100" height="100" fill="${mono ? fg : 'url(#hexfill)'}" mask="url(#${id})"/>
  <path d="${roadD}" fill="none" stroke="${mono ? fg : ACCENT_LIGHT}" stroke-opacity="${mono ? 1 : 0.95}" stroke-width="2.6" stroke-dasharray="5.5 4.5" stroke-dashoffset="2" stroke-linecap="round" clip-path="url(#${id}c)"/>`;

const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG}"/></linearGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${ACCENT}" stop-opacity="0.18"/><stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/></radialGradient>
  <linearGradient id="hexfill" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="${ACCENT_LIGHT}"/><stop offset="1" stop-color="#059669"/></linearGradient>
</defs>`;

const svg = (size, inner, { bg = false, scale = 1, dy = 0, halo = bg } = {}) => {
  const offset = (100 - 100 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${defs}
  ${bg ? `<rect width="100" height="100" fill="url(#bg)"/>` : ''}
  ${halo ? `<circle cx="50" cy="50" r="46" fill="url(#halo)"/>` : ''}
  <g transform="translate(${offset} ${offset + dy}) scale(${scale})">${inner}</g>
</svg>`;
};

const source = svg(1024, mark(), { bg: true, scale: 0.84 });
writeFileSync('assets/brand/icon.svg', source);
const png = (s, file) => sharp(Buffer.from(s)).png().toFile(`assets/images/${file}`);

await png(readFileSync('assets/brand/icon.svg', 'utf8'), 'icon.png');
await png(svg(1024, mark(), { scale: 0.56, halo: false }), 'android-icon-foreground.png');
await png(svg(1024, '', { bg: true }), 'android-icon-background.png');
await png(svg(1024, mark({ fg: '#FFFFFF', mono: true }), { scale: 0.56 }), 'android-icon-monochrome.png');
await png(svg(512, mark(), { scale: 0.96 }), 'splash-icon.png');
await png(svg(96, mark({ fg: '#FFFFFF', mono: true }), { scale: 0.95 }), 'notification-icon.png');
await png(svg(96, mark(), { bg: true, scale: 0.86 }), 'favicon.png');
await png(svg(512, mark(), { bg: true, scale: 0.84 }), 'store-icon-512.png');
console.log('icons written');
