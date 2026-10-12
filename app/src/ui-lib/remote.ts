import {
  api,
  deleteAccount,
  getRecoveryKey,
  invalidateQuery,
  restoreAccount,
  setLocalOnly as coreSetLocalOnly,
  updateMe,
  useQuery,
  useSession as useCoreSession,
  type TrophyDefinition,
} from '@/api';
import { useSettings } from '@/data/settings';

import { demo } from './demo-remote';
import { SCREENSHOTS } from './screenshot-driver';

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
  Mod,
  Period,
  PublicUser,
  Scope,
  SeasonBoard,
  SeasonStats,
  ServerConfig,
  Trophy,
  UserProfile,
} from './api-types';

export function useSession() {
  const session = useCoreSession();
  return SCREENSHOTS ? { ...session, me: demo.me, ready: true, offline: false } : session;
}
export type * from './api-types';

export function useLocalOnly(): boolean {
  const { me } = useSession();
  const local = useSettings((s) => s.localOnly);
  return local || (me?.privacy.localOnly ?? false);
}

export async function setLocalOnly(on: boolean, opts: { remote?: boolean } = {}) {
  if (opts.remote === false) useSettings.getState().set({ localOnly: on });
  else await coreSetLocalOnly(on);
}

export function useConfig() {
  return useQuery<ServerConfig>('config', () => (SCREENSHOTS ? demo.config() : api.config()));
}

export function useMyStats(period: Period = 'season') {
  return useQuery<SeasonStats>(`me/stats/${period}`, () => (SCREENSHOTS ? demo.myStats() : api.myStats(period)), [period]);
}

export function useTrophies() {
  return useQuery<{ items: Trophy[] }>('trophies', () => (SCREENSHOTS ? demo.trophies() : api.trophies()));
}

export type { TrophyDefinition };

export function useTrophyDefinitions() {
  return useQuery<{ items: TrophyDefinition[] }>('trophies/definitions', () => api.trophyDefinitions());
}

export function useRecoveryKey(enabled = true) {
  return useQuery<{ recoveryKey: string }>('auth/recovery-key', async () => ({ recoveryKey: enabled ? ((await getRecoveryKey()) ?? '') : '' }), [enabled]);
}

export function useFriends() {
  return useQuery<{ items: PublicUser[] }>('friends', () => (SCREENSHOTS ? demo.friends() : api.friends()));
}

export function useFriendRequests() {
  return useQuery<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('friends/requests', () => (SCREENSHOTS ? demo.friendRequests() : api.friendRequests()));
}

export function useUserSearch(q: string) {
  const query = q.trim();
  return useQuery<{ items: PublicUser[] }>(`users/search/${query}`, () => (query.length < 2 ? Promise.resolve({ items: [] }) : SCREENSHOTS ? demo.searchUsers(query) : api.searchUsers(query)), [query]);
}

export function useUserProfile(id: string) {
  return useQuery<UserProfile>(`users/${id}`, () => (SCREENSHOTS ? demo.user(id) : api.user(id)), [id]);
}

export function useCompare(id: string) {
  return useQuery<Compare>(`compare/${id}`, () => (SCREENSHOTS ? demo.compare(id) : api.compare(id)), [id]);
}

export function useLeaderboard(p: { metric: Metric; scope: Scope; period: Period; clubId?: string }) {
  return useQuery<{ entries: BoardEntry[]; me: BoardEntry | null; scopeLabel: string }>(
    `boards/${p.metric}/${p.scope}/${p.period}/${p.clubId ?? ''}`,
    () => (SCREENSHOTS ? demo.leaderboard(p) : api.leaderboard(p)),
    [p.metric, p.scope, p.period, p.clubId],
  );
}

export function useClubBoard(p: { metric: 'area' | 'distance'; period: Period }) {
  return useQuery<{ entries: { rank: number; club: Club; value: number }[] }>(`boards/clubs/${p.metric}/${p.period}`, () => (SCREENSHOTS ? demo.clubBoard(p) : api.clubLeaderboard(p)), [p.metric, p.period]);
}

export function useSeasonBoard(p: { board: SeasonBoard; month: string; scope: 'world' | 'friends' }) {
  return useQuery<{ entries: BoardEntry[]; me: BoardEntry | null }>(`season/${p.board}/${p.month}/${p.scope}`, () => (SCREENSHOTS ? demo.season(p) : api.territorySeason(p)), [p.board, p.month, p.scope]);
}

export function useTerritoryMine() {
  return useQuery<{ held: string[]; ever: string[] }>('territory/mine', () => (SCREENSHOTS ? demo.territoryMine() : api.myTerritory()));
}

export function fetchCells(bbox: Bbox, clubId?: string): Promise<{ cells: CellOwner[] }> {
  return SCREENSHOTS ? demo.cells(bbox, clubId) : api.cells(bbox, clubId);
}

export function useMyClub() {
  return useQuery<{ club: Club | null }>('clubs/mine', () => (SCREENSHOTS ? demo.myClub() : api.myClub()));
}

export function useClub(id: string) {
  return useQuery<{ club: Club; members: ClubMember[] }>(`clubs/${id}`, () => (SCREENSHOTS ? demo.club(id) : api.club(id)), [id]);
}

export function useClubSearch(q: string) {
  const query = q.trim();
  return useQuery<{ items: Club[] }>(`clubs/search/${query}`, () => (SCREENSHOTS ? demo.searchClubs(query) : api.searchClubs(query)), [query]);
}

export function useMods(enabled = true) {
  return useQuery<{ items: Mod[]; remainingToday: number }>('mods', () => (enabled ? (SCREENSHOTS ? demo.mods() : api.mods()) : Promise.resolve({ items: [], remainingToday: 0 })), [enabled]);
}

export type ReportReason = 'inappropriate_name' | 'spam' | 'cheating' | 'other';
export type ReportTarget = { kind: 'user' | 'club'; id: string };

export function useBlocks() {
  return useQuery<{ items: PublicUser[] }>('blocks', () => (SCREENSHOTS ? demo.blocks() : api.blocks()));
}

export const remote = {
  updateMe: (patch: Partial<Pick<Me, 'username' | 'displayName' | 'avatarColor' | 'car' | 'homeCity' | 'homeCountry'>> & { privacy?: Partial<Me['privacy']> }) =>
    updateMe(patch).then(after('me/', 'boards/')),
  deleteMe: () => deleteAccount().then(after('')),
  recoveryKey: async () => ({ recoveryKey: (await getRecoveryKey()) ?? '' }),
  restore: (recoveryKey: string) => restoreAccount(recoveryKey).then(after('')),
  requestFriend: (userId: string) => api.sendFriendRequest(userId).then(after('friends', 'users/')),
  acceptRequest: (id: string) => api.acceptFriendRequest(id).then(after('friends', 'users/', 'boards/')),
  declineRequest: (id: string) => api.declineFriendRequest(id).then(after('friends')),
  acceptInvite: (code: string) => api.acceptInvite(code).then(after('friends', 'boards/')),
  removeFriend: (userId: string) => api.removeFriend(userId).then(after('friends', 'users/', 'boards/')),
  createClub: (body: { name: string; color: string; description?: string; isPublic: boolean }) => api.createClub(body).then(after('clubs/', 'me/')),
  updateClub: (id: string, patch: Partial<Pick<Club, 'name' | 'color' | 'description' | 'isPublic'>>) => api.updateClub(id, patch).then(after('clubs/')),
  joinClubByCode: (code: string) => api.joinClub(code.trim().toUpperCase()).then(after('clubs/', 'boards/')),
  joinClub: (id: string) => api.joinPublicClub(id).then(after('clubs/', 'boards/')),
  leaveClub: (id: string) => api.leaveClub(id).then(after('clubs/', 'boards/')),
  removeMember: (clubId: string, userId: string) => api.removeClubMember(clubId, userId).then(after('clubs/')),
  deleteClub: (id: string) => api.deleteClub(id).then(after('clubs/', 'boards/')),
  createMod: (form: FormData) => api.createMod(form).then(after('mods')),
  deleteMod: (id: string) => api.deleteMod(id).then(after('mods')),
  report: (target: ReportTarget, reason: ReportReason, note?: string) =>
    api.report({ targetType: target.kind, targetId: target.id, reason: reason === 'inappropriate_name' ? 'name' : reason, note }),
  block: (userId: string) => api.block(userId).then(after('blocks', 'friends', 'users/', 'boards/', 'season/')),
  unblock: (userId: string) => api.unblock(userId).then(after('blocks', 'users/', 'boards/', 'season/')),
};

function after(...prefixes: string[]) {
  return <T>(value: T) => {
    for (const p of prefixes) invalidateQuery(p);
    return value;
  };
}

export const INVITE_BASE = 'https://roadclaim.codext.de/i/';
export const LINKS = {
  github: 'https://github.com/codextde/roadclaim',
  website: 'https://roadclaim.codext.de',
  privacy: 'https://roadclaim.codext.de/privacy',
  imprint: 'https://roadclaim.codext.de/imprint',
};
