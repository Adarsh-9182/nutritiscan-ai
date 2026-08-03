// ============================================================
// MARKDOWN
//
// A deliberately small renderer for the subset the agents
// actually emit: bold, italic, inline code, bullet lists, and
// the `**Facts**` / `**Inference**` section headings that
// MEDICAL_REASONING_FORMAT produces.
//
// NO `dangerouslySetInnerHTML`, and no markdown library.
//
// That is a security decision, not a bundle-size one. This text
// arrives from a language model that has been fed user-authored
// content (meal titles, profile fields, a pasted lab report). A
// renderer that parses to HTML is one prompt-injection away from
// putting an attacker's markup into the page. Building React
// elements directly means the worst case is ugly text.
//
// A bold line on its own becomes a section heading rather than a
// bold paragraph, because that is what the reasoning format
// means by it — and rendering "Facts" at body weight would
// collapse the visual separation between what the user told us
// and what the model inferred, which is the entire point of that
// format.
// ============================================================

import { cn } from "@/lib/cn";

/** Inline: **bold**, _italic_, `code`. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // One pass, alternating between the three inline forms. The
  // capture groups keep the delimiters out of the output.
  const pattern = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-i${i++}`;

    if (token.startsWith("**")) {
      out.push(
        <strong key={key} className="font-[640] text-[var(--text)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code key={key} className="rounded-[var(--r-xs)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // Italic in these answers is always the "educational, not a
      // diagnosis" line, so it renders as de-emphasised metadata
      // rather than as slanted body text.
      out.push(
        <em key={key} className="not-italic text-[13px] text-[var(--text-3)]">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** True when a line is a lone bold run — a section heading. */
const isHeading = (line: string) => /^\*\*[^*]+\*\*:?$/.test(line.trim());

export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="mt-1.5 space-y-1.5 pl-[1.05em]">
        {list.map((item, i) => (
          <li key={i} className="list-disc marker:text-[var(--text-3)]">
            {inline(item, `${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `b${idx}`;

    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushList(`${key}-list`);

    if (!line.trim()) return;

    if (isHeading(line)) {
      blocks.push(
        <p key={key} className="t-label mt-4 text-[var(--text-3)] first:mt-0">
          {line.trim().replace(/^\*\*|\*\*:?$/g, "")}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={key} className="mt-2.5 first:mt-0">
        {inline(line, key)}
      </p>,
    );
  });

  flushList("tail-list");

  return <div className={cn("t-body text-[var(--text-2)]", className)}>{blocks}</div>;
}
