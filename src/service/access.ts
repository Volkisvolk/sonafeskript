import { sql } from "bun";
import {
  createAccess,
  getEffectivePermission,
  resolveDisplayNames,
  type Principal,
  type PermissionLevel,
  type AccessEntry,
} from "@valentinkolb/cloud/server";
import type { MutationResult } from "@valentinkolb/cloud/contracts";

export type { AccessEntry, PermissionLevel, Principal };

const getAccessIds = async (raffleId: string): Promise<string[]> => {
  const rows = await sql<{ access_id: string }[]>`
    SELECT access_id FROM raffle.raffle_access WHERE raffle_id = ${raffleId}::uuid
  `;
  return rows.map((r) => r.access_id);
};

export const list = async (raffleId: string): Promise<AccessEntry[]> => {
  const ids = await getAccessIds(raffleId);
  if (ids.length === 0) return [];
  const rows = await sql<{
    id: string; user_id: string | null; group_id: string | null;
    authenticated_only: boolean; permission: string; created_at: Date;
  }[]>`
    SELECT id, user_id, group_id, authenticated_only, permission, created_at
    FROM auth.access
    WHERE id = ANY(${`{${ids.join(",")}}`}::uuid[])
  `;
  const entries: AccessEntry[] = rows.map((r) => ({
    id: r.id,
    principal: r.user_id
      ? { type: "user" as const, userId: r.user_id }
      : r.group_id
        ? { type: "group" as const, groupId: r.group_id }
        : r.authenticated_only
          ? { type: "authenticated" as const }
          : { type: "public" as const },
    permission: r.permission as PermissionLevel,
    createdAt: r.created_at.toISOString(),
  }));
  return resolveDisplayNames(entries);
};

export const getUserPermission = async (
  raffleId: string,
  userId: string,
  userGroups: string[],
): Promise<PermissionLevel> => {
  const accessIds = await getAccessIds(raffleId);
  return getEffectivePermission({ accessIds, userId, userGroups });
};

export const grant = async (
  raffleId: string,
  principal: Principal,
  permission: PermissionLevel,
): Promise<MutationResult<AccessEntry>> => {
  const result = await createAccess({ principal, permission });
  if (!result.ok) return { ok: false, error: String(result.error), status: 400 };

  await sql`
    INSERT INTO raffle.raffle_access (raffle_id, access_id)
    VALUES (${raffleId}::uuid, ${result.data.id}::uuid)
    ON CONFLICT DO NOTHING
  `;

  const entries = await list(raffleId);
  const entry = entries.find((e) => e.id === result.data.id);
  if (!entry) return { ok: false, error: "Eintrag nicht gefunden.", status: 500 };
  return { ok: true, data: entry };
};

export const update = async (
  raffleId: string,
  accessId: string,
  permission: PermissionLevel,
): Promise<MutationResult<void>> => {
  // Check und Update in einer Transaction mit Row-Locks auf allen Access-
  // Zeilen dieser Verlosung. So können zwei parallele Änderungen nicht beide
  // die Last-Admin-Prüfung bestehen und gemeinsam alle Admins entfernen.
  return sql.begin(async (tx) => {
    const accessRows = await tx<{ id: string; permission: PermissionLevel }[]>`
      SELECT a.id, a.permission
      FROM auth.access a
      JOIN raffle.raffle_access ra ON ra.access_id = a.id
      WHERE ra.raffle_id = ${raffleId}::uuid
      FOR UPDATE OF a
    `;
    const target = accessRows.find((r) => r.id === accessId);
    if (!target) return { ok: false as const, error: "Eintrag nicht gefunden.", status: 404 as const };

    if (permission !== "admin") {
      const otherAdmins = accessRows.filter((r) => r.id !== accessId && r.permission === "admin").length;
      if (otherAdmins === 0) {
        return { ok: false as const, error: "Es muss mindestens einen Admin geben.", status: 400 as const };
      }
    }

    await tx`
      UPDATE auth.access SET permission = ${permission}::auth.permission_level
      WHERE id = ${accessId}::uuid
    `;
    return { ok: true as const, data: undefined };
  });
};

export const revoke = async (
  raffleId: string,
  accessId: string,
): Promise<MutationResult<void>> => {
  return sql.begin(async (tx) => {
    const accessRows = await tx<{ id: string; permission: PermissionLevel }[]>`
      SELECT a.id, a.permission
      FROM auth.access a
      JOIN raffle.raffle_access ra ON ra.access_id = a.id
      WHERE ra.raffle_id = ${raffleId}::uuid
      FOR UPDATE OF a
    `;
    const target = accessRows.find((r) => r.id === accessId);
    if (!target) return { ok: false as const, error: "Eintrag nicht gefunden.", status: 404 as const };

    const otherAdmins = accessRows.filter((r) => r.id !== accessId && r.permission === "admin").length;
    if (target.permission === "admin" && otherAdmins === 0) {
      return { ok: false as const, error: "Der letzte Admin kann nicht entfernt werden.", status: 400 as const };
    }

    await tx`DELETE FROM raffle.raffle_access WHERE raffle_id = ${raffleId}::uuid AND access_id = ${accessId}::uuid`;
    await tx`DELETE FROM auth.access WHERE id = ${accessId}::uuid`;
    return { ok: true as const, data: undefined };
  });
};
