import { createSignal, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  name: string;
  description: string | null;
  ticketContingent: number;
}

export default function UserEditRaffle(props: Props) {
  const [showForm, setShowForm] = createSignal(false);
  const [name, setName] = createSignal(props.name);
  const [description, setDescription] = createSignal(props.description ?? "");
  const [contingent, setContingent] = createSignal(String(props.ticketContingent));
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim()) return prompts.error("Name darf nicht leer sein.");
    const cont = parseInt(contingent(), 10);
    if (isNaN(cont) || cont < 1) return prompts.error("Das Kontingent muss eine positive Zahl sein.");

    setLoading(true);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name().trim(),
          description: description().trim() || null,
          ticketContingent: cont,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        await prompts.error(body.message ?? "Fehler beim Speichern.");
        return;
      }
      setShowForm(false);
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="paper overflow-hidden">
      <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <span class="text-xs font-medium text-dimmed">Verlosung bearbeiten</span>
        <button class="btn-secondary btn-sm" onClick={() => setShowForm((v) => !v)}>
          <i class={`ti ${showForm() ? "ti-x" : "ti-edit"} mr-1`} />
          {showForm() ? "Abbrechen" : "Bearbeiten"}
        </button>
      </div>

      <Show when={showForm()}>
        <form onSubmit={handleSubmit} class="p-3 flex flex-col gap-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-dimmed mb-1">
                Name <span class="text-red-500">*</span>
              </label>
              <input
                type="text"
                class="btn-input w-full"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                required
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-dimmed mb-1">
                Kartenkontingent <span class="text-red-500">*</span>
              </label>
              <input
                type="number"
                class="btn-input w-full"
                min="1"
                value={contingent()}
                onInput={(e) => setContingent(e.currentTarget.value)}
                required
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-dimmed mb-1">Beschreibung (optional)</label>
            <input
              type="text"
              class="btn-input w-full"
              placeholder="Kurze Beschreibung"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary btn-sm" disabled={loading()}>
              {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-check mr-1" />}
              Speichern
            </button>
            <button type="button" class="btn-secondary btn-sm" onClick={() => setShowForm(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      </Show>
    </div>
  );
}
