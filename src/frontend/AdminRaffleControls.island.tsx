import { createSignal } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { RaffleStatus } from "@/contracts";

interface Props {
  raffleId: string;
  status: RaffleStatus;
}

export default function AdminRaffleControls(props: Props) {
  const [loading, setLoading] = createSignal<string | null>(null);

  const call = async (endpoint: string, label: string) => {
    setLoading(endpoint);
    try {
      const res = await fetch(`/api/raffle/admin/raffles/${props.raffleId}/${endpoint}`, { method: "POST" });
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
          `Fertig! ${body.emailsSent} Mails wurden versendet.${body.errors > 0 ? ` (${body.errors} Fehler — siehe Logging)` : ""}`,
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
        <button
          class="btn-primary btn-sm"
          disabled={!!loading()}
          onClick={async () => {
            const ok = await prompts.confirm(
              "Jetzt verlosen? Die Ergebnisse werden gespeichert, aber Mails werden noch NICHT versendet. Du kannst die Ergebnisse vorher prüfen.",
              { title: "Verlosung starten", confirmLabel: "Ja, verlosen!" },
            );
            if (ok) call("run-raffle", "Verlosen");
          }}
        >
          {loading() === "run-raffle" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-shuffle mr-1" />}
          Jetzt verlosen
        </button>
      ) : null}

      {props.status === "raffled" ? (
        <>
          <button
            class="btn-success btn-sm"
            disabled={!!loading()}
            onClick={async () => {
              const ok = await prompts.confirm(
                "⚠️ Achtung: Nach dem Finalisieren werden alle Gewinn- und Verlier-Mails versendet. Diese Aktion kann nicht rückgängig gemacht werden!",
                {
                  title: "Verlosung finalisieren",
                  confirmLabel: "Ja, Mails jetzt senden!",
                  tone: "danger",
                },
              );
              if (ok) call("finalize", "Finalisieren");
            }}
          >
            {loading() === "finalize" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-mail mr-1" />}
            Finalisieren & Mails senden
          </button>
          <button
            class="btn-danger btn-sm"
            disabled={!!loading()}
            onClick={async () => {
              const ok = await prompts.confirm(
                "Verlosung zurücksetzen? Alle Ergebnisse werden gelöscht und alle Anmeldungen sind wieder 'ausstehend'.",
                { title: "Zurücksetzen", confirmLabel: "Ja, zurücksetzen" },
              );
              if (ok) call("reset", "Zurücksetzen");
            }}
          >
            {loading() === "reset" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-rotate mr-1" />}
            Zurücksetzen
          </button>
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
