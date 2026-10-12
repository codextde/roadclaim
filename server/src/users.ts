import type { Sql } from "./db";

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

export type Me = PublicUser & {
  inviteCode: string;
  privacy: { localOnly: boolean; hideFromLeaderboards: boolean; cloudBackup: boolean };
  createdAt: string;
};

type Row = {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  car: PublicUser["car"];
  home_city: string | null;
  home_country: string | null;
  club_id: string | null;
  club_name: string | null;
  club_color: string | null;
  invite_code: string;
  local_only: boolean;
  hide_from_leaderboards: boolean;
  cloud_backup: boolean;
  created_at: Date;
};

function toPublic(r: Row): PublicUser {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarColor: r.avatar_color,
    car: r.car ?? null,
    homeCity: r.home_city,
    homeCountry: r.home_country,
    club: r.club_id ? { id: r.club_id, name: r.club_name!, color: r.club_color! } : null,
  };
}

async function loadRows(sql: Sql, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  return sql`
    select u.*, c.id as club_id, c.name as club_name, c.color as club_color
    from users u
    left join club_members m on m.user_id = u.id
    left join clubs c on c.id = m.club_id
    where u.id in ${sql(ids)}`;
}

export async function publicUsers(sql: Sql, ids: string[]): Promise<Map<string, PublicUser>> {
  const rows = await loadRows(sql, [...new Set(ids)]);
  return new Map(rows.map((r) => [r.id, toPublic(r)]));
}

export async function publicUser(sql: Sql, id: string): Promise<PublicUser | null> {
  return (await publicUsers(sql, [id])).get(id) ?? null;
}

export async function loadMe(sql: Sql, id: string): Promise<Me> {
  const [r] = await loadRows(sql, [id]);
  if (!r) throw new Error(`user ${id} missing`);
  return {
    ...toPublic(r),
    inviteCode: r.invite_code,
    privacy: { localOnly: r.local_only, hideFromLeaderboards: r.hide_from_leaderboards, cloudBackup: r.cloud_backup },
    createdAt: r.created_at.toISOString(),
  };
}

export async function areFriends(sql: Sql, a: string, b: string): Promise<boolean> {
  const [r] = await sql`select 1 from friendships where user_id = ${a} and friend_id = ${b}`;
  return !!r;
}

export function blockedWith(sql: Sql, me: string) {
  return sql`select blocked_id from blocks where blocker_id = ${me} union all select blocker_id from blocks where blocked_id = ${me}`;
}

export async function blockedSet(sql: Sql, me: string): Promise<Set<string>> {
  const rows = await blockedWith(sql, me);
  return new Set(rows.map((r: { blocked_id: string }) => r.blocked_id));
}

export async function visibleTo(sql: Sql, viewer: string, target: string): Promise<boolean> {
  if (viewer === target) return true;
  const [r] = await sql`
    select u.local_only, exists(select 1 from (${blockedWith(sql, viewer)}) b where b.blocked_id = u.id) as blocked
    from users u where u.id = ${target}`;
  return !!r && !r.local_only && !r.blocked;
}
