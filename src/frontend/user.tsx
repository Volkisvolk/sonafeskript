import { ssr } from "../config";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { Layout } from "@valentinkolb/cloud/ssr";
import { raffleService } from "@/service";
import UserCreateRaffle from "./UserCreateRaffle.island";

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
  const user = c.get("user")!;
  const raffles = await raffleService.raffles.listByUser(user.id);

  return () => (
    <Layout c={c} title="Meine Verlosungen">
      <div class="max-w-2xl mx-auto pb-12">

        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-primary">Meine Verlosungen</h1>
            <p class="text-sm text-dimmed mt-0.5">Verlosungen, die du erstellt hast</p>
          </div>
          <div class="flex items-center gap-2">
            <a href="/app/raffle/registrations" class="btn-secondary btn-sm">
              <i class="ti ti-ticket mr-1" />Meine Anmeldungen
            </a>
            <a href="/app/raffle" class="btn-secondary btn-sm">
              <i class="ti ti-arrow-left mr-1" />Übersicht
            </a>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <UserCreateRaffle />

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
                        <td class="px-3 py-2">
                          <a href={`/app/raffle/my/${raffle.id}`} class="btn-secondary btn-sm">
                            Verwalten
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
              <p class="text-sm text-dimmed">Du hast noch keine Verlosungen erstellt.</p>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
});
