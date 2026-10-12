import type { PublicUser, Stats, TerritoryBoard, Trophy } from '@/api';

export type {
  BoardEntry,
  Bbox,
  CellOwner,
  Club,
  ClubMember,
  FriendRequest,
  Me,
  Metric,
  Mod,
  Period,
  Privacy,
  PublicUser,
  Scope,
  ServerConfig,
  Trophy,
  TrophyDefinition,
} from '@/api';

export type SeasonStats = Stats;
export type SeasonBoard = TerritoryBoard;
export type UserProfile = { user: PublicUser; stats: SeasonStats; trophies: Trophy[]; isFriend: boolean; requestPending: 'in' | 'out' | null; isBlocked?: boolean };
export type Compare = { me: SeasonStats; them: SeasonStats; user: PublicUser };
