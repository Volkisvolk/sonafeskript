import { createSignal, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  registrationId: string;
  currentName: string;
  currentEmail: string;
  currentRequestedTickets: number;
  hasGroup: boolean;
}

export default function AdminEditRegistration(props: Props) {
  const [editMode, setEditMode] = createSignal(false);
  const [name, setName] = createSignal(props.currentName);
  const [email, setEmail] = createSignal(props.currentEmail);
  const [tickets, setTickets] = createSignal(props.currentRequestedTickets);
  const [loading, setLoading] = createSignal(false);

  const baseUrl = () =>
    `/api/raffle/admin/raffles/${props.raffleId}/registrations/${props.registrationId}`;

  const handleSave = async () => {
    if (!name().trim() || !email().trim()) return prompts.error("Name und E-Mail sind Pflichtfelder.");
    setLoading(true);
    try {
      const res = await fetch(baseUrl(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name().trim(), email: email().trim(), requestedTickets: tickets() }),
      });
      const body = await res.json();
      if (!res.ok) {
        await prompts.error(body.message ?? "Fehler beim Speichern.");
        return;
      }
      setEditMode(false);
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const ok = await prompts.confirm(
      `Anmeldung von „${props.currentName}" (${props.currentEmail}) wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      { title: "Anmeldung löschen", confirmLabel: "Ja, löschen", tone: "danger" },
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(baseUrl(), { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        await prompts.error(body.message ?? "Fehler beim Löschen.");
        return;
      }
      window.location.href = `/admin/raffle/${props.raffleId}`;
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromGroup = async () => {
    const ok = await prompts.confirm("Person aus der Gruppe entfernen?", {
      title: "Aus Gruppe entfernen",
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl()}/group`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        await prompts.error(body.message ?? "Fehler.");
        return;
      }
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="paper p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between">
        <p class="section-label">Anmeldung bearbeiten</p>
        <div class="flex gap-1">
          <Show when={props.hasGroup}>
            <button class="btn-secondary btn-sm" onClick={handleRemoveFromGroup} disabled={loading()}>
              <i class="ti ti-users-minus mr-1" /> Aus Gruppe
            </button>
          </Show>
          <button
            class="btn-secondary btn-sm"
            onClick={() => {
              setName(props.currentName);
              setEmail(props.currentEmail);
              setTickets(props.currentRequestedTickets);
              setEditMode((v) => !v);
            }}
          >
            <i class={`ti ${editMode() ? "ti-x" : "ti-pencil"} mr-1`} />
            {editMode() ? "Abbrechen" : "Bearbeiten"}
          </button>
        </div>
      </div>

      <Show when={editMode()}>
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-dimmed mb-1">Name</label>
              <input
                type="text"
                class="btn-input w-full"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
            </div>
            <div>
              <label class="block text-xs text-dimmed mb-1">E-Mail</label>
              <input
                type="email"
                class="btn-input w-full"
                value={email()}
                onInput={(e) => setEmail(e.currentTarget.value)}
              />
            </div>
          </div>
          <div>
            <label class="block text-xs text-dimmed mb-1">Gewünschte Karten</label>
            <div class="flex gap-2">
              {[1, 2].map((n) => (
                <button
                  type="button"
                  class={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    tickets() === n
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                      : "border-zinc-200 dark:border-zinc-700 text-dimmed"
                  }`}
                  onClick={() => setTickets(n)}
                >
                  {n} Karte{n === 2 ? "n" : ""}
                </button>
              ))}
            </div>
          </div>
          <div class="flex gap-2 pt-1">
            <button class="btn-primary btn-sm" onClick={handleSave} disabled={loading()}>
              {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-check mr-1" />}
              Speichern
            </button>
          </div>
          <div class="info-block-warning p-2 text-xs">
            <i class="ti ti-alert-triangle mr-1" />
            Änderungen an E-Mail oder Kartenzahl nach der Verlosung können das Ergebnis beeinflussen.
          </div>
        </div>
      </Show>

      <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <button
          class="btn-danger btn-sm"
          onClick={handleDelete}
          disabled={loading()}
        >
          <i class="ti ti-trash mr-1" /> Anmeldung löschen
        </button>
      </div>
    </div>
  );
}
