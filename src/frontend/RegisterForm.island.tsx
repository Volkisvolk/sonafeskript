import { createSignal, createResource, Show } from "solid-js";
import { prompts } from "@valentinkolb/cloud/ui";

interface Props {
  raffleId: string;
  remaining: number;
  userEmail: string;
  userDisplayName: string;
  allowedEmailPatterns: string[];
}

export default function RegisterForm(props: Props) {
  const [name, setName] = createSignal(props.userDisplayName);
  const [tickets, setTickets] = createSignal<1 | 2>(1);
  const [groupMode, setGroupMode] = createSignal<"none" | "create" | "join">("none");
  const [groupName, setGroupName] = createSignal("");
  const [joinCode, setJoinCode] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [done, setDone] = createSignal<{ inviteCode?: string } | null>(null);
  const [error, setError] = createSignal("");

  // Vorschau der Gruppe beim Eintippen des Codes
  const [groupPreview] = createResource(
    () => (groupMode() === "join" && joinCode().length >= 6 ? joinCode() : null),
    async (code) => {
      try {
        const res = await fetch(
          `/api/raffle/groups/lookup?code=${encodeURIComponent(code)}&raffleId=${encodeURIComponent(props.raffleId)}`,
        );
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
  );

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (!name().trim()) return setError("Bitte gib deinen Namen ein.");
    if (groupMode() === "create" && !groupName().trim())
      return setError("Bitte gib einen Gruppenname ein.");
    if (groupMode() === "join" && !joinCode().trim())
      return setError("Bitte gib den Einladungscode ein.");

    setLoading(true);
    try {
      const res = await fetch(`/api/raffle/raffles/${props.raffleId}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name().trim(),
          requestedTickets: tickets(),
          ...(groupMode() === "create" ? { createGroupName: groupName().trim() } : {}),
          ...(groupMode() === "join" ? { joinGroupCode: joinCode().trim().toUpperCase() } : {}),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/auth/login?redirectTo=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(body.message ?? "Ein Fehler ist aufgetreten. Bitte versuche es erneut.");
        return;
      }

      setDone({ inviteCode: body.inviteCode });
    } catch {
      setError("Verbindungsfehler. Bitte überprüfe deine Internetverbindung.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="paper p-4 mb-4">
      <Show
        when={!done()}
        fallback={
          <div class="flex flex-col items-center text-center gap-3 py-4">
            <div class="w-14 h-14 thumbnail flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/40">
              <i class="ti ti-circle-check text-3xl text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-primary">Erfolgreich angemeldet!</h2>
              <p class="text-sm text-dimmed mt-1">
                Du erhältst nach der Verlosung eine E-Mail an <strong>{props.userEmail}</strong>.
              </p>
            </div>
            <Show when={done()?.inviteCode}>
              <div class="info-block-info p-3 text-left w-full">
                <p class="text-sm font-semibold mb-1">
                  <i class="ti ti-users mr-1" /> Deine Gruppe wurde erstellt!
                </p>
                <p class="text-sm text-dimmed mb-2">
                  Teile diesen Einladungscode mit deiner Gruppe:
                </p>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-xl font-bold tracking-widest text-primary">
                    {done()?.inviteCode}
                  </span>
                  <button
                    class="btn-secondary btn-sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(done()?.inviteCode ?? "");
                      prompts.alert("Code in die Zwischenablage kopiert!", { title: "Kopiert" });
                    }}
                  >
                    <i class="ti ti-copy" />
                  </button>
                </div>
                <p class="text-xs text-dimmed mt-2">
                  Alle Mitglieder eurer Gruppe gewinnen oder verlieren gemeinsam.
                </p>
              </div>
            </Show>
          </div>
        }
      >
        <form onSubmit={handleSubmit} class="flex flex-col gap-4">
          <h2 class="text-base font-semibold text-primary">
            <i class="ti ti-user-plus mr-2" />
            Jetzt anmelden
          </h2>

          {/* Eingeloggt als */}
          <div class="info-block-info px-3 py-2 text-xs flex items-center gap-2">
            <i class="ti ti-user-check shrink-0" />
            <span>Eingeloggt als <strong>{props.userEmail}</strong></span>
          </div>

          {/* Erlaubte E-Mail-Adressen */}
          {props.allowedEmailPatterns.length > 0 && (
            <div class="info-block-info p-3 text-xs">
              <p class="font-semibold mb-1">
                <i class="ti ti-at mr-1" />
                Nur bestimmte E-Mail-Adressen zugelassen:
              </p>
              <ul class="list-disc list-inside space-y-0.5 mb-0">
                {props.allowedEmailPatterns.map((p) => (
                  <li class="font-mono">{p}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Name */}
          <div>
            <label class="block text-xs font-medium text-dimmed mb-1" for="reg-name">
              Name für die Verlosung <span class="text-red-500">*</span>
            </label>
            <input
              id="reg-name"
              type="text"
              class="btn-input w-full"
              placeholder="Max Mustermann"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              required
              autocomplete="name"
            />
          </div>

          {/* Anzahl Karten */}
          <div>
            <p class="text-xs font-medium text-dimmed mb-2">
              Wie viele Karten möchtest du? <span class="text-red-500">*</span>
            </p>
            <div class="flex gap-2">
              {([1, 2] as const).map((n) => (
                <button
                  type="button"
                  class={`flex-1 py-3 rounded-lg border-2 text-sm font-semibold transition-all ${
                    tickets() === n
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "border-zinc-200 dark:border-zinc-700 text-dimmed hover:border-zinc-400"
                  }`}
                  onClick={() => setTickets(n)}
                >
                  <i class={`ti ti-ticket${n === 2 ? "s" : ""} mr-1`} />
                  {n} Karte{n === 2 ? "n" : ""}
                </button>
              ))}
            </div>
            <Show when={props.remaining < 2 && tickets() === 2}>
              <p class="text-xs text-dimmed mt-1">
                <i class="ti ti-info-circle mr-1" />
                Das Kartenkontingent ist fast ausgeschöpft — du kannst dich trotzdem anmelden. Bei der Verlosung entscheidet das Los, wer Karten erhält.
              </p>
            </Show>
          </div>

          {/* Gruppe */}
          <div>
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-medium text-dimmed">Gruppe (optional)</p>
            </div>
            <div class="info-block-info p-3 text-xs mb-3">
              <i class="ti ti-users mr-1" />
              <strong>Was ist eine Gruppe?</strong>{" "}
              Eine Gruppe hat keinen Einfluss auf deine Gewinnchance — sie entscheidet nur,
              ob ihr gemeinsam gewinnt oder gemeinsam leer ausgeht. Entweder bekommen alle
              Mitglieder Karten, oder niemand. Eine Person erstellt die Gruppe und teilt
              den Einladungscode mit den anderen.
            </div>
            <div class="flex gap-2 flex-wrap">
              {(["none", "create", "join"] as const).map((mode) => (
                <button
                  type="button"
                  class={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    groupMode() === mode
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                      : "border-zinc-200 dark:border-zinc-700 text-dimmed hover:border-zinc-400"
                  }`}
                  onClick={() => setGroupMode(mode)}
                >
                  {mode === "none" && "Keine Gruppe"}
                  {mode === "create" && <><i class="ti ti-plus mr-1" />Gruppe erstellen</>}
                  {mode === "join" && <><i class="ti ti-users mr-1" />Gruppe beitreten</>}
                </button>
              ))}
            </div>

            <Show when={groupMode() === "create"}>
              <div class="mt-2">
                <input
                  type="text"
                  class="btn-input w-full"
                  placeholder="Name deiner Gruppe"
                  value={groupName()}
                  onInput={(e) => { setGroupName(e.currentTarget.value); setError(""); }}
                  maxLength={100}
                />
                <p class="text-xs text-dimmed mt-1">
                  Nach der Anmeldung erhältst du einen Einladungscode, den du teilen kannst.
                  Alle Mitglieder gewinnen oder verlieren gemeinsam.
                </p>
              </div>
            </Show>

            <Show when={groupMode() === "join"}>
              <div class="mt-2">
                <input
                  type="text"
                  class="btn-input w-full uppercase tracking-widest font-mono"
                  placeholder="Einladungscode (z.B. ABC123)"
                  value={joinCode()}
                  onInput={(e) => setJoinCode(e.currentTarget.value.toUpperCase())}
                  maxLength={8}
                />
                <Show when={groupPreview()}>
                  <div class="info-block-info mt-2 p-2 text-xs">
                    <i class="ti ti-users mr-1" />
                    Gruppe: <strong>{groupPreview()?.name}</strong> —{" "}
                    {groupPreview()?.memberCount} / {groupPreview()?.maxGroupSize} Mitglieder
                  </div>
                </Show>
              </div>
            </Show>
          </div>

          {/* Fehler */}
          <Show when={error()}>
            <div class="info-block-danger p-3 text-sm">
              <i class="ti ti-alert-circle mr-1" />
              {error()}
            </div>
          </Show>

          {/* Absenden */}
          <button
            type="submit"
            class="btn-primary btn-md w-full"
            disabled={loading()}
          >
            <Show when={loading()} fallback={<><i class="ti ti-send mr-2" />Jetzt anmelden</>}>
              <i class="ti ti-loader-2 mr-2 animate-spin" />
              Wird angemeldet…
            </Show>
          </button>
        </form>
      </Show>
    </div>
  );
}
