// ============================================================
// ICONS
//
// Hand-rolled rather than pulled from a library, for two
// reasons that matter at this size:
//
// 1. WEIGHT CONSISTENCY. Every glyph here is drawn on a 24-grid
//    with a 1.6 stroke and round caps. Icon sets mix 1.5 and 2.0
//    weights across their catalogue, which reads as sloppy when
//    a tab bar shows five of them side by side.
//
// 2. NO 400KB DEPENDENCY for eighteen shapes.
//
// They inherit `currentColor` and size from the `size` prop, so
// a caller never restyles a path.
// ============================================================

type IconProps = { size?: number; className?: string; strokeWidth?: number };

function Svg({
  size = 20,
  className,
  strokeWidth = 1.6,
  children,
}: IconProps & { children: React.ReactNode }) {
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
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const AskIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 12a8.5 8.5 0 1 1-3.6-6.93" />
    <path d="M4.2 19.8 3 21l1.2-3.6" />
  </Svg>
);

export const HealthIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 14.5h3.2l1.9-5.2 2.8 8.4 2.4-6.1 1.5 2.9H21" />
  </Svg>
);

export const YouIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </Svg>
);

export const ScanIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5" />
    <path d="M15.5 4H18a2 2 0 0 1 2 2v2.5" />
    <path d="M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
    <path d="M8.5 20H6a2 2 0 0 1-2-2v-2.5" />
    <path d="M7.5 12h9" />
  </Svg>
);

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="2.6" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <path d="M12 18v3.4" />
  </Svg>
);

export const ChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Svg>
);

export const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Svg>
);

export const ChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 9.5 12 16l6.5-6.5" />
  </Svg>
);

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12h15" />
    <path d="m13.5 6 6 6-6 6" />
  </Svg>
);

export const ArrowUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19.5v-15" />
    <path d="m6 10.5 6-6 6 6" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5v15M4.5 12h15" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="m16 16 4 4" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7.8v4.6" />
    <path d="M12 16.1h.01" />
  </Svg>
);

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.8" y="10.4" width="14.4" height="10" rx="2.6" />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6" />
  </Svg>
);

export const DocIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.4 3.2H7.4a2 2 0 0 0-2 2v13.6a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V8.4z" />
    <path d="M13.4 3.2v5.2h5.2" />
  </Svg>
);

export const PillIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.6" y="8.4" width="18.8" height="7.2" rx="3.6" transform="rotate(-45 12 12)" />
    <path d="M8.6 8.6 15.4 15.4" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2 5 6v5.6c0 4.3 2.9 8.1 7 9.2 4.1-1.1 7-4.9 7-9.2V6z" />
  </Svg>
);

export const ImageIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17.5 4.8-4.4 3.4 3 2.6-2.2 4.2 3.6" />
  </Svg>
);

export const BasketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.4 8.6h17.2l-1.7 10a2 2 0 0 1-2 1.7H7.1a2 2 0 0 1-2-1.7z" />
    <path d="m8.4 8.6 2.2-5M15.6 8.6l-2.2-5" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2.4" />
    <path d="M3.6 10h16.8M8.4 3.2v3.6M15.6 3.2v3.6" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.4 13.6 9 19.2 10.6 13.6 12.2 12 17.8 10.4 12.2 4.8 10.6 10.4 9z" />
    <path d="M18.4 16.6 19 18.6l2 .6-2 .6-.6 2-.6-2-2-.6 2-.6z" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 7v5.2l3.2 1.9" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.6 6.6h14.8M9.4 6.6V4.8a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v1.8" />
    <path d="M6.6 6.6 7.5 19a2 2 0 0 0 2 1.8h5a2 2 0 0 0 2-1.8l.9-12.4" />
  </Svg>
);

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 15.4V3.8" />
    <path d="m8 7.4 4-3.6 4 3.6" />
    <path d="M5.6 13.4v5.4a2 2 0 0 0 2 2h8.8a2 2 0 0 0 2-2v-5.4" />
  </Svg>
);
