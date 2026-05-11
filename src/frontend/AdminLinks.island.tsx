import { createResource, createSignal, For, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { ExternalLink } from "@/contracts";

export default function AdminLinks() {
  const [links, { refetch }] = createResource<ExternalLink[]>(async () => {
    const res = await fetch("/api/raffle/admin/links");
    if (!res.ok) return [];
    return res.json();
  });

  const [loading, setLoading] = createSignal<string | null>(null);
  const [showAdd, setShowAdd] = createSignal(false);
  const [editId, setEditId] = createSignal<string | null>(null);

  const [newLabel, setNewLabel] = createSignal("");
  const [newUrl, setNewUrl] = createSignal("");
  const [editLabel, setEditLabel] = createSignal("");
  const [editUrl, setEditUrl] = createSignal("");

  const addLink = async () => {
    if (!newLabel().trim() || !newUrl().trim()) return prompts.error("Bezeichnung und URL sind erforderlich.");
    setLoading("add");
    try {
      const res = await fetch("/api/raffle/admin/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel().trim(), url: newUrl().trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        await prompts.error(body.message ?? "Fehler.");
        return;
      }
      setNewLabel("");
      setNewUrl("");
      setShowAdd(false);
      refetch();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(null);
    }
  };

  const saveEdit = async (id: string) => {
    setLoading(`edit-${id}`);
    try {
      const res = await fetch(`/api/raffle/admin/links/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel().trim(), url: editUrl().trim() }),
      });
      if (!res.ok) {
        const body = await res.json();
        await prompts.error(body.message ?? "Fehler.");
        return;
      }
      setEditId(null);
      refetch();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(null);
    }
  };

  const deleteLink = async (id: string, label: string) => {
    const ok = await prompts.confirm(`Link „${label}" löschen?`, { title: "Link löschen" });
    if (!ok) return;
    setLoading(`del-${id}`);
    try {
      await fetch(`/api/raffle/admin/links/${id}`, { method: "DELETE" });
      refetch();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="info-block-info p-3 text-xs">
        <i class="ti ti-link mr-1" />
        Diese Links werden auf der öffentlichen Verlosungsseite angezeigt (z.B. zur Veranstaltungsseite).
      </div>

      <Show when={links.loading}>
        <p class="text-xs text-dimmed py-4 text-center">
          <i class="ti ti-loader-2 animate-spin mr-1" /> Lädt…
        </p>
      </Show>

      <Show when={!links.loading}>
        <div class="paper overflow-hidden">
          <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span class="text-xs font-medium text-dimmed">
              {(links() ?? []).length} Link{(links() ?? []).length !== 1 ? "s" : ""}
            </span>
            <button class="btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)}>
              <i class={`ti ${showAdd() ? "ti-x" : "ti-plus"} mr-1`} />
              {showAdd() ? "Abbrechen" : "Link hinzufügen"}
            </button>
          </div>

          <Show when={showAdd()}>
            <div class="p-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-col gap-2">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  class="btn-input w-full"
                  placeholder="Bezeichnung (z.B. Veranstaltungsseite)"
                  value={newLabel()}
                  onInput={(e) => setNewLabel(e.currentTarget.value)}
                />
                <input
                  type="url"
                  class="btn-input w-full"
                  placeholder="https://..."
                  value={newUrl()}
                  onInput={(e) => setNewUrl(e.currentTarget.value)}
                />
              </div>
              <button
                class="btn-primary btn-sm self-start"
                onClick={addLink}
                disabled={loading() === "add"}
              >
                {loading() === "add" ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-check mr-1" />}
                Hinzufügen
              </button>
            </div>
          </Show>

          <Show when={(links() ?? []).length === 0 && !showAdd()}>
            <p class="text-xs text-dimmed text-center py-6">Noch keine Links vorhanden.</p>
          </Show>

          <For each={links()}>
            {(link) => (
              <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                <Show
                  when={editId() === link.id}
                  fallback={
                    <div class="flex items-center gap-2">
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-primary truncate">{link.label}</p>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-xs text-dimmed hover:underline truncate block"
                        >
                          {link.url}
                        </a>
                      </div>
                      <button
                        class="btn-secondary btn-sm shrink-0"
                        onClick={() => {
                          setEditId(link.id);
                          setEditLabel(link.label);
                          setEditUrl(link.url);
                        }}
                      >
                        <i class="ti ti-pencil" />
                      </button>
                      <button
                        class="btn-danger btn-sm shrink-0"
                        disabled={loading() === `del-${link.id}`}
                        onClick={() => deleteLink(link.id, link.label)}
                      >
                        {loading() === `del-${link.id}` ? (
                          <i class="ti ti-loader-2 animate-spin" />
                        ) : (
                          <i class="ti ti-trash" />
                        )}
                      </button>
                    </div>
                  }
                >
                  <div class="flex flex-col gap-2">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        class="btn-input w-full"
                        value={editLabel()}
                        onInput={(e) => setEditLabel(e.currentTarget.value)}
                      />
                      <input
                        type="url"
                        class="btn-input w-full"
                        value={editUrl()}
                        onInput={(e) => setEditUrl(e.currentTarget.value)}
                      />
                    </div>
                    <div class="flex gap-1">
                      <button
                        class="btn-primary btn-sm"
                        onClick={() => saveEdit(link.id)}
                        disabled={!!loading()}
                      >
                        {loading() === `edit-${link.id}` ? <i class="ti ti-loader-2 animate-spin" /> : "Speichern"}
                      </button>
                      <button class="btn-secondary btn-sm" onClick={() => setEditId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
