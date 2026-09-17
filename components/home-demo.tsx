"use client";
import { useEffect, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";

type Scene = {
  label: string;
  ask: string;
  answer: string[];
  action?: string;
  urgent?: boolean;
};

// Examples of what the product does, written from its real behaviour.
const SCENES: Scene[] = [
  {
    label: "Reports",
    ask: "Summarise my latest report",
    answer: [
      "Vitamin D: 24 ng/mL — below your report's range (30–100).",
      "Vitamin B12, haemoglobin and glucose are within range.",
      "Worth asking your doctor whether and when to recheck vitamin D.",
    ],
    action: "Add “Ask about vitamin D” to my list",
  },
  {
    label: "Daily log",
    ask: "aaj lunch me do roti aur dal khayi",
    answer: [
      "Aaj ke log me ye add kar sakta hoon:",
      "Meal · 2 roti, dal (≈412 kcal, 22 g protein)",
    ],
    action: "Confirm and add to log",
  },
  {
    label: "Safety",
    ask: "seene me tez dard hai aur saans nahi aa rahi",
    answer: [
      "This needs a person now. Call 112 or go to the nearest emergency department.",
      "Don’t drive yourself if you can avoid it.",
    ],
    urgent: true,
  },
];

/** A looping, typed walkthrough of three real flows. */
export default function HomeDemo() {
  const [scene, setScene] = useState(0);
  const [typed, setTyped] = useState(0);
  const [lines, setLines] = useState(0);
  const current = SCENES[scene];

  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (reduce) {
      at(0, () => {
        setTyped(current.ask.length);
        setLines(current.answer.length + 1);
      });
    } else {
      at(0, () => {
        setTyped(0);
        setLines(0);
      });
      for (let i = 1; i <= current.ask.length; i++)
        at(300 + i * 38, () => setTyped(i));
      const start = 300 + current.ask.length * 38 + 500;
      for (let l = 1; l <= current.answer.length + 1; l++)
        at(start + l * 650, () => setLines(l));
    }
    at(
      reduce
        ? 6000
        : 300 +
            current.ask.length * 38 +
            500 +
            (current.answer.length + 1) * 650 +
            2600,
      () => setScene((s) => (s + 1) % SCENES.length),
    );
    return () => timers.forEach(clearTimeout);
  }, [scene, current]);

  return (
    <div className="hm-demo" aria-label="Examples of NutritiScan answers">
      <div className="hm-demo-tabs" role="tablist">
        {SCENES.map((s, i) => (
          <button
            key={s.label}
            role="tab"
            aria-selected={i === scene}
            onClick={() => setScene(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="hm-demo-body">
        <div className="hm-demo-user">
          <span>
            {current.ask.slice(0, typed)}
            {typed < current.ask.length && <i className="hm-caret" />}
          </span>
        </div>
        {lines > 0 && (
          <div className={`hm-demo-answer ${current.urgent ? "urgent" : ""}`}>
            <span className="hm-demo-avatar">
              {current.urgent ? <ShieldAlert size={14} /> : "n"}
            </span>
            <div>
              {current.answer.slice(0, lines).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {current.action && lines > current.answer.length && (
                <span className="hm-demo-action">
                  <Check size={13} /> {current.action}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
