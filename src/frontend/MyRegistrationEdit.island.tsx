import { createSignal, createResource, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { Registration } from "@/contracts";

interface Props {
  registration: Registration;
  raffleId: string;
  raffleName: string;
  raffleStatus: string;
  maxGroupSize: number;
}

export default function MyRegistrationEdit(props: Props) {
  const [tickets, setTickets] = createSignal<1 | 2>(props.registration.requestedTickets as 1 | 2);
  const [joinCode, setJoinCode] = createSignal("");
  const [loading, setLoading] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");

  const isOpen = () => props.raffleStatus === "open";

  const [groupPreview] = createResource(
    () => (joinCode().length >= 6 ? joinCode() : null),
    async (code) => {
      try {
        const res = await fetch(`/api/raffle/groups/lookup?code=${encodeURIComponent(code)}&raffleId=${encodeURIComponent(props.raffleId)}`);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    },
  );

  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`/api/raffle/user/my-registrations/${props.registration.id}/${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      window.location.href = `/auth/login?redirectTo=${encodeURIComponent(window.location.pathname)}`;
      throw new Error("redirect");
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.message ?? "Fehler");
    return json;
  };

  const updateTickets = async (n: 1 | 2) => {
    if (n === tickets()) return;
    setTickets(n);
    setLoading("tickets");
    setError("");
    try {
      await call("PATCH", "tickets", { requestedTickets: n });
      refreshCurrentPath();
    } catch (e: any) {
      setError(e.message);
      setTickets(props.registration.requestedTickets as 1 | 2);
    } finally { setLoading(null); }
  };

  const joinGroup = async () => {
    if (!joinCode().trim()) return;
    setLoading("join");
    setError("");
    try {
      await call("POST", "group", { joinGroupCode: joinCode().trim().toUpperCase() });
      setJoinCode("");
      refreshCurrentPath();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  const leaveGroup = async () => {
    const ok = await prompts.confirm("Gruppe verlassen?", { title: "Gruppe verlassen", confirmText: "Ja, verlassen", variant: "danger" });
    if (!ok) return;
    setLoading("leave");
    setError("");
    try {
      await call("DELETE", "group");
      refreshCurrentPath();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(null); }
  };

  return (
    <div class="flex flex-col gap-4">

      {/* Anzahl Karten */}
      <div>
        <p class="text-xs font-medium text-dimmed mb-2">Gewünschte Karten</p>
        <div class="flex gap-2">
          {([1, 2] as const).map((n) => (
            <button
              type="button"
              disabled={!isOpen() || !!loading()}
              class={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all disabled:opacity-50 ${
                tickets() === n
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  : "border-zinc-200 dark:border-zinc-700 text-dimmed hover:border-zinc-400"
              }`}
              onClick={() => updateTickets(n)}
            >
              {loading() === "tickets" && tickets() === n
                ? <i class="ti ti-loader-2 animate-spin mr-1" />
                : <i class={`ti ti-ticket${n === 2 ? "s" : ""} mr-1`} />}
              {n} Karte{n === 2 ? "n" : ""}
            </button>
          ))}
        </div>
        {!isOpen() && <p class="text-xs text-dimmed mt-1">Änderungen sind nur bei offenen Verlosungen möglich.</p>}
      </div>

      {/* Gruppe */}
      <div>
        <p class="text-xs font-medium text-dimmed mb-2">Gruppe</p>
        <Show
          when={props.registration.groupId}
          fallback={
            <Show when={isOpen()}>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="btn-input flex-1 uppercase tracking-widest font-mono"
                  placeholder="Einladungscode"
                  value={joinCode()}
                  onInput={(e) => setJoinCode(e.currentTarget.value.toUpperCase())}
                  maxLength={8}
                  disabled={!!loading()}
                />
                <button
                  class="btn-secondary btn-sm"
                  disabled={!joinCode().trim() || !!loading()}
                  onClick={joinGroup}
                >
                  {loading() === "join" ? <i class="ti ti-loader-2 animate-spin" /> : "Beitreten"}
                </button>
              </div>
              <Show when={groupPreview()}>
                <div class="info-block-info mt-2 p-2 text-xs">
                  <i class="ti ti-users mr-1" />
                  <strong>{groupPreview()?.name}</strong> — {groupPreview()?.memberCount} / {groupPreview()?.maxGroupSize} Mitglieder
                </div>
              </Show>
            </Show>
          }
        >
          <div class="flex items-center justify-between gap-2 info-block-info p-3 rounded-lg">
            <div class="text-sm">
              <i class="ti ti-users mr-1" />
              <strong>{props.registration.groupName}</strong>
              {props.registration.groupInviteCode && (
                <span class="text-xs text-dimmed ml-2 font-mono">{props.registration.groupInviteCode}</span>
              )}
            </div>
            <Show when={isOpen()}>
              <button
                class="btn-danger btn-sm shrink-0"
                disabled={!!loading()}
                onClick={leaveGroup}
              >
                {loading() === "leave" ? <i class="ti ti-loader-2 animate-spin" /> : "Verlassen"}
              </button>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={error()}>
        <div class="info-block-danger p-3 text-sm">
          <i class="ti ti-alert-circle mr-1" />{error()}
        </div>
      </Show>
    </div>
  );
}
