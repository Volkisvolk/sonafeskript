import { sql } from "bun";
import { settings, logger } from "@valentinkolb/cloud/services";
import type { MutationResult } from "@valentinkolb/cloud/contracts";

const log = logger("raffle.registrations");
import type {
  Registration,
  Register,
  UpdateRegistration,
  SimilarNamePair,
} from "@/contracts";

type DbRegistration = {
  id: string;
  name: string;
  email: string;
  requested_tickets: number;
  accepted_agb: boolean;
  group_id: string | null;
  group_name: string | null;
  group_invite_code: string | null;
  status: string;
  won_tickets: number | null;
  qr_token: string | null;
  paid_at: Date | null;
  collected_at: Date | null;
  collected_tickets: number;
  collected_by: string | null;
  confirmed_at: Date | null;
  created_at: Date;
};

const mapRegistration = (row: DbRegistration): Registration => ({
  id: row.id,
  name: row.name,
  email: row.email,
  requestedTickets: row.requested_tickets,
  acceptedAgb: row.accepted_agb,
  groupId: row.group_id,
  groupName: row.group_name,
  groupInviteCode: row.group_invite_code,
  status: row.status as Registration["status"],
  wonTickets: row.won_tickets,
  qrToken: row.qr_token,
  paidAt: row.paid_at?.toISOString() ?? null,
  collectedAt: row.collected_at?.toISOString() ?? null,
  collectedTickets: row.collected_tickets ?? 0,
  collectedBy: row.collected_by,
  confirmedAt: row.confirmed_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

const WITH_GROUP_SQL = sql`
  LEFT JOIN raffle.groups g ON r.group_id = g.id
`;

const SELECT_COLS = sql`
  r.id, r.name, r.email, r.requested_tickets, r.accepted_agb,
  r.group_id, g.name AS group_name, g.invite_code AS group_invite_code,
  r.status, r.won_tickets, r.qr_token,
  r.paid_at, r.collected_at, r.collected_tickets, r.collected_by, r.confirmed_at, r.created_at
`;

// ── Domain validation ────────────────────────────────────────────────────────

const isEmailDomainAllowed = async (email: string): Promise<boolean> => {
  const allowedDomainsRaw = await settings.get<string>("raffle.allowed_domains");
  if (!allowedDomainsRaw || allowedDomainsRaw.trim() === "") return true;
  const allowed = allowedDomainsRaw
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  return allowed.includes(domain);
};

// ── Email pre-check (call before any other validation) ───────────────────────

export const checkEmailAvailable = async (params: {
  email: string;
  raffleId: string;
}): Promise<MutationResult<void>> => {
  const domainOk = await isEmailDomainAllowed(params.email);
  if (!domainOk) {
    const allowedDomainsRaw = await settings.get<string>("raffle.allowed_domains");
    const domains = allowedDomainsRaw
      ?.split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .join(", ");
    return { ok: false, error: `Deine E-Mail-Domain ist nicht zugelassen. Erlaubte Domains: ${domains}`, status: 400 };
  }

  // Nur BESTÄTIGTE Anmeldungen blockieren eine erneute Anmeldung. Unbestätigte
  // dürfen erneut angemeldet werden (create() schickt dann den Link erneut).
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM raffle.registrations
    WHERE LOWER(email) = LOWER(${params.email}) AND raffle_id = ${params.raffleId}::uuid
      AND confirmed_at IS NOT NULL
  `;
  if (existing) {
    return { ok: false, error: "Diese E-Mail-Adresse ist für diese Verlosung bereits registriert.", status: 409 };
  }

  return { ok: true, data: undefined };
};

// ── Create ────────────────────────────────────────────────────────────────────

// Sicheres Einmal-Token für den Bestätigungslink.
const genConfirmToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export type CreateResult = {
  registration: Registration;
  confirmToken: string | null;
  requiresConfirmation: boolean;
  resent: boolean;
};

export const create = async (params: {
  data: Register;
  groupId?: string;
  raffleId: string;
}): Promise<MutationResult<CreateResult>> => {
  const { data, groupId, raffleId } = params;

  const domainOk = await isEmailDomainAllowed(data.email);
  if (!domainOk) {
    const allowedDomainsRaw = await settings.get<string>("raffle.allowed_domains");
    const domains = allowedDomainsRaw
      ?.split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .join(", ");
    return {
      ok: false,
      error: `Deine E-Mail-Domain ist nicht zugelassen. Erlaubte Domains: ${domains}`,
      status: 400,
    };
  }

  const requireConfirmation = (await settings.get<boolean>("raffle.require_email_confirmation")) ?? true;

  const [existing] = await sql<{ id: string; confirmed_at: Date | null }[]>`
    SELECT id, confirmed_at FROM raffle.registrations
    WHERE LOWER(email) = LOWER(${data.email}) AND raffle_id = ${raffleId}::uuid
  `;
  if (existing) {
    // Bereits bestätigt → echte Doppelanmeldung, ablehnen.
    if (existing.confirmed_at) {
      return {
        ok: false,
        error: "Diese E-Mail-Adresse ist für diese Verlosung bereits registriert.",
        status: 409,
      };
    }
    // Noch unbestätigt → neuen Bestätigungslink erzeugen und erneut schicken,
    // statt eine Sackgasse zu erzeugen.
    const token = genConfirmToken();
    await sql`UPDATE raffle.registrations SET confirm_token = ${token} WHERE id = ${existing.id}::uuid`;
    const reg = await get({ id: existing.id });
    if (!reg) return { ok: false, error: "Registrierung fehlgeschlagen.", status: 500 };
    return { ok: true, data: { registration: reg, confirmToken: token, requiresConfirmation: true, resent: true } };
  }

  // ── Mail-Abuse-Schutz: Cooldown pro Zieladresse ──────────────────────────
  // Begrenzt, wie oft eine einzelne E-Mail-Adresse (über alle Verlosungen)
  // Bestätigungsmails auslösen kann. Schützt davor, dass ein Angreifer eine
  // fremde Adresse über die Plattform mit Mails flutet. Pro-Verlosung-
  // Eindeutigkeit oben verhindert Wiederholung in derselben Verlosung.
  // Konfigurierbar über raffle.register_cooldown_seconds (0 = aus).
  const cooldownSecs = (await settings.get<number>("raffle.register_cooldown_seconds")) ?? 15;
  if (cooldownSecs > 0) {
    const [recent] = await sql<{ created_at: Date }[]>`
      SELECT created_at FROM raffle.registrations
      WHERE LOWER(email) = LOWER(${data.email})
        AND created_at > now() - make_interval(secs => ${cooldownSecs})
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (recent) {
      log.warn("register.cooldown.blocked", { raffleId, emailDomain: data.email.split("@")[1] ?? "?" });
      return {
        ok: false,
        error: "Zu viele Anmeldungen in kurzer Zeit. Bitte versuche es in einem Moment erneut.",
        status: 400,
      };
    }
  }

  const maxGroupSize = (await settings.get<number>("raffle.max_group_size")) ?? 4;

  // Bestätigungspflicht: Token + confirmed_at vorbereiten. Ohne Pflicht gilt
  // die Anmeldung sofort als bestätigt.
  const confirmToken = requireConfirmation ? genConfirmToken() : null;
  const confirmedAt: Date | null = requireConfirmation ? null : new Date();

  // Status-Check, Gruppengröße-Check und INSERT in einer Transaction mit
  // Row-Locks. Die Raffle-Zeile wird mit FOR SHARE gesperrt: Damit kann
  // runRaffle (FOR UPDATE / Status-Wechsel) erst weiterlaufen, wenn diese
  // Registrierung committed ist – kein Timing-Fenster für Spät-Anmeldungen.
  let row: DbRegistration | undefined;
  try {
    const rows = await sql.begin(async (tx) => {
      // Raffle-Zeile sperren und Status atomar prüfen
      const [raffleRow] = await tx<{ status: string }[]>`
        SELECT status FROM raffle.raffles WHERE id = ${raffleId}::uuid FOR SHARE
      `;
      if (!raffleRow) {
        throw Object.assign(new Error("RAFFLE_NOT_FOUND"), {});
      }
      if (raffleRow.status !== "open") {
        throw Object.assign(new Error("RAFFLE_CLOSED"), {});
      }

      if (groupId) {
        // Sperrt die Gruppe-Zeile für die Dauer der Transaction
        await tx`SELECT id FROM raffle.groups WHERE id = ${groupId}::uuid FOR UPDATE`;
        const [countRow] = await tx<{ count: number }[]>`
          SELECT COUNT(*)::int AS count FROM raffle.registrations
          WHERE group_id = ${groupId}::uuid AND raffle_id = ${raffleId}::uuid
        `;
        if ((countRow?.count ?? 0) >= maxGroupSize) {
          const err: any = new Error("GROUP_FULL");
          err.maxGroupSize = maxGroupSize;
          throw err;
        }
      }
      return tx<DbRegistration[]>`
        INSERT INTO raffle.registrations
          (name, email, requested_tickets, accepted_agb, group_id, raffle_id, confirm_token, confirmed_at)
        VALUES
          (${data.name}, ${data.email}, ${data.requestedTickets}, ${data.acceptedAgb}, ${groupId ?? null}, ${raffleId}::uuid, ${confirmToken}, ${confirmedAt})
        RETURNING
          id, name, email, requested_tickets, accepted_agb,
          group_id, NULL AS group_name, NULL AS group_invite_code,
          status, won_tickets, qr_token,
          paid_at, collected_at, collected_tickets, collected_by, confirmed_at, created_at
      `;
    });
    [row] = rows;
  } catch (e: any) {
    if (e.message === "GROUP_FULL") {
      return {
        ok: false,
        error: `Die Gruppe hat bereits die maximale Größe von ${e.maxGroupSize} Personen erreicht.`,
        status: 400,
      };
    }
    if (e.message === "RAFFLE_NOT_FOUND") {
      return { ok: false, error: "Verlosung nicht gefunden.", status: 404 };
    }
    if (e.message === "RAFFLE_CLOSED") {
      return {
        ok: false,
        error: "Die Anmeldephase ist bereits beendet. Neue Registrierungen sind nicht mehr möglich.",
        status: 400,
      };
    }
    throw e;
  }
  if (!row) return { ok: false, error: "Registrierung fehlgeschlagen.", status: 500 };

  const finalRow = await get({ id: row.id });
  if (!finalRow) return { ok: false, error: "Registrierung fehlgeschlagen.", status: 500 };
  return {
    ok: true,
    data: { registration: finalRow, confirmToken, requiresConfirmation: requireConfirmation, resent: false },
  };
};

// ── E-Mail-Bestätigung (Magic Link) ─────────────────────────────────────────────

export type ConfirmOutcome = "confirmed" | "already" | "expired" | "invalid";

export const confirmRegistration = async (
  token: string,
): Promise<{ outcome: ConfirmOutcome; raffleId?: string; name?: string }> => {
  if (!token || token.length < 16) return { outcome: "invalid" };

  // Bestätigung und Status-Prüfung atomar in einer Transaction. Die Raffle-
  // Zeile wird FOR SHARE gesperrt, die Registrierung FOR UPDATE: Damit kann
  // runRaffle (UPDATE auf raffles, Status-Wechsel) nicht parallel laufen –
  // entweder wir bestätigen vor dem Start, oder die Verlosung ist beim Lesen
  // bereits nicht mehr 'open' und der Link gilt als abgelaufen. Kein Fenster,
  // in dem eine Anmeldung nach dem Verlosungsstart noch bestätigt wird.
  return await sql.begin(async (tx) => {
    const [existing] = await tx<
      { id: string; confirmed_at: Date | null; raffle_id: string; name: string; raffle_status: string }[]
    >`
      SELECT r.id, r.confirmed_at, r.raffle_id, r.name, ra.status AS raffle_status
      FROM raffle.registrations r
      JOIN raffle.raffles ra ON ra.id = r.raffle_id
      WHERE r.confirm_token = ${token}
      FOR UPDATE OF r
      FOR SHARE OF ra
    `;
    if (!existing) return { outcome: "invalid" as const };
    if (existing.confirmed_at) {
      return { outcome: "already" as const, raffleId: existing.raffle_id, name: existing.name };
    }
    if (existing.raffle_status !== "open") {
      // Verlosung läuft/lief bereits → Bestätigung kommt zu spät.
      return { outcome: "expired" as const, raffleId: existing.raffle_id, name: existing.name };
    }

    await tx`
      UPDATE raffle.registrations SET confirmed_at = now() WHERE id = ${existing.id}::uuid AND confirmed_at IS NULL
    `;
    return { outcome: "confirmed" as const, raffleId: existing.raffle_id, name: existing.name };
  });
};

// ── Ticket-Lookup per QR-Token (für die öffentliche Ticket-Seite) ────────────────
// Der qr_token ist ein unguessbares Zufallstoken und dient als Zugang zur
// Ticket-Seite (analog zum Bestätigungs-Token).

export type TicketInfo = {
  id: string;
  name: string;
  status: "pending" | "won" | "lost";
  wonTickets: number | null;
  raffleId: string;
  raffleName: string;
};

export const getTicketByToken = async (token: string): Promise<TicketInfo | null> => {
  if (!token || token.length < 16) return null;
  const [row] = await sql<{
    id: string;
    name: string;
    status: string;
    won_tickets: number | null;
    raffle_id: string;
    raffle_name: string;
  }[]>`
    SELECT r.id, r.name, r.status, r.won_tickets, r.raffle_id, ra.name AS raffle_name
    FROM raffle.registrations r
    JOIN raffle.raffles ra ON ra.id = r.raffle_id
    WHERE r.qr_token = ${token}
  `;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status as TicketInfo["status"],
    wonTickets: row.won_tickets,
    raffleId: row.raffle_id,
    raffleName: row.raffle_name,
  };
};

// ── Read ──────────────────────────────────────────────────────────────────────

export const get = async (params: { id: string; raffleId?: string }): Promise<Registration | null> => {
  const [row] = await sql<DbRegistration[]>`
    SELECT ${SELECT_COLS}
    FROM raffle.registrations r
    ${WITH_GROUP_SQL}
    WHERE r.id = ${params.id}::uuid
      AND (${params.raffleId ?? null}::uuid IS NULL OR r.raffle_id = ${params.raffleId ?? null}::uuid)
  `;
  return row ? mapRegistration(row) : null;
};

export const getByEmail = async (params: { email: string; raffleId: string }): Promise<Registration | null> => {
  const [row] = await sql<DbRegistration[]>`
    SELECT ${SELECT_COLS}
    FROM raffle.registrations r
    ${WITH_GROUP_SQL}
    WHERE LOWER(r.email) = LOWER(${params.email}) AND r.raffle_id = ${params.raffleId}::uuid
  `;
  return row ? mapRegistration(row) : null;
};

export const listAll = async (params: { raffleId: string }): Promise<Registration[]> => {
  const rows = await sql<DbRegistration[]>`
    SELECT ${SELECT_COLS}
    FROM raffle.registrations r
    ${WITH_GROUP_SQL}
    WHERE r.raffle_id = ${params.raffleId}::uuid
    ORDER BY r.created_at ASC
  `;
  return rows.map(mapRegistration);
};

export const listAdmin = async (params: {
  raffleId: string;
  search?: string;
  filter?: "won" | "lost" | "pending" | "duplicate_email" | "duplicate_name";
  pagination: { page: number; perPage: number };
}): Promise<{ items: Registration[]; total: number }> => {
  const { raffleId, search, filter, pagination } = params;
  const pattern = search?.trim() ? `%${search.trim().toLowerCase()}%` : null;
  const offset = (pagination.page - 1) * pagination.perPage;

  let rows: DbRegistration[];
  let countRow: { count: number } | undefined;

  if (filter === "duplicate_email") {
    rows = await sql<DbRegistration[]>`
      SELECT ${SELECT_COLS}
      FROM raffle.registrations r
      ${WITH_GROUP_SQL}
      WHERE r.raffle_id = ${raffleId}::uuid
        AND LOWER(r.email) IN (
          SELECT LOWER(email) FROM raffle.registrations
          WHERE raffle_id = ${raffleId}::uuid
          GROUP BY LOWER(email) HAVING COUNT(*) > 1
        )
      ORDER BY LOWER(r.email), r.created_at
      LIMIT ${pagination.perPage} OFFSET ${offset}
    `;
    [countRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM raffle.registrations r
      WHERE r.raffle_id = ${raffleId}::uuid
        AND LOWER(r.email) IN (
          SELECT LOWER(email) FROM raffle.registrations
          WHERE raffle_id = ${raffleId}::uuid
          GROUP BY LOWER(email) HAVING COUNT(*) > 1
        )
    `;
  } else if (filter === "duplicate_name") {
    rows = await sql<DbRegistration[]>`
      SELECT ${SELECT_COLS}
      FROM raffle.registrations r
      ${WITH_GROUP_SQL}
      WHERE r.raffle_id = ${raffleId}::uuid
        AND LOWER(r.name) IN (
          SELECT LOWER(name) FROM raffle.registrations
          WHERE raffle_id = ${raffleId}::uuid
          GROUP BY LOWER(name) HAVING COUNT(*) > 1
        )
      ORDER BY LOWER(r.name), r.created_at
      LIMIT ${pagination.perPage} OFFSET ${offset}
    `;
    [countRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM raffle.registrations r
      WHERE r.raffle_id = ${raffleId}::uuid
        AND LOWER(r.name) IN (
          SELECT LOWER(name) FROM raffle.registrations
          WHERE raffle_id = ${raffleId}::uuid
          GROUP BY LOWER(name) HAVING COUNT(*) > 1
        )
    `;
  } else {
    rows = await sql<DbRegistration[]>`
      SELECT ${SELECT_COLS}
      FROM raffle.registrations r
      ${WITH_GROUP_SQL}
      WHERE r.raffle_id = ${raffleId}::uuid
        AND (${pattern}::text IS NULL
          OR LOWER(r.name) LIKE ${pattern}
          OR LOWER(r.email) LIKE ${pattern})
        AND (${filter ?? null}::text IS NULL OR r.status = ${filter ?? null})
      ORDER BY r.created_at ASC
      LIMIT ${pagination.perPage} OFFSET ${offset}
    `;
    [countRow] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM raffle.registrations r
      WHERE r.raffle_id = ${raffleId}::uuid
        AND (${pattern}::text IS NULL
          OR LOWER(r.name) LIKE ${pattern}
          OR LOWER(r.email) LIKE ${pattern})
        AND (${filter ?? null}::text IS NULL OR r.status = ${filter ?? null})
    `;
  }

  return { items: rows.map(mapRegistration), total: countRow?.count ?? 0 };
};

// ── Update ────────────────────────────────────────────────────────────────────

export const update = async (params: {
  id: string;
  raffleId?: string;
  data: UpdateRegistration;
}): Promise<MutationResult<Registration>> => {
  const existing = await get({ id: params.id });
  if (!existing) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };

  const name = params.data.name ?? existing.name;
  const email = params.data.email ?? existing.email;
  const requestedTickets = params.data.requestedTickets ?? existing.requestedTickets;

  if (email !== existing.email) {
    const domainOk = await isEmailDomainAllowed(email);
    if (!domainOk) return { ok: false, error: "Diese E-Mail-Domain ist nicht zugelassen.", status: 400 };
    const [dup] = await sql<{ id: string }[]>`
      SELECT id FROM raffle.registrations
      WHERE LOWER(email) = LOWER(${email}) AND id != ${params.id}::uuid
        AND (${params.raffleId ?? null}::uuid IS NULL OR raffle_id = ${params.raffleId ?? null}::uuid)
    `;
    if (dup) return { ok: false, error: "Diese E-Mail-Adresse ist bereits vergeben.", status: 409 };
  }

  await sql`
    UPDATE raffle.registrations
    SET name = ${name}, email = ${email}, requested_tickets = ${requestedTickets}
    WHERE id = ${params.id}::uuid
  `;

  const updated = await get({ id: params.id });
  if (!updated) return { ok: false, error: "Aktualisierung fehlgeschlagen.", status: 500 };
  return { ok: true, data: updated };
};

export const updateGroup = async (params: {
  id: string;
  groupId: string | null;
}): Promise<MutationResult<void>> => {
  const result = await sql`
    UPDATE raffle.registrations SET group_id = ${params.groupId}
    WHERE id = ${params.id}::uuid
  `;
  if (result.count === 0) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  return { ok: true, data: undefined };
};

// ── Delete ────────────────────────────────────────────────────────────────────

export const remove = async (params: { id: string; raffleId?: string }): Promise<MutationResult<void>> => {
  const result = await sql`
    DELETE FROM raffle.registrations
    WHERE id = ${params.id}::uuid
      AND (${params.raffleId ?? null}::uuid IS NULL OR raffle_id = ${params.raffleId ?? null}::uuid)
  `;
  if (result.count === 0) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  return { ok: true, data: undefined };
};

// ── Stats ─────────────────────────────────────────────────────────────────────

export const getStats = async (params: { raffleId: string }): Promise<{
  totalRegistrations: number;
  totalRequestedTickets: number;
  totalCollected: number;
}> => {
  const [row] = await sql<{
    total_registrations: number;
    total_requested_tickets: number;
    total_collected: number;
  }[]>`
    SELECT
      COUNT(*)::int AS total_registrations,
      COALESCE(SUM(requested_tickets), 0)::int AS total_requested_tickets,
      COALESCE(SUM(collected_tickets), 0)::int AS total_collected
    FROM raffle.registrations
    WHERE raffle_id = ${params.raffleId}::uuid AND confirmed_at IS NOT NULL
  `;
  return {
    totalRegistrations: row?.total_registrations ?? 0,
    totalRequestedTickets: row?.total_requested_tickets ?? 0,
    totalCollected: row?.total_collected ?? 0,
  };
};

export const getAdminSummary = async (params: { raffleId: string }): Promise<{
  total: number;
  won: number;
  lost: number;
  pending: number;
  paid: number;
  collected: number;
  unconfirmed: number;
  unsentResultEmails: number;
  totalRequestedTickets: number;
  totalWonTickets: number;
  totalCollectedTickets: number;
}> => {
  // Alle Kennzahlen beziehen sich auf BESTÄTIGTE Anmeldungen. Unbestätigte
  // (Magic Link noch nicht geklickt) werden separat als `unconfirmed` gezählt
  // und fließen nicht in Teilnehmer-/Kartenzahlen oder die Verlosung ein.
  const [row] = await sql<{
    total: number;
    won: number;
    lost: number;
    pending: number;
    paid: number;
    collected: number;
    unconfirmed: number;
    unsent_result_emails: number;
    total_requested: number;
    total_won: number;
    total_collected_tickets: number;
  }[]>`
    SELECT
      COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::int AS total,
      COUNT(*) FILTER (WHERE status = 'won' AND confirmed_at IS NOT NULL)::int AS won,
      COUNT(*) FILTER (WHERE status = 'lost' AND confirmed_at IS NOT NULL)::int AS lost,
      COUNT(*) FILTER (WHERE status = 'pending' AND confirmed_at IS NOT NULL)::int AS pending,
      COUNT(*) FILTER (WHERE paid_at IS NOT NULL)::int AS paid,
      COUNT(*) FILTER (WHERE collected_at IS NOT NULL)::int AS collected,
      COUNT(*) FILTER (WHERE confirmed_at IS NULL)::int AS unconfirmed,
      COUNT(*) FILTER (WHERE status IN ('won', 'lost') AND result_email_sent_at IS NULL)::int AS unsent_result_emails,
      COALESCE(SUM(requested_tickets) FILTER (WHERE confirmed_at IS NOT NULL), 0)::int AS total_requested,
      COALESCE(SUM(won_tickets) FILTER (WHERE confirmed_at IS NOT NULL), 0)::int AS total_won,
      COALESCE(SUM(collected_tickets), 0)::int AS total_collected_tickets
    FROM raffle.registrations
    WHERE raffle_id = ${params.raffleId}::uuid
  `;
  return {
    total: row?.total ?? 0,
    won: row?.won ?? 0,
    lost: row?.lost ?? 0,
    pending: row?.pending ?? 0,
    paid: row?.paid ?? 0,
    collected: row?.collected ?? 0,
    unconfirmed: row?.unconfirmed ?? 0,
    unsentResultEmails: row?.unsent_result_emails ?? 0,
    totalRequestedTickets: row?.total_requested ?? 0,
    totalWonTickets: row?.total_won ?? 0,
    totalCollectedTickets: row?.total_collected_tickets ?? 0,
  };
};

// ── Fraud filter: ähnliche Namen ─────────────────────────────────────────────

export const findSimilarNames = async (params: { raffleId: string }): Promise<SimilarNamePair[]> => {
  const rows = await sql<{
    id_a: string; name_a: string; email_a: string;
    id_b: string; name_b: string; email_b: string;
    sim: number;
  }[]>`
    SELECT
      a.id   AS id_a,   a.name  AS name_a,  a.email AS email_a,
      b.id   AS id_b,   b.name  AS name_b,  b.email AS email_b,
      similarity(a.name, b.name) AS sim
    FROM raffle.registrations a
    JOIN raffle.registrations b ON a.id < b.id
    WHERE a.raffle_id = ${params.raffleId}::uuid
      AND b.raffle_id = ${params.raffleId}::uuid
      AND similarity(a.name, b.name) > 0.45
    ORDER BY sim DESC
    LIMIT 200
  `;
  return rows.map((r) => ({
    a: { id: r.id_a, name: r.name_a, email: r.email_a },
    b: { id: r.id_b, name: r.name_b, email: r.email_b },
    similarity: r.sim,
  }));
};

// ── Winner / loser bulk update ────────────────────────────────────────────────

export const markWon = async (params: {
  ids: string[];
  wonTickets: Map<string, number>;
  tokens: Map<string, string>;
}): Promise<void> => {
  for (const id of params.ids) {
    const tickets = params.wonTickets.get(id) ?? 1;
    const token = params.tokens.get(id) ?? "";
    await sql`
      UPDATE raffle.registrations
      SET status = 'won', won_tickets = ${tickets}, qr_token = ${token}
      WHERE id = ${id}::uuid
    `;
  }
};

export const markLost = async (params: { ids: string[] }): Promise<void> => {
  for (const id of params.ids) {
    await sql`
      UPDATE raffle.registrations
      SET status = 'lost'
      WHERE id = ${id}::uuid
    `;
  }
};

// ── Raw access for raffle algorithm ──────────────────────────────────────────

type RawRegistration = {
  id: string;
  requested_tickets: number;
  group_id: string | null;
};

export const listAllRaw = async (
  params: { raffleId: string },
  db: typeof sql = sql,
): Promise<RawRegistration[]> => {
  return db<RawRegistration[]>`
    SELECT id, requested_tickets, group_id
    FROM raffle.registrations
    WHERE status = 'pending' AND raffle_id = ${params.raffleId}::uuid
      AND confirmed_at IS NOT NULL
  `;
};
