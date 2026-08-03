// ============================================================
// ICONS
//
// The product used emoji as its only icon vocabulary (🥗 🏋️ 🩺).
// That is fine for the agent roster — those are illustrations of
// characters — but it fails for navigation: emoji render in the
// system's own colour and weight, so a "selected" tab cannot
// actually look selected, and the glyph shifts between macOS,
// Windows and Android. Chrome on Android draws 📷 in a completely
// different style to Safari on iOS.
//
// These are stroke icons that inherit `currentColor` and the
// stroke width, so the dock can express state by colour alone —
// which is the whole mechanism the nav depends on.
//
// Deliberately hand-written rather than pulled from a library:
// five icons is not worth a dependency, and every icon set ships
// a thousand more.
// ============================================================

type IconProps = {
  /** Rendered size in px. The dock uses 22, inline uses 16. */
  size?: number;
  className?: string;
  /** Slightly heavier stroke when a tab is active — presence without a colour change. */
  strokeWidth?: number;
};

/**
 * Shared wrapper. `aria-hidden` is unconditional: every icon in this
 * product sits next to a real text label or inside a button that has
 * an accessible name of its own, so announcing the glyph too would
 * make a screen reader read every nav item twice.
 */
function Svg({ size = 22, className = "", strokeWidth = 1.6, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 10.2 12 3l9 7.2" />
      <path d="M5.5 9.2V20a1 1 0 0 0 1 1H10v-5.5h4V21h3.5a1 1 0 0 0 1-1V9.2" />
    </Svg>
  );
}

/** The AI coach. A speech bubble with a spark — conversation, not a robot. */
export function CoachIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2a9.8 9.8 0 0 1-2.7-.37L4.5 21l1.2-3.5A6.9 6.9 0 0 1 3.5 12.4C3.5 8.4 7.3 5.2 12 5.2s8.5 3.2 8.5 7.2Z" />
      <path d="M12 9.1l.85 2.05L14.9 12l-2.05.85L12 14.9l-.85-2.05L9.1 12l2.05-.85Z" />
    </Svg>
  );
}

/** The scanner. Viewfinder corners around a lens — reads as "aim this". */
export function ScanIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 8.5v-2a3 3 0 0 1 3-3h2" />
      <path d="M15.5 3.5h2a3 3 0 0 1 3 3v2" />
      <path d="M20.5 15.5v2a3 3 0 0 1-3 3h-2" />
      <path d="M8.5 20.5h-2a3 3 0 0 1-3-3v-2" />
      <circle cx="12" cy="12" r="3.2" />
    </Svg>
  );
}

export function ProgressIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M7.5 16.5l3.5-4.5 3 2.5 4.5-6" />
    </Svg>
  );
}

export function ProfileIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8.2" r="3.7" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </Svg>
  );
}

export function DropletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.2s5.5 5.6 5.5 9.3a5.5 5.5 0 0 1-11 0C6.5 8.8 12 3.2 12 3.2Z" />
    </Svg>
  );
}

export function FlameIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3s.9 2.6-.8 4.6c-1.6 1.9-3.9 2.7-3.9 6A4.9 4.9 0 0 0 12 21a4.9 4.9 0 0 0 4.7-4.9c0-4.2-3.3-5.4-3.3-8.6" />
    </Svg>
  );
}

export function BoltIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.2 2.5 5.5 13.4h5.4l-.6 8.1 7.7-10.9h-5.4Z" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  );
}
