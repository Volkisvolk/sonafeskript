import { createSignal } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { RaffleStatus } from "@/contracts";

interface Props {
  raffleId: string;
  status: RaffleStatus;
  // Anzahl Gewinner/Verlierer, deren Ergebnis-Mail noch NICHT versendet wurde.
  // > 0 nach Finalize bedeutet: Mailversand ist teilweise fehlgeschlagen und
  // kann erneut angestoßen werden.
  unsentResultEmails: number;
}

export default function UserRaffleControls(props: Props) {
  const [loading, setLoading] = createSignal<string | null>(null);

  const call = async (endpoint: string) => {
    setLoading(endpoint);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}/${endpoint}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        await prompts.alert(body.message ?? "Fehler aufgetreten.", { title: "Fehler" });
        return;
      }
      if (endpoint === "run-raffle") {
        await prompts.alert(
          `Verlosung abgeschlossen!\n\n✅ Gewinner: ${body.winners}\n❌ Verlierer: ${body.losers}\n\nDie Mails wurden noch NICHT versendet. Überprüfe die Ergebnisse und klicke dann auf „Finalisieren".`,
          { title: "Verlosung durchgeführt" },
        );
      } else if (endpoint === "finalize") {
        if (body.errors > 0) {
          await prompts.error(
            `${body.emailsSent} Mails versendet, aber ${body.errors} fehlgeschlagen.\n\nDie fehlgeschlagenen Mails wurden NICHT als versendet markiert. Klicke erneut auf „Fehlende Mails erneut senden", um sie nachzuholen.`,
            { title: "Teilweise fehlgeschlagen" },
          );
        } else {
          await prompts.alert(
            `Fertig! ${body.emailsSent} Mails wurden versendet.`,
            { title: "Finalisiert" },
          );
        }
      } else if (endpoint === "reset") {
        await prompts.alert("Verlosung wurde zurückgesetzt. Alle sind wieder 'ausstehend'.", { title: "Zurückgesetzt" });
      }
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler. Bitte versuche es erneut.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div class="paper p-3 flex flex-wrap items-center gap-2">
      <span class="text-xs font-medium text-dimmed">Verlosungssteuerung:</span>

      {props.status === "open" ? (
        <span class="group relative inline-block">
          <button
            class="btn-primary btn-sm"
            disabled={!!loading()}
            onClick={async () => {
              const ok = await prompts.confirm(
                "Jetzt verlosen? Die Ergebnisse werden gespeichert, aber Mails werden noch NICHT versendet.",
                { title: "Verlosung starten", confirmText: "Ja, verlosen!" },
              );
              if (ok) call("run-raffle");
            }}
          >
            {loading() === "run-raffle" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-shuffle mr-1" />}
            Jetzt verlosen
          </button>
          <span class="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
            Startet die Verlosung und bestimmt Gewinner. Mails werden noch nicht versendet – du kannst die Ergebnisse zuerst pruefen.
          </span>
        </span>
      ) : null}

      {props.status === "raffled" ? (
        <>
          <span class="group relative inline-block">
            <button
              class="btn-success btn-sm"
              disabled={!!loading()}
              onClick={async () => {
                const ok = await prompts.confirm(
                  "⚠️ Achtung: Nach dem Finalisieren werden alle Gewinn- und Verlier-Mails versendet. Diese Aktion kann nicht rückgängig gemacht werden!",
                  { title: "Verlosung finalisieren", confirmText: "Ja, Mails jetzt senden!", variant: "danger" },
                );
                if (ok) call("finalize");
              }}
            >
              {loading() === "finalize" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-mail mr-1" />}
              Finalisieren & Mails senden
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
              Versendet alle Gewinn- und Verlier-Mails. Nicht rückgängig machbar!
            </span>
          </span>
          <span class="group relative inline-block">
            <button
              class="btn-danger btn-sm"
              disabled={!!loading()}
              onClick={async () => {
                const ok = await prompts.confirm(
                  "Verlosung zurücksetzen?\n\nDadurch werden alle Ergebnisse gelöscht und alle Anmeldungen wieder auf 'Ausstehend' gesetzt. Außerdem werden alle Bezahlungen und Abholungen zurückgesetzt. Mails wurden noch nicht versendet, daher ist das sicher möglich.",
                  { title: "Zurücksetzen", confirmText: "Ja, zurücksetzen", variant: "danger" },
                );
                if (ok) call("reset");
              }}
            >
              {loading() === "reset" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-rotate mr-1" />}
              Zurücksetzen
            </button>
            <span class="pointer-events-none absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
              Setzt alle Verlosungsergebnisse zurueck. Alle Anmeldungen sind wieder 'ausstehend'. Mails wurden noch nicht versendet.
            </span>
          </span>
        </>
      ) : null}

      {props.status === "finalized" && props.unsentResultEmails > 0 ? (
        <>
          <span class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <i class="ti ti-alert-triangle" />
            {props.unsentResultEmails} Ergebnis-Mail(s) konnten nicht versendet werden.
          </span>
          <span class="group relative inline-block">
            <button
              class="btn-warning btn-sm"
              disabled={!!loading()}
              onClick={async () => {
                const ok = await prompts.confirm(
                  `${props.unsentResultEmails} Ergebnis-Mail(s) wurden noch nicht versendet. Jetzt erneut versuchen? Bereits versendete Mails werden nicht doppelt verschickt.`,
                  { title: "Mails erneut senden", confirmText: "Ja, erneut senden" },
                );
                if (ok) call("finalize");
              }}
            >
              {loading() === "finalize" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-mail-forward mr-1" />}
              Fehlende Mails erneut senden
            </button>
          </span>
        </>
      ) : null}

      {props.status === "finalized" && props.unsentResultEmails === 0 ? (
        <span class="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <i class="ti ti-circle-check" />
          Alle Mails wurden versendet. Verlosung abgeschlossen.
        </span>
      ) : null}
    </div>
  );
}
