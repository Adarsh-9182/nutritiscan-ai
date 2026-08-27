// ============================================================
// DICTATION — speaking a symptom instead of typing it
//
// Someone with a fever, a migraine, or shaking hands should not have to type
// a paragraph to be heard. This is the browser's own SpeechRecognition, kept
// behind a small interface so the parts worth testing are testable and the
// parts that are not are one thin adapter.
//
// Three things this file is careful about:
//
//   1. IT IS NOT AVAILABLE EVERYWHERE. Firefox has no SpeechRecognition, and
//      Safari's is inconsistent. `dictationSupport()` answers honestly and
//      the UI hides the button rather than offering something that silently
//      does nothing.
//
//   2. IT IS SENT TO THE BROWSER'S VENDOR. Chrome's implementation uploads
//      audio to Google for transcription. That is a different privacy
//      posture from the rest of this product, which keeps everything local —
//      so the user is told, once, before the first use rather than in a
//      footnote nobody reads.
//
//   3. IT MISHEARS. A transcript is a draft, never a submission: dictation
//      fills the input and stops there. Auto-sending a misheard symptom into
//      a clinical pipeline is how "chest pain" becomes "just plain" and the
//      triage rules never see it.
// ============================================================

export type DictationSupport = "available" | "unsupported" | "insecure-context";

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Whether dictation can actually run here.
 *
 * `insecure-context` is separated from `unsupported` because they need
 * different words: one is "your browser can't", the other is "this page
 * isn't on HTTPS", and telling a developer the first when it is the second
 * wastes an afternoon.
 */
export function dictationSupport(): DictationSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!ctor()) return "unsupported";
  if (!window.isSecureContext) return "insecure-context";
  return "available";
}

/**
 * Merge a recognition event into the text already in the box.
 *
 * Pure, and the only part with real logic — which is why it is separate from
 * the adapter below. Interim results are volatile: the engine revises them
 * as you keep speaking, so only finalised segments are committed and the
 * interim tail is returned separately for the UI to show in grey.
 */
export function applyResult(
  committed: string,
  e: SpeechRecognitionEventLike,
): { committed: string; interim: string } {
  let final = "";
  let interim = "";

  for (let i = e.resultIndex; i < e.results.length; i++) {
    const r = e.results[i];
    const text = r[0]?.transcript ?? "";
    if (r.isFinal) final += text;
    else interim += text;
  }

  if (!final) return { committed, interim };

  // Join on a single space, and never introduce a leading one — dictating
  // into an empty box should not produce " chest pain".
  const merged = committed ? `${committed.trimEnd()} ${final.trim()}` : final.trim();
  return { committed: merged, interim };
}

/** Error codes worth saying something specific about. */
export function describeError(code: string | undefined): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. You can allow it in your browser's site settings.";
    case "no-speech":
      return "I didn't catch anything — try again a little closer to the mic.";
    case "audio-capture":
      return "No microphone was found.";
    case "network":
      return "Speech recognition needs a connection and couldn't reach it.";
    default:
      return "Dictation stopped unexpectedly. You can type instead.";
  }
}

export type DictationHandlers = {
  onCommitted: (text: string, interim: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

/**
 * Thin adapter over the browser API.
 *
 * Returns null when dictation is unavailable so callers branch once, at the
 * point they try to start, rather than guarding every method.
 */
export function startDictation(
  initial: string,
  lang: string,
  handlers: DictationHandlers,
): { stop: () => void } | null {
  const C = ctor();
  if (!C || dictationSupport() !== "available") return null;

  const rec = new C();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  let committed = initial;

  rec.onresult = (e) => {
    const next = applyResult(committed, e);
    committed = next.committed;
    handlers.onCommitted(next.committed, next.interim);
  };
  rec.onerror = (e) => handlers.onError(describeError(e?.error));
  rec.onend = () => handlers.onEnd();

  try {
    rec.start();
  } catch {
    // Chrome throws if start() is called while already running. Treat it as
    // a no-op rather than surfacing an error the user cannot act on.
    return { stop: () => rec.abort() };
  }

  return { stop: () => rec.stop() };
}
