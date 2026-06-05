import { sql } from "bun";
import type { MutationResult } from "@valentinkolb/cloud/contracts";
import type { RaffleItem, CreateRaffle, UpdateRaffle, RaffleStatus } from "@/contracts";

type DbRaffle = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  ticket_contingent: number;
  registration_count: number;
  total_requested_tickets: number;
  created_at: Date;
  created_by: string | null;
  allowed_email_patterns: string[];
  reply_to_email: string | null;
  win_email_subject: string | null;
  win_email_body: string | null;
  loss_email_subject: string | null;
  loss_email_body: string | null;
  banner_url: string | null;
  banner_position: string;
  faq_items: string;
  agb_text: string | null;
  reg_email_subject: string | null;
  reg_email_body: string | null;
};

const mapRaffle = (r: DbRaffle): RaffleItem => ({
  id: r.id,
  name: r.name,
  description: r.description,
  status: r.status as RaffleStatus,
  ticketContingent: r.ticket_contingent,
  registrationCount: r.registration_count,
  totalRequestedTickets: r.total_requested_tickets,
  createdAt: r.created_at.toISOString(),
  createdBy: r.created_by,
  allowedEmailPatterns: r.allowed_email_patterns ?? [],
  replyToEmail: r.reply_to_email,
  winEmailSubject: r.win_email_subject,
  winEmailBody: r.win_email_body,
  lossEmailSubject: r.loss_email_subject,
  lossEmailBody: r.loss_email_body,
  bannerUrl: r.banner_url,
  bannerPosition: r.banner_position ?? "50% 50%",
  faqItems: (() => { try { return JSON.parse(r.faq_items || "[]"); } catch { return []; } })(),
  agbText: r.agb_text,
  regEmailSubject: r.reg_email_subject,
  regEmailBody: r.reg_email_body,
});

const toPgTextArray = (arr: string[]) =>
  "{" + arr.map((s) => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\{/g, "\\{").replace(/\}/g, "\\}") + '"').join(",") + "}";

const WITH_COUNT = sql`
  SELECT r.*, COALESCE(rc.cnt, 0)::int AS registration_count, COALESCE(rc.requested, 0)::int AS total_requested_tickets
  FROM raffle.raffles r
  LEFT JOIN (
    SELECT raffle_id, COUNT(*)::int AS cnt, COALESCE(SUM(requested_tickets), 0)::int AS requested
    FROM raffle.registrations
    WHERE confirmed_at IS NOT NULL
    GROUP BY raffle_id
  ) rc ON rc.raffle_id = r.id
`;

export const create = async (data: CreateRaffle, createdBy?: string): Promise<MutationResult<RaffleItem>> => {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO raffle.raffles (name, description, ticket_contingent, created_by)
    VALUES (${data.name}, ${data.description ?? null}, ${data.ticketContingent ?? 100}, ${createdBy ?? null})
    RETURNING id
  `;
  if (!row) return { ok: false, error: "Verlosung konnte nicht erstellt werden.", status: 500 };

  if (createdBy) {
    const { grant } = await import("./access");
    await grant(row.id, { type: "user", userId: createdBy }, "admin");
  }

  const item = await get(row.id);
  if (!item) return { ok: false, error: "Verlosung konnte nicht geladen werden.", status: 500 };
  return { ok: true, data: item };
};

export const update = async (id: string, data: UpdateRaffle): Promise<MutationResult<RaffleItem>> => {
  const existing = await get(id);
  if (!existing) return { ok: false, error: "Verlosung nicht gefunden.", status: 404 };

  const name = data.name ?? existing.name;
  const description = data.description !== undefined ? data.description : existing.description;
  // Das Kontingent ist die Anzahl tatsächlich verfügbarer Karten und darf
  // bewusst unter der Summe der angeforderten Karten liegen – genau dafür
  // gibt es die Verlosung. Keine künstliche Untergrenze.
  const ticketContingent = data.ticketContingent ?? existing.ticketContingent;

  const allowedEmailPatterns = data.allowedEmailPatterns !== undefined ? data.allowedEmailPatterns : existing.allowedEmailPatterns;
  const replyToEmail = data.replyToEmail !== undefined ? data.replyToEmail : existing.replyToEmail;
  const winEmailSubject = data.winEmailSubject !== undefined ? data.winEmailSubject : existing.winEmailSubject;
  const winEmailBody = data.winEmailBody !== undefined ? data.winEmailBody : existing.winEmailBody;
  const lossEmailSubject = data.lossEmailSubject !== undefined ? data.lossEmailSubject : existing.lossEmailSubject;
  const lossEmailBody = data.lossEmailBody !== undefined ? data.lossEmailBody : existing.lossEmailBody;
  const bannerUrl = data.bannerUrl !== undefined ? data.bannerUrl : existing.bannerUrl;
  const bannerPosition = data.bannerPosition ?? existing.bannerPosition;
  const faqItems = data.faqItems !== undefined ? JSON.stringify(data.faqItems) : JSON.stringify(existing.faqItems);
  const agbText = data.agbText !== undefined ? data.agbText : existing.agbText;
  const regEmailSubject = data.regEmailSubject !== undefined ? data.regEmailSubject : existing.regEmailSubject;
  const regEmailBody = data.regEmailBody !== undefined ? data.regEmailBody : existing.regEmailBody;

  await sql`
    UPDATE raffle.raffles
    SET name = ${name}, description = ${description}, ticket_contingent = ${ticketContingent},
        allowed_email_patterns = ${toPgTextArray(allowedEmailPatterns)}::text[],
        reply_to_email = ${replyToEmail}, win_email_subject = ${winEmailSubject},
        win_email_body = ${winEmailBody}, loss_email_subject = ${lossEmailSubject},
        loss_email_body = ${lossEmailBody}, banner_url = ${bannerUrl},
        banner_position = ${bannerPosition}, faq_items = ${faqItems},
        agb_text = ${agbText}, reg_email_subject = ${regEmailSubject},
        reg_email_body = ${regEmailBody}, updated_at = now()
    WHERE id = ${id}::uuid
  `;
  const item = await get(id);
  if (!item) return { ok: false, error: "Verlosung konnte nicht geladen werden.", status: 500 };
  return { ok: true, data: item };
};

export const listByUser = async (userId: string): Promise<RaffleItem[]> => {
  const rows = await sql<DbRaffle[]>`
    ${WITH_COUNT}
    WHERE r.id IN (
      SELECT ra.raffle_id FROM raffle.raffle_access ra
      JOIN auth.access a ON a.id = ra.access_id
      WHERE a.user_id = ${userId}::uuid
    )
    OR r.created_by = ${userId}
    ORDER BY r.created_at DESC
  `;
  return rows.map(mapRaffle);
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
