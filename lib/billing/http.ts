import { authenticatedAccount } from "@/lib/account/session";
import { matchesOrigin } from "@/lib/agent-runtime/origin";
import { checkRateShared, clientKey } from "@/lib/http/guard";
export const billingHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export class BillingRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function billingAccount(request: Request) {
  if (!matchesOrigin(request) || request.headers.get("sec-fetch-site") === "cross-site") throw new BillingRequestError("Open billing on this site to continue.", 403);
  const rate = await checkRateShared(`billing:${clientKey(request)}`, 10, 60_000);
  if (!rate.ok) throw new BillingRequestError("Please wait before retrying billing.", 429);
  const account = await authenticatedAccount(request);
  if (!account) throw new BillingRequestError("Sign in before managing a subscription.", 401);
  return account;
}
export function billingError(error: unknown) {
  const safe = error instanceof Error && "status" in error && typeof error.status === "number";
  return Response.json({ error: safe ? error.message : "Billing is temporarily unavailable. Please retry." }, { status: safe ? error.status as number : 503, headers: billingHeaders });
}
