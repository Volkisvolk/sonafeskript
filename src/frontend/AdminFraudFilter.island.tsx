import { createResource, createSignal, For, Show } from "solid-js";
import { prompts } from "@valentinkolb/cloud/ui";
import type { SimilarNamePair } from "@/contracts";

interface Props {
  raffleId: string;
}

export default function AdminFraudFilter(props: Props) {
  const [pairs, { refetch }] = createResource<SimilarNamePair[]>(async () => {
    const res = await fetch(`/api/raffle/admin/raffles/${props.raffleId}/fraud-filter`);
    if (!res.ok) return [];
    return res.json();
  });

  const [deleting, setDeleting] = createSignal<string | null>(null);

  const deleteRegistration = async (id: string, name: string, email: string) => {
    const reason = await prompts.form({
      title: "Anmeldung entfernen",
      icon: "ti ti-trash",
      fields: {
        reason: {
          type: "text",
          label: "Begründung (wird protokolliert)",
          required: true,
          placeholder: "z.B. Doppelte Anmeldung, identisch mit ...",
        },
      },
    });
    if (!reason) return;

    setDeleting(id);
    try {
      const res = await fetch(
        `/api/raffle/admin/raffles/${props.raffleId}/registrations/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json();
        await prompts.error(body.message ?? "Fehler beim Löschen.");
        return;
      }
      await prompts.alert(`Anmeldung von ${name} (${email}) wurde entfernt.`, {
        title: "Entfernt",
      });
      refetch();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="info-block-warning p-3 text-xs">
        <i class="ti ti-shield-search mr-1" />
        <strong>Betrugsfilter:</strong> Die folgende Liste zeigt Paare mit ähnlichen Namen (Ähnlichkeit &gt; 45%).
        Überprüfe diese Paare vor der Verlosung und entferne ggf. Doppelanmeldungen.
      </div>

      <Show when={pairs.loading}>
        <p class="text-xs text-dimmed text-center py-4">
          <i class="ti ti-loader-2 animate-spin mr-1" /> Wird geladen…
        </p>
      </Show>

      <Show when={!pairs.loading && (pairs() ?? []).length === 0}>
        <div class="paper p-6 text-center">
          <i class="ti ti-shield-check text-2xl text-emerald-500 mb-2 block" />
          <p class="text-sm text-dimmed">Keine verdächtigen Namensähnlichkeiten gefunden.</p>
        </div>
      </Show>

      <Show when={(pairs() ?? []).length > 0}>
        <div class="paper overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-zinc-100 dark:border-zinc-800">
                  <th class="px-3 py-2 text-left font-medium text-dimmed">Person A</th>
                  <th class="px-3 py-2 text-left font-medium text-dimmed">Person B</th>
                  <th class="px-3 py-2 text-center font-medium text-dimmed">Ähnlichkeit</th>
                  <th class="w-px px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                <For each={pairs()}>
                  {(pair) => (
                    <tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                      <td class="px-3 py-2">
                        <p class="font-medium text-primary">{pair.a.name}</p>
                        <p class="text-dimmed">{pair.a.email}</p>
                        <a
                          href={`/admin/raffle/${props.raffleId}/${pair.a.id}`}
                          class="text-blue-600 hover:underline"
                        >
                          Details
                        </a>
                      </td>
                      <td class="px-3 py-2">
                        <p class="font-medium text-primary">{pair.b.name}</p>
                        <p class="text-dimmed">{pair.b.email}</p>
                        <a
                          href={`/admin/raffle/${props.raffleId}/${pair.b.id}`}
                          class="text-blue-600 hover:underline"
                        >
                          Details
                        </a>
                      </td>
                      <td class="px-3 py-2 text-center">
                        <span
                          class={`font-bold ${
                            pair.similarity > 0.8
                              ? "text-red-500"
                              : pair.similarity > 0.6
                                ? "text-amber-600"
                                : "text-dimmed"
                          }`}
                        >
                          {Math.round(pair.similarity * 100)}%
                        </span>
                      </td>
                      <td class="px-3 py-2">
                        <div class="flex gap-1">
                          <button
                            class="btn-danger btn-sm"
                            disabled={deleting() === pair.a.id}
                            onClick={() => deleteRegistration(pair.a.id, pair.a.name, pair.a.email)}
                          >
                            {deleting() === pair.a.id ? (
                              <i class="ti ti-loader-2 animate-spin" />
                            ) : (
                              "A löschen"
                            )}
                          </button>
                          <button
                            class="btn-danger btn-sm"
                            disabled={deleting() === pair.b.id}
                            onClick={() => deleteRegistration(pair.b.id, pair.b.name, pair.b.email)}
                          >
                            {deleting() === pair.b.id ? (
                              <i class="ti ti-loader-2 animate-spin" />
                            ) : (
                              "B löschen"
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
        </div>
      </Show>
    </div>
  );
}
