import { sql } from "bun";
import { settings, notifications, logger } from "@valentinkolb/cloud/services";
import QRCode from "qrcode";
import * as registrationsService from "./registrations";
import * as groupsService from "./groups";
import * as rafflesService from "./raffles";
import type { MutationResult } from "@valentinkolb/cloud/contracts";

const log = logger("raffle");

// ── Raffle Algorithm ──────────────────────────────────────────────────────────

export const runRaffle = async (
  raffleId: string,
): Promise<MutationResult<{ winners: number; losers: number; contingent: number }>> => {
  // Atomic claim: setzt status auf 'raffled' genau dann wenn er noch 'open' ist.
  // Zwei gleichzeitige Requests: nur einer bekommt eine Zeile zurück.
  const [claimed] = await sql<{ ticket_contingent: number }[]>`
    UPDATE raffle.raffles SET status = 'raffled', updated_at = now()
    WHERE id = ${raffleId}::uuid AND status = 'open'
    RETURNING ticket_contingent
  `;
  if (!claimed) {
    return { ok: false, error: "Die Verlosung kann nur im Status 'Offen' gestartet werden.", status: 400 };
  }
  const contingent = claimed.ticket_contingent;

  try {
    const allPending = await registrationsService.listAllRaw({ raffleId });
    if (allPending.length === 0) {
      await rafflesService.setStatus(raffleId, "open");
      return { ok: false, error: "Keine Anmeldungen vorhanden.", status: 400 };
    }

    const groups = await groupsService.listGroupsWithMembers({ raffleId });
    const inGroupIds = new Set(groups.flatMap((g) => g.members.map((m) => m.id)));

    type Unit =
      | { type: "solo"; id: string; requestedTickets: number }
      | { type: "group"; groupId: string; members: { id: string; requestedTickets: number }[] };

    const units: Unit[] = [];

    for (const r of allPending) {
      if (!inGroupIds.has(r.id)) {
        units.push({ type: "solo", id: r.id, requestedTickets: r.requested_tickets });
      }
    }

    for (const g of groups) {
      units.push({ type: "group", groupId: g.groupId, members: g.members });
    }

    for (let i = units.length - 1; i > 0; i--) {
      const [rand] = crypto.getRandomValues(new Uint32Array(1));
      const j = Math.floor((rand / 0x100000000) * (i + 1));
      [units[i], units[j]] = [units[j], units[i]];
    }

    let remaining = contingent;
    const winners: string[] = [];
    const losers: string[] = [];

    for (const unit of units) {
      if (unit.type === "solo") {
        const needed = unit.requestedTickets;
        if (remaining >= needed) {
          winners.push(unit.id);
          remaining -= needed;
        } else {
          losers.push(unit.id);
        }
      } else {
        const totalNeeded = unit.members.reduce((sum, m) => sum + m.requestedTickets, 0);
        if (remaining >= totalNeeded) {
          for (const m of unit.members) winners.push(m.id);
          remaining -= totalNeeded;
        } else {
          for (const m of unit.members) losers.push(m.id);
        }
      }
    }

    const wonTicketsMap = new Map<string, number>();
    const tokensMap = new Map<string, string>();

    for (const id of winners) {
      const reg = allPending.find((r) => r.id === id);
      wonTicketsMap.set(id, reg?.requested_tickets ?? 1);
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      tokensMap.set(id, token);
    }

    // Alle Schreiboperationen in einer Transaction: entweder alles oder nichts.
    // status = 'raffled' wurde bereits atomar gesetzt, hier nur Registrierungen.
    await sql.begin(async (tx) => {
      for (const id of winners) {
        await tx`
          UPDATE raffle.registrations
          SET status = 'won', won_tickets = ${wonTicketsMap.get(id) ?? 1}, qr_token = ${tokensMap.get(id) ?? ""}
          WHERE id = ${id}::uuid
        `;
      }
      for (const id of losers) {
        await tx`UPDATE raffle.registrations SET status = 'lost' WHERE id = ${id}::uuid`;
      }
    });

    log.info("raffle.completed", {
      raffleId,
      winners: winners.length,
      losers: losers.length,
      contingentUsed: contingent - remaining,
      contingent,
    });

    return {
      ok: true,
      data: { winners: winners.length, losers: losers.length, contingent },
    };
  } catch (e: any) {
    // Bei einem unerwarteten Fehler: Status zurücksetzen damit die Verlosung
    // erneut gestartet werden kann.
    await rafflesService.setStatus(raffleId, "open").catch(() => {});
    log.error("raffle.run.failed", { raffleId, message: e?.message });
    return { ok: false, error: "Die Verlosung ist fehlgeschlagen und wurde zurückgesetzt.", status: 500 };
  }
};

// ── Reset Raffle ──────────────────────────────────────────────────────────────

export const resetRaffle = async (raffleId: string): Promise<MutationResult<void>> => {
  const status = await rafflesService.getStatus(raffleId);
  if (status !== "raffled") {
    return { ok: false, error: "Zurücksetzen ist nur im Status 'Verlost' möglich.", status: 400 };
  }

  await sql`
    UPDATE raffle.registrations
    SET status = 'pending', won_tickets = NULL, qr_token = NULL
    WHERE raffle_id = ${raffleId}::uuid AND status IN ('won', 'lost')
  `;

  await rafflesService.setStatus(raffleId, "open");
  log.info("raffle.reset", { raffleId });
  return { ok: true, data: undefined };
};

// ── Finalize (Mails versenden) ────────────────────────────────────────────────

export const finalizeRaffle = async (
  raffleId: string,
): Promise<MutationResult<{ emailsSent: number; errors: number }>> => {
  const status = await rafflesService.getStatus(raffleId);
  if (status !== "raffled") {
    return {
      ok: false,
      error: "Finalisieren ist nur im Status 'Verlost (noch keine Mails)' möglich.",
      status: 400,
    };
  }

  const raffle = await rafflesService.get(raffleId);

  const [globalWinSubject, globalWinBody, globalLossSubject, globalLossBody, globalReplyTo] = await Promise.all([
    settings.get<string>("raffle.win_email_subject"),
    settings.get<string>("raffle.win_email_body"),
    settings.get<string>("raffle.loss_email_subject"),
    settings.get<string>("raffle.loss_email_body"),
    settings.get<string>("raffle.reply_to_email"),
  ]);

  const winSubject = raffle?.winEmailSubject ?? globalWinSubject;
  const winBody = raffle?.winEmailBody ?? globalWinBody;
  const lossSubject = raffle?.lossEmailSubject ?? globalLossSubject;
  const lossBody = raffle?.lossEmailBody ?? globalLossBody;
  const replyTo = raffle?.replyToEmail ?? globalReplyTo;

  const allRegistrations = await registrationsService.listAll({ raffleId });
  let emailsSent = 0;
  let errors = 0;

  for (const reg of allRegistrations) {
    if (reg.status === "pending") continue;

    try {
      if (reg.status === "won") {
        const subject = (winSubject ?? "Herzlichen Glückwunsch!")
          .replace("{{name}}", reg.name)
          .replace("{{won_tickets}}", String(reg.wonTickets ?? 1));

        const bodyText = (winBody ?? "Du hast gewonnen, {{name}}!")
          .replace(/{{name}}/g, reg.name)
          .replace(/{{won_tickets}}/g, String(reg.wonTickets ?? 1));

        const qrData = reg.qrToken ?? reg.id;
        const qrDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 1 });

        const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const rawHtml = `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <p style="white-space:pre-wrap">${escHtml(bodyText)}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
            <p style="color:#666;font-size:14px">Dein QR-Code für die Kartenabholung:</p>
            <img src="${qrDataUrl}" alt="QR-Code" style="width:200px;height:200px;display:block;margin:8px 0"/>
            <p style="color:#999;font-size:12px">Referenz-ID: ${reg.id}</p>
          </div>
        `;

        await notifications
          .send({
            type: "email",
            recipient: reg.email,
            subject,
            rawHtml,
            ...(replyTo ? { replyTo } : {}),
          })
          .catch((e) => {
            log.error("raffle.finalize.win-mail.failed", { registrationId: reg.id, message: e.message });
          });
      } else {
        const subject = (lossSubject ?? "Leider kein Glück").replace("{{name}}", reg.name);
        const content = (lossBody ?? "Hallo {{name}}, leider kein Glück.")
          .replace(/{{name}}/g, reg.name);

        await notifications
          .send({
            type: "email",
            recipient: reg.email,
            subject,
            content,
            ...(replyTo ? { replyTo } : {}),
          })
          .catch((e) => {
            log.error("raffle.finalize.loss-mail.failed", { registrationId: reg.id, message: e.message });
          });
      }
      emailsSent++;
    } catch (e: any) {
      log.error("raffle.finalize.mail.error", { registrationId: reg.id, message: e.message });
      errors++;
    }
  }

  await rafflesService.setStatus(raffleId, "finalized");
  log.info("raffle.finalized", { raffleId, emailsSent, errors });

  return { ok: true, data: { emailsSent, errors } };
};
