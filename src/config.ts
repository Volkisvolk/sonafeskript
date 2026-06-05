import { defineApp } from "@valentinkolb/cloud";

export const app = defineApp({
  id: "raffle",
  name: "Verlosung",
  icon: "ti ti-ticket",
  description: "Registrierung und Ticketverwaltung für Verlosungen.",
  basePath: "/app/raffle",
  baseUrl: "http://app-raffle:3000",
  nav: {
    href: "/app/raffle",
    match: "/app/raffle",
    section: "primary",
    requiresAuth: false,
  },
  widgets: [{ id: "stats", path: "/api/raffle/widget/stats" }],
  openapi: "/api/raffle/openapi.json",
  routes: ["/api/raffle", "/app/raffle", "/public/raffle"],
  settings: {
    "raffle.ticket_contingent": {
      kind: "number",
      label: "Kartenkontingent",
      default: 100,
      description:
        "Gesamtanzahl der verfügbaren Karten für die Verlosung. Kann bis zur Verlosung angepasst werden.",
    },
    "raffle.max_group_size": {
      kind: "number",
      label: "Maximale Gruppengröße",
      default: 4,
      description: "Wie viele Personen maximal in einer Gruppe sein dürfen.",
    },
    "raffle.allowed_domains": {
      kind: "string",
      label: "Erlaubte E-Mail-Domains",
      default: "",
      description:
        'Kommagetrennte Liste erlaubter Domains (z.B. "uni.de,firma.com"). Leer lassen = alle Domains erlaubt.',
    },
    "raffle.reply_to_email": {
      kind: "string",
      label: "Reply-To E-Mail-Adresse",
      default: "",
      description:
        "Antwort-Adresse für alle Benachrichtigungs-Mails. Wenn Teilnehmer antworten, landet die Mail hier.",
    },
    "raffle.win_email_subject": {
      kind: "string",
      label: "Gewinn-Mail: Betreff",
      default: "Herzlichen Glückwunsch – Du hast gewonnen!",
      description: "Betreffzeile der Gewinn-Benachrichtigung.",
    },
    "raffle.win_email_body": {
      kind: "string",
      label: "Gewinn-Mail: Text",
      default:
        "Hallo {{name}},\n\nherzlichen Glückwunsch! Du hast bei unserer Verlosung {{won_tickets}} Karte(n) gewonnen.\n\nDein persönlicher QR-Code für die Abholung befindet sich im Anhang dieser Mail. Bitte zeige ihn beim Abholen vor.\n\nBei Fragen antworte einfach auf diese Mail.\n\nViele Grüße",
      description:
        "Text der Gewinn-Mail. Platzhalter: {{name}} (Name), {{won_tickets}} (Anzahl gewonnener Karten).",
    },
    "raffle.loss_email_subject": {
      kind: "string",
      label: "Verlier-Mail: Betreff",
      default: "Leider kein Glück bei der Verlosung",
      description: "Betreffzeile der Verlier-Benachrichtigung.",
    },
    "raffle.loss_email_body": {
      kind: "string",
      label: "Verlier-Mail: Text",
      default:
        "Hallo {{name}},\n\nleider haben wir mehr Anmeldungen als Karten erhalten. Bei der Verlosung hattest du diesmal leider kein Glück.\n\nWir hoffen, dich beim nächsten Mal dabei zu haben!\n\nViele Grüße",
      description: "Text der Verlier-Mail. Platzhalter: {{name}} (Name).",
    },
    "raffle.banner_url": {
      kind: "string",
      label: "Banner-Bild URL",
      default: "",
      description:
        "URL eines Bildes, das oben auf der Verlosungsseite angezeigt wird. Leer lassen für kein Bild.",
    },
  },
});

export const { ssr, plugin } = app;
