import { sql } from "bun";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { RaffleMember, AddMember } from "@/contracts";

type RaffleMemberRole = "owner" | "moderator";

type DbMember = {
  user_id: string;
  role: string;
  display_name: string | null;
  mail: string | null;
  added_at: Date;
};

const mapMember = (r: DbMember): RaffleMember => ({
  userId: r.user_id,
  role: r.role as RaffleMemberRole,
  displayName: r.display_name,
  mail: r.mail,
  addedAt: r.added_at.toISOString(),
});

export const list = async (params: { raffleId: string }): Promise<RaffleMember[]> => {
  const rows = await sql<DbMember[]>`
    SELECT m.user_id, m.role, u.display_name, u.mail, m.added_at
    FROM raffle.raffle_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.raffle_id = ${params.raffleId}::uuid
    ORDER BY m.role DESC, m.added_at ASC
  `;
  return rows.map(mapMember);
};

export const getRole = async (params: {
  raffleId: string;
  userId: string;
}): Promise<RaffleMemberRole | null> => {
  const [row] = await sql<{ role: string }[]>`
    SELECT role FROM raffle.raffle_members
    WHERE raffle_id = ${params.raffleId}::uuid AND user_id = ${params.userId}::uuid
  `;
  return row ? (row.role as RaffleMemberRole) : null;
};

export const add = async (params: {
  raffleId: string;
  data: AddMember;
}): Promise<MutationResult<RaffleMember>> => {
  const [user] = await sql<{ id: string; display_name: string | null; mail: string | null }[]>`
    SELECT id, display_name, mail FROM auth.users WHERE LOWER(mail) = LOWER(${params.data.email})
  `;
  if (!user) {
    return { ok: false, error: "Kein Nutzer mit dieser E-Mail-Adresse gefunden.", status: 404 };
  }

  const [existing] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM raffle.raffle_members
    WHERE raffle_id = ${params.raffleId}::uuid AND user_id = ${user.id}::uuid
  `;
  if (existing) {
    return { ok: false, error: "Diese Person ist bereits Mitglied dieser Verlosung.", status: 409 };
  }

  const [row] = await sql<{ added_at: Date }[]>`
    INSERT INTO raffle.raffle_members (raffle_id, user_id, role)
    VALUES (${params.raffleId}::uuid, ${user.id}::uuid, ${params.data.role})
    RETURNING added_at
  `;
  if (!row) return { ok: false, error: "Hinzufügen fehlgeschlagen.", status: 500 };

  return {
    ok: true,
    data: {
      userId: user.id,
      role: params.data.role,
      displayName: user.display_name,
      mail: user.mail,
      addedAt: row.added_at.toISOString(),
    },
  };
};

export const remove = async (params: {
  raffleId: string;
  userId: string;
}): Promise<MutationResult<void>> => {
  const [target] = await sql<{ role: string }[]>`
    SELECT role FROM raffle.raffle_members
    WHERE raffle_id = ${params.raffleId}::uuid AND user_id = ${params.userId}::uuid
  `;
  if (!target) return { ok: false, error: "Mitglied nicht gefunden.", status: 404 };

  if (target.role === "owner") {
    const [ownerCount] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM raffle.raffle_members
      WHERE raffle_id = ${params.raffleId}::uuid AND role = 'owner'
    `;
    if ((ownerCount?.count ?? 0) <= 1) {
      return { ok: false, error: "Der letzte Besitzer kann nicht entfernt werden.", status: 400 };
    }
  }

  await sql`
    DELETE FROM raffle.raffle_members
    WHERE raffle_id = ${params.raffleId}::uuid AND user_id = ${params.userId}::uuid
  `;
  return { ok: true, data: undefined };
};
