import QRCode from "qrcode";
import { ssr } from "../../../config";
import { Layout } from "@valentinkolb/cloud/ssr";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { raffleService } from "@/service";

export default ssr<AuthContext>(async (c) => {
  const token = c.req.param("token") ?? "";
  const ticket = await raffleService.registrations.getTicketByToken(token);

  // QR-Code nur für Gewinner erzeugen. Inhalt = "RAFFLE-<regId>" – genau das
  // Format, das der Scanner erwartet. Der Token selbst bleibt geheim (nur in
  // der URL), der QR-Inhalt wird ohnehin erst durch die Scanner-Auth + die
  // Verlosungs-Berechtigung nutzbar.
  let qrDataUrl: string | null = null;
  if (ticket && ticket.status === "won") {
    qrDataUrl = await QRCode.toDataURL(`RAFFLE-${ticket.id}`, { width: 240, margin: 1 });
  }

  return () => {
    if (!ticket) {
      return (
        <Layout c={c} title="Ticket nicht gefunden">
          <div class="max-w-md mx-auto pt-16 text-center">
            <i class="ti ti-alert-circle text-5xl text-red-500 mb-4 block" />
            <h1 class="text-lg font-semibold text-primary mb-2">Ticket nicht gefunden</h1>
            <p class="text-sm text-dimmed">Dieser Link ist ungültig oder abgelaufen.</p>
          </div>
        </Layout>
      );
    }

    if (ticket.status === "won" && qrDataUrl) {
      return (
        <Layout c={c} title={`Dein Ticket – ${ticket.raffleName}`}>
          <div class="max-w-md mx-auto pt-10 text-center">
            <p class="text-xs text-dimmed mb-1">{ticket.raffleName}</p>
            <h1 class="text-lg font-semibold text-primary mb-1">Dein Gewinn-Ticket</h1>
            <p class="text-sm text-dimmed mb-6">
              {ticket.name} · {ticket.wonTickets ?? 1} Karte{(ticket.wonTickets ?? 1) === 1 ? "" : "n"}
            </p>
            <div class="paper inline-block p-4">
              <img src={qrDataUrl} alt="QR-Code" width="240" height="240" class="block" />
            </div>
            <p class="text-sm text-dimmed mt-6">
              <i class="ti ti-qrcode mr-1" />
              Zeige diesen QR-Code beim Abholen vor.
            </p>
          </div>
        </Layout>
      );
    }

    if (ticket.status === "lost") {
      return (
        <Layout c={c} title="Kein Gewinn">
          <div class="max-w-md mx-auto pt-16 text-center">
            <i class="ti ti-mood-sad text-5xl text-dimmed mb-4 block" />
            <h1 class="text-lg font-semibold text-primary mb-2">Leider kein Glück</h1>
            <p class="text-sm text-dimmed">
              Bei „{ticket.raffleName}" hattest du diesmal leider kein Glück.
            </p>
          </div>
        </Layout>
      );
    }

    // pending: Verlosung noch nicht durchgeführt
    return (
      <Layout c={c} title="Verlosung ausstehend">
        <div class="max-w-md mx-auto pt-16 text-center">
          <i class="ti ti-clock text-5xl text-dimmed mb-4 block" />
          <h1 class="text-lg font-semibold text-primary mb-2">Noch nicht verlost</h1>
          <p class="text-sm text-dimmed">
            Die Verlosung „{ticket.raffleName}" wurde noch nicht durchgeführt. Du erhältst nach der
            Ziehung eine E-Mail mit deinem Ergebnis.
          </p>
        </div>
      </Layout>
    );
  };
});
