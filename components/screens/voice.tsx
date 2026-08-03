"use client";

// ============================================================
// VOICE · HANDS-FREE
//
// Kitchen-and-gym mode. The design brief for this screen is one
// sentence: the user's hands are busy and their eyes are not on
// the phone.
//
// That produces three requirements, and everything here serves
// one of them:
//
// 1. THE TRANSCRIPT IS AT READING SIZE (t-h2, not caption).
//    Its job is to let someone verify from a metre away that
//    they were heard correctly. A 13px transcript is decoration.
//
// 2. ONE OBVIOUS WAY OUT. The whole backdrop is the interrupt
//    target — you should not have to aim at a small button with
//    wet hands.
//
// 3. IT NEVER PRETENDS. Where the browser has no speech
//    recognition (Firefox, most in-app webviews) this says so
//    and offers typing, rather than showing an animated orb that
//    listens to nothing. A fake listening state in a hands-free
//    mode is worse than no hands-free mode.
// ============================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MicIcon } from "@/components/ds/icons";
import { Button } from "@/components/ds/primitives";

/**
 * Minimal structural typing for the Web Speech API.
 *
 * It is still vendor-prefixed and absent from TypeScript's DOM
 * lib, so this describes only the handful of members used here
 * rather than pulling a dependency for a type.
 */
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type Ctor = new () => SpeechRecognitionLike;

function getRecognition(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Phase = "listening" | "unsupported" | "denied" | "done";

const NO_SUBSCRIBE = () => () => {};

/**
 * Whether this browser can transcribe at all.
 *
 * Read through `useSyncExternalStore` rather than set from an
 * effect. Capability detection is exactly what its
 * server-snapshot split is for: the server has no idea what the
 * browser supports, so it renders the optimistic case and the
 * client corrects during hydration — without a setState that
 * triggers a second render pass.
 */
const useSpeechSupported = () =>
  useSyncExternalStore(NO_SUBSCRIBE, () => getRecognition() !== null, () => true);

export function VoiceScreen() {
  const router = useRouter();
  const supported = useSpeechSupported();
  const [phase, setPhase] = useState<Phase>("listening");
  const [transcript, setTranscript] = useState("");
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const finalText = useRef("");

  const send = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) {
        router.back();
        return;
      }
      router.replace(`/ask/new?q=${encodeURIComponent(q)}`);
    },
    [router],
  );

  useEffect(() => {
    const Ctor = getRecognition();
    // Unsupported is already reflected by `supported` above — this
    // effect's only job is to drive the external system.
    if (!Ctor) return;

    const rec = new Ctor();
    recognition.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const said = result[0]?.transcript ?? "";
        if (result.isFinal) finalText.current += said;
        else interim += said;
      }
      setTranscript((finalText.current + interim).trim());
    };

    rec.onerror = (e) => {
      // "no-speech" is a normal silence timeout, not a failure —
      // showing a permission error for it would be a lie.
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setPhase("denied");
      else if (e.error !== "no-speech" && e.error !== "aborted") setPhase("unsupported");
    };

    try {
      rec.start();
    } catch {
      // `start()` throws synchronously when the engine refuses to
      // begin at all — and in that case `onerror` never fires, so
      // this is the only signal we get.
      //
      // The lint rule is right in general (a setState in an effect
      // body cascades a render) and wrong here: this runs only on a
      // failure path, and the alternative is leaving an animated
      // "listening" orb on screen attached to nothing, which is the
      // exact dishonesty this screen's header comment forbids. One
      // extra render in a rare failure is the cheaper trade.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("unsupported");
    }

    return () => {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // Already stopped — nothing to clean up.
      }
    };
  }, []);

  // The rendered phase. `unsupported` is a capability, not a
  // state transition, so it overrides whatever the state machine
  // thinks it's doing.
  const view: Phase = supported ? phase : "unsupported";

  const finish = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      // Recognition may already have ended on its own.
    }
    setPhase("done");
    send(transcript);
  }, [send, transcript]);

  return (
    <main
      id="main"
      className="fixed inset-0 z-50 mx-auto flex max-w-[var(--app-max)] flex-col bg-[var(--bg)]"
      // The whole surface is the interrupt target.
      onClick={view === "listening" ? finish : undefined}
    >
      <header className="flex items-center justify-between px-5 pt-[calc(var(--s-4)+var(--safe-t))]">
        <span className="t-label text-[var(--text-3)]">
          {view === "listening" ? "Listening" : view === "denied" ? "Microphone blocked" : view === "unsupported" ? "Voice unavailable" : "Done"}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.back();
          }}
          className="t-meta font-[590] text-[var(--accent-text)]"
        >
          {view === "listening" ? "Done" : "Close"}
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
        {view === "listening" && (
          <>
            {/* The orb. Concentric because a single circle can't
                show both "on" and "receiving" at once. */}
            <div className="ns-pulse relative grid size-[136px] place-items-center rounded-full bg-[var(--accent)]">
              <div className="grid size-[86px] place-items-center rounded-full bg-[var(--o-300)]">
                <div className="size-[46px] rounded-full bg-[var(--accent)]" />
              </div>
            </div>

            {/* Amplitude bars.
                HONEST LIMITATION: these are a fixed rhythm, not
                real microphone amplitude — reading true amplitude
                needs an AudioContext analyser on a second stream,
                which means a second permission prompt purely to
                animate six rectangles. The bars communicate "the
                mic is live", and the transcript below carries the
                actual verification. */}
            <div className="mt-7 flex h-6 items-center gap-1.5" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className="ns-bar w-[3px] rounded-full bg-[var(--accent)]"
                  style={{ height: 24, animationDelay: `${i * 110}ms` }}
                />
              ))}
            </div>

            {/* Reading size, and a live region so a screen reader
                announces what was heard. */}
            <p
              className="t-h2 mt-8 min-h-[3.4em] max-w-[22ch] text-[var(--text)]"
              aria-live="polite"
            >
              {transcript ? `“${transcript}”` : <span className="text-[var(--text-3)]">Say what you need…</span>}
            </p>

            <p className="t-meta mt-6 text-[var(--text-3)]">Tap anywhere to interrupt</p>
          </>
        )}

        {view === "denied" && (
          <Fallback
            title="I can't hear you"
            body="Your browser is blocking microphone access for this site. You can allow it in the address bar, or just type the question instead."
            onType={() => router.replace("/")}
          />
        )}

        {view === "unsupported" && (
          <Fallback
            title="Voice isn't available here"
            body="This browser doesn't offer speech recognition. Everything works the same by typing — nothing about the answer changes."
            onType={() => router.replace("/")}
          />
        )}
      </div>

      {view === "listening" && (
        <div className="grid place-items-center pb-[calc(var(--s-8)+var(--safe-b))]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              finish();
            }}
            aria-label="Stop listening and send"
            className="grid size-14 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text)] transition-transform active:scale-95"
          >
            <span className="size-3.5 rounded-[3px] bg-current" />
          </button>
        </div>
      )}
    </main>
  );
}

function Fallback({ title, body, onType }: { title: string; body: string; onType: () => void }) {
  return (
    <div className="max-w-[30ch]">
      <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-3)]">
        <MicIcon size={22} />
      </div>
      <p className="t-h2 text-[var(--text)]">{title}</p>
      <p className="t-body mt-2 text-[var(--text-2)]">{body}</p>
      <Button
        variant="primary"
        className="mt-6"
        onClick={(e) => {
          e.stopPropagation();
          onType();
        }}
      >
        Type it instead
      </Button>
    </div>
  );
}
