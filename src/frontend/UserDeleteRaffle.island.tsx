import { createSignal } from "solid-js";
import { prompts } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  raffleName: string;
  registrationCount: number;
}

export default function UserDeleteRaffle(props: Props) {
  const [loading, setLoading] = createSignal(false);

  const handleDelete = async () => {
    const confirmed = await prompts.confirm(
      `Verlosung „${props.raffleName}" unwiderruflich löschen?\n\n` +
        `⚠️ Dabei werden ALLE Daten dieser Verlosung dauerhaft gelöscht:\n` +
        `• ${props.registrationCount} Anmeldung${props.registrationCount !== 1 ? "en" : ""}\n` +
        `• Alle Gruppen und Ereignis-Protokolle\n\n` +
        `Diese Aktion kann nicht rückgängig gemacht werden.`,
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler beim Löschen.");
        return;
      }
      window.location.href = "/app/raffle/my";
    } catch {
      await prompts.error("Verbindungsfehler beim Löschen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      class="btn-secondary btn-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
      onClick={handleDelete}
      disabled={loading()}
    >
      {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-trash mr-1" />}
      Löschen
    </button>
  );
}
