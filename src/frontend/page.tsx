import { ssr } from "../config";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { Layout } from "@valentinkolb/cloud/ssr";
import { raffleService } from "@/service";
import { LinkText } from "./lib/links";

export default ssr<AuthContext>(async (c) => {
  const user = c.get("user");
  const [raffles, links] = await Promise.all([
    raffleService.raffles.listOpen(),
    raffleService.links.listAll(),
  ]);

  return () => (
    <Layout c={c} title="Verlosungen">
      <div class="max-w-2xl mx-auto pb-12">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 thumbnail bg-blue-100 dark:bg-blue-900/40 mb-4">
            <i class="ti ti-ticket text-3xl text-blue-600 dark:text-blue-400" />
          </div>
          <h1 class="text-2xl font-bold text-primary mb-1">Kartenverlosungen</h1>
          <p class="text-sm text-dimmed">
            Wähle eine Verlosung aus und melde dich an.
          </p>
          {user ? (
            <div class="flex items-center justify-center gap-2 mt-3 flex-wrap">
              <a href="/app/raffle/registrations" class="btn-primary btn-sm inline-flex items-center gap-1">
                <i class="ti ti-ticket" />Meine Anmeldungen
              </a>
              <a href="/app/raffle/my" class="btn-secondary btn-sm inline-flex items-center gap-1">
                <i class="ti ti-settings" />Meine Verlosungen
              </a>
            </div>
          ) : null}
        </div>

        {/* ── Verlosungsliste ─────────────────────────────────────────────── */}
        {raffles.length > 0 ? (
          <div class="flex flex-col gap-4 mb-8">
            {raffles.map((raffle) => {
              const pct = raffle.ticketContingent === 0
                ? 0
                : Math.min(100, Math.round((raffle.totalRequestedTickets / raffle.ticketContingent) * 100));
              const remaining = Math.max(0, raffle.ticketContingent - raffle.totalRequestedTickets);
              const overbooked = raffle.totalRequestedTickets >= raffle.ticketContingent;

              return (
                <div class="paper overflow-hidden">
                  {raffle.bannerUrl ? (
                    <img src={raffle.bannerUrl} alt="" class="w-full object-cover max-h-36" style={`object-position: ${raffle.bannerPosition ?? "50% 50%"}`} />
                  ) : null}
                  <div class="p-5">
                  <div class="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h2 class="text-base font-semibold text-primary">{raffle.name}</h2>
                      {raffle.description ? (
                        <LinkText text={raffle.description} class="text-sm text-dimmed mt-1 block" />
                      ) : null}
                    </div>
                    <span class="text-xs font-medium px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 shrink-0">
                      <i class="ti ti-lock-open mr-1" />
                      Offen
                    </span>
                  </div>

                  <div class="flex items-end justify-between gap-2 mb-2">
                    <div>
                      <span class="text-xl font-bold text-primary">{raffle.totalRequestedTickets}</span>
                      <span class="text-sm text-dimmed ml-1">von {raffle.ticketContingent} Karten angefordert</span>
                    </div>
                    <span class="text-sm text-dimmed">
                      {overbooked ? "Anmeldung offen" : `${remaining} frei`}
                    </span>
                  </div>
                  <div class="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mb-2">
                    <div
                      class={`h-full rounded-full transition-all ${overbooked ? "bg-blue-500" : pct >= 90 ? "bg-amber-500" : "bg-blue-500"}`}
                      style={`width: ${pct}%`}
                    />
                  </div>
                  {overbooked ? (
                    <div class="info-block-info px-3 py-2 mb-3 text-xs flex items-center gap-2">
                      <i class="ti ti-arrow-shuffle shrink-0" />
                      <span>Es haben sich mehr Personen angemeldet als Karten vorhanden sind — das ist normal und gewollt. Du kannst dich trotzdem anmelden! Wer eine Karte erhält, wird anschließend per Verlosung zufällig ausgewählt.</span>
                    </div>
                  ) : (
                    <div class="mb-4" />
                  )}

                  <a
                    href={`/app/raffle/${raffle.id}`}
                    class="btn-primary btn-md w-full text-center block"
                  >
                    <i class="ti ti-arrow-right mr-2" />
                    Jetzt anmelden
                  </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div class="paper p-8 text-center mb-8">
            <i class="ti ti-ticket-off text-3xl text-dimmed mb-3 block" />
            <p class="text-base font-semibold text-primary mb-1">Keine offenen Verlosungen</p>
            <p class="text-sm text-dimmed">
              Momentan gibt es keine aktiven Verlosungen. Schau später wieder vorbei!
            </p>
          </div>
        )}

        {/* ── Externe Links ────────────────────────────────────────────────── */}
        {links.length > 0 ? (
          <div class="paper p-4">
            <p class="section-label mb-3">Weitere Informationen</p>
            <div class="flex flex-col gap-2">
              {links.map((link) => (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <i class="ti ti-external-link text-dimmed" />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

      </div>
    </Layout>
  );
});
