import { ssr } from "../../../config";
import { Layout } from "@valentinkolb/cloud/ssr";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { raffleService } from "@/service";

export default ssr<AuthContext>(async (c) => {
  const token = c.req.param("token") ?? "";
  const res = await raffleService.registrations.confirmRegistration(token);

  const raffleHref = res.raffleId ? `/app/raffle/${res.raffleId}` : "/app/raffle";

  const view = (() => {
    if (res.outcome === "confirmed") {
      return {
        icon: "ti-circle-check",
        tone: "text-emerald-600 dark:text-emerald-400",
        title: "Anmeldung bestätigt!",
        text: "Deine Anmeldung zählt jetzt für die Verlosung. Du erhältst nach der Ziehung eine E-Mail mit deinem Ergebnis.",
      };
    }
    if (res.outcome === "already") {
      return {
        icon: "ti-circle-check",
        tone: "text-emerald-600 dark:text-emerald-400",
        title: "Bereits bestätigt",
        text: "Diese Anmeldung wurde schon bestätigt – du musst nichts weiter tun.",
      };
    }
    if (res.outcome === "expired") {
      return {
        icon: "ti-clock-x",
        tone: "text-amber-500",
        title: "Verlosung bereits gestartet",
        text: "Die Anmeldephase für diese Verlosung ist beendet. Dein Bestätigungslink ist deshalb abgelaufen und deine Anmeldung konnte nicht mehr in die Ziehung aufgenommen werden.",
      };
    }
    return {
      icon: "ti-alert-circle",
      tone: "text-red-500",
      title: "Link ungültig",
      text: "Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte melde dich ggf. erneut an.",
    };
  })();

  return () => (
    <Layout c={c} title={view.title}>
      <div class="max-w-md mx-auto pt-16 text-center">
        <i class={`ti ${view.icon} text-5xl ${view.tone} mb-4 block`} />
        <h1 class="text-lg font-semibold text-primary mb-2">{view.title}</h1>
        <p class="text-sm text-dimmed mb-6">{view.text}</p>
        <a href={raffleHref} class="btn-primary btn-sm inline-block">
          <i class="ti ti-arrow-right mr-1" /> Zur Verlosung
        </a>
      </div>
    </Layout>
  );
});
