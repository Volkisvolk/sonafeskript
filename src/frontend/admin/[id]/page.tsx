import { ssr } from "../../../config";
import { AdminLayout } from "@valentinkolb/cloud/ssr";
import { StatCell, Pagination } from "@valentinkolb/cloud/ui";
import { SearchBar } from "@valentinkolb/cloud/ssr/islands";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { raffleService } from "@/service";
import AdminRaffleControls from "../../AdminRaffleControls.island";
import AdminFraudFilter from "../../AdminFraudFilter.island";
import AdminLinks from "../../AdminLinks.island";
import AdminDeleteRaffle from "../../AdminDeleteRaffle.island";

const PER_PAGE = 50;

const STATUS_LABEL: Record<string, string> = {
  pending: "Ausstehend",
  won: "Gewonnen",
  lost: "Verloren",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "text-dimmed",
  won: "text-emerald-600 dark:text-emerald-400",
  lost: "text-red-500",
};

export default ssr<AuthContext>(async (c) => {
  const raffleId = c.req.param("id");

  const raffle = await raffleService.raffles.get(raffleId);
  if (!raffle) {
    return () => (
      <AdminLayout c={c} title="Nicht gefunden">
        <div class="flex items-center justify-center gap-2 text-dimmed text-sm p-8">
          <i class="ti ti-alert-circle" />
          Verlosung nicht gefunden.
        </div>
      </AdminLayout>
    );
  }

  const search = (c.req.query("search") ?? "").trim();
  const filter = c.req.query("filter") as
    | "won"
    | "lost"
    | "pending"
    | "duplicate_email"
    | "duplicate_name"
    | undefined;
  const tab = (c.req.query("tab") ?? "list") as "list" | "fraud" | "links";
  const pageRaw = Number.parseInt(c.req.query("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const [summary, registrations, collectedCount] = await Promise.all([
    raffleService.registrations.getAdminSummary({ raffleId }),
    raffleService.registrations.listAdmin({
      raffleId,
      search: search || undefined,
      filter,
      pagination: { page, perPage: PER_PAGE },
    }),
    raffleService.tickets.getTotalCollectedCount(),
  ]);

  const totalPages = Math.ceil(registrations.total / PER_PAGE);
  const baseUrl = `/admin/raffle/${raffleId}?tab=list${search ? `&search=${encodeURIComponent(search)}` : ""}${filter ? `&filter=${filter}` : ""}&page=`;

  const statusLabel =
    raffle.status === "open"
      ? "Anmeldung offen"
      : raffle.status === "raffled"
        ? "Verlost – Mails ausstehend"
        : "Abgeschlossen";
  const statusTone =
    raffle.status === "open" ? "blue" : raffle.status === "raffled" ? "amber" : "emerald";

  return () => (
    <AdminLayout
      c={c}
      title={[{ title: "Verlosungen", href: "/admin/raffle" }, { title: raffle.name }]}
      stretch
    >
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="flex flex-col gap-2">

          {/* ── Überschrift & Status ───────────────────────────────────────── */}
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <a href="/admin/raffle" class="btn-simple btn-sm">
                <i class="ti ti-arrow-left mr-1" /> Verlosungen
              </a>
              <h1 class="text-base font-semibold text-primary">{raffle.name}</h1>
            </div>
            <div class="flex items-center gap-2">
              <span
                class={`text-xs font-medium px-2 py-1 rounded-full ${
                  statusTone === "blue"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : statusTone === "amber"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                }`}
              >
                <i class={`ti ${statusTone === "blue" ? "ti-lock-open" : statusTone === "amber" ? "ti-clock" : "ti-circle-check"} mr-1`} />
                {statusLabel}
              </span>
              <AdminDeleteRaffle
                raffleId={raffleId}
                raffleName={raffle.name}
                registrationCount={summary.total}
              />
            </div>
          </div>

          {/* ── Statistik-Karten ───────────────────────────────────────────── */}
          <div class="paper overflow-hidden">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-px p-px bg-zinc-100 dark:bg-zinc-800">
              <StatCell
                label="Anmeldungen"
                value={summary.total}
                sub={`${summary.totalRequestedTickets} Karten angefordert`}
                accent={{ tone: "blue", icon: "ti ti-users" }}
              />
              <StatCell
                label="Gewinner"
                value={summary.won}
                sub={`${summary.totalWonTickets} Karten gewonnen`}
                accent={{ tone: "emerald", icon: "ti ti-trophy" }}
              />
              <StatCell
                label="Verlierer"
                value={summary.lost}
                sub={summary.pending > 0 ? `${summary.pending} ausstehend` : "alle verlost"}
                accent={{ tone: "red", icon: "ti ti-x" }}
              />
              <StatCell
                label="Abgeholt"
                value={collectedCount}
                sub={`von ${summary.paid} bezahlten Karten`}
                accent={{ tone: "amber", icon: "ti ti-package" }}
              />
            </div>
          </div>

          {/* Kontingent-Info */}
          <div class="paper px-3 py-2 flex items-center justify-between text-xs">
            <span class="text-dimmed">
              Kontingent: <strong class="text-primary">{raffle.ticketContingent} Karten</strong> gesamt
              — {Math.max(0, raffle.ticketContingent - summary.totalRequestedTickets)} noch frei
            </span>
          </div>

          {/* ── Verlosungssteuerung ────────────────────────────────────────── */}
          <AdminRaffleControls raffleId={raffleId} status={raffle.status} />

          {/* ── Tabs ──────────────────────────────────────────────────────── */}
          <div class="flex gap-1 border-b border-zinc-100 dark:border-zinc-800">
            {[
              { id: "list", label: "Anmeldungen", icon: "ti-list" },
              { id: "fraud", label: "Betrugsfilter", icon: "ti-shield-search" },
              { id: "links", label: "Externe Links", icon: "ti-link" },
            ].map((t) => (
              <a
                href={`/admin/raffle/${raffleId}?tab=${t.id}`}
                class={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-dimmed hover:text-primary"
                }`}
              >
                <i class={`ti ${t.icon} mr-1`} />
                {t.label}
              </a>
            ))}
          </div>

          {/* ── Tab: Anmeldungsliste ──────────────────────────────────────── */}
          {tab === "list" ? (
            <>
              <div class="flex flex-wrap gap-1">
                {[
                  { key: undefined, label: "Alle" },
                  { key: "won", label: "Gewinner" },
                  { key: "lost", label: "Verlierer" },
                  { key: "pending", label: "Ausstehend" },
                  { key: "duplicate_email", label: "Doppelte Mails" },
                  { key: "duplicate_name", label: "Doppelte Namen" },
                ].map((f) => (
                  <a
                    href={`/admin/raffle/${raffleId}?tab=list${f.key ? `&filter=${f.key}` : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                    class={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      filter === f.key
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-zinc-200 dark:border-zinc-700 text-dimmed hover:border-zinc-400"
                    }`}
                  >
                    {f.label}
                  </a>
                ))}
              </div>

              <SearchBar
                action={`/admin/raffle/${raffleId}?tab=list${filter ? `&filter=${filter}` : ""}`}
                value={search}
                placeholder="Name oder E-Mail suchen..."
                ariaLabel="Anmeldungen suchen"
              />

              {registrations.items.length > 0 ? (
                <section class="paper overflow-hidden">
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="border-b border-zinc-100 dark:border-zinc-800">
                          <th class="px-3 py-2 text-left font-medium text-dimmed">Name</th>
                          <th class="px-3 py-2 text-left font-medium text-dimmed">E-Mail</th>
                          <th class="px-3 py-2 text-center font-medium text-dimmed">Gewünscht</th>
                          <th class="px-3 py-2 text-left font-medium text-dimmed">Gruppe</th>
                          <th class="px-3 py-2 text-left font-medium text-dimmed">Status</th>
                          <th class="px-3 py-2 text-center font-medium text-dimmed">Bezahlt</th>
                          <th class="px-3 py-2 text-center font-medium text-dimmed">Abgeholt</th>
                          <th class="w-px px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.items.map((r) => (
                          <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <td class="px-3 py-2 font-medium text-primary">{r.name}</td>
                            <td class="px-3 py-2 text-dimmed">{r.email}</td>
                            <td class="px-3 py-2 text-center text-dimmed">{r.requestedTickets}</td>
                            <td class="px-3 py-2 text-dimmed">
                              {r.groupName ? (
                                <span class="inline-flex items-center gap-1">
                                  <i class="ti ti-users text-xs" />
                                  {r.groupName}
                                </span>
                              ) : (
                                <span class="text-zinc-300 dark:text-zinc-600">—</span>
                              )}
                            </td>
                            <td class={`px-3 py-2 ${STATUS_CLASS[r.status]}`}>
                              {STATUS_LABEL[r.status]}
                              {r.status === "won" && r.wonTickets != null
                                ? ` (${r.wonTickets} Karte${r.wonTickets !== 1 ? "n" : ""})`
                                : ""}
                            </td>
                            <td class="px-3 py-2 text-center">
                              {r.paidAt ? (
                                <i class="ti ti-circle-check text-emerald-500" title={r.paidAt} />
                              ) : (
                                <i class="ti ti-circle text-zinc-300 dark:text-zinc-600" />
                              )}
                            </td>
                            <td class="px-3 py-2 text-center">
                              {r.collectedAt ? (
                                <i
                                  class="ti ti-circle-check text-emerald-500"
                                  title={r.collectedBy ? `Vollmacht: ${r.collectedBy}` : r.collectedAt}
                                />
                              ) : (
                                <i class="ti ti-circle text-zinc-300 dark:text-zinc-600" />
                              )}
                            </td>
                            <td class="px-3 py-2">
                              <a
                                href={`/admin/raffle/${raffleId}/${r.id}`}
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
                <p class="paper p-8 text-center text-xs text-dimmed">
                  {search || filter
                    ? "Keine Anmeldungen gefunden."
                    : "Noch keine Anmeldungen vorhanden."}
                </p>
              )}

              {totalPages > 1 ? (
                <Pagination currentPage={page} totalPages={totalPages} baseUrl={baseUrl} />
              ) : null}
            </>
          ) : null}

          {/* ── Tab: Betrugsfilter ────────────────────────────────────────── */}
          {tab === "fraud" ? <AdminFraudFilter raffleId={raffleId} /> : null}

          {/* ── Tab: Externe Links ────────────────────────────────────────── */}
          {tab === "links" ? <AdminLinks /> : null}

        </div>
      </div>
    </AdminLayout>
  );
});
