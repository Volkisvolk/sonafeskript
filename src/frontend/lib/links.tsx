import type { JSX } from "solid-js";

// Markdown-Link-Pattern: [label](https://...)
const LINK_RE = /\[([^\]]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g;

type Segment = { type: "text"; value: string } | { type: "link"; label: string; url: string };

// Validiert eine URL: nur http/https erlaubt. Gibt die normalisierte URL
// zurück oder null, wenn sie nicht sicher renderbar ist.
const safeHref = (raw: string): string | null => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.href;
};

// Zerlegt einen Text in Text- und Link-Segmente. Reine Funktion, kein HTML.
export const parseSegments = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const [full, label, url] = match;
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    const href = safeHref(url!);
    if (href) {
      segments.push({ type: "link", label: label!, url: href });
    } else {
      // Ungültige URL → als reiner Text rendern (kein Link)
      segments.push({ type: "text", value: full });
    }
    lastIndex = start + full.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
};

/**
 * Rendert Text mit eingebetteten Markdown-Links als sichere JSX-Knoten.
 * Kein innerHTML, keine String-HTML-Erzeugung → kein XSS-Risiko.
 * Solid escaped Textinhalte und Attributwerte automatisch.
 */
export const LinkText = (props: { text: string | null | undefined; class?: string }): JSX.Element => {
  const segments = () => parseSegments(props.text ?? "");
  return (
    <span class={props.class}>
      {segments().map((seg) =>
        seg.type === "link" ? (
          <a
            href={seg.url}
            target="_blank"
            rel="noopener noreferrer"
            class="underline hover:no-underline break-all"
          >
            {seg.label}
          </a>
        ) : (
          seg.value
        ),
      )}
    </span>
  );
};
