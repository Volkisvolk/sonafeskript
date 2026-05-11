import { ssr } from "../config";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { AdminLayout } from "@valentinkolb/cloud/ssr";
import { raffleService } from "@/service";
import AdminCreateRaffle from "./AdminCreateRaffle.island";

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  raffled: "Verlost",
  finalized: "Abgeschlossen",
};

const STATUS_CLASS: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  raffled: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  finalized: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export default ssr<AuthContext>(async (c) => {
  const raffles = await raffleService.raffles.list();

  return () => (
    <AdminLayout c={c} title="Verlosungen" stretch>
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-3">

          {/* ── Überschrift ───────────────────────────────────────────────── */}
          <div class="flex items-center justify-between flex-wrap gap-2">
            <h1 class="text-base font-semibold text-primary">Verlosungsverwaltung</h1>
            <span class="text-xs text-dimmed">{raffles.length} Verlosung{raffles.length !== 1 ? "en" : ""}</span>
          </div>

          {/* ── Neue Verlosung erstellen ───────────────────────────────────── */}
          <AdminCreateRaffle />

          {/* ── Verlosungsliste ────────────────────────────────────────────── */}
          {raffles.length > 0 ? (
            <section class="paper overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="border-b border-zinc-100 dark:border-zinc-800">
                      <th class="px-3 py-2 text-left font-medium text-dimmed">Name</th>
                      <th class="px-3 py-2 text-left font-medium text-dimmed">Status</th>
                      <th class="px-3 py-2 text-center font-medium text-dimmed">Kontingent</th>
                      <th class="px-3 py-2 text-center font-medium text-dimmed">Anmeldungen</th>
                      <th class="px-3 py-2 text-left font-medium text-dimmed">Erstellt</th>
                      <th class="w-px px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {raffles.map((raffle) => (
                      <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td class="px-3 py-2">
                          <p class="font-medium text-primary">{raffle.name}</p>
                          {raffle.description ? (
                            <p class="text-dimmed truncate max-w-xs">{raffle.description}</p>
                          ) : null}
                        </td>
                        <td class="px-3 py-2">
                          <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[raffle.status]}`}>
                            {STATUS_LABEL[raffle.status]}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-center text-dimmed">{raffle.ticketContingent}</td>
                        <td class="px-3 py-2 text-center text-dimmed">{raffle.registrationCount}</td>
                        <td class="px-3 py-2 text-dimmed">
                          {new Date(raffle.createdAt).toLocaleDateString("de-DE", { dateStyle: "medium" })}
                        </td>
                        <td class="px-3 py-2">
                          <a
                            href={`/admin/raffle/${raffle.id}`}
                            class="btn-secondary btn-sm"
                          >
                            Details
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <div class="paper p-8 text-center">
              <i class="ti ti-ticket-off text-2xl text-dimmed mb-2 block" />
              <p class="text-sm text-dimmed">Noch keine Verlosungen vorhanden. Erstelle jetzt eine!</p>
            </div>
          )}

        </div>
      </div>
    </AdminLayout>
  );
});
