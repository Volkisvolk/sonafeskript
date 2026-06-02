import { sql } from "bun";
import { settings } from "@valentinkolb/cloud/services";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { Group } from "@/contracts";

type DbGroup = {
  id: string;
  name: string;
  invite_code: string;
  member_count: number;
  total_requested_tickets: number;
  created_at: Date;
};

const mapGroup = (row: DbGroup): Group => ({
  id: row.id,
  name: row.name,
  inviteCode: row.invite_code,
  memberCount: row.member_count,
  totalRequestedTickets: row.total_requested_tickets,
  createdAt: row.created_at.toISOString(),
});

const groupAggs = (raffleId: string) => sql`
  COALESCE((SELECT COUNT(*)::int FROM raffle.registrations r WHERE r.group_id = g.id AND r.raffle_id = ${raffleId}::uuid), 0) AS member_count,
  COALESCE((SELECT SUM(r.requested_tickets)::int FROM raffle.registrations r WHERE r.group_id = g.id AND r.raffle_id = ${raffleId}::uuid), 0) AS total_requested_tickets
`;

const generateInviteCode = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code;
};

// ── Create ────────────────────────────────────────────────────────────────────

export const create = async (params: {
  name: string;
  raffleId: string;
  creatorRegistrationId?: string;
}): Promise<MutationResult<Group>> => {
  let inviteCode: string = "";
  for (let i = 0; i < 5; i++) {
    inviteCode = generateInviteCode();
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM raffle.groups WHERE invite_code = ${inviteCode}
    `;
    if (!existing) break;
  }

  const [row] = await sql<{ id: string; name: string; invite_code: string; created_at: Date }[]>`
    INSERT INTO raffle.groups (name, invite_code, raffle_id)
    VALUES (${params.name}, ${inviteCode}, ${params.raffleId}::uuid)
    RETURNING id, name, invite_code, created_at
  `;
  if (!row) return { ok: false, error: "Gruppe konnte nicht erstellt werden.", status: 500 };

  if (params.creatorRegistrationId) {
    await sql`
      UPDATE raffle.registrations SET group_id = ${row.id}::uuid
      WHERE id = ${params.creatorRegistrationId}::uuid
    `;
  }

  const group = await get({ id: row.id, raffleId: params.raffleId });
  if (!group) return { ok: false, error: "Gruppe konnte nicht erstellt werden.", status: 500 };
  return { ok: true, data: group };
};

// ── Read ──────────────────────────────────────────────────────────────────────

export const get = async (params: { id: string; raffleId: string }): Promise<Group | null> => {
  const [row] = await sql<DbGroup[]>`
    SELECT g.id, g.name, g.invite_code, g.created_at, ${groupAggs(params.raffleId)}
    FROM raffle.groups g
    WHERE g.id = ${params.id}::uuid AND g.raffle_id = ${params.raffleId}::uuid
  `;
  return row ? mapGroup(row) : null;
};

export const getByName = async (params: { name: string; raffleId: string }): Promise<Group | null> => {
  const [row] = await sql<DbGroup[]>`
    SELECT g.id, g.name, g.invite_code, g.created_at, ${groupAggs(params.raffleId)}
    FROM raffle.groups g
    WHERE LOWER(g.name) = LOWER(${params.name}) AND g.raffle_id = ${params.raffleId}::uuid
  `;
  return row ? mapGroup(row) : null;
};

export const getByInviteCode = async (params: { code: string; raffleId: string }): Promise<Group | null> => {
  const [row] = await sql<DbGroup[]>`
    SELECT g.id, g.name, g.invite_code, g.created_at, ${groupAggs(params.raffleId)}
    FROM raffle.groups g
    WHERE g.invite_code = ${params.code.toUpperCase()} AND g.raffle_id = ${params.raffleId}::uuid
  `;
  return row ? mapGroup(row) : null;
};

export const listAll = async (params: { raffleId: string }): Promise<Group[]> => {
  const rows = await sql<DbGroup[]>`
    SELECT g.id, g.name, g.invite_code, g.created_at, ${groupAggs(params.raffleId)}
    FROM raffle.groups g
    WHERE g.raffle_id = ${params.raffleId}::uuid
    ORDER BY g.created_at ASC
  `;
  return rows.map(mapGroup);
};

// ── Join / Leave ──────────────────────────────────────────────────────────────

export const join = async (params: {
  registrationId: string;
  inviteCode: string;
  raffleId: string;
}): Promise<MutationResult<Group>> => {
  const group = await getByInviteCode({ code: params.inviteCode, raffleId: params.raffleId });
  if (!group) {
    return { ok: false, error: "Kein Gruppe mit diesem Einladungscode gefunden.", status: 404 };
  }

  const maxGroupSize = (await settings.get<number>("raffle.max_group_size")) ?? 4;
  if (group.memberCount >= maxGroupSize) {
    return {
      ok: false,
      error: `Die Gruppe „${group.name}" ist bereits voll (max. ${maxGroupSize} Personen).`,
      status: 400,
    };
  }

  const result = await sql`
    UPDATE raffle.registrations SET group_id = ${group.id}::uuid
    WHERE id = ${params.registrationId}::uuid
  `;
  if (result.count === 0) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };

  const updated = await get({ id: group.id, raffleId: params.raffleId });
  return { ok: true, data: updated! };
};

export const leave = async (params: { registrationId: string }): Promise<MutationResult<void>> => {
  const result = await sql`
    UPDATE raffle.registrations SET group_id = NULL
    WHERE id = ${params.registrationId}::uuid
  `;
  if (result.count === 0) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  return { ok: true, data: undefined };
};

// ── Delete empty groups ───────────────────────────────────────────────────────

export const removeIfEmpty = async (params: { id: string }): Promise<void> => {
  await sql`
    DELETE FROM raffle.groups
    WHERE id = ${params.id}::uuid
    AND NOT EXISTS (SELECT 1 FROM raffle.registrations WHERE group_id = ${params.id}::uuid)
  `;
};

// ── Members list (for raffle algorithm) ──────────────────────────────────────

export type GroupWithMembers = {
  groupId: string;
  members: { id: string; requestedTickets: number }[];
};

export const listGroupsWithMembers = async (
  params: { raffleId: string },
  db: typeof sql = sql,
): Promise<GroupWithMembers[]> => {
  const rows = await db<{ group_id: string; id: string; requested_tickets: number }[]>`
    SELECT group_id, id, requested_tickets
    FROM raffle.registrations
    WHERE group_id IS NOT NULL AND status = 'pending' AND raffle_id = ${params.raffleId}::uuid
    ORDER BY group_id, created_at
  `;

  const map = new Map<string, { id: string; requestedTickets: number }[]>();
  for (const row of rows) {
    const gid = row.group_id!;
    if (!map.has(gid)) map.set(gid, []);
    map.get(gid)!.push({ id: row.id, requestedTickets: row.requested_tickets });
  }

  return Array.from(map.entries()).map(([groupId, members]) => ({ groupId, members }));
};
