import { ssr } from "../../config";
import { Layout } from "@valentinkolb/cloud/ssr";
import { type AuthContext } from "@valentinkolb/cloud/server";
import AdminLinks from "../AdminLinks.island";
import AdminRaffles from "../AdminRaffles.island";

export default ssr<AuthContext>(async (c) => {
  return () => (
    <Layout c={c} title="Admin-Panel">
      <div class="max-w-4xl mx-auto pb-12">

        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-bold text-primary">Admin-Panel</h1>
            <p class="text-sm text-dimmed mt-0.5">Systemweite Verwaltung</p>
          </div>
          <a href="/app/raffle" class="btn-secondary btn-sm">
            <i class="ti ti-arrow-left mr-1" />Übersicht
          </a>
        </div>

        <div class="flex flex-col gap-8">

          <section class="flex flex-col gap-3">
            <div>
              <h2 class="text-sm font-semibold text-primary">Alle Verlosungen</h2>
              <p class="text-xs text-dimmed mt-0.5">Übersicht aller Verlosungen im System. Admins können jede Verlosung löschen.</p>
            </div>
            <AdminRaffles />
          </section>

          <section class="flex flex-col gap-3">
            <div>
              <h2 class="text-sm font-semibold text-primary">Externe Links</h2>
              <p class="text-xs text-dimmed mt-0.5">Links, die auf der öffentlichen Verlosungsseite angezeigt werden.</p>
            </div>
            <AdminLinks />
          </section>

        </div>
      </div>
    </Layout>
  );
});
