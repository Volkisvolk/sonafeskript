import { createSignal } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  registrationId: string;
  paidAt: string | null;
  collectedAt: string | null;
}

export default function UserRegistrationActions(props: Props) {
  const [loading, setLoading] = createSignal(false);

  const handlePaid = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/raffle/user/raffles/${props.raffleId}/registrations/${props.registrationId}/mark-paid`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler aufgetreten.");
        return;
      }
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async () => {
    const ok = await prompts.confirm(
      "Bezahlung wirklich zurücksetzen? Die Karten werden wieder als nicht bezahlt und nicht abgeholt markiert.",
      {
        title: "Bezahlung zurücksetzen",
        confirmText: "Ja, zurücksetzen",
        variant: "danger",
      },
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/raffle/user/raffles/${props.raffleId}/registrations/${props.registrationId}/mark-paid`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler aufgetreten.");
        return;
      }
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  if (props.paidAt) {
    return (
      <button
        class="btn-secondary btn-sm text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:text-red-600 hover:border-red-200 dark:hover:text-red-400 dark:hover:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        disabled={loading()}
        onClick={handleRevert}
        title="Klicken zum Zurücksetzen"
      >
        {loading()
          ? <i class="ti ti-loader-2 animate-spin mr-1" />
          : <i class="ti ti-circle-check mr-1" />}
        Bezahlt & Abgeholt
      </button>
    );
  }

  return (
    <span class="group relative inline-block">
      <button class="btn-secondary btn-sm" disabled={loading()} onClick={handlePaid}>
        {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-coin mr-1" />}
        Bezahlt
      </button>
      <span class="pointer-events-none absolute bottom-full right-0 z-50 mb-2 max-w-[200px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
        Markiert die Karten als bezahlt und abgeholt.
      </span>
    </span>
  );
}
