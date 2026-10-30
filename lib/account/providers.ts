import { z } from "zod";
import type { OAuthProvider } from "./oauth";
const Provider = z.object({ configured: z.boolean(), client_id: z.string().max(255) });
const Providers = z.object({ google: Provider,github: Provider });
export async function healthAuth(path: string, options: RequestInit = {}) {
  const base = process.env.HEALTH_API_URL;
  if (!base) throw new Error("Account service unavailable");
  return fetch(`${base.replace(/\/$/, "")}/auth/${path}`, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(25_000)]) });
}
export async function configuredProviders() {
  const response = await healthAuth("providers", { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error("Social sign-in unavailable"); }
  return Providers.parse(await response.json());
}
export const providerLabel = (p: OAuthProvider) => p === "google" ? "Google" : "GitHub";
export const oauthMessages: Record<string,string> = {
  "oauth-canceled": "Sign-in was canceled. You can try again or use email.",
  "oauth-invalid": "This sign-in link expired or could not be verified. Please start again.",
  "oauth-unavailable": "Social sign-in is temporarily unavailable. Please retry or use email.",
  "oauth-conflict": "Sign in with your current method, then link this provider in Account settings. Accounts have not been merged.",
  "oauth-email": "Add and verify a primary email in your GitHub account settings, then try signing in again.",
  "oauth-reauth": "Sign in again, then link this provider from Account settings within 15 minutes.",
  "oauth-linked": "Your sign-in method has been linked to this account.",
};
export function oauthMessage(value?: string) { return value && Object.hasOwn(oauthMessages,value) ? oauthMessages[value] : undefined; }
