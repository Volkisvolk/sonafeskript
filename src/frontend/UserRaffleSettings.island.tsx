import { createSignal, For, Show } from "solid-js";
import { prompts, refreshCurrentPath } from "@valentinkolb/cloud/ui";
import type { RaffleItem, RaffleMember } from "@/contracts";

type EmailConfig = Pick<
  RaffleItem,
  "replyToEmail" | "winEmailSubject" | "winEmailBody" | "lossEmailSubject" | "lossEmailBody"
>;

interface FaqItem { q: string; a: string; }

const DEFAULT_FAQ: FaqItem[] = [
  {
    q: "Wie viele Karten kann ich anfordern?",
    a: "Du kannst 1 oder 2 Karten anfordern. Die Anzahl ist unabhaengig davon, ob du in einer Gruppe bist.",
  },
  {
    q: "Wann erfahre ich, ob ich gewonnen habe?",
    a: "Nach der Verlosung erhaeltst du eine E-Mail an die angegebene Adresse. Bitte schau auch in deinen Spam-Ordner.",
  },
];

interface Defaults {
  agbText: string;
  replyToEmail: string;
  regEmailSubject: string;
  regEmailBody: string;
  winEmailSubject: string;
  winEmailBody: string;
  lossEmailSubject: string;
  lossEmailBody: string;
}

interface Props {
  raffleId: string;
  name: string;
  description: string | null;
  ticketContingent: number;
  totalRequestedTickets: number;
  allowedEmailPatterns: string[];
  emailConfig: EmailConfig;
  bannerUrl: string | null;
  bannerPosition: string;
  faqItems: FaqItem[];
  agbText: string | null;
  regEmailSubject: string | null;
  regEmailBody: string | null;
  defaults: Defaults;
  members: RaffleMember[];
  currentUserRole: "owner" | "moderator";
  currentUserId: string;
}

function MembersTab(p: { raffleId: string; members: RaffleMember[]; currentUserRole: "owner" | "moderator"; currentUserId: string }) {
  const [memberEmail, setMemberEmail] = createSignal("");
  const [memberRole, setMemberRole] = createSignal<"owner" | "moderator">("moderator");
  const [memberLoading, setMemberLoading] = createSignal(false);

  const isOwner = () => p.currentUserRole === "owner";

  const handleAdd = async () => {
    if (!memberEmail().trim()) return;
    setMemberLoading(true);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${p.raffleId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail().trim(), role: memberRole() }),
      });
      const body = await res.json();
      if (!res.ok) { await prompts.error(body.message ?? "Fehler beim Hinzufügen."); return; }
      setMemberEmail("");
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setMemberLoading(false);
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
      const res = await fetch(`/api/raffle/user/raffles/${p.raffleId}/members/${member.userId}`, { method: "DELETE" });
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
    <div class="flex flex-col gap-3">
      <div class="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-100 dark:border-zinc-800 rounded-lg overflow-hidden">
        <For each={p.members}>
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
                <Show when={isOwner() && member.userId !== p.currentUserId}>
                  <button class="btn-simple btn-sm text-red-500 hover:text-red-600" onClick={() => handleRemove(member)}>
                    <i class="ti ti-x text-xs" />
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>

      <Show when={isOwner()}>
        <div class="flex flex-col gap-2">
          <p class="text-xs font-medium text-dimmed">Mitglied hinzufügen</p>
          <div class="flex gap-2">
            <input
              type="email"
              class="btn-input flex-1"
              placeholder="E-Mail-Adresse"
              value={memberEmail()}
              onInput={(e) => setMemberEmail(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <select class="btn-input shrink-0" value={memberRole()} onChange={(e) => setMemberRole(e.currentTarget.value as "owner" | "moderator")}>
              <option value="moderator">Moderator</option>
              <option value="owner">Besitzer</option>
            </select>
            <button class="btn-primary btn-sm shrink-0" disabled={!memberEmail().trim() || memberLoading()} onClick={handleAdd}>
              {memberLoading() ? <i class="ti ti-loader-2 animate-spin" /> : <i class="ti ti-plus" />}
            </button>
          </div>
          <p class="text-xs text-dimmed">
            <i class="ti ti-info-circle mr-1" />
            Moderatoren können die Verlosung verwalten. Besitzer können zusätzlich Mitglieder verwalten und die Verlosung löschen.
          </p>
        </div>
      </Show>
    </div>
  );
}

const Tip = (props: { text: string }) => (
  <span class="group relative inline-block align-middle ml-1">
    <i class="ti ti-info-circle text-dimmed text-[11px] cursor-help" />
    <span class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2 max-w-[240px] whitespace-normal rounded bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 text-center leading-tight">
      {props.text}
    </span>
  </span>
);

const PRESETS = [
  { label: "Uni Ulm", pattern: "^[^@]*\\.[^@]*@uni-ulm\\.de$", hint: "vorname.nachname@uni-ulm.de" },
  { label: "THU",     pattern: "@thu\\.de$",                    hint: "*@thu.de" },
  { label: "HS Ulm",  pattern: "@hs-ulm\\.de$",                hint: "*@hs-ulm.de" },
];

type Tab = "general" | "filter" | "email" | "banner" | "faq" | "members";

export default function UserRaffleSettings(props: Props) {
  const [showForm, setShowForm] = createSignal(false);
  const [tab, setTab] = createSignal<Tab>("general");

  // ── Allgemein ──────────────────────────────────────────────────────────────
  const [raffleName, setRaffleName] = createSignal(props.name);
  const [description, setDescription] = createSignal(props.description ?? "");
  const [contingent, setContingent] = createSignal(String(props.ticketContingent));
  const [agbText, setAgbText] = createSignal(props.agbText ?? "");

  // ── E-Mail-Filter ──────────────────────────────────────────────────────────
  const [patterns, setPatterns] = createSignal<string[]>([...props.allowedEmailPatterns]);
  const [customInput, setCustomInput] = createSignal("");
  const [testEmail, setTestEmail] = createSignal("");

  const inputError = () => {
    const v = customInput().trim();
    if (!v) return null;
    try { new RegExp(v, "i"); return null; } catch (e: any) { return e.message as string; }
  };

  const addPattern = (p: string) => {
    const trimmed = p.trim();
    if (!trimmed || patterns().includes(trimmed)) return;
    try { new RegExp(trimmed, "i"); } catch { return; }
    setPatterns((prev) => [...prev, trimmed]);
  };

  const removePattern = (index: number) =>
    setPatterns((prev) => prev.filter((_, i) => i !== index));

  const handleAddCustom = () => {
    if (inputError()) return;
    addPattern(customInput());
    setCustomInput("");
  };

  const testResult = () => {
    const e = testEmail().trim();
    const list = patterns();
    if (!e || list.length === 0) return null;
    const allowed = list.some((p) => { try { return new RegExp(p, "i").test(e); } catch { return false; } });
    return allowed ? "erlaubt" : "gesperrt";
  };

  // ── E-Mail-Inhalt ──────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = createSignal(props.emailConfig.replyToEmail ?? "");
  const [regSubject, setRegSubject] = createSignal(props.regEmailSubject ?? "");
  const [regBody, setRegBody] = createSignal(props.regEmailBody ?? "");
  const [winSubject, setWinSubject] = createSignal(props.emailConfig.winEmailSubject ?? "");
  const [winBody, setWinBody] = createSignal(props.emailConfig.winEmailBody ?? "");
  const [lossSubject, setLossSubject] = createSignal(props.emailConfig.lossEmailSubject ?? "");
  const [lossBody, setLossBody] = createSignal(props.emailConfig.lossEmailBody ?? "");

  // ── Banner ────────────────────────────────────────────────────────────────
  const [bannerPreview, setBannerPreview] = createSignal<string | null>(props.bannerUrl);
  const [bannerDims, setBannerDims] = createSignal<{ w: number; h: number } | null>(null);
  const [bannerChanged, setBannerChanged] = createSignal(false);

  const parsePos = (s: string) => {
    const [x, y] = s.split(" ").map((v) => parseInt(v));
    return { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y };
  };
  const initial = parsePos(props.bannerPosition ?? "50% 50%");
  const [posX, setPosX] = createSignal(initial.x);
  const [posY, setPosY] = createSignal(initial.y);
  const positionCss = () => `${posX()}% ${posY()}%`;

  let dragContainerRef!: HTMLDivElement;
  let isDragging = false;

  const applyPointer = (clientX: number, clientY: number) => {
    const rect = dragContainerRef.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)));
    setPosX(x);
    setPosY(y);
    setBannerChanged(true);
  };

  const onMouseDown = (e: MouseEvent) => { isDragging = true; applyPointer(e.clientX, e.clientY); };
  const onMouseMove = (e: MouseEvent) => { if (isDragging) applyPointer(e.clientX, e.clientY); };
  const onMouseUp   = () => { isDragging = false; };
  const onTouchStart = (e: TouchEvent) => { isDragging = true; applyPointer(e.touches[0].clientX, e.touches[0].clientY); };
  const onTouchMove  = (e: TouchEvent) => { if (isDragging) { e.preventDefault(); applyPointer(e.touches[0].clientX, e.touches[0].clientY); } };
  const onTouchEnd   = () => { isDragging = false; };

  const resizeImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX_W = 1400;
        const ratio = Math.min(1, MAX_W / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });

  const handleBannerFile = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      await prompts.error("Das Bild ist zu groß (max. 8 MB).");
      return;
    }
    try {
      const data = await resizeImage(file);
      setBannerPreview(data);
      setBannerChanged(true);
    } catch {
      await prompts.error("Bild konnte nicht geladen werden.");
    }
  };

  const removeBanner = () => { setBannerPreview(null); setBannerChanged(true); };

  // ── FAQ ───────────────────────────────────────────────────────────────────
  const [faqItems, setFaqItems] = createSignal<FaqItem[]>(
    props.faqItems.length > 0 ? [...props.faqItems] : [...DEFAULT_FAQ]
  );
  const [faqQ, setFaqQ] = createSignal("");
  const [faqA, setFaqA] = createSignal("");
  const [editingIdx, setEditingIdx] = createSignal<number | null>(null);
  const [editQ, setEditQ] = createSignal("");
  const [editA, setEditA] = createSignal("");

  const addFaqItem = () => {
    const q = faqQ().trim(); const a = faqA().trim();
    if (!q || !a) return;
    setFaqItems((prev) => [...prev, { q, a }]);
    setFaqQ(""); setFaqA("");
  };
  const removeFaqItem = (i: number) => {
    if (editingIdx() === i) setEditingIdx(null);
    setFaqItems((prev) => prev.filter((_, idx) => idx !== i));
  };
  const moveFaqItem = (i: number, dir: -1 | 1) => {
    const arr = [...faqItems()];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (editingIdx() === i) setEditingIdx(j);
    else if (editingIdx() === j) setEditingIdx(i);
    setFaqItems(arr);
  };
  const startEdit = (i: number) => {
    setEditingIdx(i);
    setEditQ(faqItems()[i].q);
    setEditA(faqItems()[i].a);
  };
  const confirmEdit = (i: number) => {
    const q = editQ().trim(); const a = editA().trim();
    if (!q || !a) return;
    setFaqItems((prev) => prev.map((item, idx) => idx === i ? { q, a } : item));
    setEditingIdx(null);
  };

  // ── Speichern ──────────────────────────────────────────────────────────────
  const [loading, setLoading] = createSignal(false);

  const handleSave = async () => {
    if (!raffleName().trim()) { await prompts.error("Name darf nicht leer sein."); return; }
    const cont = parseInt(contingent(), 10);
    if (isNaN(cont) || cont < 1) { await prompts.error("Das Kontingent muss eine positive Zahl sein."); return; }
    if (cont < props.totalRequestedTickets) {
      await prompts.error(`Das Kontingent kann nicht unter ${props.totalRequestedTickets} gesenkt werden – so viele Karten wurden bereits angefordert.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/raffle/user/raffles/${props.raffleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: raffleName().trim(),
          description: description().trim() || null,
          ticketContingent: cont,
          allowedEmailPatterns: patterns(),
          replyToEmail: replyTo().trim() || null,
          regEmailSubject: regSubject().trim() || null,
          regEmailBody: regBody().trim() || null,
          winEmailSubject: winSubject().trim() || null,
          winEmailBody: winBody().trim() || null,
          lossEmailSubject: lossSubject().trim() || null,
          lossEmailBody: lossBody().trim() || null,
          bannerPosition: positionCss(),
          faqItems: faqItems(),
          agbText: agbText().trim() || null,
          ...(bannerChanged() ? { bannerUrl: bannerPreview() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) { await prompts.error(body.message ?? "Fehler beim Speichern."); return; }
      setShowForm(false);
      refreshCurrentPath();
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="paper overflow-hidden">
      {/* ── Header ── */}
      <div class="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="ti ti-settings text-dimmed" />
          <span class="text-xs font-medium text-dimmed">Verlosungseinstellungen</span>
        </div>
        <button class="btn-secondary btn-sm" onClick={() => setShowForm((v) => !v)}>
          <i class={`ti ${showForm() ? "ti-x" : "ti-settings-2"} mr-1`} />
          {showForm() ? "Schließen" : "Einstellungen"}
        </button>
      </div>

      {/* ── Collapsed Summary ── */}
      <Show when={!showForm()}>
        <div class="px-3 py-2 text-xs text-dimmed flex flex-wrap gap-x-4 gap-y-1">
          <span class="flex items-center gap-1">
            <i class="ti ti-mail-check" />
            E-Mail-Filter:{" "}
            {props.allowedEmailPatterns.length > 0
              ? `${props.allowedEmailPatterns.length} Muster aktiv`
              : <span class="italic">kein Filter</span>}
          </span>
          <span class="flex items-center gap-1">
            <i class="ti ti-mail" />
            Mails:{" "}
            {props.emailConfig.winEmailSubject || props.emailConfig.lossEmailSubject
              ? <span class="text-blue-600 dark:text-blue-400">individuell konfiguriert</span>
              : <span class="italic">globale Standardtexte</span>}
          </span>
          <span class="flex items-center gap-1">
            <i class="ti ti-photo" />
            Banner:{" "}
            {props.bannerUrl
              ? <span class="text-blue-600 dark:text-blue-400">gesetzt</span>
              : <span class="italic">kein Banner</span>}
          </span>
        </div>
      </Show>

      {/* ── Expanded Form ── */}
      <Show when={showForm()}>
        {/* Tabs */}
        <div class="flex gap-0 border-b border-zinc-100 dark:border-zinc-800">
          {([
            { id: "general" as Tab, label: "Allgemein",     icon: "ti-edit" },
            { id: "filter"  as Tab, label: "E-Mail-Filter", icon: "ti-shield-check" },
            { id: "email"   as Tab, label: "Mail-Inhalte",  icon: "ti-mail-cog" },
            { id: "banner"  as Tab, label: "Banner",        icon: "ti-photo" },
            { id: "faq"     as Tab, label: "FAQ",           icon: "ti-help-circle" },
            { id: "members" as Tab, label: "Mitglieder",    icon: "ti-users" },
          ] as const).map((t) => (
            <button
              class={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab() === t.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-dimmed hover:text-primary"
              }`}
              onClick={() => setTab(t.id)}
            >
              <i class={`ti ${t.icon} mr-1`} />
              {t.label}
            </button>
          ))}
        </div>

        <div class="p-3 flex flex-col gap-4">

          {/* ── Tab: Allgemein ── */}
          <Show when={tab() === "general"}>
            <div class="flex flex-col gap-3">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">
                    Name <span class="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    class="btn-input w-full"
                    value={raffleName()}
                    onInput={(e) => setRaffleName(e.currentTarget.value)}
                    required
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">
                    Kartenkontingent <span class="text-red-500">*</span>
                    <Tip text="Maximale Anzahl der Tickets. Kann nicht unter die Summe bereits angeforderter Karten gesenkt werden." />
                  </label>
                  <input
                    type="number"
                    class="btn-input w-full"
                    min={props.totalRequestedTickets}
                    value={contingent()}
                    onInput={(e) => setContingent(e.currentTarget.value)}
                    required
                  />
                  <p class="text-xs text-dimmed mt-1">
                    Minimum: {props.totalRequestedTickets} (bereits angefordert)
                  </p>
                </div>
              </div>
              <div>
                <label class="block text-xs font-medium text-dimmed mb-1">Beschreibung (optional)</label>
                <input
                  type="text"
                  class="btn-input w-full"
                  placeholder="Kurze Beschreibung – Links: [Text](https://...)"
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-dimmed mb-1">
                  Teilnahmebedingungen (AGB)
                  <Tip text="Wird als Pflicht-Checkbox im Anmeldeformular angezeigt. Leer lassen = globaler Standardtext wird verwendet." />
                </label>
                <textarea
                  class="btn-input w-full resize-y"
                  rows={4}
                  placeholder={props.defaults.agbText || "Leer = globaler Standardtext wird verwendet."}
                  value={agbText()}
                  onInput={(e) => setAgbText(e.currentTarget.value)}
                />
                <p class="text-xs text-dimmed mt-1">
                  Wird als Pflicht-Checkbox im Anmeldeformular angezeigt. Links: <code class="font-mono">[Text](https://...)</code>
                </p>
              </div>
            </div>
          </Show>

          {/* ── Tab: E-Mail-Filter ── */}
          <Show when={tab() === "filter"}>

            <div>
              <p class="text-xs font-medium text-dimmed mb-2">Voreinstellungen</p>
              <div class="flex gap-2 flex-wrap">
                <For each={PRESETS}>
                  {(preset) => {
                    const active = () => patterns().includes(preset.pattern);
                    return (
                      <button
                        class={`btn-sm text-xs flex items-center gap-1 transition-colors ${
                          active() ? "bg-blue-600 text-white border border-blue-600" : "btn-secondary"
                        }`}
                        onClick={() =>
                          active()
                            ? removePattern(patterns().indexOf(preset.pattern))
                            : addPattern(preset.pattern)
                        }
                      >
                        <i class={`ti ${active() ? "ti-circle-check" : "ti-plus"}`} />
                        {preset.label}
                        <span class="opacity-60 font-mono text-[10px]">({preset.hint})</span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            <div>
              <p class="text-xs font-medium text-dimmed mb-2">
                Aktive Filter{" "}
                <span class="opacity-60">
                  ({patterns().length === 0 ? "kein Filter – alle erlaubt" : `${patterns().length} Muster`})
                </span>
                <Tip text="Nur E-Mail-Adressen, die mindestens einem Muster entsprechen, duerfen sich anmelden. Ohne Filter sind alle E-Mail-Adressen erlaubt." />
              </p>
              <Show
                when={patterns().length > 0}
                fallback={<p class="text-xs text-dimmed italic">Noch keine Filter hinzugefügt.</p>}
              >
                <div class="flex gap-1 flex-wrap">
                  <For each={patterns()}>
                    {(p, i) => (
                      <span class="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-primary font-mono px-2 py-1 rounded-full text-xs">
                        {p}
                        <button
                          class="ml-0.5 text-dimmed hover:text-red-500 transition-colors"
                          onClick={() => removePattern(i())}
                        >
                          <i class="ti ti-x text-[10px]" />
                        </button>
                      </span>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <div>
              <p class="text-xs font-medium text-dimmed mb-2">
                Eigenes Muster (RegEx)
                <Tip text="Regulaerer Ausdruck (JavaScript-Syntax) zur E-Mail-Pruefung. Gross-/Kleinschreibung wird ignoriert." />
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  class="btn-input flex-1 font-mono"
                  placeholder="z. B. @meinverein\.de$"
                  value={customInput()}
                  onInput={(e) => setCustomInput(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
                />
                <button
                  class="btn-secondary btn-sm shrink-0"
                  disabled={!customInput().trim() || !!inputError()}
                  onClick={handleAddCustom}
                >
                  <i class="ti ti-plus mr-1" /> Hinzufügen
                </button>
              </div>
              <Show when={inputError()}>
                <p class="mt-1 text-xs text-red-500">
                  <i class="ti ti-alert-circle mr-1" />{inputError()}
                </p>
              </Show>
            </div>

            <Show when={patterns().length > 0}>
              <div>
                <p class="text-xs font-medium text-dimmed mb-2">Testen</p>
                <div class="flex gap-2 items-center">
                  <input
                    type="email"
                    class="btn-input flex-1"
                    placeholder="test@beispiel.de"
                    value={testEmail()}
                    onInput={(e) => setTestEmail(e.currentTarget.value)}
                  />
                  <Show when={testResult()}>
                    <span
                      class={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                        testResult() === "erlaubt"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      }`}
                    >
                      <i class={`ti ${testResult() === "erlaubt" ? "ti-circle-check" : "ti-circle-x"} mr-1`} />
                      {testResult()}
                    </span>
                  </Show>
                </div>
              </div>
            </Show>

          </Show>

          {/* ── Tab: Mail-Inhalte ── */}
          <Show when={tab() === "email"}>

            <div class="info-block-warning p-3 text-xs">
              <i class="ti ti-info-circle mr-1" />
              Leer lassen = globaler Standardtext wird verwendet.
              Verfügbare Platzhalter: <code class="font-mono">{"{{name}}"}</code>{" "}
              (Gewinn-Mail auch: <code class="font-mono">{"{{won_tickets}}"}</code>)
            </div>

            <div>
              <label class="block text-xs font-medium text-dimmed mb-1">
                Reply-To E-Mail
                <Tip text="Antworten auf versendete Mails werden an diese Adresse weitergeleitet. Leer lassen = kein Reply-To-Header." />
              </label>
              <input
                type="email"
                class="btn-input w-full"
                placeholder={props.defaults.replyToEmail || "antwort@example.de (globaler Standard)"}
                value={replyTo()}
                onInput={(e) => setReplyTo(e.currentTarget.value)}
              />
            </div>

            <div class="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p class="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-3">
                <i class="ti ti-mail mr-1" /> Anmeldungs-Mail
                <Tip text="Wird direkt nach der Anmeldung versendet. Enthaelt automatisch den Gruppencode, falls eine Gruppe erstellt wurde." />
              </p>
              <div class="flex flex-col gap-3">
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Betreff</label>
                  <input
                    type="text"
                    class="btn-input w-full"
                    placeholder={props.defaults.regEmailSubject || "Deine Anmeldung für {{raffle_name}} (Standard)"}
                    value={regSubject()}
                    onInput={(e) => setRegSubject(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Nachrichtentext</label>
                  <textarea
                    class="btn-input w-full font-mono resize-y"
                    rows={5}
                    placeholder={props.defaults.regEmailBody || "Hallo {{name}},\n\ndu hast dich erfolgreich angemeldet … (Standard)"}
                    value={regBody()}
                    onInput={(e) => setRegBody(e.currentTarget.value)}
                  />
                  <p class="text-xs text-dimmed mt-1">
                    Platzhalter: <code class="font-mono">{"{{name}}"}</code>, <code class="font-mono">{"{{raffle_name}}"}</code>.
                    Der Gruppencode wird automatisch angehängt, falls zutreffend.
                  </p>
                </div>
              </div>
            </div>

            <div class="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
                <i class="ti ti-trophy mr-1" /> Gewinn-Mail
                <Tip text="Wird beim Finalisieren an alle Gewinner versendet. Platzhalter: {{name}}, {{won_tickets}}, {{raffle_name}}." />
              </p>
              <div class="flex flex-col gap-3">
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Betreff</label>
                  <input
                    type="text"
                    class="btn-input w-full"
                    placeholder={props.defaults.winEmailSubject || "Herzlichen Glückwunsch – Du hast gewonnen! (Standard)"}
                    value={winSubject()}
                    onInput={(e) => setWinSubject(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Nachrichtentext</label>
                  <textarea
                    class="btn-input w-full font-mono resize-y"
                    rows={6}
                    placeholder={props.defaults.winEmailBody || "Hallo {{name}},\n\nherzlichen Glückwunsch! … (Standard)"}
                    value={winBody()}
                    onInput={(e) => setWinBody(e.currentTarget.value)}
                  />
                </div>
              </div>
            </div>

            <div class="border-t border-zinc-100 dark:border-zinc-800 pt-4">
              <p class="text-xs font-semibold text-red-500 mb-3">
                <i class="ti ti-x mr-1" /> Verlier-Mail
                <Tip text="Wird beim Finalisieren an alle Nicht-Gewinner versendet. Platzhalter: {{name}}, {{raffle_name}}." />
              </p>
              <div class="flex flex-col gap-3">
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Betreff</label>
                  <input
                    type="text"
                    class="btn-input w-full"
                    placeholder={props.defaults.lossEmailSubject || "Leider kein Glück bei der Verlosung (Standard)"}
                    value={lossSubject()}
                    onInput={(e) => setLossSubject(e.currentTarget.value)}
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-dimmed mb-1">Nachrichtentext</label>
                  <textarea
                    class="btn-input w-full font-mono resize-y"
                    rows={6}
                    placeholder={props.defaults.lossEmailBody || "Hallo {{name}},\n\nleider kein Glück … (Standard)"}
                    value={lossBody()}
                    onInput={(e) => setLossBody(e.currentTarget.value)}
                  />
                </div>
              </div>
            </div>

          </Show>

          {/* ── Tab: Banner ── */}
          <Show when={tab() === "banner"}>
            <div class="flex flex-col gap-3">

              <Show when={bannerPreview()}>
                <div>
                  <p class="text-xs font-medium text-dimmed mb-2">Position anpassen — Bild ziehen</p>
                  <div
                    ref={dragContainerRef!}
                    class="relative rounded-xl overflow-hidden cursor-crosshair select-none border border-zinc-200 dark:border-zinc-700"
                    style="height: 160px"
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                  >
                    <img
                      src={bannerPreview()!}
                      alt="Banner"
                      class="w-full h-full object-cover pointer-events-none"
                      style={`object-position: ${positionCss()}`}
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        setBannerDims({ w: img.naturalWidth, h: img.naturalHeight });
                      }}
                    />
                    <div
                      class="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                      style={`left: ${posX()}%; top: ${posY()}%`}
                    >
                      <div class="w-full h-full rounded-full border-2 border-white shadow-md bg-white/20" />
                    </div>
                  </div>
                  <p class="text-xs text-dimmed mt-1 text-center">
                    Position: {posX()}% / {posY()}%
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-dimmed mb-1">Horizontal ({posX()}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={posX()}
                      onInput={(e) => { setPosX(+e.currentTarget.value); setBannerChanged(true); }}
                      class="w-full"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-dimmed mb-1">Vertikal ({posY()}%)</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={posY()}
                      onInput={(e) => { setPosY(+e.currentTarget.value); setBannerChanged(true); }}
                      class="w-full"
                    />
                  </div>
                </div>

                <Show when={bannerDims()}>
                  <p class="text-xs text-dimmed">
                    <i class="ti ti-ruler-2 mr-1" />
                    Bildgröße: <span class="font-mono">{bannerDims()!.w} × {bannerDims()!.h} px</span>
                    {" "}— Empfohlen: <span class="font-mono">1400 × 400–600 px</span>
                  </p>
                </Show>

                <button class="btn-danger btn-sm w-fit" onClick={removeBanner}>
                  <i class="ti ti-trash mr-1" /> Banner entfernen
                </button>
              </Show>

              <Show when={!bannerPreview()}>
                <div class="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-8 text-center">
                  <i class="ti ti-photo text-3xl text-dimmed mb-2 block" />
                  <p class="text-xs text-dimmed">Kein Banner gesetzt</p>
                </div>
              </Show>

              <label class="btn-secondary btn-sm cursor-pointer inline-flex items-center gap-2 w-fit">
                <i class="ti ti-upload" />
                {bannerPreview() ? "Anderes Bild wählen" : "Bild hochladen"}
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  onChange={handleBannerFile}
                />
              </label>

              <p class="text-xs text-dimmed">
                JPG, PNG, WebP — max. 8 MB. Das Bild wird automatisch auf max. 1400 px Breite skaliert.
                Wird oben auf der öffentlichen Verlosungsseite angezeigt.
              </p>

            </div>
          </Show>

          {/* ── Tab: FAQ ── */}
          <Show when={tab() === "faq"}>
            <div class="flex flex-col gap-4">

              <div class="info-block-warning p-3 text-xs">
                <i class="ti ti-info-circle mr-1" />
                Die Standard-FAQ-Einträge sind vorausgefüllt. Ändere oder lösche sie nach Bedarf.
                Alle Einträge werden nur für diese Verlosung gespeichert.
              </div>

              <Show when={faqItems().length > 0}>
                <div class="flex flex-col gap-2">
                  <For each={faqItems()}>
                    {(item, i) => (
                      <div class="paper p-3 flex flex-col gap-2">
                        <Show
                          when={editingIdx() === i()}
                          fallback={
                            <>
                              <div class="flex items-start justify-between gap-2">
                                <p class="text-xs font-medium text-primary flex-1">{item.q}</p>
                                <div class="flex gap-1 shrink-0">
                                  <button class="btn-simple btn-sm" onClick={() => moveFaqItem(i(), -1)} disabled={i() === 0} title="Nach oben">
                                    <i class="ti ti-arrow-up text-[11px]" />
                                  </button>
                                  <button class="btn-simple btn-sm" onClick={() => moveFaqItem(i(), 1)} disabled={i() === faqItems().length - 1} title="Nach unten">
                                    <i class="ti ti-arrow-down text-[11px]" />
                                  </button>
                                  <button class="btn-simple btn-sm" onClick={() => startEdit(i())} title="Bearbeiten">
                                    <i class="ti ti-pencil text-[11px]" />
                                  </button>
                                  <button class="btn-simple btn-sm text-red-500" onClick={() => removeFaqItem(i())} title="Entfernen">
                                    <i class="ti ti-trash text-[11px]" />
                                  </button>
                                </div>
                              </div>
                              <p class="text-xs text-dimmed">{item.a}</p>
                            </>
                          }
                        >
                          <input
                            type="text"
                            class="btn-input w-full text-xs"
                            value={editQ()}
                            onInput={(e) => setEditQ(e.currentTarget.value)}
                            placeholder="Frage"
                          />
                          <textarea
                            class="btn-input w-full text-xs resize-y"
                            rows={3}
                            value={editA()}
                            onInput={(e) => setEditA(e.currentTarget.value)}
                            placeholder="Antwort"
                          />
                          <div class="flex gap-2">
                            <button
                              class="btn-primary btn-sm"
                              disabled={!editQ().trim() || !editA().trim()}
                              onClick={() => confirmEdit(i())}
                            >
                              <i class="ti ti-check mr-1" /> Übernehmen
                            </button>
                            <button class="btn-secondary btn-sm" onClick={() => setEditingIdx(null)}>
                              Abbrechen
                            </button>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div class="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex flex-col gap-2">
                <p class="text-xs font-medium text-dimmed">Neue Frage hinzufügen</p>
                <input
                  type="text"
                  class="btn-input w-full"
                  placeholder="Frage"
                  value={faqQ()}
                  onInput={(e) => setFaqQ(e.currentTarget.value)}
                />
                <textarea
                  class="btn-input w-full resize-y"
                  rows={3}
                  placeholder="Antwort"
                  value={faqA()}
                  onInput={(e) => setFaqA(e.currentTarget.value)}
                />
                <button
                  class="btn-secondary btn-sm w-fit"
                  disabled={!faqQ().trim() || !faqA().trim()}
                  onClick={addFaqItem}
                >
                  <i class="ti ti-plus mr-1" /> Hinzufügen
                </button>
              </div>

            </div>
          </Show>

          {/* ── Tab: Mitglieder ── */}
          <Show when={tab() === "members"}>
            <MembersTab
              raffleId={props.raffleId}
              members={props.members}
              currentUserRole={props.currentUserRole}
              currentUserId={props.currentUserId}
            />
          </Show>

          <Show when={tab() !== "members"}>
            <div class="flex gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
              <button class="btn-primary btn-sm" disabled={loading()} onClick={handleSave}>
                {loading() ? <i class="ti ti-loader-2 animate-spin mr-1" /> : <i class="ti ti-check mr-1" />}
                Speichern
              </button>
              <button class="btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                Abbrechen
              </button>
            </div>
          </Show>

        </div>
      </Show>
    </div>
  );
}
