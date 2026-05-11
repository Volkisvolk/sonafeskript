import { sql } from "bun";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { RaffleItem, CreateRaffle, RaffleStatus } from "@/contracts";

type DbRaffle = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ticket_contingent: number;
  registration_count: number;
  created_at: Date;
};

const mapRaffle = (r: DbRaffle): RaffleItem => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: r.status as RaffleStatus,
  ticketContingent: r.ticket_contingent,
  registrationCount: r.registration_count,
  createdAt: r.created_at.toISOString(),
});

const WITH_COUNT = sql`
  SELECT r.*, COALESCE(rc.cnt, 0)::int AS registration_count
  FROM raffle.raffles r
  LEFT JOIN (
    SELECT raffle_id, COUNT(*)::int AS cnt
    FROM raffle.registrations
    GROUP BY raffle_id
  ) rc ON rc.raffle_id = r.id
`;

export const create = async (data: CreateRaffle): Promise<MutationResult<RaffleItem>> => {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO raffle.raffles (name, description, ticket_contingent)
    VALUES (${data.name}, ${data.description ?? null}, ${data.ticketContingent ?? 100})
    RETURNING id
  `;
  if (!row) return { ok: false, error: "Verlosung konnte nicht erstellt werden.", status: 500 };
  const item = await get(row.id);
  if (!item) return { ok: false, error: "Verlosung konnte nicht geladen werden.", status: 500 };
  return { ok: true, data: item };
};

export const list = async (): Promise<RaffleItem[]> => {
  const rows = await sql<DbRaffle[]>`
    ${WITH_COUNT}
    ORDER BY r.created_at DESC
  `;
  return rows.map(mapRaffle);
};

export const listOpen = async (): Promise<RaffleItem[]> => {
  const rows = await sql<DbRaffle[]>`
    ${WITH_COUNT}
    WHERE r.status = 'open'
    ORDER BY r.created_at DESC
  `;
  return rows.map(mapRaffle);
};

export const get = async (id: string): Promise<RaffleItem | null> => {
  const [row] = await sql<DbRaffle[]>`
    ${WITH_COUNT}
    WHERE r.id = ${id}::uuid
  `;
  return row ? mapRaffle(row) : null;
};

export const remove = async (id: string): Promise<MutationResult<void>> => {
  const result = await sql`DELETE FROM raffle.raffles WHERE id = ${id}::uuid`;
  if (result.count === 0) return { ok: false, error: "Verlosung nicht gefunden.", status: 404 };
  return { ok: true, data: undefined };
};

export const getStatus = async (id: string): Promise<RaffleStatus> => {
  const [row] = await sql<{ status: string }[]>`
    SELECT status FROM raffle.raffles WHERE id = ${id}::uuid
  `;
  return (row?.status ?? "open") as RaffleStatus;
};

export const setStatus = async (id: string, status: RaffleStatus): Promise<void> => {
  await sql`
    UPDATE raffle.raffles
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}::uuid
  `;
};
