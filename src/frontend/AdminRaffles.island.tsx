import { createResource, createSignal, For, Show } from "solid-js";
import { prompts } from "@valentinkolb/cloud/ui";
import type { RaffleItem } from "@/contracts";

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

export default function AdminRaffles() {
  const [raffles, { refetch }] = createResource<RaffleItem[]>(async () => {
    const res = await fetch("/api/raffle/admin/raffles");
    if (!res.ok) return [];
    return res.json();
  });

  const [deleting, setDeleting] = createSignal<string | null>(null);

  const deleteRaffle = async (raffle: RaffleItem) => {
    const confirmed = await prompts.confirm(
      `Verlosung „${raffle.name}" unwiderruflich löschen?\n\n` +
        `⚠️ Dabei werden ALLE Daten dieser Verlosung dauerhaft gelöscht:\n` +
        `• ${raffle.registrationCount} Anmeldung${raffle.registrationCount !== 1 ? "en" : ""}\n` +
        `• Alle Gruppen und Ereignis-Protokolle\n\n` +
        `Diese Aktion kann nicht rückgängig gemacht werden.`,
      { title: "Verlosung löschen" },
    );
    if (!confirmed) return;

    setDeleting(raffle.id);
    try {
      const res = await fetch(`/api/raffle/admin/raffles/${raffle.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler beim Löschen.");
        return;
      }
      refetch();
    } catch {
      await prompts.error("Verbindungsfehler beim Löschen.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <Show when={raffles.loading}>
        <p class="text-xs text-dimmed py-4 text-center">
          <i class="ti ti-loader-2 animate-spin mr-1" /> Lädt…
        </p>
      </Show>

      <Show when={!raffles.loading}>
        <div class="paper overflow-hidden">
          <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span class="text-xs font-medium text-dimmed">
              {(raffles() ?? []).length} Verlosung{(raffles() ?? []).length !== 1 ? "en" : ""}
            </span>
          </div>

          <Show when={(raffles() ?? []).length === 0}>
            <p class="text-xs text-dimmed text-center py-6">Keine Verlosungen vorhanden.</p>
          </Show>

          <Show when={(raffles() ?? []).length > 0}>
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
                  <For each={raffles()}>
                    {(raffle) => (
                      <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td class="px-3 py-2">
                          <p class="font-medium text-primary">{raffle.name}</p>
                          <Show when={raffle.description}>
                            <p class="text-dimmed truncate max-w-xs">{raffle.description}</p>
                          </Show>
                        </td>
                        <td class="px-3 py-2">
                          <span class={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[raffle.status]}`}>
                            {STATUS_LABEL[raffle.status]}
                          </span>
                        </td>
                        <td class="px-3 py-2 text-center text-dimmed">{raffle.ticketContingent}</td>
                        <td class="px-3 py-2 text-center text-dimmed">{raffle.registrationCount}</td>
                        <td class="px-3 py-2">
                          <div class="flex items-center gap-1 justify-end">
                            <a href={`/app/raffle/my/${raffle.id}`} class="btn-secondary btn-sm">
                              Verwalten
                            </a>
                            <button
                              class="btn-danger btn-sm shrink-0"
                              disabled={deleting() === raffle.id}
                              onClick={() => deleteRaffle(raffle)}
                            >
                              {deleting() === raffle.id ? (
                                <i class="ti ti-loader-2 animate-spin" />
                              ) : (
                                <i class="ti ti-trash" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
