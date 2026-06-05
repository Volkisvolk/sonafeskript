import { ssr } from "../../config";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { Layout } from "@valentinkolb/cloud/ssr";
import { settings } from "@valentinkolb/cloud/services";
import { raffleService } from "@/service";
import MyRegistrationEdit from "../MyRegistrationEdit.island";

const STATUS_LABEL: Record<string, string> = {
  pending: "Ausstehend",
  won: "Gewonnen",
  lost: "Verloren",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  won: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const RAFFLE_STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  raffled: "Verlost",
  finalized: "Abgeschlossen",
};

export default ssr<AuthContext>(async (c) => {
  const user = c.get("user")!;

  if (!user.mail) {
    return () => (
      <Layout c={c} title="Meine Anmeldungen">
        <div class="max-w-2xl mx-auto pt-16 text-center">
          <p class="text-sm text-dimmed">Dein Account hat keine E-Mail-Adresse.</p>
        </div>
      </Layout>
    );
  }

  const [registrations, maxGroupSize] = await Promise.all([
    raffleService.registrations.listByEmail(user.mail),
    settings.get<number>("raffle.max_group_size").then((v) => v ?? 4),
  ]);

  return () => (
    <Layout c={c} title="Meine Anmeldungen">
      <div class="max-w-2xl mx-auto pb-12">

        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-primary">Meine Anmeldungen</h1>
            <p class="text-sm text-dimmed mt-0.5">Verlosungen, für die du angemeldet bist</p>
          </div>
          <a href="/app/raffle" class="btn-secondary btn-sm">
            <i class="ti ti-arrow-left mr-1" />Übersicht
          </a>
        </div>

        {registrations.length === 0 ? (
          <div class="paper p-8 text-center">
            <i class="ti ti-ticket-off text-2xl text-dimmed mb-2 block" />
            <p class="text-sm text-dimmed">Du bist noch bei keiner Verlosung angemeldet.</p>
            <a href="/app/raffle" class="btn-primary btn-sm mt-4 inline-block">
              <i class="ti ti-ticket mr-1" />Verlosungen anschauen
            </a>
          </div>
        ) : (
          <div class="flex flex-col gap-4">
            {registrations.map((reg) => (
              <div class="paper p-4">
                <div class="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <a href={`/app/raffle/${reg.raffleId}`} class="font-semibold text-primary hover:underline">
                      {reg.raffleName}
                    </a>
                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                      <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[reg.status]}`}>
                        {STATUS_LABEL[reg.status]}
                      </span>
                      <span class="text-xs text-dimmed">
                        Verlosung: {RAFFLE_STATUS_LABEL[reg.raffleStatus] ?? reg.raffleStatus}
                      </span>
                      {reg.wonTickets != null && (
                        <span class="text-xs text-dimmed">
                          <i class="ti ti-tickets mr-0.5" />{reg.wonTickets} Karte{reg.wonTickets !== 1 ? "n" : ""} gewonnen
                        </span>
                      )}
                    </div>
                  </div>
                  <span class="text-xs text-dimmed shrink-0">
                    {new Date(reg.createdAt).toLocaleDateString("de-DE")}
                  </span>
                </div>

                <MyRegistrationEdit
                  registration={reg}
                  raffleId={reg.raffleId!}
                  raffleName={reg.raffleName}
                  raffleStatus={reg.raffleStatus}
                  maxGroupSize={maxGroupSize}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
});
