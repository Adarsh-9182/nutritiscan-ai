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
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), interest-cohort=()" },
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
   * The app screens were renamed when the dock replaced the top nav:
   * /dashboard split into /home (today) and /profile (memory), and
   * /timeline became /progress.
   *
   * These are the URLs the live marketing page has been linking to, so
   * they are permanent redirects rather than dead routes. /dashboard
   * lands on /home because that is what someone opening it actually
   * wants — the day's state, not the settings.
   */
  async redirects() {
    return [
      { source: "/dashboard", destination: "/home", permanent: true },
      { source: "/timeline", destination: "/progress", permanent: true },
    ];
  },
};

export default nextConfig;
