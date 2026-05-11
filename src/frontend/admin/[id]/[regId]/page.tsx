import { ssr } from "../../../../config";
import { AdminLayout } from "@valentinkolb/cloud/ssr";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { raffleService } from "@/service";
import AdminTicketActions from "../../../AdminTicketActions.island";
import AdminEditRegistration from "../../../AdminEditRegistration.island";

const EVENT_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  paid: { label: "Bezahlt", icon: "ti-coin", color: "text-emerald-600" },
  paid_reverted: { label: "Bezahlung zurückgesetzt", icon: "ti-coin-off", color: "text-red-500" },
  collected: { label: "Abgeholt (Okily Dokily)", icon: "ti-package", color: "text-emerald-600" },
  collected_reverted: { label: "Abholung zurückgesetzt", icon: "ti-package-off", color: "text-red-500" },
  collected_by_proxy: { label: "Per Vollmacht abgeholt", icon: "ti-user-check", color: "text-blue-600" },
  tickets_adjusted: { label: "Karten angepasst", icon: "ti-pencil", color: "text-amber-600" },
  removed_by_admin: { label: "Durch Admin entfernt", icon: "ti-trash", color: "text-red-500" },
};

export default ssr<AuthContext>(async (c) => {
  const raffleId = c.req.param("id");
  const regId = c.req.param("regId");

  const [reg, events] = await Promise.all([
    raffleService.registrations.get({ id: regId }),
    raffleService.tickets.getEvents({ registrationId: regId }),
  ]);

  if (!reg) {
    return () => (
      <AdminLayout c={c} title="Nicht gefunden">
        <div class="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <i class="ti ti-alert-circle text-2xl text-dimmed" />
          <p class="text-sm text-dimmed">Anmeldung nicht gefunden.</p>
          <a href={`/admin/raffle/${raffleId}`} class="btn-secondary btn-sm">
            <i class="ti ti-arrow-left mr-1" /> Zurück zur Verlosung
          </a>
        </div>
      </AdminLayout>
    );
  }

  const statusLabel =
    reg.status === "won" ? "Gewonnen" : reg.status === "lost" ? "Verloren" : "Ausstehend";
  const statusColor =
    reg.status === "won"
      ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
      : reg.status === "lost"
        ? "text-red-500 bg-red-50 dark:bg-red-900/20"
        : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20";

  return () => (
    <AdminLayout
      c={c}
      title={[
        { title: "Verlosungen", href: "/admin/raffle" },
        { title: "Verlosung", href: `/admin/raffle/${raffleId}` },
        { title: reg.name },
      ]}
    >
      <div class="flex-1 min-h-0 overflow-y-auto">
        <div class="max-w-2xl mx-auto flex flex-col gap-3">

          {/* ── Zurück-Link ─────────────────────────────────────────────── */}
          <div>
            <a href={`/admin/raffle/${raffleId}`} class="btn-simple btn-sm">
              <i class="ti ti-arrow-left mr-1" /> Zurück zur Verlosung
            </a>
          </div>

          {/* ── Stammdaten ──────────────────────────────────────────────── */}
          <div class="paper p-4">
            <div class="flex items-start justify-between gap-2 mb-3">
              <div>
                <h2 class="text-base font-semibold text-primary">{reg.name}</h2>
                <p class="text-sm text-dimmed">{reg.email}</p>
              </div>
              <span class={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor}`}>
                {statusLabel}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="text-xs text-dimmed mb-0.5">Gewünschte Karten</p>
                <p class="font-medium">{reg.requestedTickets}</p>
              </div>
              {reg.status === "won" ? (
                <div>
                  <p class="text-xs text-dimmed mb-0.5">Gewonnene Karten</p>
                  <p class="font-medium text-emerald-600">{reg.wonTickets}</p>
                </div>
              ) : null}
              <div>
                <p class="text-xs text-dimmed mb-0.5">Gruppe</p>
                <p class="font-medium">
                  {reg.groupName ? (
                    <span class="flex items-center gap-1">
                      <i class="ti ti-users text-xs text-dimmed" />
                      {reg.groupName}
                      {reg.groupInviteCode ? (
                        <span class="text-xs text-dimmed ml-1">({reg.groupInviteCode})</span>
                      ) : null}
                    </span>
                  ) : (
                    <span class="text-dimmed">Keine Gruppe</span>
                  )}
                </p>
              </div>
              <div>
                <p class="text-xs text-dimmed mb-0.5">Angemeldet am</p>
                <p class="font-medium">
                  {new Date(reg.createdAt).toLocaleString("de-DE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>

            {reg.qrToken ? (
              <div class="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <p class="text-xs text-dimmed mb-1">QR-Token</p>
                <p class="text-xs font-mono text-dimmed break-all">{reg.qrToken}</p>
              </div>
            ) : null}
          </div>

          {/* ── Ticket-Aktionen (nur für Gewinner) ──────────────────────── */}
          {reg.status === "won" ? (
            <AdminTicketActions
              raffleId={raffleId}
              registrationId={reg.id}
              paidAt={reg.paidAt}
              collectedAt={reg.collectedAt}
              collectedBy={reg.collectedBy}
              wonTickets={reg.wonTickets ?? 1}
            />
          ) : null}

          {/* ── Stammdaten bearbeiten ────────────────────────────────────── */}
          <AdminEditRegistration
            raffleId={raffleId}
            registrationId={reg.id}
            currentName={reg.name}
            currentEmail={reg.email}
            currentRequestedTickets={reg.requestedTickets}
            hasGroup={!!reg.groupId}
          />

          {/* ── Ereignis-Log ────────────────────────────────────────────── */}
          {events.length > 0 ? (
            <div class="paper p-4">
              <p class="section-label mb-3">Ereignis-Protokoll</p>
              <div class="flex flex-col gap-2">
                {events.map((ev) => {
                  const meta = EVENT_LABELS[ev.eventType] ?? {
                    label: ev.eventType,
                    icon: "ti-info-circle",
                    color: "text-dimmed",
                  };
                  return (
                    <div class="flex items-start gap-2 text-xs">
                      <i class={`ti ${meta.icon} ${meta.color} mt-0.5 shrink-0`} />
                      <div class="flex-1">
                        <span class={`font-medium ${meta.color}`}>{meta.label}</span>
                        {ev.details ? (
                          <span class="text-dimmed ml-1">— {ev.details}</span>
                        ) : null}
                        {ev.performedBy ? (
                          <span class="text-dimmed ml-1">von {ev.performedBy}</span>
                        ) : null}
                      </div>
                      <time class="text-dimmed shrink-0">
                        {new Date(ev.createdAt).toLocaleString("de-DE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </AdminLayout>
  );
});
