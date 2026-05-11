import { createSignal, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

export default function AdminCreateRaffle() {
  const [showForm, setShowForm] = createSignal(false);
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [contingent, setContingent] = createSignal("100");
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!name().trim()) return prompts.error("Bitte gib einen Namen für die Verlosung ein.");
    const cont = parseInt(contingent(), 10);
    if (isNaN(cont) || cont < 1) return prompts.error("Das Kontingent muss eine positive Zahl sein.");

    setLoading(true);
    try {
      const res = await fetch("/api/raffle/admin/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name().trim(),
          description: description().trim() || undefined,
          ticketContingent: cont,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        await prompts.error(body.message ?? "Fehler beim Erstellen.");
        return;
      }
      setShowForm(false);
      setName("");
      setDescription("");
      setContingent("100");
      window.location.href = `/admin/raffle/${body.id}`;
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="paper overflow-hidden">
      <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <span class="text-xs font-medium text-dimmed">Neue Verlosung</span>
        <button
          class="btn-primary btn-sm"
          onClick={() => setShowForm((v) => !v)}
        >
          <i class={`ti ${showForm() ? "ti-x" : "ti-plus"} mr-1`} />
          {showForm() ? "Abbrechen" : "Erstellen"}
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
                placeholder="z.B. Konzert 2025"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
                required
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-dimmed mb-1">
                Kartenkontigent <span class="text-red-500">*</span>
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
              placeholder="Kurze Beschreibung der Verlosung"
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </div>
          <div class="flex gap-2">
            <button type="submit" class="btn-primary btn-sm" disabled={loading()}>
              {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-check mr-1" />}
              Verlosung erstellen
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
