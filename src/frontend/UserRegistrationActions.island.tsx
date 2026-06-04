import { createSignal, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  registrationId: string;
  name: string;
  status: "pending" | "won" | "lost";
  paidAt: string | null;
  collectedAt: string | null;
  wonTickets: number | null;
  collectedTickets: number;
  requestedTickets: number;
}

export default function UserRegistrationActions(props: Props) {
  const [loading, setLoading] = createSignal(false);
  const wonCount = () => props.wonTickets ?? props.requestedTickets;

  const call = async (url: string, method: string, body?: unknown): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        await prompts.error(b.message ?? "Fehler aufgetreten.");
        return false;
      }
      return true;
    } catch {
      await prompts.error("Verbindungsfehler.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const base = () => `/api/raffle/user/raffles/${props.raffleId}/registrations/${props.registrationId}`;

  const handlePaid = async () => {
    const won = wonCount();
    let collectedTickets: number | undefined;
    if (won > 1) {
      const n = await prompts.promptNumber(
        `Wie viele der ${won} Karten wurden abgeholt?`,
        won,
        { title: "Als bezahlt markieren", confirmText: "Bezahlt", min: 0, max: won },
      );
      if (n === null) return; // abgebrochen
      collectedTickets = n;
    }
    if (await call(`${base()}/mark-paid`, "POST", { collectedTickets })) refreshCurrentPath();
  };

  const handleRevert = async () => {
    const ok = await prompts.confirm(
      "Bezahlung wirklich zurücksetzen? Die Karten werden wieder als nicht bezahlt und nicht abgeholt markiert.",
      { title: "Bezahlung zurücksetzen", confirmText: "Ja, zurücksetzen", variant: "danger" },
    );
    if (!ok) return;
    if (await call(`${base()}/mark-paid`, "DELETE")) refreshCurrentPath();
  };

  const setCollected = async (tickets: number) => {
    if (await call(`${base()}/collected`, "PATCH", { tickets })) refreshCurrentPath();
  };

  const handleDelete = async () => {
    const ok = await prompts.confirm(
      `Anmeldung von „${props.name}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`,
      { title: "Anmeldung löschen", confirmText: "Ja, löschen", variant: "danger" },
    );
    if (!ok) return;
    if (await call(base(), "DELETE")) refreshCurrentPath();
  };

  return (
    <div class="flex items-center justify-end gap-1.5 flex-wrap">
      <Show when={props.status === "won"}>
        {/* Teil-Abholung: Stepper, solange nicht komplett bezahlt/abgeholt */}
        <Show when={!props.paidAt}>
          <span class="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-1">
            <button
              class="w-5 h-5 flex items-center justify-center text-dimmed hover:text-primary disabled:opacity-30"
              disabled={loading() || props.collectedTickets <= 0}
              title="Eine Karte weniger abgeholt"
              onClick={() => setCollected(props.collectedTickets - 1)}
            >
              <i class="ti ti-minus text-[11px]" />
            </button>
            <span class="text-[11px] tabular-nums text-dimmed min-w-[42px] text-center" title="Abgeholte Karten">
              {props.collectedTickets}/{wonCount()} abgeh.
            </span>
            <button
              class="w-5 h-5 flex items-center justify-center text-dimmed hover:text-primary disabled:opacity-30"
              disabled={loading() || props.collectedTickets >= wonCount()}
              title="Eine Karte mehr abgeholt"
              onClick={() => setCollected(props.collectedTickets + 1)}
            >
              <i class="ti ti-plus text-[11px]" />
            </button>
          </span>
        </Show>

        <Show
          when={props.paidAt}
          fallback={
            <button class="btn-secondary btn-sm" disabled={loading()} onClick={handlePaid} title="Markiert die Karten als bezahlt und vollständig abgeholt.">
              {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-coin mr-1" />}
              Bezahlt
            </button>
          }
        >
          <button
            class="btn-secondary btn-sm text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:text-red-600 hover:border-red-200 dark:hover:text-red-400 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            disabled={loading()}
            onClick={handleRevert}
            title="Klicken zum Zurücksetzen"
          >
            {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-circle-check mr-1" />}
            Bezahlt & Abgeholt
          </button>
        </Show>
      </Show>

      {/* Löschen – für alle Anmeldungen */}
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-dimmed hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        disabled={loading()}
        onClick={handleDelete}
        title="Anmeldung löschen"
      >
        <i class="ti ti-trash text-sm" />
      </button>
    </div>
  );
}
