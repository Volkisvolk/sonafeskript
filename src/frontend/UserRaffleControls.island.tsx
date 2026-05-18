import { createSignal } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { RaffleStatus } from "@/contracts";

interface Props {
  raffleId: string;
  status: RaffleStatus;
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
        await prompts.alert(
          `Fertig! ${body.emailsSent} Mails wurden versendet.${body.errors > 0 ? ` (${body.errors} Fehler)` : ""}`,
          { title: "Finalisiert" },
        );
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
                { title: "Verlosung starten", confirmLabel: "Ja, verlosen!" },
              );
              if (ok) call("run-raffle");
            }}
          >
            {loading() === "run-raffle" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-shuffle mr-1" />}
            Jetzt verlosen
          </button>
          <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
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
                  { title: "Verlosung finalisieren", confirmLabel: "Ja, Mails jetzt senden!", tone: "danger" },
                );
                if (ok) call("finalize");
              }}
            >
              {loading() === "finalize" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-mail mr-1" />}
              Finalisieren & Mails senden
            </button>
            <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
              Versendet alle Gewinn- und Verlier-Mails. Nicht rückgängig machbar!
            </span>
          </span>
          <span class="group relative inline-block">
            <button
              class="btn-danger btn-sm"
              disabled={!!loading()}
              onClick={async () => {
                const ok = await prompts.confirm(
                  "Verlosung zurücksetzen? Alle Ergebnisse werden gelöscht und alle Anmeldungen sind wieder 'ausstehend'.",
                  { title: "Zurücksetzen", confirmLabel: "Ja, zurücksetzen" },
                );
                if (ok) call("reset");
              }}
            >
              {loading() === "reset" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-rotate mr-1" />}
              Zurücksetzen
            </button>
            <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 max-w-[220px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
              Setzt alle Verlosungsergebnisse zurueck. Alle Anmeldungen sind wieder 'ausstehend'. Mails wurden noch nicht versendet.
            </span>
          </span>
        </>
      ) : null}

      {props.status === "finalized" ? (
        <span class="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <i class="ti ti-circle-check" />
          Alle Mails wurden versendet. Verlosung abgeschlossen.
        </span>
      ) : null}
    </div>
  );
}
