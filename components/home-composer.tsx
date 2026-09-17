"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

const IDEAS = [
  "Meri Vitamin D report low hai, kya karun?",
  "What should I eat for PCOS?",
  "सिर दर्द रोज़ क्यों होता है?",
  "Is it okay to take paracetamol with my BP medicine?",
  "Had 2 roti and dal for lunch — is that enough protein?",
];

const CHIPS = [
  "Explain my blood report",
  "Diet for thyroid",
  "Neend kyun nahi aati?",
  "Remind me to take vitamin D daily",
];

/** The homepage prompt: asking starts a guest chat, no sign-up needed. */
export default function HomeComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [idea, setIdea] = useState(0);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setInterval(
      () => setIdea((i) => (i + 1) % IDEAS.length),
      3200,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  function go(question: string) {
    const q = question.trim().slice(0, 1000);
    if (!q) return;
    router.push(`/workspace?guest&q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="hm-ask">
      <form
        className="hm-composer"
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <textarea
          ref={input}
          rows={1}
          aria-label="Ask a health question"
          placeholder={IDEAS[idea]}
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              go(text);
            }
          }}
        />
        <div className="hm-composer-row">
          <span>English · हिंदी · Hinglish</span>
          <button aria-label="Ask" disabled={!text.trim()}>
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        </div>
      </form>
      <div className="hm-chips">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => go(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
