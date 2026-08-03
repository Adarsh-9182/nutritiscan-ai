// ============================================================
// PRIMITIVES
//
// Deliberately hook-free and without a "use client" directive,
// so the same components render inside Server Components and
// Client Components alike. The moment a primitive reaches for
// useState, every page that uses it gets pulled across the
// client boundary.
//
// Variants are semantic ("attention", "steady", "evidence"),
// never chromatic ("amber", "green", "blue"). A component that
// names a colour cannot be re-themed; see globals.css §1.
// ============================================================

import Link from "next/link";
import { cn } from "@/lib/cn";
import { ChevronRight } from "./icons";

export type Tone = "neutral" | "accent" | "attention" | "steady" | "evidence";

/** Token lookups per tone. One table, so a new tone is one edit. */
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-[var(--text-2)]",
  accent: "text-[var(--accent-text)]",
  attention: "text-[var(--attention-text)]",
  steady: "text-[var(--steady-text)]",
  evidence: "text-[var(--evidence-text)]",
};

const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] border-[var(--border)]",
  accent: "bg-[var(--accent-soft)] border-[var(--accent-line)]",
  attention: "bg-[var(--attention-soft)] border-[var(--attention-line)]",
  steady: "bg-[var(--steady-soft)] border-[var(--steady-line)]",
  evidence: "bg-[var(--evidence-soft)] border-[var(--evidence-line)]",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-[var(--text-3)]",
  accent: "bg-[var(--accent)]",
  attention: "bg-[var(--attention)]",
  steady: "bg-[var(--steady)]",
  evidence: "bg-[var(--evidence)]",
};

// ------------------------------------------------------------
// Button
// ------------------------------------------------------------

type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost" | "quiet";
  size?: "sm" | "md" | "lg";
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] font-[590] " +
  "transition-[transform,background-color,border-color,opacity] duration-[var(--dur-1)] " +
  "active:scale-[0.985] disabled:opacity-45 disabled:pointer-events-none select-none";

const BUTTON_VARIANT = {
  primary: "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-accent)]",
  secondary: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--surface-3)]",
  ghost: "bg-transparent text-[var(--text-2)] border border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
  quiet: "bg-transparent text-[var(--accent-text)] hover:opacity-80",
} as const;

const BUTTON_SIZE = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-4 text-[14px]",
  lg: "h-[52px] px-5 text-[15px]",
} as const;

export function Button({ variant = "secondary", size = "md", full, className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], full && "w-full", className)}
      {...rest}
    />
  );
}

/** Same surface treatment as Button, rendered as a link. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  full,
  className,
  children,
  ...rest
}: { href: string; variant?: keyof typeof BUTTON_VARIANT; size?: keyof typeof BUTTON_SIZE; full?: boolean } & Omit<
  React.ComponentProps<typeof Link>,
  "href"
>) {
  return (
    <Link
      href={href}
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], full && "w-full", className)}
      {...rest}
    >
      {children}
    </Link>
  );
}

// ------------------------------------------------------------
// Card
// ------------------------------------------------------------

export function Card({
  tone = "neutral",
  className,
  children,
  ...rest
}: { tone?: Tone } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "card",
        tone === "attention" && "card-attention",
        tone === "steady" && "card-steady",
        tone === "accent" && "card-accent",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** The uppercase micro-heading above a group. */
export function Eyebrow({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <p className={cn("t-label", TONE_TEXT[tone], tone === "neutral" && "text-[var(--text-3)]", className)}>{children}</p>;
}

/** Eyebrow with a leading status dot — used where the tone is the point. */
export function DotLabel({ tone = "accent", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />
      <span className={cn("t-label", TONE_TEXT[tone])}>{children}</span>
    </span>
  );
}

// ------------------------------------------------------------
// Badge & Chip
//
// A BADGE states a status and is not interactive.
// A CHIP is a control. Keeping them as separate components
// stops a status badge quietly acquiring an onClick and
// becoming an invisible affordance.
// ------------------------------------------------------------

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--r-full)] border px-2.5 py-1 text-[11.5px] font-[590] leading-none",
        TONE_SOFT[tone],
        TONE_TEXT[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ChipProps = {
  tone?: Tone;
  selected?: boolean;
  as?: "button" | "span";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ tone = "neutral", selected, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-full)] border px-3 py-2 text-[13px] leading-none",
        "transition-[background-color,border-color,color,opacity] duration-[var(--dur-1)] active:scale-[0.97]",
        selected ? cn(TONE_SOFT[tone], TONE_TEXT[tone], "font-[590]") : "border-[var(--border)] bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-2)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A chip that navigates. Used for suggested questions and evidence. */
export function ChipLink({
  href,
  tone = "neutral",
  className,
  children,
}: {
  href: string;
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-full)] border px-3 py-2 text-[13px] leading-none",
        "transition-colors duration-[var(--dur-1)] active:scale-[0.97]",
        tone === "neutral"
          ? "border-[var(--border)] text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          : cn(TONE_SOFT[tone], TONE_TEXT[tone]),
        className,
      )}
    >
      {children}
    </Link>
  );
}

// ------------------------------------------------------------
// Rows
// ------------------------------------------------------------

/**
 * A settings/record row. Renders as a link when `href` is given
 * and as a plain div otherwise, so a non-navigating row never
 * shows a chevron it can't honour.
 */
export function Row({
  href,
  icon,
  title,
  detail,
  value,
  tone = "neutral",
  className,
}: {
  href?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  value?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const inner = (
    <>
      {icon && (
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[var(--r-sm)] border", TONE_SOFT[tone], TONE_TEXT[tone])}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="t-body block font-[560] text-[var(--text)]">{title}</span>
        {detail && <span className="t-meta mt-0.5 block text-[var(--text-3)]">{detail}</span>}
      </span>
      {value && <span className="t-meta shrink-0 text-[var(--text-3)]">{value}</span>}
      {href && <ChevronRight size={16} className="shrink-0 text-[var(--text-3)]" />}
    </>
  );

  const classes = cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-[var(--dur-1)]",
    href && "hover:bg-[var(--surface-2)]",
    className,
  );

  return href ? (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}

/** Hairline between rows inside a card. Inset so it doesn't touch the radius. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn("mx-4 h-px bg-[var(--border)]", className)} />;
}

/** A titled block of content with consistent vertical rhythm. */
export function Section({
  title,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mt-7", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          {title && <Eyebrow>{title}</Eyebrow>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * The educational-not-medical line.
 *
 * A component rather than a copied string so it cannot drift
 * between screens, and so removing it anywhere is a visible
 * deletion in review rather than a quietly dropped paragraph.
 */
export function Disclaimer({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("t-meta mt-4 text-[var(--text-3)]", className)}>
      {children}
    </p>
  );
}
