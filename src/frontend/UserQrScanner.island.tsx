import { createSignal, Show } from "solid-js";
import jsQR from "jsqr";
import { prompts } from "@valentinkolb/cloud/ui";
import type { Registration } from "@/contracts";

interface Props {
  raffleId: string;
  raffleName: string;
}

type Phase = "idle" | "scanning" | "loading" | "result" | "error";

export default function UserQrScanner(props: Props) {
  let videoEl!: HTMLVideoElement;
  let canvasEl!: HTMLCanvasElement;
  let streamRef: MediaStream | null = null;
  let rafId: number | null = null;
  let active = false;

  const [phase, setPhase] = createSignal<Phase>("idle");
  const [result, setResult] = createSignal<Registration | null>(null);
  const [errorMsg, setErrorMsg] = createSignal("");
  const [markingPaid, setMarkingPaid] = createSignal(false);

  const stopStream = () => {
    active = false;
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    streamRef?.getTracks().forEach((t) => t.stop());
    streamRef = null;
  };

  const startScanning = async () => {
    setResult(null);
    setPhase("scanning");
    try {
      streamRef = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      videoEl.srcObject = streamRef;
      await videoEl.play();
      active = true;
      tick();
    } catch {
      setErrorMsg("Kamerazugriff nicht möglich. Bitte erlaube den Kamerazugriff in deinem Browser.");
      setPhase("error");
    }
  };

  const tick = () => {
    if (!active) return;
    if (videoEl.readyState < 2 || !videoEl.videoWidth) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    const w = videoEl.videoWidth;
    const h = videoEl.videoHeight;
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(videoEl, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = jsQR(img.data, w, h);
    if (code?.data.startsWith("RAFFLE-")) {
      stopStream();
      lookup(code.data);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  const lookup = async (token: string) => {
    setPhase("loading");
    const regId = token.slice("RAFFLE-".length);
    try {
      const res = await fetch(
        `/api/raffle/user/raffles/${props.raffleId}/registrations/${regId}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.message ?? "QR-Code gehört nicht zu dieser Verlosung.");
        setPhase("error");
        return;
      }
      setResult(await res.json());
      setPhase("result");
    } catch {
      setErrorMsg("Verbindungsfehler beim Laden der Anmeldung.");
      setPhase("error");
    }
  };

  const markPaid = async () => {
    const reg = result();
    if (!reg) return;
    setMarkingPaid(true);
    try {
      const res = await fetch(
        `/api/raffle/user/raffles/${props.raffleId}/registrations/${reg.id}/mark-paid`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await prompts.error(body.message ?? "Fehler beim Markieren.");
        return;
      }
      setResult({ ...reg, paidAt: new Date().toISOString() });
    } catch {
      await prompts.error("Verbindungsfehler.");
    } finally {
      setMarkingPaid(false);
    }
  };

  const reset = () => { stopStream(); setPhase("idle"); };
  const scanNext = () => { stopStream(); startScanning(); };

  return (
    <div class="min-h-[calc(100vh-4rem)] bg-zinc-950 text-white flex flex-col">

      {/* Header */}
      <div class="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <a
          href={`/app/raffle/my/${props.raffleId}`}
          class="text-zinc-400 hover:text-white transition-colors"
          onClick={() => stopStream()}
        >
          <i class="ti ti-arrow-left text-xl" />
        </a>
        <div>
          <p class="text-sm font-semibold">QR-Scanner</p>
          <p class="text-xs text-zinc-400">{props.raffleName}</p>
        </div>
      </div>

      {/* Body */}
      <div class="flex-1 flex flex-col items-center justify-center p-4 gap-6">

        {/* Idle */}
        <Show when={phase() === "idle"}>
          <div class="text-center max-w-xs">
            <i class="ti ti-qrcode text-7xl text-zinc-600 mb-4 block" />
            <p class="text-zinc-300 mb-2 font-medium">QR-Code scannen</p>
            <p class="text-zinc-500 text-sm mb-6">
              Halte die Kamera auf den QR-Code aus der Gewinn-Mail — der Teilnehmer wird automatisch gefunden.
            </p>
            <button class="btn-primary" onClick={startScanning}>
              <i class="ti ti-camera mr-2" /> Kamera starten
            </button>
          </div>
        </Show>

        {/* Scanning / Loading */}
        <Show when={phase() === "scanning" || phase() === "loading"}>
          <div class="w-full max-w-sm flex flex-col items-center">
            <div class="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
              <video ref={videoEl!} class="w-full h-full object-cover" playsinline muted />
              <canvas ref={canvasEl!} class="hidden" />
              {/* Corner overlay */}
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="w-52 h-52 relative">
                  <div class="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-blue-400 rounded-tl" />
                  <div class="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-blue-400 rounded-tr" />
                  <div class="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-blue-400 rounded-bl" />
                  <div class="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-blue-400 rounded-br" />
                </div>
              </div>
              <Show when={phase() === "loading"}>
                <div class="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <i class="ti ti-loader-2 animate-spin text-3xl text-blue-400" />
                </div>
              </Show>
            </div>
            <p class="text-xs text-zinc-500 mt-3 text-center">
              {phase() === "loading" ? "Suche Registrierung…" : "Richte die Kamera auf den QR-Code"}
            </p>
            <button class="btn-secondary btn-sm mt-4" onClick={reset}>
              <i class="ti ti-x mr-1" /> Abbrechen
            </button>
          </div>
        </Show>

        {/* Result */}
        <Show when={phase() === "result" ? result() : null} keyed>
          {(reg) => {
            const paid = !!reg.paidAt;
            return (
              <div class="w-full max-w-sm flex flex-col gap-3">
                <div class="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
                  <div class="flex items-start justify-between gap-3 mb-4">
                    <div class="min-w-0">
                      <p class="font-semibold text-lg truncate">{reg.name}</p>
                      <p class="text-zinc-400 text-sm truncate">{reg.email}</p>
                    </div>
                    <span
                      class={`shrink-0 text-xs font-medium px-2 py-1 rounded-full border ${
                        paid
                          ? "bg-emerald-900/40 text-emerald-400 border-emerald-800"
                          : "bg-amber-900/40 text-amber-400 border-amber-800"
                      }`}
                    >
                      {paid ? "✓ Bezahlt" : "Offen"}
                    </span>
                  </div>

                  <div class="grid grid-cols-2 gap-2 mb-4 text-sm">
                    <div class="bg-zinc-800 rounded-xl p-3">
                      <p class="text-zinc-500 text-xs mb-1">Gewonnene Karten</p>
                      <p class="font-bold text-xl">{reg.wonTickets ?? reg.requestedTickets}</p>
                    </div>
                    <div class="bg-zinc-800 rounded-xl p-3">
                      <p class="text-zinc-500 text-xs mb-1">Status</p>
                      <p class="font-semibold">
                        {reg.status === "won" ? "Gewonnen" : reg.status === "lost" ? "Verloren" : "Ausstehend"}
                      </p>
                    </div>
                  </div>

                  <Show when={!paid}>
                    <button
                      class="btn-primary w-full"
                      disabled={markingPaid()}
                      onClick={markPaid}
                    >
                      {markingPaid()
                        ? <i class="ti ti-loader-2 animate-spin mr-2" />
                        : <i class="ti ti-coin mr-2" />}
                      Als bezahlt markieren
                    </button>
                  </Show>

                  <Show when={paid}>
                    <div class="flex items-center justify-center gap-2 text-emerald-400 py-2">
                      <i class="ti ti-circle-check text-xl" />
                      <span class="font-medium">Bezahlung bestätigt</span>
                    </div>
                  </Show>
                </div>

                <button class="btn-secondary w-full" onClick={scanNext}>
                  <i class="ti ti-qrcode mr-2" /> Nächsten QR-Code scannen
                </button>
                <button class="text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors" onClick={reset}>
                  Beenden
                </button>
              </div>
            );
          }}
        </Show>


        {/* Error */}
        <Show when={phase() === "error"}>
          <div class="w-full max-w-xs text-center">
            <i class="ti ti-alert-circle text-5xl text-red-500 mb-3 block" />
            <p class="text-zinc-300 mb-5">{errorMsg()}</p>
            <div class="flex flex-col gap-2">
              <button class="btn-secondary" onClick={startScanning}>
                <i class="ti ti-refresh mr-1" /> Erneut versuchen
              </button>
              <button class="text-zinc-500 text-sm py-2 hover:text-zinc-300 transition-colors" onClick={reset}>
                Zur Startansicht
              </button>
            </div>
          </div>
        </Show>

      </div>
    </div>
  );
}
