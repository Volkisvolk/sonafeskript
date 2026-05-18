import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { sql } from "bun";
import { v, jsonResponse, auth, type AuthContext, rateLimit, respond } from "@valentinkolb/cloud/server";
import { settings, notifications } from "@valentinkolb/cloud/services";
import { raffleService } from "../service";
import {
  RegisterSchema,
  UpdateRegistrationSchema,
  AdjustTicketsSchema,
  ProxyCollectSchema,
  RemoveWithReasonSchema,
  CreateLinkSchema,
  UpdateLinkSchema,
  CreateRaffleSchema,
  UpdateRaffleSchema,
  RegistrationSchema,
  GroupPublicSchema,
  ExternalLinkSchema,
  RaffleStatsSchema,
  SimilarNamePairSchema,
  RaffleItemSchema,
  ErrorResponseSchema,
  MessageResponseSchema,
  RegisterResponseSchema,
} from "@/contracts";

import widgetRoutes from "./widgets";

const RegistrationListSchema = z.array(RegistrationSchema);
const ExternalLinkListSchema = z.array(ExternalLinkSchema);
const SimilarNamePairListSchema = z.array(SimilarNamePairSchema);
const RaffleItemListSchema = z.array(RaffleItemSchema);

const getOwnedRaffle = async (raffleId: string, userId: string) => {
  const raffle = await raffleService.raffles.get(raffleId);
  if (!raffle) return { ok: false as const, error: "Verlosung nicht gefunden.", status: 404 as const };
  if (raffle.createdBy !== userId) return { ok: false as const, error: "Keine Berechtigung.", status: 403 as const };
  return { ok: true as const, raffle };
};

const app = new Hono<AuthContext>()

  // ── Widget (eigene Auth-Logik) ────────────────────────────────────────────
  .route("/widget", widgetRoutes)
  .use(rateLimit())

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖFFENTLICHE ENDPUNKTE
  // ═══════════════════════════════════════════════════════════════════════════

  .get(
    "/raffles",
    describeRoute({
      tags: ["Public"],
      summary: "Offene Verlosungen auflisten",
      responses: { 200: jsonResponse(RaffleItemListSchema, "Offene Verlosungen") },
    }),
    async (c) => {
      const raffles = await raffleService.raffles.listOpen();
      return c.json(raffles);
    },
  )

  .get(
    "/raffles/:id/stats",
    describeRoute({
      tags: ["Public"],
      summary: "Statistiken einer Verlosung",
      responses: { 200: jsonResponse(RaffleStatsSchema, "Statistiken") },
    }),
    async (c) => {
      const id = c.req.param("id");
      const raffle = await raffleService.raffles.get(id);
      if (!raffle) return c.json({ error: true, message: "Verlosung nicht gefunden." }, 404);

      const stats = await raffleService.registrations.getStats({ raffleId: id });
      return c.json({
        status: raffle.status,
        ticketContingent: raffle.ticketContingent,
        totalRequestedTickets: stats.totalRequestedTickets,
        totalRegistrations: stats.totalRegistrations,
        totalCollected: stats.totalCollected,
      });
    },
  )

  .post(
    "/raffles/:id/register",
    describeRoute({
      tags: ["Public"],
      summary: "Für eine Verlosung anmelden",
      responses: {
        200: jsonResponse(RegisterResponseSchema, "Erfolgreich angemeldet"),
        400: jsonResponse(ErrorResponseSchema, "Ungültige Eingabe"),
        409: jsonResponse(ErrorResponseSchema, "E-Mail bereits registriert"),
      },
    }),
    v("json", RegisterSchema),
    async (c) => {
      const raffleId = c.req.param("id");
      const data = c.req.valid("json");

      const raffle = await raffleService.raffles.get(raffleId);
      if (!raffle) return c.json({ error: true, message: "Verlosung nicht gefunden." }, 404);
      if (raffle.status !== "open") {
        return c.json(
          { error: true, message: "Die Anmeldephase ist bereits beendet. Neue Registrierungen sind nicht mehr möglich." },
          400,
        );
      }

      if (raffle.allowedEmailPatterns.length > 0) {
        const allowed = raffle.allowedEmailPatterns.some((pattern) => {
          try { return new RegExp(pattern, "i").test(data.email); } catch { return false; }
        });
        if (!allowed) {
          return c.json({ error: true, message: "Deine E-Mail-Adresse ist für diese Verlosung nicht zugelassen." }, 400);
        }
      }

      let groupId: string | undefined;
      let inviteCode: string | undefined;

      if (data.joinGroupCode && data.createGroupName) {
        return c.json({ error: true, message: "Du kannst nicht gleichzeitig eine Gruppe erstellen und einer beitreten." }, 400);
      }

      const emailCheck = await raffleService.registrations.checkEmailAvailable({ email: data.email, raffleId });
      if (!emailCheck.ok) {
        return c.json({ error: true, message: emailCheck.error }, emailCheck.status ?? 400);
      }

      if (data.createGroupName) {
        const existing = await raffleService.groups.getByName({ name: data.createGroupName, raffleId });
        if (existing) {
          return c.json(
            { error: true, message: `Eine Gruppe mit dem Namen „${existing.name}" existiert bereits. Bitte wähle einen anderen Namen.` },
            409,
          );
        }
      }

      if (data.joinGroupCode) {
        const group = await raffleService.groups.getByInviteCode({ code: data.joinGroupCode, raffleId });
        if (!group) {
          return c.json({ error: true, message: "Kein Gruppe mit diesem Einladungscode gefunden." }, 404);
        }
        const maxGroupSize = (await settings.get<number>("raffle.max_group_size")) ?? 4;
        if (group.memberCount >= maxGroupSize) {
          return c.json({ error: true, message: `Die Gruppe ist bereits voll (max. ${maxGroupSize} Personen).` }, 400);
        }
        groupId = group.id;
      }

      const result = await raffleService.registrations.create({ data, groupId, raffleId });
      if (!result.ok) {
        return c.json({ error: true, message: result.error }, result.status ?? 400);
      }

      const registrationId = result.data.id;

      if (data.createGroupName) {
        const groupResult = await raffleService.groups.create({
          name: data.createGroupName,
          raffleId,
          creatorRegistrationId: registrationId,
        });
        if (!groupResult.ok) {
          return c.json({ error: true, message: groupResult.error }, 500);
        }
        inviteCode = groupResult.data.inviteCode;
      }

      // ── Anmeldungs-Bestätigungsmail ─────────────────────────────────────────
      {
        const raffle = await raffleService.raffles.get(raffleId);
        const [globalRegSubject, globalRegBody, globalReplyTo] = await Promise.all([
          settings.get<string>("raffle.reg_email_subject"),
          settings.get<string>("raffle.reg_email_body"),
          settings.get<string>("raffle.reply_to_email"),
        ]);

        const defaultSubject = "Deine Anmeldung für {{raffle_name}}";
        const defaultBody = "Hallo {{name}},\n\ndu hast dich erfolgreich für die Verlosung angemeldet. Du erhältst nach der Verlosung eine E-Mail mit deinem Ergebnis.\n\nViel Glück!";

        const rawSubject = (raffle?.regEmailSubject ?? globalRegSubject ?? defaultSubject)
          .replace(/{{name}}/g, data.name)
          .replace(/{{raffle_name}}/g, raffle?.name ?? "die Verlosung");

        const rawBody = (raffle?.regEmailBody ?? globalRegBody ?? defaultBody)
          .replace(/{{name}}/g, data.name)
          .replace(/{{raffle_name}}/g, raffle?.name ?? "die Verlosung");

        const groupSection = inviteCode
          ? `<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
             <p style="font-weight:600">Dein Gruppeneinladungscode:</p>
             <p style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;padding:12px 0">${inviteCode}</p>
             <p style="color:#666;font-size:14px">Teile diesen Code mit den anderen Mitgliedern deiner Gruppe. Eine Gruppe hat keinen Einfluss auf deine Gewinnchance &mdash; sie sorgt nur daf&uuml;r, dass ihr als Gruppe das gleiche Ergebnis erhaltet.</p>`
          : "";

        const replyTo = raffle?.replyToEmail ?? globalReplyTo;
        await notifications
          .send({
            type: "email",
            recipient: data.email,
            subject: rawSubject,
            rawHtml: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><p style="white-space:pre-wrap">${rawBody.replace(/</g, "&lt;")}</p>${groupSection}</div>`,
            ...(replyTo ? { replyTo } : {}),
          })
          .catch(() => {});
      }

      return c.json({
        message: "Erfolgreich angemeldet! Du erhältst nach der Verlosung eine E-Mail.",
        registrationId,
        ...(inviteCode ? { inviteCode } : {}),
      });
    },
  )

  .get(
    "/groups/lookup",
    describeRoute({
      tags: ["Public"],
      summary: "Gruppe per Einladungscode finden",
      responses: {
        200: jsonResponse(GroupPublicSchema, "Gruppeninformation"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const code = c.req.query("code") ?? "";
      const raffleId = c.req.query("raffleId") ?? "";
      if (!code) return c.json({ error: true, message: "Kein Einladungscode angegeben." }, 400);
      if (!raffleId) return c.json({ error: true, message: "Keine Verlosungs-ID angegeben." }, 400);

      const group = await raffleService.groups.getByInviteCode({ code, raffleId });
      if (!group) return c.json({ error: true, message: "Keine Gruppe mit diesem Code gefunden." }, 404);

      const maxGroupSize = (await settings.get<number>("raffle.max_group_size")) ?? 4;
      return c.json({ id: group.id, name: group.name, memberCount: group.memberCount, maxGroupSize });
    },
  )

  .get(
    "/links",
    describeRoute({
      tags: ["Public"],
      summary: "Externe Links",
      responses: { 200: jsonResponse(ExternalLinkListSchema, "Liste der Links") },
    }),
    async (c) => {
      const links = await raffleService.links.listAll();
      return c.json(links);
    },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN-ENDPUNKTE
  // ═══════════════════════════════════════════════════════════════════════════

  .use("/admin/*", auth.requireRole("admin"))

  // ── Admin: Externe Links ──────────────────────────────────────────────────

  .get(
    "/admin/links",
    describeRoute({
      tags: ["Admin"],
      summary: "Alle Links auflisten",
      responses: { 200: jsonResponse(ExternalLinkListSchema, "Links") },
    }),
    async (c) => c.json(await raffleService.links.listAll()),
  )

  .post(
    "/admin/links",
    describeRoute({
      tags: ["Admin"],
      summary: "Link hinzufügen",
      responses: {
        200: jsonResponse(ExternalLinkSchema, "Neuer Link"),
        400: jsonResponse(ErrorResponseSchema, "Ungültige Eingabe"),
      },
    }),
    v("json", CreateLinkSchema),
    async (c) => {
      const data = c.req.valid("json");
      return respond(c, raffleService.links.create(data));
    },
  )

  .patch(
    "/admin/links/:id",
    describeRoute({
      tags: ["Admin"],
      summary: "Link aktualisieren",
      responses: {
        200: jsonResponse(ExternalLinkSchema, "Aktualisierter Link"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    v("json", UpdateLinkSchema),
    async (c) => {
      const id = c.req.param("id");
      const data = c.req.valid("json");
      return respond(c, raffleService.links.update({ id, data }));
    },
  )

  .delete(
    "/admin/links/:id",
    describeRoute({
      tags: ["Admin"],
      summary: "Link löschen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Gelöscht"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const id = c.req.param("id");
      const result = await raffleService.links.remove({ id });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Link wurde gelöscht." });
    },
  )

  // ── Admin: Aggregierte Stats ──────────────────────────────────────────────

  .get(
    "/admin/registrations/stats",
    describeRoute({
      tags: ["Admin"],
      summary: "Aggregierte Anmeldungsstatistiken über alle Verlosungen",
      responses: { 200: jsonResponse(z.object({ totalRegistrations: z.number(), openRaffles: z.number() }), "Stats") },
    }),
    async (c) => {
      const [openRaffles, rows] = await Promise.all([
        raffleService.raffles.listOpen(),
        sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM raffle.registrations`,
      ]);
      const row = rows[0];
      return c.json({ totalRegistrations: row?.total ?? 0, openRaffles: openRaffles.length });
    },
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // NUTZER-ENDPUNKTE (eigene Verlosungen)
  // ═══════════════════════════════════════════════════════════════════════════

  .use("/user/*", auth.requireRole("authenticated"))

  .get(
    "/user/raffles",
    describeRoute({
      tags: ["User"],
      summary: "Eigene Verlosungen auflisten",
      responses: { 200: jsonResponse(RaffleItemListSchema, "Eigene Verlosungen") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffles = await raffleService.raffles.listByUser(user.id);
      return c.json(raffles);
    },
  )

  .post(
    "/user/raffles",
    describeRoute({
      tags: ["User"],
      summary: "Neue Verlosung erstellen",
      responses: {
        200: jsonResponse(RaffleItemSchema, "Neue Verlosung"),
        400: jsonResponse(ErrorResponseSchema, "Ungültige Eingabe"),
      },
    }),
    v("json", CreateRaffleSchema),
    async (c) => {
      const user = c.get("user")!;
      const data = c.req.valid("json");
      const result = await raffleService.raffles.create(data, user.id);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .patch(
    "/user/raffles/:raffleId",
    describeRoute({
      tags: ["User"],
      summary: "Eigene Verlosung bearbeiten",
      responses: {
        200: jsonResponse(RaffleItemSchema, "Aktualisierte Verlosung"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    v("json", UpdateRaffleSchema),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const data = c.req.valid("json");
      return respond(c, raffleService.raffles.update(raffleId, data));
    },
  )

  .delete(
    "/user/raffles/:raffleId",
    describeRoute({
      tags: ["User"],
      summary: "Eigene Verlosung löschen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Gelöscht"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const result = await raffleService.raffles.remove(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Verlosung wurde gelöscht." });
    },
  )

  .get(
    "/user/raffles/:raffleId/summary",
    describeRoute({
      tags: ["User"],
      summary: "Zusammenfassung einer eigenen Verlosung",
      responses: {
        200: jsonResponse(
          z.object({
            raffle: RaffleItemSchema,
            total: z.number(), won: z.number(), lost: z.number(), pending: z.number(),
            paid: z.number(), collected: z.number(), totalRequestedTickets: z.number(), totalWonTickets: z.number(),
          }),
          "Zusammenfassung",
        ),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const summary = await raffleService.registrations.getAdminSummary({ raffleId });
      return c.json({ raffle: access.raffle, ...summary });
    },
  )

  .get(
    "/user/raffles/:raffleId/registrations",
    describeRoute({
      tags: ["User"],
      summary: "Anmeldungen einer eigenen Verlosung",
      responses: { 200: jsonResponse(RegistrationListSchema, "Anmeldungsliste"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const search = c.req.query("search")?.trim();
      const filter = c.req.query("filter") as any;
      const page = Math.max(1, Number(c.req.query("page") ?? 1));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query("perPage") ?? 50)));
      const result = await raffleService.registrations.listAdmin({ raffleId, search, filter, pagination: { page, perPage } });
      return c.json({ items: result.items, total: result.total, page, perPage });
    },
  )

  .get(
    "/user/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["User"],
      summary: "Anmeldung abrufen",
      responses: {
        200: jsonResponse(RegistrationSchema, "Anmeldung"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const reg = await raffleService.registrations.get({ id: regId });
      if (!reg) return c.json({ error: true, message: "Anmeldung nicht gefunden." }, 404);
      const events = await raffleService.tickets.getEvents({ registrationId: regId });
      return c.json({ ...reg, ticketEvents: events });
    },
  )

  .patch(
    "/user/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["User"],
      summary: "Anmeldung bearbeiten",
      responses: {
        200: jsonResponse(RegistrationSchema, "Aktualisierte Anmeldung"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    v("json", UpdateRegistrationSchema),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const data = c.req.valid("json");
      return respond(c, raffleService.registrations.update({ id: regId, data }));
    },
  )

  .delete(
    "/user/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["User"],
      summary: "Anmeldung löschen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Gelöscht"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.registrations.remove({ id: regId });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Anmeldung wurde gelöscht." });
    },
  )

  .delete(
    "/user/raffles/:raffleId/registrations/:regId/group",
    describeRoute({
      tags: ["User"],
      summary: "Person aus Gruppe entfernen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Aus Gruppe entfernt"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const reg = await raffleService.registrations.get({ id: regId });
      if (!reg) return c.json({ error: true, message: "Anmeldung nicht gefunden." }, 404);
      const oldGroupId = reg.groupId;
      const result = await raffleService.registrations.updateGroup({ id: regId, groupId: null });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 500);
      if (oldGroupId) await raffleService.groups.removeIfEmpty({ id: oldGroupId });
      return c.json({ message: "Person wurde aus der Gruppe entfernt." });
    },
  )

  .post(
    "/user/raffles/:raffleId/run-raffle",
    describeRoute({
      tags: ["User"],
      summary: "Verlosung durchführen",
      responses: {
        200: jsonResponse(z.object({ winners: z.number(), losers: z.number(), contingent: z.number() }), "Ergebnis"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const result = await raffleService.raffle.runRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .post(
    "/user/raffles/:raffleId/finalize",
    describeRoute({
      tags: ["User"],
      summary: "Verlosung finalisieren und Mails versenden",
      responses: {
        200: jsonResponse(z.object({ emailsSent: z.number(), errors: z.number() }), "Ergebnis"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const result = await raffleService.raffle.finalizeRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .post(
    "/user/raffles/:raffleId/reset",
    describeRoute({
      tags: ["User"],
      summary: "Verlosung zurücksetzen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Zurückgesetzt"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
        403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung"),
      },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const result = await raffleService.raffle.resetRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Verlosung wurde zurückgesetzt. Alle Anmeldungen sind wieder ausstehend." });
    },
  )

  .post(
    "/user/raffles/:raffleId/registrations/:regId/mark-paid",
    describeRoute({
      tags: ["User"],
      summary: "Als bezahlt markieren",
      responses: { 200: jsonResponse(MessageResponseSchema, "Als bezahlt markiert"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.tickets.markPaid({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Als bezahlt markiert." });
    },
  )

  .delete(
    "/user/raffles/:raffleId/registrations/:regId/mark-paid",
    describeRoute({
      tags: ["User"],
      summary: "Bezahlung zurücksetzen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Bezahlung zurückgesetzt"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.tickets.revertPaid({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Bezahlung wurde zurückgesetzt." });
    },
  )

  .post(
    "/user/raffles/:raffleId/registrations/:regId/mark-collected",
    describeRoute({
      tags: ["User"],
      summary: "Als abgeholt markieren",
      responses: { 200: jsonResponse(MessageResponseSchema, "Als abgeholt markiert"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.tickets.markCollected({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Okily Dokily! Als abgeholt markiert." });
    },
  )

  .delete(
    "/user/raffles/:raffleId/registrations/:regId/mark-collected",
    describeRoute({
      tags: ["User"],
      summary: "Abholung zurücksetzen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Abholung zurückgesetzt"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.tickets.revertCollected({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Abholung wurde zurückgesetzt." });
    },
  )

  .post(
    "/user/raffles/:raffleId/registrations/:regId/mark-collected-proxy",
    describeRoute({
      tags: ["User"],
      summary: "Per Vollmacht abgeholt",
      responses: { 200: jsonResponse(MessageResponseSchema, "Vollmacht eingetragen"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    v("json", ProxyCollectSchema),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const { collectedByEmail } = c.req.valid("json");
      const result = await raffleService.tickets.markCollectedByProxy({ registrationId: regId, collectedByEmail, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: `Karten wurden von ${collectedByEmail} per Vollmacht abgeholt.` });
    },
  )

  .patch(
    "/user/raffles/:raffleId/registrations/:regId/adjust-tickets",
    describeRoute({
      tags: ["User"],
      summary: "Gewonnene Karten anpassen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Angepasst"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    v("json", AdjustTicketsSchema),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const { wonTickets } = c.req.valid("json");
      const result = await raffleService.tickets.adjustTickets({ registrationId: regId, wonTickets, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: `Karten angepasst auf ${wonTickets}.` });
    },
  )

  .delete(
    "/user/raffles/:raffleId/registrations/:regId/remove-with-reason",
    describeRoute({
      tags: ["User"],
      summary: "Anmeldung mit Begründung entfernen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Entfernt"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    v("json", RemoveWithReasonSchema),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const regId = c.req.param("regId");
      const result = await raffleService.registrations.remove({ id: regId });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Anmeldung wurde entfernt." });
    },
  )

  .get(
    "/user/raffles/:raffleId/fraud-filter",
    describeRoute({
      tags: ["User"],
      summary: "Ähnliche Namen (Betrugsfilter)",
      responses: { 200: jsonResponse(SimilarNamePairListSchema, "Ähnliche Namenpaare"), 403: jsonResponse(ErrorResponseSchema, "Keine Berechtigung") },
    }),
    async (c) => {
      const user = c.get("user")!;
      const raffleId = c.req.param("raffleId");
      const access = await getOwnedRaffle(raffleId, user.id);
      if (!access.ok) return c.json({ error: true, message: access.error }, access.status);
      const pairs = await raffleService.registrations.findSimilarNames({ raffleId });
      return c.json(pairs);
    },
  );

export default app;

export type ApiType = typeof app;
