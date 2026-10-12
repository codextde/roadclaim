import { request } from './client';
import type {
  Bbox,
  BoardEntry,
  CellOwner,
  Club,
  ClubMember,
  DriveUpload,
  FriendRequest,
  Me,
  MePatch,
  Metric,
  Mod,
  ModRequest,
  Period,
  PublicUser,
  Report,
  Scope,
  ServerConfig,
  Stats,
  TerritoryBoard,
  TerritoryResult,
  Trophy,
  TrophyDefinition,
} from './types';

type Ok = { ok: true };
const enc = encodeURIComponent;

function modForm(input: ModRequest | FormData): FormData {
  if (input instanceof FormData) return input;
  const form = new FormData();
  form.append('style', input.style);
  form.append('carLabel', input.carLabel);
  if (input.prompt) form.append('prompt', input.prompt);
  if (input.color) form.append('color', input.color);
  if (input.photo) {
    const name = input.photo.name ?? (input.photo.type === 'image/png' ? 'photo.png' : 'photo.jpg');
    form.append('photo', { uri: input.photo.uri, type: input.photo.type, name } as unknown as Blob);
  }
  return form;
}

export const api = {
  health: () => request<{ ok: boolean }>('/health', { auth: false }),
  config: () => request<ServerConfig>('/v1/config', { auth: false }),

  deviceSignup: (body: { platform: 'ios' | 'android'; locale?: string }) =>
    request<{ token: string; recoveryKey: string; me: Me }>('/v1/auth/device', { method: 'POST', body, auth: false, retries: 2 }),
  restore: (recoveryKey: string) => request<{ token: string; me: Me }>('/v1/auth/restore', { method: 'POST', body: { recoveryKey }, auth: false }),
  recoveryKey: () => request<{ recoveryKey: string }>('/v1/auth/recovery-key'),
  deleteWithRecovery: (recoveryKey: string) =>
    request<Ok>('/v1/auth/delete-with-recovery', { method: 'POST', body: { recoveryKey }, auth: false }),

  me: () => request<Me>('/v1/me'),
  updateMe: (patch: MePatch) => request<Me>('/v1/me', { method: 'PATCH', body: patch }),
  deleteMe: () => request<Ok>('/v1/me', { method: 'DELETE' }),
  myStats: (period: Period = 'season') => request<Stats>('/v1/me/stats', { query: { period } }),

  uploadDrive: (drive: DriveUpload) =>
    request<{ territory: TerritoryResult; newTrophies: Trophy[] }>('/v1/drives', { method: 'POST', body: drive, retries: 2 }),
  deleteDrive: (id: string) => request<Ok>(`/v1/drives/${enc(id)}`, { method: 'DELETE', retries: 1 }),
  backupDrive: (id: string, drive: unknown) =>
    request<{ ok: boolean }>(`/v1/backup/drives/${enc(id)}`, { method: 'PUT', body: drive, retries: 1, timeoutMs: 60_000 }),
  backups: () => request<{ items: { id: string; updatedAt: string; size: number }[] }>('/v1/backup/drives'),
  backup: <T = unknown>(id: string) => request<T>(`/v1/backup/drives/${enc(id)}`, { timeoutMs: 60_000 }),
  deleteBackup: (id: string) => request<Ok>(`/v1/backup/drives/${enc(id)}`, { method: 'DELETE' }),

  searchUsers: (q: string) => request<{ items: PublicUser[] }>('/v1/users/search', { query: { q } }),
  user: (id: string) =>
    request<{ user: PublicUser; stats: Stats; trophies: Trophy[]; isFriend: boolean; requestPending: 'in' | 'out' | null }>(`/v1/users/${enc(id)}`),
  friends: () => request<{ items: PublicUser[] }>('/v1/friends'),
  friendRequests: () => request<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/v1/friends/requests'),
  sendFriendRequest: (userId: string) => request<{ id: string }>('/v1/friends/requests', { method: 'POST', body: { userId } }),
  acceptFriendRequest: (id: string) => request<Ok>(`/v1/friends/requests/${enc(id)}/accept`, { method: 'POST' }),
  declineFriendRequest: (id: string) => request<Ok>(`/v1/friends/requests/${enc(id)}/decline`, { method: 'POST' }),
  acceptInvite: (code: string) => request<{ friend: PublicUser }>(`/v1/friends/invite/${enc(code)}`, { method: 'POST' }),
  removeFriend: (userId: string) => request<Ok>(`/v1/friends/${enc(userId)}`, { method: 'DELETE' }),
  compare: (userId: string) => request<{ me: Stats; them: Stats; user: PublicUser }>(`/v1/compare/${enc(userId)}`),

  leaderboard: (q: { metric: Metric; scope: Scope; period: Period; clubId?: string }) =>
    request<{ entries: BoardEntry[]; me: BoardEntry | null; scopeLabel: string }>('/v1/leaderboards', { query: q }),
  clubLeaderboard: (q: { metric: 'area' | 'distance'; period: Period }) =>
    request<{ entries: { rank: number; club: Club; value: number }[] }>('/v1/leaderboards/clubs', { query: q }),

  cells: (bbox: Bbox, clubId?: string) =>
    request<{ cells: CellOwner[] }>('/v1/territory/cells', {
      query: { bbox: [bbox.minLat, bbox.minLng, bbox.maxLat, bbox.maxLng].map((x) => x.toFixed(5)).join(','), clubId },
    }),
  myTerritory: () => request<{ held: string[]; ever: string[] }>('/v1/territory/mine'),
  territorySeason: (q: { board: TerritoryBoard; month?: string; scope?: 'world' | 'friends' }) =>
    request<{ entries: BoardEntry[]; me: BoardEntry | null }>('/v1/territory/season', { query: q }),

  createClub: (body: { name: string; color: string; description?: string; isPublic: boolean }) =>
    request<Club>('/v1/clubs', { method: 'POST', body }),
  myClub: () => request<{ club: Club | null }>('/v1/clubs/mine'),
  searchClubs: (q: string) => request<{ items: Club[] }>('/v1/clubs/search', { query: { q } }),
  club: (id: string) => request<{ club: Club; members: ClubMember[] }>(`/v1/clubs/${enc(id)}`),
  joinClub: (code: string) => request<Club>('/v1/clubs/join', { method: 'POST', body: { code } }),
  joinPublicClub: (id: string) => request<Club>(`/v1/clubs/${enc(id)}/join`, { method: 'POST' }),
  leaveClub: (id: string) => request<Ok>(`/v1/clubs/${enc(id)}/leave`, { method: 'POST' }),
  removeClubMember: (id: string, userId: string) => request<Ok>(`/v1/clubs/${enc(id)}/members/${enc(userId)}`, { method: 'DELETE' }),
  deleteClub: (id: string) => request<Ok>(`/v1/clubs/${enc(id)}`, { method: 'DELETE' }),
  updateClub: (id: string, patch: Partial<{ name: string; color: string; description: string; isPublic: boolean }>) =>
    request<Club>(`/v1/clubs/${enc(id)}`, { method: 'PATCH', body: patch }),

  trophies: () => request<{ items: Trophy[] }>('/v1/trophies'),
  trophyDefinitions: () => request<{ items: TrophyDefinition[] }>('/v1/trophies/definitions', { auth: false }),

  createMod: (input: ModRequest | FormData) =>
    request<{ id: string; imageUrl: string; createdAt: string }>('/v1/mods', { method: 'POST', form: modForm(input), timeoutMs: 120_000 }),
  mods: () => request<{ items: Mod[]; remainingToday: number }>('/v1/mods'),
  deleteMod: (id: string) => request<Ok>(`/v1/mods/${enc(id)}`, { method: 'DELETE' }),

  report: (report: Report) => request<Ok>('/v1/reports', { method: 'POST', body: report }),
  block: (userId: string) => request<Ok>('/v1/blocks', { method: 'POST', body: { userId } }),
  unblock: (userId: string) => request<Ok>(`/v1/blocks/${enc(userId)}`, { method: 'DELETE' }),
  blocks: () => request<{ items: PublicUser[] }>('/v1/blocks'),
};

export type Api = typeof api;
