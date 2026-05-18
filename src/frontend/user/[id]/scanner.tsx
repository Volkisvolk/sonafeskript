import { ssr } from "../../../config";
import { Layout } from "@valentinkolb/cloud/ssr";
import { type AuthContext } from "@valentinkolb/cloud/server";
import { raffleService } from "@/service";
import UserQrScanner from "../../UserQrScanner.island";

export default ssr<AuthContext>(async (c) => {
  const user = c.get("user")!;
  const raffleId = c.req.param("id");
  const raffle = await raffleService.raffles.get(raffleId);

  if (!raffle || raffle.createdBy !== user.id) {
    return () => (
      <Layout c={c} title="Nicht gefunden">
        <div class="max-w-2xl mx-auto pt-12 text-center">
          <i class="ti ti-alert-circle text-3xl text-dimmed mb-3 block" />
          <p class="text-sm text-dimmed">Verlosung nicht gefunden oder keine Berechtigung.</p>
          <a href="/app/raffle/my" class="btn-secondary btn-sm mt-4 inline-block">
            <i class="ti ti-arrow-left mr-1" /> Meine Verlosungen
          </a>
        </div>
      </Layout>
    );
  }

  return () => (
    <Layout c={c} title={`Scanner – ${raffle.name}`}>
      <UserQrScanner raffleId={raffleId} raffleName={raffle.name} />
    </Layout>
  );
});
