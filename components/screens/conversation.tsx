"use client";

// ============================================================
// CONVERSATION
//
// "Trust comes from showing the receipts: every answer carries
// the sources it used and ends in one testable action, not a
// wall of advice."
//
// Three things here are load-bearing.
//
// 1. THE ANSWER IS NOT IN A BUBBLE. The user's question is; the
//    answer is plain prose on the page. Bubbles frame both
//    parties as equal chat participants. This is not a chat with
//    a peer — it is an explanation, and explanations are
//    typeset, not messaged.
//
// 2. EVIDENCE SITS DIRECTLY UNDER THE CLAIM, before any chart or
//    action, because provenance the reader has to scroll for is
//    provenance they won't check.
//
// 3. THE ANSWER IS NEVER LEFT MID-THOUGHT. The API distinguishes
//    "failed before any content" (falls back to the keyless demo
//    brain) from "failed mid-answer" (says so explicitly). This
//    screen only has to surface the error state honestly.
// ============================================================

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, MicIcon } from "@/components/ds/icons";
import { Markdown } from "@/components/ds/markdown";
import { LineChart } from "@/components/ds/charts";
import { Badge, ChipLink } from "@/components/ds/primitives";
import { ErrorState, ThinkingDots } from "@/components/ds/states";
import { ScreenHeader } from "@/components/ds/screen";
import { evidenceForTurn, NEXT_STEP_RULE, type Conversation, type Turn } from "@/lib/v2/conversation";
import type { Evidence } from "@/lib/v2/insight";
import { personToProfile } from "@/lib/v2/persona";
import { readMeals } from "@/lib/memory/store";
import { cn } from "@/lib/cn";

/** Pull the plain text out of a UIMessage's parts. */
function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function ConversationScreen({ conversation }: { conversation?: Conversation }) {
  const router = useRouter();
  const params = useSearchParams();
  const seedQuestion = params.get("q");

  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const sentSeed = useRef(false);

  const profile = useMemo(() => personToProfile(), []);

  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      /**
       * Attach the health memory to every turn.
       *
       * The route re-sanitises all of this (lib/memory/schema.ts)
       * — the client is never trusted — but sending it from here
       * is what makes the answer personal, and what makes the
       * evidence chips below truthful about the context used.
       */
      prepareSendMessagesRequest: ({ messages: msgs, body }) => ({
        body: { ...body, messages: msgs, profile, meals: readMeals() },
      }),
    }),
  });

  const busy = status === "submitted" || status === "streaming";

  // A question arriving via ?q= is sent once, on mount. The ref
  // guard matters because React 18 double-invokes effects in dev
  // and the user would otherwise watch their question be asked
  // twice.
  useEffect(() => {
    if (!seedQuestion || sentSeed.current) return;
    sentSeed.current = true;
    sendMessage({ text: `${seedQuestion}\n${NEXT_STEP_RULE}` });
  }, [seedQuestion, sendMessage]);

  // Follow the stream, but only ever downward — yanking the view
  // while someone is re-reading a sentence higher up is worse
  // than not following at all.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function submit(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setDraft("");
    sendMessage({ text: `${q}\n${NEXT_STEP_RULE}` });
  }

  const liveEvidence = useMemo(() => evidenceForTurn(profile, readMeals()), [profile]);
  const title = conversation?.title ?? (seedQuestion ? truncate(seedQuestion, 34) : "New question");

  return (
    <>
      <ScreenHeader
        backHref="/"
        title={title}
        trailing={
          conversation?.basis ? (
            <span className="t-meta shrink-0 text-[var(--text-3)]">{conversation.basis}</span>
          ) : undefined
        }
      />

      <main id="main" className="app-scroll px-5" style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-b) + 92px)" }}>
        {/* ---- Seeded turns ---- */}
        {conversation?.turns.map((t) => (
          <SeededTurn key={t.id} turn={t} onAsk={submit} />
        ))}

        {/* ---- Live turns ---- */}
        {messages.map((m, i) => {
          const text = textOf(m);
          if (m.role === "user") {
            // The response contract is machinery, not something
            // the user typed — never echo it back at them.
            return <UserTurn key={m.id} text={stripContract(text)} />;
          }

          const isLast = i === messages.length - 1;
          return (
            <AssistantTurn
              key={m.id}
              text={text}
              evidence={liveEvidence}
              streaming={isLast && status === "streaming"}
            />
          );
        })}

        {/* Thinking, shown only in the gap before the first token. */}
        {status === "submitted" && (
          <div className="mt-6 flex items-center gap-2.5">
            <ThinkingDots label="Reading your health memory" />
            <span className="t-meta text-[var(--text-3)]">Reading your health memory</span>
          </div>
        )}

        {error && (
          <ErrorState
            className="mt-6"
            title="I couldn't finish that"
            body="The connection dropped before I had a complete answer. Nothing was saved — ask again and I'll start over."
            retry={() => router.refresh()}
          />
        )}

        <div ref={endRef} />
      </main>

      {/* ---- Reply ---- */}
      <div
        className="blur-bar fixed inset-x-0 z-30 mx-auto max-w-[var(--app-max)] border-t border-[var(--border)] px-5 py-3"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-b))" }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(draft);
          }}
        >
          <div className="flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface)] p-1.5 pl-4 transition-colors focus-within:border-[var(--accent-line)]">
            <label htmlFor="reply" className="sr-only">
              Reply
            </label>
            <input
              id="reply"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply"
              autoComplete="off"
              enterKeyHint="send"
              className="t-body min-w-0 flex-1 bg-transparent text-[var(--text)] outline-none placeholder:text-[var(--text-3)]"
            />
            {busy ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--text-2)]"
              >
                <span className="size-2.5 rounded-[2px] bg-current" />
              </button>
            ) : draft.trim() ? (
              <button
                type="submit"
                aria-label="Send"
                className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] transition-transform active:scale-95"
              >
                <ArrowUp size={17} strokeWidth={2} />
              </button>
            ) : (
              <Link
                href="/ask/voice"
                aria-label="Ask by voice"
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--text-3)] transition-colors hover:text-[var(--text)]"
              >
                <MicIcon size={17} />
              </Link>
            )}
          </div>
        </form>
      </div>
    </>
  );
}

// ------------------------------------------------------------
// Turns
// ------------------------------------------------------------

function UserTurn({ text }: { text: string }) {
  return (
    <div className="mt-6 flex justify-end">
      <p className="t-body max-w-[85%] rounded-[var(--r-lg)] rounded-br-[var(--r-xs)] bg-[var(--accent-soft)] px-4 py-2.5 text-[var(--text)]">
        {text}
      </p>
    </div>
  );
}

function EvidenceRow({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {evidence.map((e) =>
        e.href ? (
          <ChipLink key={e.label} href={e.href} tone={e.source === "labs" ? "evidence" : "neutral"} className="px-2.5 py-1.5 text-[12px]">
            {e.label}
          </ChipLink>
        ) : (
          <Badge key={e.label} tone="neutral">
            {e.label}
          </Badge>
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  text,
  evidence,
  streaming,
}: {
  text: string;
  evidence?: Evidence[];
  streaming?: boolean;
}) {
  return (
    <div className="mt-5">
      <div className={cn(streaming && "ns-caret")}>
        <Markdown text={text} />
      </div>
      {/* Evidence appears only once the answer has settled —
          chips flickering in mid-stream read as instability. */}
      {!streaming && evidence && <EvidenceRow evidence={evidence} />}
    </div>
  );
}

function SeededTurn({ turn, onAsk }: { turn: Turn; onAsk: (q: string) => void }) {
  if (turn.role === "user") return <UserTurn text={turn.text} />;

  return (
    <div className="mt-5">
      <Markdown text={turn.text} />
      {turn.evidence && <EvidenceRow evidence={turn.evidence} />}

      {turn.chart && (
        <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <LineChart
            label={turn.chart.label}
            unit={turn.chart.unit}
            points={turn.chart.points}
            markAt={turn.chart.markAt}
          />
        </div>
      )}

      {turn.followUps && (
        <div className="mt-4 flex flex-wrap gap-2">
          {turn.followUps.map((f) =>
            f.href ? (
              <ChipLink key={f.label} href={f.href}>
                {f.label}
              </ChipLink>
            ) : (
              <button
                key={f.label}
                type="button"
                onClick={() => f.ask && onAsk(f.ask)}
                className="inline-flex items-center rounded-[var(--r-full)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                {f.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Remove the appended response contract before displaying a user turn. */
const stripContract = (s: string) => s.split("[RESPONSE CONTRACT")[0].trim();
