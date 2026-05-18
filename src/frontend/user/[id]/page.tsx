import { ssr } from "../../../config";
import { Layout } from "@valentinkolb/cloud/ssr";
import { StatCell, Pagination } from "@valentinkolb/cloud/ui";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { settings } from "@valentinkolb/cloud/services";
import { raffleService } from "@/service";
import UserRaffleControls from "../../UserRaffleControls.island";
import UserDeleteRaffle from "../../UserDeleteRaffle.island";
import UserRaffleSettings from "../../UserRaffleSettings.island";
import UserFraudFilter from "../../UserFraudFilter.island";
import UserRegistrationActions from "../../UserRegistrationActions.island";

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
  const user = c.get("user")!;
  const raffleId = c.req.param("id");

  const raffle = await raffleService.raffles.get(raffleId);

  if (!raffle || raffle.createdBy !== user.id) {
    return () => (
      <Layout c={c} title="Nicht gefunden">
        <div class="max-w-2xl mx-auto pt-12 text-center">
          <i class="ti ti-alert-circle text-3xl text-dimmed mb-3 block" />
          <p class="text-sm text-dimmed">Verlosung nicht gefunden oder keine Berechtigung.</p>
          <a href="/app/raffle/my" class="btn-secondary btn-sm mt-4 inline-block">
            <i class="ti ti-arrow-left mr-1" /> Meine Verlosungen
          </a>
        </div>
      </Layout>
    );
  }

  const tab = (c.req.query("tab") ?? "list") as "list" | "fraud";
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const search = (c.req.query("search") ?? "").trim();
  const filter = c.req.query("filter") as "won" | "lost" | "pending" | undefined;

  const [summary, registrations, defaultAgbText, defaultReplyTo, defaultRegSubject, defaultRegBody, defaultWinSubject, defaultWinBody, defaultLossSubject, defaultLossBody] = await Promise.all([
    raffleService.registrations.getAdminSummary({ raffleId }),
    raffleService.registrations.listAdmin({
      raffleId,
      search: search || undefined,
      filter,
      pagination: { page, perPage: PER_PAGE },
    }),
    settings.get<string>("raffle.agb_text"),
    settings.get<string>("raffle.reply_to_email"),
    settings.get<string>("raffle.reg_email_subject"),
    settings.get<string>("raffle.reg_email_body"),
    settings.get<string>("raffle.win_email_subject"),
    settings.get<string>("raffle.win_email_body"),
    settings.get<string>("raffle.loss_email_subject"),
    settings.get<string>("raffle.loss_email_body"),
  ]);

  const totalPages = Math.ceil(registrations.total / PER_PAGE);
  const baseUrl = `/app/raffle/my/${raffleId}?tab=list${search ? `&search=${encodeURIComponent(search)}` : ""}${filter ? `&filter=${filter}` : ""}&page=`;

  const statusLabel =
    raffle.status === "open"
      ? "Anmeldung offen"
      : raffle.status === "raffled"
        ? "Verlost – Mails ausstehend"
        : "Abgeschlossen";
  const statusTone =
    raffle.status === "open" ? "blue" : raffle.status === "raffled" ? "amber" : "emerald";

  return () => (
    <Layout c={c} title={raffle.name}>
      <div class="max-w-3xl mx-auto pb-12">
        <div class="flex flex-col gap-3">

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <a href="/app/raffle/my" class="btn-simple btn-sm">
                <i class="ti ti-arrow-left mr-1" /> Meine Verlosungen
              </a>
              <h1 class="text-base font-semibold text-primary">{raffle.name}</h1>
            </div>
            <div class="flex items-center gap-2">
              {raffle.status === "raffled" || raffle.status === "finalized" ? (
                <a href={`/app/raffle/my/${raffleId}/scanner`} class="btn-secondary btn-sm">
                  <i class="ti ti-qrcode mr-1" /> Scanner
                </a>
              ) : null}
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
              <UserDeleteRaffle
                raffleId={raffleId}
                raffleName={raffle.name}
                registrationCount={summary.total}
              />
            </div>
          </div>

          {/* ── Statistik ────────────────────────────────────────────────────── */}
          <div class="paper overflow-hidden">
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px p-px bg-zinc-100 dark:bg-zinc-800">
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
                value={summary.collected}
                sub={summary.won > 0 ? `von ${summary.won} Gewinnern` : "noch keine"}
                accent={{ tone: "purple", icon: "ti ti-package-check" }}
              />
              <StatCell
                label="Kontingent"
                value={raffle.ticketContingent}
                sub={`${Math.max(0, raffle.ticketContingent - summary.totalRequestedTickets)} noch frei`}
                accent={{ tone: "amber", icon: "ti ti-ticket" }}
              />
            </div>
          </div>

          {/* ── Verlosungssteuerung ──────────────────────────────────────────── */}
          <UserRaffleControls raffleId={raffleId} status={raffle.status} />

          {/* ── Einstellungen ────────────────────────────────────────────────── */}
          <UserRaffleSettings
            raffleId={raffleId}
            name={raffle.name}
            description={raffle.description}
            ticketContingent={raffle.ticketContingent}
            totalRequestedTickets={summary.totalRequestedTickets}
            allowedEmailPatterns={raffle.allowedEmailPatterns}
            bannerUrl={raffle.bannerUrl}
            bannerPosition={raffle.bannerPosition}
            faqItems={raffle.faqItems}
            agbText={raffle.agbText}
            regEmailSubject={raffle.regEmailSubject}
            regEmailBody={raffle.regEmailBody}
            defaults={{
              agbText: defaultAgbText ?? "",
              replyToEmail: defaultReplyTo ?? "",
              regEmailSubject: defaultRegSubject ?? "",
              regEmailBody: defaultRegBody ?? "",
              winEmailSubject: defaultWinSubject ?? "",
              winEmailBody: defaultWinBody ?? "",
              lossEmailSubject: defaultLossSubject ?? "",
              lossEmailBody: defaultLossBody ?? "",
            }}
            emailConfig={{
              replyToEmail: raffle.replyToEmail,
              winEmailSubject: raffle.winEmailSubject,
              winEmailBody: raffle.winEmailBody,
              lossEmailSubject: raffle.lossEmailSubject,
              lossEmailBody: raffle.lossEmailBody,
            }}
          />

          {/* ── Tabs ─────────────────────────────────────────────────────────── */}
          <div class="flex gap-1 border-b border-zinc-100 dark:border-zinc-800">
            {[
              { id: "list", label: "Anmeldungen", icon: "ti-list" },
              { id: "fraud", label: "Betrugsfilter", icon: "ti-shield-search" },
            ].map((t) => (
              <a
                href={`/app/raffle/my/${raffleId}?tab=${t.id}`}
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

          {/* ── Tab: Anmeldungen ─────────────────────────────────────────────── */}
          {tab === "list" ? (
            <>
              <div class="flex flex-wrap gap-1">
                {[
                  { key: undefined, label: "Alle" },
                  { key: "won", label: "Gewinner" },
                  { key: "lost", label: "Verlierer" },
                  { key: "pending", label: "Ausstehend" },
                ].map((f) => (
                  <a
                    href={`/app/raffle/my/${raffleId}?tab=list${f.key ? `&filter=${f.key}` : ""}`}
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

              {registrations.items.length > 0 ? (
                <section class="paper overflow-hidden">
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="border-b border-zinc-100 dark:border-zinc-800">
                          <th class="px-3 py-2 text-left font-medium text-dimmed">Name</th>
                          <th class="px-3 py-2 text-left font-medium text-dimmed">E-Mail</th>
                          <th class="px-3 py-2 text-center font-medium text-dimmed">
                            Karten
                            <span class="group relative inline-block align-middle ml-1">
                              <i class="ti ti-info-circle text-dimmed text-[10px] cursor-help" />
                              <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 max-w-[200px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight font-normal">
                                Bei Gewinnern wird die tatsaechliche Gewinnkartenzahl angezeigt, sonst die angeforderte Anzahl.
                              </span>
                            </span>
                          </th>
                          <th class="px-3 py-2 text-left font-medium text-dimmed">
                            Status
                            <span class="group relative inline-block align-middle ml-1">
                              <i class="ti ti-info-circle text-dimmed text-[10px] cursor-help" />
                              <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 max-w-[200px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight font-normal">
                                Ausstehend = noch nicht verlost. Gewonnen = hat Karten erhalten. Verloren = kein Glueck.
                              </span>
                            </span>
                          </th>
                          <th class="w-px px-3 py-2 text-left font-medium text-dimmed">
                            Aktion
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.items.map((r) => (
                          <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                            <td class="px-3 py-2 font-medium text-primary">{r.name}</td>
                            <td class="px-3 py-2 text-dimmed">{r.email}</td>
                            <td class="px-3 py-2 text-center text-dimmed">
                              {r.status === "won" && r.wonTickets != null ? r.wonTickets : r.requestedTickets}
                            </td>
                            <td class={`px-3 py-2 ${STATUS_CLASS[r.status]}`}>
                              {STATUS_LABEL[r.status]}
                            </td>
                            <td class="px-3 py-2">
                              {r.status === "won" ? (
                                <UserRegistrationActions
                                  raffleId={raffleId}
                                  registrationId={r.id}
                                  paidAt={r.paidAt}
                                  collectedAt={r.collectedAt}
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p class="paper p-8 text-center text-xs text-dimmed">
                  {filter ? "Keine Anmeldungen gefunden." : "Noch keine Anmeldungen vorhanden."}
                </p>
              )}

              {totalPages > 1 ? (
                <Pagination currentPage={page} totalPages={totalPages} baseUrl={baseUrl} />
              ) : null}
            </>
          ) : null}

          {/* ── Tab: Betrugsfilter ────────────────────────────────────────────── */}
          {tab === "fraud" ? <UserFraudFilter raffleId={raffleId} /> : null}

        </div>
      </div>
    </Layout>
  );
});
