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

  if (props.paidAt) {
    return (
      <span class="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
        <i class="ti ti-circle-check" />
        Bezahlt
      </span>
    );
  }

  const handlePaid = async () => {
    const ok = await prompts.confirm("Karten als bezahlt markieren?", {
      title: "Bezahlung bestätigen",
      confirmLabel: "Ja, bezahlt!",
    });
    if (!ok) return;

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
