import { createSignal, For, Show } from "solid-js";

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

interface Props {
  items: FaqItem[];
}

export default function RaffleFaq(props: Props) {
  const items = () => (props.items.length > 0 ? props.items : DEFAULT_FAQ);
  const [open, setOpen] = createSignal<number | null>(null);
  const toggle = (i: number) => setOpen((prev) => (prev === i ? null : i));

  return (
    <div class="paper overflow-hidden mb-4">
      <div class="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p class="text-sm font-semibold text-primary">
          <i class="ti ti-help-circle mr-2 text-blue-500" />
          Häufige Fragen
        </p>
      </div>
      <div class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <For each={items()}>
          {(item, i) => (
            <div>
              <button
                class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => toggle(i())}
              >
                <span class="text-sm font-medium text-primary">{item.q}</span>
                <i
                  class={`ti ti-chevron-down shrink-0 text-dimmed transition-transform ${open() === i() ? "rotate-180" : ""}`}
                />
              </button>
              <Show when={open() === i()}>
                <div class="px-4 pb-3 text-sm text-dimmed leading-relaxed">
                  {item.a}
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
