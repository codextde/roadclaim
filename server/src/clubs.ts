import type { Sql } from "./db";

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

export async function loadClubs(sql: Sql, ids: string[], viewerId: string | null): Promise<Map<string, Club>> {
  if (!ids.length) return new Map();
  const rows = await sql`
    select c.*,
      (select count(*) from club_members m where m.club_id = c.id)::int as member_count,
      (select count(*) from cells x join club_members m on m.user_id = x.owner_id where m.club_id = c.id)::int as cells_held,
      exists(select 1 from club_members m where m.club_id = c.id and m.user_id = ${viewerId}) as is_member
    from clubs c where c.id in ${sql([...new Set(ids)])}`;
  return new Map(
    rows.map((r: any) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        color: r.color,
        description: r.description,
        isPublic: r.is_public,
        ownerId: r.owner_id,
        memberCount: r.member_count,
        cellsHeld: r.cells_held,
        ...(r.is_member ? { inviteCode: r.invite_code } : {}),
      } satisfies Club,
    ]),
  );
}

export async function loadClub(sql: Sql, id: string, viewerId: string | null): Promise<Club | null> {
  return (await loadClubs(sql, [id], viewerId)).get(id) ?? null;
}

export async function leaveClub(tx: Sql, userId: string): Promise<void> {
  const [m] = await tx`delete from club_members where user_id = ${userId} returning club_id, role`;
  if (!m) return;
  await tx`update cells set club_id = null where owner_id = ${userId}`;
  if (m.role !== "owner") return;
  const [heir] = await tx`
    select user_id from club_members where club_id = ${m.club_id} order by joined_at, user_id limit 1`;
  if (heir) {
    await tx`update club_members set role = 'owner' where user_id = ${heir.user_id}`;
    await tx`update clubs set owner_id = ${heir.user_id} where id = ${m.club_id}`;
  } else {
    await tx`delete from clubs where id = ${m.club_id}`;
  }
}

export async function joinClub(tx: Sql, userId: string, clubId: string, role: "owner" | "member"): Promise<void> {
  await leaveClub(tx, userId);
  await tx`insert into club_members (user_id, club_id, role) values (${userId}, ${clubId}, ${role})`;
  await tx`update cells set club_id = ${clubId} where owner_id = ${userId}`;
}

export async function deleteAccount(sql: Sql, userId: string): Promise<void> {
  await sql.begin(async (tx) => {
    await leaveClub(tx, userId);
    await tx`delete from users where id = ${userId}`;
  });
}
