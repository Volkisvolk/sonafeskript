import { ssr } from "../../config";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { Layout } from "@valentinkolb/cloud/ssr";
import { settings } from "@valentinkolb/cloud/services";
import { raffleService } from "@/service";
import RegisterForm from "../RegisterForm.island";
import { parseLinks } from "../lib/links";
import RaffleFaq from "../RaffleFaq.island";

export default ssr<AuthContext>(async (c) => {
  const id = c.req.param("id")!;

  const raffle = await raffleService.raffles.get(id);

  if (!raffle) {
    return () => (
      <Layout c={c} title="Nicht gefunden">
        <div class="max-w-2xl mx-auto pb-12 text-center py-16">
          <i class="ti ti-ticket-off text-3xl text-dimmed mb-3 block" />
          <p class="text-base font-semibold text-primary mb-1">Verlosung nicht gefunden</p>
          <p class="text-sm text-dimmed mb-4">Diese Verlosung existiert nicht oder wurde gelöscht.</p>
          <a href="/app/raffle" class="btn-secondary btn-sm">
            <i class="ti ti-arrow-left mr-1" /> Zurück zur Übersicht
          </a>
        </div>
      </Layout>
    );
  }

  const [globalAgbText, globalBannerUrl, stats] = await Promise.all([
    settings.get<string>("raffle.agb_text"),
    settings.get<string>("raffle.banner_url"),
    raffleService.registrations.getStats({ raffleId: id }),
  ]);

  const bannerUrl = raffle.bannerUrl || globalBannerUrl;
  const agbText = raffle.agbText || globalAgbText || "";

  const remaining = Math.max(0, raffle.ticketContingent - stats.totalRequestedTickets);
  const pct = raffle.ticketContingent === 0
    ? 0
    : Math.min(100, Math.round((stats.totalRequestedTickets / raffle.ticketContingent) * 100));
  const overbooked = stats.totalRequestedTickets >= raffle.ticketContingent;

  return () => (
    <Layout c={c} title={raffle.name}>
      <div class="max-w-2xl mx-auto pb-12">

        {/* ── Zurück ──────────────────────────────────────────────────────── */}
        <div class="mb-4">
          <a href="/app/raffle" class="btn-simple btn-sm">
            <i class="ti ti-arrow-left mr-1" /> Alle Verlosungen
          </a>
        </div>

        {/* ── Banner ──────────────────────────────────────────────────────── */}
        {bannerUrl ? (
          <div class="mb-6 rounded-xl overflow-hidden">
            <img src={bannerUrl} alt="Verlosungs-Banner" class="w-full object-cover max-h-48" style={`object-position: ${raffle.bannerPosition ?? "50% 50%"}`} />
          </div>
        ) : null}

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 thumbnail bg-blue-100 dark:bg-blue-900/40 mb-4">
            <i class="ti ti-ticket text-3xl text-blue-600 dark:text-blue-400" />
          </div>
          <h1 class="text-2xl font-bold text-primary mb-1">{raffle.name}</h1>
          {raffle.description ? (
            <p class="text-sm text-dimmed" innerHTML={parseLinks(raffle.description)} />
          ) : (
            <p class="text-sm text-dimmed">Melde dich an und nimm an der Verlosung teil.</p>
          )}
        </div>

        {/* ── Statistiken ─────────────────────────────────────────────────── */}
        <div class="paper p-4 mb-4">
          <p class="section-label mb-3">Aktueller Stand</p>
          <div class="flex items-end justify-between gap-2 mb-2">
            <div>
              <span class="text-2xl font-bold text-primary">{stats.totalRequestedTickets}</span>
              <span class="text-sm text-dimmed ml-1">von {raffle.ticketContingent} Karten angefordert</span>
            </div>
            <span class="text-sm text-dimmed">
              {overbooked ? "Anmeldung offen" : `${remaining} frei`}
            </span>
          </div>
          <div class="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              class={`h-full rounded-full transition-all ${overbooked ? "bg-blue-500" : pct >= 90 ? "bg-amber-500" : "bg-blue-500"}`}
              style={`width: ${pct}%`}
            />
          </div>
          {overbooked ? (
            <div class="info-block-info px-3 py-2 mt-2 text-xs flex items-center gap-2">
              <i class="ti ti-arrow-shuffle shrink-0" />
              <span>Es haben sich mehr Personen angemeldet als Karten vorhanden sind — das ist normal und gewollt. Du kannst dich trotzdem anmelden! Wer eine Karte erhält, wird anschließend per Verlosung zufällig ausgewählt.</span>
            </div>
          ) : (
            <p class="text-xs text-dimmed mt-1 text-right">{pct}% des Kontingents</p>
          )}
        </div>

        {/* ── Status-Meldung oder Formular ─────────────────────────────────── */}
        {raffle.status === "open" ? (
          <RegisterForm
            raffleId={raffle.id}
            agbText={agbText ?? ""}
            remaining={remaining}
          />
        ) : raffle.status === "raffled" ? (
          <div class="info-block-info p-4 mb-4">
            <div class="flex items-start gap-3">
              <i class="ti ti-clock text-xl shrink-0 mt-0.5" />
              <div>
                <p class="font-semibold">Die Verlosung wurde durchgeführt</p>
                <p class="text-sm mt-1">
                  Die Gewinner wurden bereits ausgelost. Die Benachrichtigungs-Mails
                  werden in Kürze verschickt. Bitte schau in dein E-Mail-Postfach!
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div class="info-block-info p-4 mb-4">
            <div class="flex items-start gap-3">
              <i class="ti ti-mail text-xl shrink-0 mt-0.5" />
              <div>
                <p class="font-semibold">Benachrichtigungen wurden verschickt</p>
                <p class="text-sm mt-1">
                  Die Verlosung ist abgeschlossen. Alle Teilnehmer haben eine
                  Benachrichtigungs-Mail erhalten. Überprüfe dein Postfach!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── FAQ ─────────────────────────────────────────────────────────── */}
        <RaffleFaq items={raffle.faqItems} />

      </div>
    </Layout>
  );
});
