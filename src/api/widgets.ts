import { Hono } from "hono";
import { auth, type AuthContext } from "@valentinkolb/cloud/server";
import type { WidgetResponse } from "@valentinkolb/cloud/contracts";
import { raffleService } from "../service";
import { sql } from "bun";

const app = new Hono<AuthContext>()
  .use(auth.requireRole("*"))
  .get("/stats", async (c) => {
    const [openRaffles, totalRow] = await Promise.all([
      raffleService.raffles.listOpen(),
      sql<{ total: number; total_tickets: number }[]>`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(requested_tickets), 0)::int AS total_tickets
        FROM raffle.registrations
      `.then((rows) => rows[0]),
    ]);

    const totalRegistrations = totalRow?.total ?? 0;
    const totalTickets = totalRow?.total_tickets ?? 0;

    const body: WidgetResponse = {
      title: "Verlosung",
      icon: "ti ti-ticket",
      href: "/app/raffle",
      blocks: [
        {
          kind: "stat",
          label: "Offene Verlosungen",
          value: String(openRaffles.length),
          sub: openRaffles.length === 1 ? "Verlosung aktiv" : "Verlosungen aktiv",
        },
        {
          kind: "stat",
          label: "Anmeldungen gesamt",
          value: String(totalRegistrations),
          sub: `${totalTickets} Karten angefordert`,
        },
      ],
    };
    return c.json(body);
  });

export default app;
