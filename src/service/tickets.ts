import { sql } from "bun";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { TicketEvent } from "@/contracts";

type DbEvent = {
  id: string;
  registration_id: string;
  event_type: string;
  details: string | null;
  performed_by: string | null;
  created_at: Date;
};

const mapEvent = (row: DbEvent): TicketEvent => ({
  id: row.id,
  registrationId: row.registration_id,
  eventType: row.event_type as TicketEvent["eventType"],
  details: row.details,
  performedBy: row.performed_by,
  createdAt: row.created_at.toISOString(),
});

const logEvent = async (params: {
  registrationId: string;
  eventType: TicketEvent["eventType"];
  details?: string;
  performedBy?: string;
}): Promise<void> => {
  await sql`
    INSERT INTO raffle.ticket_events (registration_id, event_type, details, performed_by)
    VALUES (
      ${params.registrationId}::uuid,
      ${params.eventType},
      ${params.details ?? null},
      ${params.performedBy ?? null}
    )
  `;
};

// ── Get events ────────────────────────────────────────────────────────────────

export const getEvents = async (params: { registrationId: string }): Promise<TicketEvent[]> => {
  const rows = await sql<DbEvent[]>`
    SELECT id, registration_id, event_type, details, performed_by, created_at
    FROM raffle.ticket_events
    WHERE registration_id = ${params.registrationId}::uuid
    ORDER BY created_at DESC
  `;
  return rows.map(mapEvent);
};

// ── Bezahlung ─────────────────────────────────────────────────────────────────

export const markPaid = async (params: {
  registrationId: string;
  collectedTickets?: number;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ paid_at: Date | null; status: string; won_tickets: number | null }[]>`
    SELECT paid_at, status, won_tickets FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (row.status !== "won") return { ok: false, error: "Nur Gewinner können Karten bezahlen.", status: 400 };
  if (row.paid_at) return { ok: false, error: "Karten sind bereits als bezahlt markiert.", status: 400 };

  const won = row.won_tickets ?? 0;
  // Standardmäßig gelten alle gewonnenen Karten als abgeholt; optional kann
  // beim Bezahlen eine geringere abgeholte Anzahl angegeben werden.
  const collected = params.collectedTickets ?? won;
  if (collected < 0 || collected > won) {
    return { ok: false, error: `Die abgeholte Kartenzahl muss zwischen 0 und ${won} liegen.`, status: 400 };
  }
  const fullyCollected = collected >= won && won > 0;

  await sql`
    UPDATE raffle.registrations
    SET paid_at = now(),
        collected_tickets = ${collected},
        collected_at = CASE WHEN ${fullyCollected} THEN now() ELSE NULL END
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "paid",
    performedBy: params.performedBy,
  });
  await logEvent({
    registrationId: params.registrationId,
    eventType: "collected",
    details: `Abgeholt: ${collected}/${won}`,
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

export const revertPaid = async (params: {
  registrationId: string;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ paid_at: Date | null }[]>`
    SELECT paid_at FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (!row.paid_at) return { ok: false, error: "Karten sind nicht als bezahlt markiert.", status: 400 };

  await sql`
    UPDATE raffle.registrations SET paid_at = NULL, collected_at = NULL, collected_tickets = 0
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "paid_reverted",
    performedBy: params.performedBy,
  });
  await logEvent({
    registrationId: params.registrationId,
    eventType: "collected_reverted",
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

// ── Abholung ──────────────────────────────────────────────────────────────────

export const markCollected = async (params: {
  registrationId: string;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ collected_at: Date | null; status: string }[]>`
    SELECT collected_at, status FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (row.status !== "won") return { ok: false, error: "Nur Gewinner können Karten abholen.", status: 400 };
  if (row.collected_at) return { ok: false, error: "Karten sind bereits als abgeholt markiert.", status: 400 };

  await sql`
    UPDATE raffle.registrations
    SET collected_at = now(), collected_by = NULL, collected_tickets = COALESCE(won_tickets, 0)
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "collected",
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

export const revertCollected = async (params: {
  registrationId: string;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ collected_at: Date | null }[]>`
    SELECT collected_at FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (!row.collected_at) return { ok: false, error: "Karten sind nicht als abgeholt markiert.", status: 400 };

  await sql`
    UPDATE raffle.registrations
    SET collected_at = NULL, collected_by = NULL, collected_tickets = 0
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "collected_reverted",
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

// ── Vollmacht ─────────────────────────────────────────────────────────────────

export const markCollectedByProxy = async (params: {
  registrationId: string;
  collectedByEmail: string;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ collected_at: Date | null; status: string }[]>`
    SELECT collected_at, status FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (row.status !== "won") return { ok: false, error: "Nur Gewinner können Karten abholen.", status: 400 };
  if (row.collected_at) return { ok: false, error: "Karten sind bereits als abgeholt markiert.", status: 400 };

  await sql`
    UPDATE raffle.registrations
    SET collected_at = now(), collected_by = ${params.collectedByEmail}, collected_tickets = COALESCE(won_tickets, 0)
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "collected_by_proxy",
    details: `Abgeholt von: ${params.collectedByEmail}`,
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

// ── Teil-Abholung: abgeholte Kartenzahl setzen ──────────────────────────────────

export const setCollected = async (params: {
  registrationId: string;
  tickets: number;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ status: string; won_tickets: number | null }[]>`
    SELECT status, won_tickets FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (row.status !== "won") return { ok: false, error: "Nur Gewinner können Karten abholen.", status: 400 };

  const won = row.won_tickets ?? 0;
  if (params.tickets < 0 || params.tickets > won) {
    return { ok: false, error: `Die abgeholte Kartenzahl muss zwischen 0 und ${won} liegen.`, status: 400 };
  }

  // collected_at markiert die vollständige Abholung. Bei Teil-Abholung bleibt
  // es NULL, damit Statistik und Scanner "noch offen" korrekt anzeigen.
  const fullyCollected = params.tickets >= won && won > 0;
  await sql`
    UPDATE raffle.registrations
    SET collected_tickets = ${params.tickets},
        collected_at = CASE WHEN ${fullyCollected} THEN now() ELSE NULL END
    WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: params.tickets === 0 ? "collected_reverted" : "collected",
    details: `Abgeholt: ${params.tickets}/${won}`,
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

// ── Karten anpassen ───────────────────────────────────────────────────────────

export const adjustTickets = async (params: {
  registrationId: string;
  wonTickets: number;
  performedBy?: string;
}): Promise<MutationResult<void>> => {
  const [row] = await sql<{ status: string; won_tickets: number | null }[]>`
    SELECT status, won_tickets FROM raffle.registrations WHERE id = ${params.registrationId}::uuid
  `;
  if (!row) return { ok: false, error: "Anmeldung nicht gefunden.", status: 404 };
  if (row.status !== "won") return { ok: false, error: "Karten können nur für Gewinner angepasst werden.", status: 400 };

  const old = row.won_tickets;
  await sql`
    UPDATE raffle.registrations SET won_tickets = ${params.wonTickets} WHERE id = ${params.registrationId}::uuid
  `;
  await logEvent({
    registrationId: params.registrationId,
    eventType: "tickets_adjusted",
    details: `Karten angepasst: ${old} → ${params.wonTickets}`,
    performedBy: params.performedBy,
  });
  return { ok: true, data: undefined };
};

// ── Gesamtzahl abgeholter Karten ──────────────────────────────────────────────

export const getTotalCollectedCount = async (): Promise<number> => {
  const [row] = await sql<{ count: number }[]>`
    SELECT COALESCE(SUM(collected_tickets), 0)::int AS count
    FROM raffle.registrations
  `;
  return row?.count ?? 0;
};
