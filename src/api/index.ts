import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import { sql } from "bun";
import { v, jsonResponse, auth, type AuthContext, rateLimit, respond } from "@valentinkolb/cloud/server";
import { settings } from "@valentinkolb/cloud/services";
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
            {
              error: true,
              message: `Eine Gruppe mit dem Namen „${existing.name}" existiert bereits. Du kannst ihr mit dem Einladungscode beitreten.`,
              conflictGroupCode: existing.inviteCode,
              conflictGroupName: existing.name,
            },
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

  // ── Admin: Verlosungen ────────────────────────────────────────────────────

  .get(
    "/admin/raffles",
    describeRoute({
      tags: ["Admin"],
      summary: "Alle Verlosungen auflisten",
      responses: { 200: jsonResponse(RaffleItemListSchema, "Alle Verlosungen") },
    }),
    async (c) => {
      const raffles = await raffleService.raffles.list();
      return c.json(raffles);
    },
  )

  .post(
    "/admin/raffles",
    describeRoute({
      tags: ["Admin"],
      summary: "Neue Verlosung erstellen",
      responses: {
        200: jsonResponse(RaffleItemSchema, "Neue Verlosung"),
        400: jsonResponse(ErrorResponseSchema, "Ungültige Eingabe"),
      },
    }),
    v("json", CreateRaffleSchema),
    async (c) => {
      const data = c.req.valid("json");
      const result = await raffleService.raffles.create(data);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .delete(
    "/admin/raffles/:raffleId",
    describeRoute({
      tags: ["Admin"],
      summary: "Verlosung löschen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Gelöscht"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const result = await raffleService.raffles.remove(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Verlosung wurde gelöscht." });
    },
  )

  .get(
    "/admin/raffles/:raffleId/summary",
    describeRoute({
      tags: ["Admin"],
      summary: "Admin-Zusammenfassung einer Verlosung",
      responses: {
        200: jsonResponse(
          z.object({
            raffle: RaffleItemSchema,
            total: z.number(), won: z.number(), lost: z.number(), pending: z.number(),
            paid: z.number(), collected: z.number(), totalRequestedTickets: z.number(), totalWonTickets: z.number(),
          }),
          "Zusammenfassung",
        ),
      },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const raffle = await raffleService.raffles.get(raffleId);
      if (!raffle) return c.json({ error: true, message: "Verlosung nicht gefunden." }, 404);
      const summary = await raffleService.registrations.getAdminSummary({ raffleId });
      return c.json({ raffle, ...summary });
    },
  )

  // ── Admin: Anmeldungen einer Verlosung ────────────────────────────────────

  .get(
    "/admin/raffles/:raffleId/registrations",
    describeRoute({
      tags: ["Admin"],
      summary: "Anmeldungen einer Verlosung",
      responses: { 200: jsonResponse(RegistrationListSchema, "Anmeldungsliste") },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const search = c.req.query("search")?.trim();
      const filter = c.req.query("filter") as any;
      const page = Math.max(1, Number(c.req.query("page") ?? 1));
      const perPage = Math.min(100, Math.max(1, Number(c.req.query("perPage") ?? 50)));

      const result = await raffleService.registrations.listAdmin({
        raffleId,
        search,
        filter,
        pagination: { page, perPage },
      });
      return c.json({ items: result.items, total: result.total, page, perPage });
    },
  )

  .get(
    "/admin/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["Admin"],
      summary: "Anmeldung abrufen",
      responses: {
        200: jsonResponse(RegistrationSchema, "Anmeldung"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const reg = await raffleService.registrations.get({ id: regId });
      if (!reg) return c.json({ error: true, message: "Anmeldung nicht gefunden." }, 404);
      const events = await raffleService.tickets.getEvents({ registrationId: regId });
      return c.json({ ...reg, ticketEvents: events });
    },
  )

  .patch(
    "/admin/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["Admin"],
      summary: "Anmeldung bearbeiten",
      responses: {
        200: jsonResponse(RegistrationSchema, "Aktualisierte Anmeldung"),
        400: jsonResponse(ErrorResponseSchema, "Ungültige Eingabe"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    v("json", UpdateRegistrationSchema),
    async (c) => {
      const regId = c.req.param("regId");
      const data = c.req.valid("json");
      return respond(c, raffleService.registrations.update({ id: regId, data }));
    },
  )

  .delete(
    "/admin/raffles/:raffleId/registrations/:regId",
    describeRoute({
      tags: ["Admin"],
      summary: "Anmeldung löschen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Gelöscht"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const result = await raffleService.registrations.remove({ id: regId });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Anmeldung wurde gelöscht." });
    },
  )

  // ── Admin: Person aus Gruppe entfernen ───────────────────────────────────

  .delete(
    "/admin/raffles/:raffleId/registrations/:regId/group",
    describeRoute({
      tags: ["Admin"],
      summary: "Person aus Gruppe entfernen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Aus Gruppe entfernt"),
        404: jsonResponse(ErrorResponseSchema, "Nicht gefunden"),
      },
    }),
    async (c) => {
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

  // ── Admin: Verlosungsprozess ──────────────────────────────────────────────

  .post(
    "/admin/raffles/:raffleId/run-raffle",
    describeRoute({
      tags: ["Admin"],
      summary: "Verlosung durchführen",
      responses: {
        200: jsonResponse(z.object({ winners: z.number(), losers: z.number(), contingent: z.number() }), "Ergebnis"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
      },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const result = await raffleService.raffle.runRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .post(
    "/admin/raffles/:raffleId/finalize",
    describeRoute({
      tags: ["Admin"],
      summary: "Verlosung finalisieren und Mails versenden",
      responses: {
        200: jsonResponse(z.object({ emailsSent: z.number(), errors: z.number() }), "Ergebnis"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
      },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const result = await raffleService.raffle.finalizeRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json(result.data);
    },
  )

  .post(
    "/admin/raffles/:raffleId/reset",
    describeRoute({
      tags: ["Admin"],
      summary: "Verlosung zurücksetzen",
      responses: {
        200: jsonResponse(MessageResponseSchema, "Zurückgesetzt"),
        400: jsonResponse(ErrorResponseSchema, "Fehler"),
      },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const result = await raffleService.raffle.resetRaffle(raffleId);
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Verlosung wurde zurückgesetzt. Alle Anmeldungen sind wieder ausstehend." });
    },
  )

  // ── Admin: Ticket-Aktionen ────────────────────────────────────────────────

  .post(
    "/admin/raffles/:raffleId/registrations/:regId/mark-paid",
    describeRoute({
      tags: ["Admin"],
      summary: "Als bezahlt markieren",
      responses: { 200: jsonResponse(MessageResponseSchema, "Als bezahlt markiert") },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const user = c.get("user");
      const result = await raffleService.tickets.markPaid({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Als bezahlt markiert." });
    },
  )

  .delete(
    "/admin/raffles/:raffleId/registrations/:regId/mark-paid",
    describeRoute({
      tags: ["Admin"],
      summary: "Bezahlung zurücksetzen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Bezahlung zurückgesetzt") },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const user = c.get("user");
      const result = await raffleService.tickets.revertPaid({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Bezahlung wurde zurückgesetzt." });
    },
  )

  .post(
    "/admin/raffles/:raffleId/registrations/:regId/mark-collected",
    describeRoute({
      tags: ["Admin"],
      summary: "Als abgeholt markieren",
      responses: { 200: jsonResponse(MessageResponseSchema, "Als abgeholt markiert") },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const user = c.get("user");
      const result = await raffleService.tickets.markCollected({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Okily Dokily! Als abgeholt markiert." });
    },
  )

  .delete(
    "/admin/raffles/:raffleId/registrations/:regId/mark-collected",
    describeRoute({
      tags: ["Admin"],
      summary: "Abholung zurücksetzen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Abholung zurückgesetzt") },
    }),
    async (c) => {
      const regId = c.req.param("regId");
      const user = c.get("user");
      const result = await raffleService.tickets.revertCollected({ registrationId: regId, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: "Abholung wurde zurückgesetzt." });
    },
  )

  .post(
    "/admin/raffles/:raffleId/registrations/:regId/mark-collected-proxy",
    describeRoute({
      tags: ["Admin"],
      summary: "Per Vollmacht abgeholt",
      responses: { 200: jsonResponse(MessageResponseSchema, "Vollmacht eingetragen") },
    }),
    v("json", ProxyCollectSchema),
    async (c) => {
      const regId = c.req.param("regId");
      const { collectedByEmail } = c.req.valid("json");
      const user = c.get("user");
      const result = await raffleService.tickets.markCollectedByProxy({
        registrationId: regId,
        collectedByEmail,
        performedBy: user?.email,
      });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: `Karten wurden von ${collectedByEmail} per Vollmacht abgeholt.` });
    },
  )

  .patch(
    "/admin/raffles/:raffleId/registrations/:regId/adjust-tickets",
    describeRoute({
      tags: ["Admin"],
      summary: "Gewonnene Karten anpassen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Angepasst") },
    }),
    v("json", AdjustTicketsSchema),
    async (c) => {
      const regId = c.req.param("regId");
      const { wonTickets } = c.req.valid("json");
      const user = c.get("user");
      const result = await raffleService.tickets.adjustTickets({ registrationId: regId, wonTickets, performedBy: user?.email });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 400);
      return c.json({ message: `Karten angepasst auf ${wonTickets}.` });
    },
  )

  .delete(
    "/admin/raffles/:raffleId/registrations/:regId/remove-with-reason",
    describeRoute({
      tags: ["Admin"],
      summary: "Anmeldung mit Begründung entfernen",
      responses: { 200: jsonResponse(MessageResponseSchema, "Entfernt") },
    }),
    v("json", RemoveWithReasonSchema),
    async (c) => {
      const regId = c.req.param("regId");
      const result = await raffleService.registrations.remove({ id: regId });
      if (!result.ok) return c.json({ error: true, message: result.error }, result.status ?? 404);
      return c.json({ message: "Anmeldung wurde entfernt." });
    },
  )

  // ── Admin: Betrugsfilter ──────────────────────────────────────────────────

  .get(
    "/admin/raffles/:raffleId/fraud-filter",
    describeRoute({
      tags: ["Admin"],
      summary: "Ähnliche Namen (Betrugsfilter)",
      responses: { 200: jsonResponse(SimilarNamePairListSchema, "Ähnliche Namenpaare") },
    }),
    async (c) => {
      const raffleId = c.req.param("raffleId");
      const pairs = await raffleService.registrations.findSimilarNames({ raffleId });
      return c.json(pairs);
    },
  )

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
  );

export default app;

export type ApiType = typeof app;
