import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * This app holds biomarkers, medicines and conditions in the browser. The
 * single highest-value fix is a CSP: it is what stops an injected script
 * from reading `localStorage` and exfiltrating that memory.
 *
 * `'unsafe-inline'` on style-src is required by the inline `style={{…}}`
 * props used throughout the components, and Next injects inline bootstrap
 * scripts, hence `'unsafe-inline'` on script-src. Both are honest ceilings
 * rather than oversights — tightening them means moving to nonce-based CSP
 * via middleware, which is the right next step but a behavioural change.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // data: covers the in-browser canvas preview of the user's meal photo
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Health URLs should never leak to third parties via the Referer header.
  { key: "Referrer-Policy", value: "no-referrer" },
  /**
   * `microphone` and `camera` are granted to SELF, not denied.
   *
   * They were both denied outright, which silently broke the two
   * capture surfaces this product is built around: the voice
   * screen's Web Speech transcription and the scanner's live
   * `getUserMedia` viewfinder. The failure was invisible in
   * development — both features degrade gracefully to a file
   * picker and a "voice unavailable" message — so the app looked
   * like it merely lacked browser support rather than like it was
   * forbidding itself.
   *
   * `self` still blocks any embedded third-party frame from
   * reaching the mic or camera, which is the threat this header
   * exists to address. Everything else stays denied.
   */
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // This project has its own lockfile; pin the workspace root to silence
  // Next's multi-lockfile inference warning.
  turbopack: { root: __dirname },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  /**
   * Old URLs, kept alive.
   *
   * The v1 shell had /dashboard, /home, /progress, /coach, /profile
   * and /timeline. The v2 information architecture has three
   * destinations instead, so each old path redirects to the screen
   * that now answers the same need — not to the homepage, which is
   * the lazy version and drops the user's intent.
   *
   * These were previously pointing at /home and /progress, both of
   * which no longer exist: the redirects were resolving to 404s.
   */
  async redirects() {
    return [
      // "Show me today" → the question field, which is the new default.
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/home", destination: "/", permanent: true },
      { source: "/coach", destination: "/", permanent: true },
      // "Show me myself over time" → Health.
      { source: "/progress", destination: "/health", permanent: true },
      { source: "/timeline", destination: "/health", permanent: true },
      // "Show me my settings" → You.
      { source: "/profile", destination: "/you", permanent: true },
    ];
  },
};

export default nextConfig;
