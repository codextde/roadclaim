export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  car: { id: string; label: string; color?: string } | null;
  homeCity: string | null;
  homeCountry: string | null;
  club: { id: string; name: string; color: string } | null;
};

export type Privacy = { localOnly: boolean; hideFromLeaderboards: boolean; cloudBackup: boolean };

export type Me = PublicUser & { inviteCode: string; privacy: Privacy; createdAt: string };

export type MePatch = Partial<{
  username: string;
  displayName: string;
  avatarColor: string;
  car: { id: string; label: string; color?: string } | null;
  homeCity: string | null;
  homeCountry: string | null;
  privacy: Partial<Privacy>;
}>;

export type DriveUpload = {
  id: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationS: number;
  movingS: number;
  maxSpeedMps: number;
  avgSpeedMps: number;
  elevationGainM: number;
  elevationLossM: number;
  brakePresses: number;
  turnsLeft: number;
  turnsRight: number;
  laneChanges: number;
  stops: number;
  city: string | null;
  countryCode: string | null;
  cells: string[];
  utcOffsetMin?: number;
};

export type TerritoryResult = { claimed: number; stolen: number; refreshed: number; held: number };

export type Trophy = { id: string; tier: 0 | 1 | 2 | 3; value: number; next: number | null; earnedAt: string | null };

export type Period = 'today' | 'week' | 'month' | 'season';
export type Metric = 'distance' | 'area' | 'longest' | 'trophies';
export type Scope = 'friends' | 'city' | 'country' | 'world' | 'club';

export type BoardEntry = { rank: number; user: PublicUser; value: number };

export type Club = {
  id: string;
  name: string;
  color: string;
  description: string;
  isPublic: boolean;
  ownerId: string;
  memberCount: number;
  cellsHeld: number;
  inviteCode?: string;
};

export type CellOwner = { cell: string; owner: 'me' | 'friend' | 'club' | 'other'; userId: string; name: string; color: string };

export type Stats = {
  distanceM: number;
  drives: number;
  longestM: number;
  cellsHeld: number;
  cellsEver: number;
  trophies: number;
  activeDays: number;
  elevationGainM: number;
  durationS: number;
  countries: number;
};

export type ServerConfig = { features: { aiMods: boolean }; modsPerDay: number; h3Resolution: 9; season: string };

export type FriendRequest = { id: string; user: PublicUser; createdAt: string };

export type ClubMember = { user: PublicUser; role: 'owner' | 'member'; distanceM: number };

export type Mod = { id: string; style: string; prompt: string | null; carLabel: string; imageUrl: string; createdAt: string };

export type ModRequest = {
  style: string;
  prompt?: string;
  carLabel: string;
  color?: string;
  photo?: { uri: string; type: 'image/jpeg' | 'image/png'; name?: string };
};

export type TrophyDefinition = {
  id: string;
  unit: string;
  tiers: number[];
  title: { en: string; de: string };
  description: { en: string; de: string };
};

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export type TerritoryBoard = 'overall' | 'stealers' | 'gainers' | 'losers';

export type Report = { targetType: 'user' | 'club'; targetId: string; reason: 'name' | 'spam' | 'cheating' | 'other'; note?: string };
