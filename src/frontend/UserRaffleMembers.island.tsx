import { createSignal, For, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { RaffleMember } from "@/contracts";

interface Props {
  raffleId: string;
  members: RaffleMember[];
  currentUserRole: "owner" | "moderator";
  currentUserId: string;
}

export default function UserRaffleMembers(props: Props) {
  const [showForm, setShowForm] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [role, setRole] = createSignal<"owner" | "moderator">("moderator");
  const [loading, setLoading] = createSignal(false);

  const isOwner = () => props.currentUserRole === "owner";

  const handleAdd = async () => {
    if (!email().trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email().trim(), role: role() }),
      });
      const body = await res.json();
      if (!res.ok) { await prompts.error(body.message ?? "Fehler beim Hinzufügen."); return; }
      setEmail("");
      setRole("moderator");
      setShowForm(false);
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (member: RaffleMember) => {
    const name = member.displayName ?? member.mail ?? member.userId;
    const ok = await prompts.confirm(`${name} aus dieser Verlosung entfernen?`, {
      title: "Mitglied entfernen",
      confirmText: "Ja, entfernen",
      variant: "danger",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}/members/${member.userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler beim Entfernen.");
        return;
      }
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    }
  };

  return (
    <div class="paper overflow-hidden">
      <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="ti ti-users text-dimmed" />
          <span class="text-xs font-medium text-dimmed">Mitglieder</span>
          <span class="text-xs text-dimmed opacity-60">({props.members.length})</span>
        </div>
        <Show when={isOwner()}>
          <button class="btn-secondary btn-sm" onClick={() => setShowForm((v) => !v)}>
            <i class={`ti ${showForm() ? "ti-x" : "ti-user-plus"} mr-1`} />
            {showForm() ? "Abbrechen" : "Hinzufügen"}
          </button>
        </Show>
      </div>

      <Show when={showForm()}>
        <div class="px-3 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col gap-2">
          <div class="flex gap-2">
            <input
              type="email"
              class="btn-input flex-1"
              placeholder="E-Mail-Adresse"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <select
              class="btn-input shrink-0"
              value={role()}
              onChange={(e) => setRole(e.currentTarget.value as "owner" | "moderator")}
            >
              <option value="moderator">Moderator</option>
              <option value="owner">Besitzer</option>
            </select>
            <button
              class="btn-primary btn-sm shrink-0"
              disabled={!email().trim() || loading()}
              onClick={handleAdd}
            >
              {loading() ? <i class="ti ti-loader-2 animate-spin" /> : <i class="ti ti-plus" />}
            </button>
          </div>
          <p class="text-xs text-dimmed">
            <i class="ti ti-info-circle mr-1" />
            Moderatoren können die Verlosung verwalten. Besitzer können zusätzlich Mitglieder hinzufügen und die Verlosung löschen.
          </p>
        </div>
      </Show>

      <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <For each={props.members}>
          {(member) => (
            <div class="px-3 py-2 flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <i class="ti ti-user text-dimmed text-xs" />
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-medium text-primary truncate">
                    {member.displayName ?? member.mail ?? member.userId}
                  </p>
                  <Show when={member.displayName && member.mail}>
                    <p class="text-xs text-dimmed truncate">{member.mail}</p>
                  </Show>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  member.role === "owner"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                }`}>
                  {member.role === "owner" ? "Besitzer" : "Moderator"}
                </span>
                <Show when={isOwner() && member.userId !== props.currentUserId}>
                  <button
                    class="btn-simple btn-sm text-red-500 hover:text-red-600"
                    onClick={() => handleRemove(member)}
                    title="Mitglied entfernen"
                  >
                    <i class="ti ti-x text-xs" />
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
