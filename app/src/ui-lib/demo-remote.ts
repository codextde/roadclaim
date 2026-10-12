import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';

import type { DriveSummary } from '@/core/types';

import type {
  BoardEntry,
  Bbox,
  CellOwner,
  Club,
  ClubMember,
  Compare,
  FriendRequest,
  Me,
  Metric,
  Period,
  PublicUser,
  Scope,
  SeasonBoard,
  SeasonStats,
  ServerConfig,
  Trophy,
  UserProfile,
} from './api-types';

const ISAR = { id: 'club-isar', name: 'Isar Night Drivers', color: '#F59E0B' };

function user(id: string, displayName: string, avatarColor: string, car: string | null, carColor: string, homeCity: string, homeCountry = 'DE', club: PublicUser['club'] = null): PublicUser {
  return { id, username: id, displayName, avatarColor, car: car ? { id: car, label: car, color: carColor } : null, homeCity, homeCountry, club };
}

export const demoMe: Me = {
  ...user('daniel.e', 'Daniel', '#10B981', 'BMW M3 Touring', '#1E4FD8', 'Munich', 'DE', ISAR),
  id: 'me',
  inviteCode: 'K7Q2MX',
  privacy: { localOnly: false, hideFromLeaderboards: false, cloudBackup: false },
  createdAt: '2026-03-02T08:00:00.000Z',
};

const friends: PublicUser[] = [
  user('lena.k', 'Lena Kraus', '#3B82F6', 'VW Golf GTI', '#C81E1E', 'Munich', 'DE', ISAR),
  user('maxi_r', 'Maximilian Roth', '#EF4444', 'Porsche 911 Carrera', '#B8BDC2', 'Munich'),
  user('sofia.m', 'Sofia Marino', '#EC4899', 'Fiat 500e', '#F5F5F5', 'Munich', 'IT'),
  user('jonas.w', 'Jonas Weber', '#8B5CF6', 'Audi RS 3', '#111111', 'Augsburg', 'DE', ISAR),
  user('aylin.d', 'Aylin Demir', '#14B8A6', 'Tesla Model 3', '#F5F5F5', 'Munich'),
  user('tom.h', 'Tom Hartmann', '#F97316', 'Mercedes-AMG C 63', '#6B7075', 'Stuttgart'),
];

const others: PublicUser[] = [
  user('nora.b', 'Nora Becker', '#84CC16', 'Mini Cooper S', '#1F7A4D', 'Munich'),
  user('luca.f', 'Luca Fischer', '#64748B', 'Toyota GR86', '#F07C1B', 'Munich', 'DE', ISAR),
  user('kenji.t', 'Kenji Tanaka', '#3B82F6', 'Mazda MX-5', '#C81E1E', 'Vienna', 'AT'),
  user('olivia.p', 'Olivia Parker', '#EC4899', 'Ford Mustang', '#F2C230', 'Zurich', 'CH'),
  user('mateo.g', 'Mateo García', '#F59E0B', 'Seat Leon Cupra', '#1E4FD8', 'Munich', 'ES'),
  user('felix.n', 'Felix Neumann', '#8B5CF6', 'Skoda Octavia RS', '#111111', 'Munich'),
  user('clara.v', 'Clara Vogel', '#14B8A6', 'Volvo XC40', '#D8C9A8', 'Munich'),
  user('emre.y', 'Emre Yilmaz', '#EF4444', 'Hyundai i30 N', '#1E4FD8', 'Nuremberg'),
  user('hanna.s', 'Hanna Schulz', '#10B981', 'Polestar 2', '#B8BDC2', 'Munich'),
  user('pierre.l', 'Pierre Laurent', '#64748B', 'Renault Alpine A110', '#1E4FD8', 'Lyon', 'FR'),
];

const everyone = [...friends, ...others];
const byId = new Map(everyone.map((u) => [u.id, u]));
const meUser: PublicUser = demoMe;

const PERIOD_SCALE: Record<Period, number> = { today: 0.06, week: 0.28, month: 1, season: 7.5 };

const BASE: Record<Metric, Record<string, number>> = {
  distance: { 'maxi_r': 1890e3, 'lena.k': 1610e3, 'jonas.w': 1420e3, me: 1288e3, 'aylin.d': 1105e3, 'tom.h': 980e3, 'sofia.m': 640e3, 'nora.b': 1520e3, 'luca.f': 1350e3, 'kenji.t': 2210e3, 'olivia.p': 1985e3, 'mateo.g': 1180e3, 'felix.n': 870e3, 'clara.v': 760e3, 'emre.y': 1730e3, 'hanna.s': 690e3, 'pierre.l': 1560e3 },
  area: { 'lena.k': 1544, me: 1284, 'maxi_r': 1190, 'jonas.w': 1012, 'aylin.d': 846, 'tom.h': 601, 'sofia.m': 388, 'nora.b': 1402, 'luca.f': 1320, 'kenji.t': 1890, 'olivia.p': 1610, 'mateo.g': 940, 'felix.n': 702, 'clara.v': 515, 'emre.y': 1188, 'hanna.s': 455, 'pierre.l': 1240 },
  longest: { 'tom.h': 412e3, 'maxi_r': 386e3, me: 186e3, 'jonas.w': 233e3, 'lena.k': 158e3, 'aylin.d': 141e3, 'sofia.m': 96e3, 'nora.b': 205e3, 'luca.f': 177e3, 'kenji.t': 501e3, 'olivia.p': 455e3, 'mateo.g': 268e3, 'felix.n': 122e3, 'clara.v': 88e3, 'emre.y': 344e3, 'hanna.s': 74e3, 'pierre.l': 389e3 },
  trophies: { me: 14, 'lena.k': 17, 'maxi_r': 15, 'jonas.w': 12, 'aylin.d': 9, 'tom.h': 11, 'sofia.m': 6, 'nora.b': 13, 'luca.f': 12, 'kenji.t': 21, 'olivia.p': 19, 'mateo.g': 10, 'felix.n': 8, 'clara.v': 7, 'emre.y': 16, 'hanna.s': 5, 'pierre.l': 14 },
};

function board(ids: string[], metric: Metric, period: Period): { entries: BoardEntry[]; me: BoardEntry | null } {
  const scale = metric === 'distance' ? PERIOD_SCALE[period] : metric === 'longest' ? (period === 'season' ? 1 : Math.min(1, PERIOD_SCALE[period] * 1.8)) : 1;
  const rows = ids
    .map((id) => ({ user: id === 'me' ? meUser : byId.get(id)!, value: Math.round((BASE[metric][id] ?? 0) * scale) }))
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { entries: rows, me: rows.find((r) => r.user.id === 'me') ?? null };
}

const SCOPE_IDS: Record<Scope, string[]> = {
  friends: ['me', ...friends.map((f) => f.id)],
  city: ['me', 'lena.k', 'maxi_r', 'sofia.m', 'aylin.d', 'nora.b', 'luca.f', 'mateo.g', 'felix.n', 'clara.v', 'hanna.s'],
  country: ['me', ...everyone.filter((u) => u.homeCountry === 'DE' || u.homeCity === 'Munich').map((u) => u.id)],
  world: ['me', ...everyone.map((u) => u.id)],
  club: ['me', 'lena.k', 'jonas.w', 'luca.f'],
};

const SCOPE_LABEL: Record<Scope, string> = { friends: '', city: 'Munich', country: 'Germany', world: '', club: ISAR.name };

const clubs: Club[] = [
  { id: ISAR.id, name: ISAR.name, color: ISAR.color, description: 'Late drives along the Isar. Claim Schwabing, hold the Altstadt.', isPublic: true, ownerId: 'me', memberCount: 4, cellsHeld: 4120, inviteCode: 'ISAR26' },
  { id: 'club-ghosts', name: 'Autobahn Ghosts', color: '#3B82F6', description: 'A9 regulars.', isPublic: true, ownerId: 'maxi_r', memberCount: 12, cellsHeld: 5310 },
  { id: 'club-alpine', name: 'Alpine Apex', color: '#10B981', description: 'Passes, hairpins and early starts.', isPublic: true, ownerId: 'kenji.t', memberCount: 9, cellsHeld: 3980 },
  { id: 'club-torque', name: 'Stuttgart Torque', color: '#EF4444', description: 'Home of the Kesselrunde.', isPublic: true, ownerId: 'tom.h', memberCount: 15, cellsHeld: 3410 },
  { id: 'club-rhein', name: 'Rhein Cruisers', color: '#8B5CF6', description: 'Slow roads, long views.', isPublic: true, ownerId: 'pierre.l', memberCount: 7, cellsHeld: 2260 },
];

function stats(seed: number): SeasonStats {
  return {
    distanceM: Math.round(BASE.distance[seedKey(seed)] ?? 900e3) * 7.5,
    drives: 180 + (seed % 7) * 23,
    longestM: BASE.longest[seedKey(seed)] ?? 150e3,
    cellsHeld: BASE.area[seedKey(seed)] ?? 900,
    cellsEver: Math.round((BASE.area[seedKey(seed)] ?? 900) * 1.8),
    trophies: BASE.trophies[seedKey(seed)] ?? 10,
    activeDays: 120 + (seed % 5) * 17,
    elevationGainM: 21000 + (seed % 9) * 3100,
    durationS: 420000 + (seed % 6) * 36000,
    countries: 2 + (seed % 4),
  };
}

const seedKeys = ['me', ...everyone.map((u) => u.id)];
function seedKey(seed: number) {
  return seedKeys[seed % seedKeys.length];
}

const myStats: SeasonStats = { ...stats(0), distanceM: 9_660_000, drives: 214, longestM: 186e3, cellsHeld: 1284, cellsEver: 2310, trophies: 14, activeDays: 158, elevationGainM: 48200, durationS: 512000, countries: 4 };

const trophies: Trophy[] = [
  { id: 'first_drive', tier: 3, value: 1, next: null, earnedAt: '2026-03-02T08:00:00.000Z' },
  { id: 'distance_total', tier: 2, value: 9_660_000, next: 10_000_000, earnedAt: '2026-08-21T18:00:00.000Z' },
  { id: 'distance_single', tier: 1, value: 186_000, next: 300_000, earnedAt: '2026-05-11T12:00:00.000Z' },
  { id: 'active_days', tier: 3, value: 158, next: null, earnedAt: '2026-09-30T07:00:00.000Z' },
  { id: 'streak', tier: 2, value: 12, next: 30, earnedAt: '2026-07-04T07:00:00.000Z' },
  { id: 'cells_held', tier: 2, value: 1284, next: 10_000, earnedAt: '2026-09-12T07:00:00.000Z' },
  { id: 'steals', tier: 2, value: 212, next: 500, earnedAt: '2026-08-02T07:00:00.000Z' },
  { id: 'night_drive', tier: 1, value: 1, next: null, earnedAt: '2026-06-20T01:30:00.000Z' },
  { id: 'early_bird', tier: 1, value: 1, next: null, earnedAt: '2026-04-18T05:10:00.000Z' },
  { id: 'climber', tier: 2, value: 2140, next: 3000, earnedAt: '2026-08-15T11:00:00.000Z' },
  { id: 'countries', tier: 1, value: 4, next: 5, earnedAt: '2026-06-01T11:00:00.000Z' },
  { id: 'club_join', tier: 1, value: 1, next: null, earnedAt: '2026-03-10T11:00:00.000Z' },
];

let drives: DriveSummary[] = [];
let territory: CellOwner[] | null = null;

export function setDemoDrives(next: DriveSummary[]) {
  if (next === drives) return;
  drives = next;
  territory = null;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function blob(lat: number, lng: number, k: number, keep: number) {
  const center = latLngToCell(lat, lng, 9);
  return gridDisk(center, k).filter((c) => c === center || hash(c) < keep);
}

function buildTerritory(): CellOwner[] {
  const owners = new Map<string, CellOwner>();
  const put = (cells: string[], o: Omit<CellOwner, 'cell'>) => {
    for (const cell of cells) if (!owners.has(cell)) owners.set(cell, { cell, ...o });
  };
  const mine = { owner: 'me' as const, userId: 'me', name: demoMe.displayName, color: '#10B981' };
  put(drives.flatMap((d) => d.cells), mine);
  put(blob(48.1600, 11.5790, 3, 0.8), mine);
  put(blob(48.1520, 11.5900, 2, 0.75), mine);
  put(blob(48.1660, 11.5700, 2, 0.7), mine);
  put(blob(48.1680, 11.5890, 3, 0.75), { owner: 'club', userId: 'lena.k', name: 'Lena Kraus', color: ISAR.color });
  put(blob(48.1480, 11.5700, 2, 0.72), { owner: 'club', userId: 'jonas.w', name: 'Jonas Weber', color: ISAR.color });
  put(blob(48.1560, 11.5560, 3, 0.72), { owner: 'friend', userId: 'maxi_r', name: 'Maximilian Roth', color: '#3B82F6' });
  put(blob(48.1470, 11.6020, 3, 0.7), { owner: 'friend', userId: 'aylin.d', name: 'Aylin Demir', color: '#3B82F6' });
  put(blob(48.1720, 11.6060, 3, 0.66), { owner: 'other', userId: 'nora.b', name: 'Nora Becker', color: '#6B7280' });
  put(blob(48.1420, 11.5830, 2, 0.62), { owner: 'other', userId: 'mateo.g', name: 'Mateo García', color: '#6B7280' });
  put(blob(48.1760, 11.5660, 2, 0.62), { owner: 'other', userId: 'felix.n', name: 'Felix Neumann', color: '#6B7280' });
  return [...owners.values()];
}

function allTerritory() {
  territory ??= buildTerritory();
  return territory;
}

const wait = <T>(value: T, ms = 120) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

function profile(id: string): UserProfile {
  const u = byId.get(id) ?? friends[0];
  const seed = seedKeys.indexOf(u.id);
  return {
    user: u,
    stats: stats(seed),
    trophies: trophies.map((t, i) => ({ ...t, tier: (((i + seed) % 4) as Trophy['tier']) })),
    isFriend: friends.some((f) => f.id === u.id),
    requestPending: null,
    isBlocked: false,
  };
}

export const demo = {
  me: demoMe,
  config: () => wait<ServerConfig>({ features: { aiMods: true }, modsPerDay: 10, h3Resolution: 9, season: '2026' }),
  myStats: () => wait(myStats),
  trophies: () => wait({ items: trophies }),
  friends: () => wait({ items: friends }),
  friendRequests: () =>
    wait<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({
      incoming: [
        { id: 'req-1', user: byId.get('felix.n')!, createdAt: '2026-10-12T17:20:00.000Z' },
        { id: 'req-2', user: byId.get('clara.v')!, createdAt: '2026-10-11T09:05:00.000Z' },
      ],
      outgoing: [{ id: 'req-3', user: byId.get('hanna.s')!, createdAt: '2026-10-10T19:40:00.000Z' }],
    }),
  searchUsers: (q: string) => wait({ items: everyone.filter((u) => u.username.includes(q.toLowerCase()) || u.displayName.toLowerCase().includes(q.toLowerCase())) }),
  user: (id: string) => wait(profile(id)),
  compare: (id: string) => wait<Compare>({ me: myStats, them: profile(id).stats, user: profile(id).user }),
  leaderboard: (p: { metric: Metric; scope: Scope; period: Period }) => wait({ ...board(SCOPE_IDS[p.scope], p.metric, p.period), scopeLabel: SCOPE_LABEL[p.scope] }),
  clubBoard: (p: { metric: 'area' | 'distance'; period: Period }) =>
    wait({
      entries: clubs
        .map((club) => ({ club, value: p.metric === 'area' ? club.cellsHeld : Math.round(club.cellsHeld * 1450 * PERIOD_SCALE[p.period]) }))
        .sort((a, b) => b.value - a.value)
        .map((r, i) => ({ ...r, rank: i + 1 })),
    }),
  season: (p: { board: SeasonBoard }) => {
    const metric: Record<SeasonBoard, Record<string, number>> = {
      overall: BASE.area,
      stealers: { 'lena.k': 188, me: 164, 'maxi_r': 151, 'kenji.t': 140, 'jonas.w': 97, 'nora.b': 88, 'emre.y': 71, 'aylin.d': 52, 'luca.f': 44, 'tom.h': 31 },
      gainers: { me: 312, 'lena.k': 286, 'kenji.t': 240, 'olivia.p': 198, 'maxi_r': 176, 'jonas.w': 120, 'emre.y': 98, 'nora.b': 75, 'sofia.m': 40, 'hanna.s': 22 },
      losers: { 'felix.n': -142, 'clara.v': -118, 'mateo.g': -96, 'tom.h': -81, 'hanna.s': -64, 'pierre.l': -51, 'sofia.m': -37, 'aylin.d': -20, me: -12, 'luca.f': -8 },
    };
    const rows = Object.entries(metric[p.board])
      .map(([id, value]) => ({ user: id === 'me' ? meUser : byId.get(id)!, value }))
      .sort((a, b) => (p.board === 'losers' ? a.value - b.value : b.value - a.value))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    return wait({ entries: rows, me: rows.find((r) => r.user.id === 'me') ?? null });
  },
  territoryMine: () => {
    const held = allTerritory().filter((c) => c.owner === 'me').map((c) => c.cell);
    const ever = [...held, ...allTerritory().filter((c) => c.owner === 'club' || c.owner === 'friend').map((c) => c.cell).filter((c) => hash(c) < 0.35)];
    return wait({ held, ever });
  },
  cells: (b: Bbox, clubId?: string) =>
    wait({
      cells: allTerritory().filter((c) => {
        if (clubId && c.owner !== 'me' && c.owner !== 'club') return false;
        const [lat, lng] = cellToLatLng(c.cell);
        return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
      }),
    }),
  myClub: () => wait({ club: clubs[0] }),
  club: (id: string) => {
    const club = clubs.find((c) => c.id === id) ?? clubs[0];
    const members: ClubMember[] = [
      { user: meUser, role: club.ownerId === 'me' ? 'owner' : 'member', distanceM: 1_288_000 },
      { user: byId.get('lena.k')!, role: 'member', distanceM: 1_610_000 },
      { user: byId.get('jonas.w')!, role: 'member', distanceM: 1_420_000 },
      { user: byId.get('luca.f')!, role: 'member', distanceM: 1_350_000 },
    ];
    return wait({ club, members });
  },
  searchClubs: (q: string) => wait({ items: clubs.slice(1).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) }),
  mods: () => wait({ items: [], remainingToday: 10 }),
  blocks: () => wait({ items: [] as PublicUser[] }),
};
