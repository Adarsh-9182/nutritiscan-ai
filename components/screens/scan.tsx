"use client";

// ============================================================
// CAPTURE — ONE CAMERA, FIVE THINGS IT UNDERSTANDS
//
// "The user shouldn't pick a scanner mode — but they should be
// able to."
//
// That is the whole interaction model. Auto is the default and
// the mode strip is an ESCAPE HATCH, not a decision the user is
// asked to make before they can start. Most scanner UIs get this
// backwards: they open on a mode picker, which forces the user
// to classify their own photo before the app that exists to
// classify things has looked at it.
//
// The status pill is the other load-bearing piece. Recognition
// can take four seconds; four seconds of a still viewfinder
// reads as a freeze. Narrating the stage ("Reading the label")
// converts the same wait into visible work.
// ============================================================

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, ImageIcon, MicIcon, SparkIcon } from "@/components/ds/icons";
import { StatusPill } from "@/components/ds/states";
import { ErrorState } from "@/components/ds/states";
import { personToProfile } from "@/lib/v2/persona";
import type { ScanResult } from "@/lib/nutrition/analyze";
import { FoodVerdict } from "./food-verdict";
import { cn } from "@/lib/cn";

export type ScanMode = "auto" | "food" | "barcode" | "label" | "report" | "medicine";

const MODES: { id: ScanMode; label: string }[] = [
  { id: "food", label: "Food" },
  { id: "barcode", label: "Barcode" },
  { id: "label", label: "Label" },
  { id: "report", label: "Report" },
  { id: "medicine", label: "Medicine" },
];

/** What the status pill says while each mode is working. */
const NARRATION: Record<ScanMode, string> = {
  auto: "Looking at the image",
  food: "Identifying the food",
  barcode: "Reading the barcode",
  label: "Reading the label",
  report: "Reading the report",
  medicine: "Reading the packaging",
};

/** Downscale before upload: a 12MP phone photo is 40× more than the model needs. */
const MAX_EDGE = 1152;

async function toDownscaledBase64(file: File): Promise<{ base64: string; mediaType: string; filename: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", mediaType: "image/jpeg", filename: file.name };
}

type Phase = "idle" | "working" | "result" | "error";

export function ScanScreen() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<ScanMode>((params.get("mode") as ScanMode) ?? "auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [narration, setNarration] = useState<string>("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraLive, setCameraLive] = useState(false);

  // ---- Live camera, where the browser and permissions allow ----
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraLive(true);
      } catch {
        // Denied, unavailable, or an insecure origin. The file
        // picker below is a complete path on its own, so this is
        // a downgrade rather than a failure — no error shown.
        setCameraLive(false);
      }
    }
    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const analyse = useCallback(
    async (file: File) => {
      // Report and medicine are documents, not meals — they route
      // to their own readers rather than through the food pipeline.
      if (mode === "report") {
        router.push("/labs/reading");
        return;
      }
      if (mode === "medicine") {
        router.push("/medicine/ferrous-fumarate-210?from=scan");
        return;
      }

      setPhase("working");
      setNarration(NARRATION[mode]);
      setError("");
      setPreview(URL.createObjectURL(file));

      try {
        const image = await toDownscaledBase64(file);
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "photo", image, profile: personToProfile() }),
        });

        if (!res.ok || !res.body) {
          setError("That scan didn't go through. Check your connection and try again.");
          setPhase("error");
          return;
        }

        // The route streams NDJSON so the pill can narrate real
        // stages instead of a spinner that means nothing.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            let event: { type: string; label?: string; status?: string; result?: ScanResult; message?: string };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.type === "stage" && event.status === "active" && event.label) setNarration(event.label);
            if (event.type === "result" && event.result) {
              setResult(event.result);
              setPhase("result");
            }
            if (event.type === "error") {
              setError(event.message ?? "I couldn't read that one.");
              setPhase("error");
            }
          }
        }
      } catch {
        setError("Something interrupted that scan. Nothing was saved — try again.");
        setPhase("error");
      }
    },
    [mode, router],
  );

  /** Grab a still from the live camera and run it through the same path. */
  const shoot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraLive) {
      fileRef.current?.click();
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) analyse(new File([blob], "capture.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.85,
    );
  }, [analyse, cameraLive]);

  if (phase === "result" && result) {
    return <FoodVerdict result={result} preview={preview} onRescan={() => setPhase("idle")} />;
  }

  return (
    <main
      id="main"
      className="fixed inset-0 z-50 mx-auto flex max-w-[var(--app-max)] flex-col bg-black"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) analyse(file);
      }}
    >
      {/* ---- Top bar ---- */}
      <header className="z-20 flex items-center justify-between px-5 pt-[calc(var(--s-4)+var(--safe-t))]">
        <button type="button" onClick={() => router.back()} className="t-meta font-[560] text-white/90">
          Cancel
        </button>

        {phase === "working" ? (
          <StatusPill className="border-white/15 bg-white/10 text-white/90">{narration}</StatusPill>
        ) : (
          <span className="t-label text-white/40">
            {mode === "auto" ? "Auto-detecting" : MODES.find((m) => m.id === mode)?.label}
          </span>
        )}

        <SparkIcon size={18} className={cn("text-white/60", phase === "working" && "ns-breathe")} />
      </header>

      {/* ---- Viewfinder ---- */}
      <div className="relative flex-1 overflow-hidden">
        {cameraLive && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 size-full object-cover opacity-90"
          />
        )}

        {/* Reticle. Corner brackets rather than a full frame — a
            closed rectangle reads as a crop tool. */}
        <div className="absolute inset-x-8 top-1/2 aspect-[4/3] -translate-y-1/2">
          {(
            [
              "left-0 top-0 border-l-2 border-t-2 rounded-tl-[var(--r-md)]",
              "right-0 top-0 border-r-2 border-t-2 rounded-tr-[var(--r-md)]",
              "left-0 bottom-0 border-b-2 border-l-2 rounded-bl-[var(--r-md)]",
              "right-0 bottom-0 border-b-2 border-r-2 rounded-br-[var(--r-md)]",
            ] as const
          ).map((pos) => (
            <span key={pos} className={cn("absolute size-9 border-[var(--accent)]", pos)} />
          ))}

          {phase === "working" && (
            <span className="ns-sweep absolute inset-x-3 top-1/2 h-16 rounded-full bg-gradient-to-b from-transparent via-[var(--accent)]/35 to-transparent" />
          )}

          {!cameraLive && phase === "idle" && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                "absolute inset-0 grid place-items-center rounded-[var(--r-lg)] border-2 border-dashed transition-colors",
                dragging ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-white/20",
              )}
            >
              <span className="text-center">
                <ImageIcon size={26} className="mx-auto text-white/50" />
                <span className="t-body mt-3 block text-white/80">Drop a photo</span>
                <span className="t-meta mt-0.5 block text-white/45">or browse files</span>
              </span>
            </button>
          )}
        </div>

        {phase === "error" && (
          <div className="absolute inset-x-5 bottom-5">
            <ErrorState body={error} retry={() => setPhase("idle")} />
          </div>
        )}
      </div>

      {/* ---- Mode strip. An escape hatch, not a decision. ---- */}
      <div className="z-20 px-5">
        <div className="rail py-3">
          <button
            type="button"
            onClick={() => setMode("auto")}
            aria-pressed={mode === "auto"}
            className={cn(
              "rounded-[var(--r-full)] px-3.5 py-2 text-[13px] leading-none transition-colors",
              mode === "auto" ? "bg-[var(--accent)] font-[590] text-[var(--accent-ink)]" : "bg-white/10 text-white/70",
            )}
          >
            Auto
          </button>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                "rounded-[var(--r-full)] px-3.5 py-2 text-[13px] leading-none transition-colors",
                mode === m.id ? "bg-[var(--accent)] font-[590] text-[var(--accent-ink)]" : "bg-white/10 text-white/70",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Shutter row ---- */}
      <div className="z-20 grid grid-cols-3 items-center px-9 pb-[calc(var(--s-7)+var(--safe-b))] pt-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Choose a photo"
          className="grid size-11 place-items-center justify-self-start rounded-[var(--r-md)] bg-white/10 text-white/80"
        >
          <ImageIcon size={19} />
        </button>

        <button
          type="button"
          onClick={shoot}
          disabled={phase === "working"}
          aria-label="Capture"
          className={cn(
            "size-[68px] justify-self-center rounded-full border-4 border-white/30 bg-white transition-transform active:scale-95",
            phase === "working" && "opacity-50",
          )}
        />

        <button
          type="button"
          onClick={() => router.push("/ask/voice")}
          aria-label="Describe it out loud instead"
          className="grid size-11 place-items-center justify-self-end rounded-[var(--r-md)] bg-white/10 text-white/80"
        >
          <MicIcon size={19} />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) analyse(file);
          // Reset so re-picking the same file fires change again.
          e.target.value = "";
        }}
      />

      {/* Close affordance for keyboard users, who can't tap "Cancel"
          at the top without tabbing past the whole viewfinder. */}
      <button type="button" onClick={() => router.back()} className="sr-only">
        <CloseIcon /> Close scanner
      </button>
    </main>
  );
}
