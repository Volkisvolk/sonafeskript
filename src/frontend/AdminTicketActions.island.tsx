import { createSignal, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  registrationId: string;
  paidAt: string | null;
  collectedAt: string | null;
  collectedBy: string | null;
  wonTickets: number;
}

export default function AdminTicketActions(props: Props) {
  const [loading, setLoading] = createSignal<string | null>(null);
  const [wonTicketsInput, setWonTicketsInput] = createSignal<string>("");
  const [proxyEmail, setProxyEmail] = createSignal("");
  const [adjustMode, setAdjustMode] = createSignal(false);
  const [proxyMode, setProxyMode] = createSignal(false);

  const call = async (
    method: "POST" | "DELETE" | "PATCH",
    action: string,
    body?: object,
  ): Promise<boolean> => {
    setLoading(action);
    try {
      const res = await fetch(
        `/api/raffle/admin/raffles/${props.raffleId}/registrations/${props.registrationId}/${action}`,
        {
          method,
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
        },
      );
      const data = await res.json();
      if (!res.ok) {
        await prompts.error(data.message ?? "Fehler aufgetreten.");
        return false;
      }
      refreshCurrentPath();
      return true;
    } catch {
      await prompts.error("Verbindungsfehler. Bitte versuche es erneut.");
      return false;
    } finally {
      setLoading(null);
    }
  };

  return (
    <div class="paper p-4 flex flex-col gap-4">
      <p class="section-label">Kartenaktionen</p>

      {/* ── Bezahlung ─────────────────────────────────────────────────────── */}
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-primary">Bezahlung</p>
          <p class="text-xs text-dimmed">
            {props.paidAt
              ? `Bezahlt am ${new Date(props.paidAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}`
              : "Noch nicht bezahlt"}
          </p>
        </div>
        {props.paidAt ? (
          <button
            class="btn-danger btn-sm"
            disabled={!!loading()}
            onClick={async () => {
              const ok = await prompts.confirm("Bezahlung wirklich zurücksetzen?", {
                title: "Bezahlung zurücksetzen",
              });
              if (ok) call("DELETE", "mark-paid");
            }}
          >
            {loading() === "mark-paid" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-rotate-2 mr-1" />}
            Zurücksetzen
          </button>
        ) : (
          <button
            class="btn-success btn-sm"
            disabled={!!loading()}
            onClick={() => call("POST", "mark-paid")}
          >
            {loading() === "mark-paid" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-coin mr-1" />}
            Als bezahlt markieren
          </button>
        )}
      </div>

      {/* ── Abholung ──────────────────────────────────────────────────────── */}
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-primary">Abholung</p>
          <p class="text-xs text-dimmed">
            {props.collectedAt
              ? `Abgeholt am ${new Date(props.collectedAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}${
                  props.collectedBy ? ` — Vollmacht: ${props.collectedBy}` : ""
                }`
              : "Noch nicht abgeholt"}
          </p>
        </div>
        {props.collectedAt ? (
          <button
            class="btn-danger btn-sm"
            disabled={!!loading()}
            onClick={async () => {
              const ok = await prompts.confirm("Abholung wirklich zurücksetzen?", {
                title: "Abholung zurücksetzen",
              });
              if (ok) call("DELETE", "mark-collected");
            }}
          >
            {loading() === "mark-collected" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-rotate-2 mr-1" />}
            Zurücksetzen
          </button>
        ) : (
          <div class="flex gap-1">
            <button
              class="btn-success btn-sm"
              disabled={!!loading() || proxyMode()}
              onClick={async () => {
                const ok = await prompts.confirm(
                  "Karten als persönlich abgeholt markieren?",
                  { title: "Okily Dokily!" },
                );
                if (ok) call("POST", "mark-collected");
              }}
            >
              {loading() === "mark-collected" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-package mr-1" />}
              Okily Dokily!
            </button>
            <button
              class="btn-secondary btn-sm"
              disabled={!!loading()}
              onClick={() => setProxyMode((v) => !v)}
              title="Per Vollmacht abholen"
            >
              <i class="ti ti-user-check" />
            </button>
          </div>
        )}
      </div>

      {/* ── Vollmacht-Formular ────────────────────────────────────────────── */}
      <Show when={proxyMode() && !props.collectedAt}>
        <div class="info-block-info p-3 flex flex-col gap-2">
          <p class="text-xs font-medium">Vollmacht — abgeholt von:</p>
          <div class="flex gap-2">
            <input
              type="email"
              class="btn-input flex-1"
              placeholder="E-Mail der bevollmächtigten Person"
              value={proxyEmail()}
              onInput={(e) => setProxyEmail(e.currentTarget.value)}
            />
            <button
              class="btn-success btn-sm"
              disabled={!proxyEmail() || !!loading()}
              onClick={async () => {
                if (!proxyEmail()) return;
                const ok = await prompts.confirm(
                  `Karten per Vollmacht von ${proxyEmail()} abgeholt?`,
                  { title: "Vollmacht bestätigen" },
                );
                if (ok) {
                  const success = await call("POST", "mark-collected-proxy", {
                    collectedByEmail: proxyEmail(),
                  });
                  if (success) setProxyMode(false);
                }
              }}
            >
              {loading() === "mark-collected-proxy" ? <i class="ti ti-loader-2 animate-spin" /> : "Bestätigen"}
            </button>
            <button
              class="btn-secondary btn-sm"
              onClick={() => setProxyMode(false)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      </Show>

      {/* ── Karten anpassen ──────────────────────────────────────────────── */}
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-primary">Gewonnene Karten</p>
          <p class="text-xs text-dimmed">{props.wonTickets} Karte{props.wonTickets !== 1 ? "n" : ""} zugewiesen</p>
        </div>
        <button
          class="btn-secondary btn-sm"
          onClick={() => {
            setWonTicketsInput(String(props.wonTickets));
            setAdjustMode((v) => !v);
          }}
        >
          <i class="ti ti-pencil mr-1" /> Anpassen
        </button>
      </div>

      <Show when={adjustMode()}>
        <div class="info-block-info p-3 flex flex-col gap-2">
          <p class="text-xs font-medium">Neue Kartenanzahl:</p>
          <div class="flex gap-2">
            <input
              type="number"
              class="btn-input w-20"
              min="1"
              max="10"
              value={wonTicketsInput()}
              onInput={(e) => setWonTicketsInput(e.currentTarget.value)}
            />
            <button
              class="btn-primary btn-sm"
              disabled={!wonTicketsInput() || !!loading()}
              onClick={async () => {
                const n = parseInt(wonTicketsInput(), 10);
                if (isNaN(n) || n < 1) return prompts.error("Ungültige Zahl.");
                const ok = await prompts.confirm(
                  `Kartenanzahl auf ${n} setzen?`,
                  { title: "Karten anpassen" },
                );
                if (ok) {
                  const success = await call("PATCH", "adjust-tickets", { wonTickets: n });
                  if (success) setAdjustMode(false);
                }
              }}
            >
              {loading() === "adjust-tickets" ? <i class="ti ti-loader-2 animate-spin" /> : "Speichern"}
            </button>
            <button class="btn-secondary btn-sm" onClick={() => setAdjustMode(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
