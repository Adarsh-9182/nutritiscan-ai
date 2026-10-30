import { billingAccount, billingError, billingHeaders, BillingRequestError } from "@/lib/billing/http";
import { cancelRenewal } from "@/lib/billing/provider";
import { billingStore } from "@/lib/billing/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const account = await billingAccount(request);
    const store = await billingStore(); const s = await store.management(account.id);
    if (!s) throw new BillingRequestError("There is no recurring subscription to cancel.", 404);
    if (!s.cancel_at_period_end) { await cancelRenewal(s.provider, s.subscription_id); await store.markCancellation(s.provider, s.subscription_id); }
    return Response.json({ canceled: true, message: "Renewal has been canceled. Paid access remains available through the paid period, subject to the usage allowance." }, { headers: billingHeaders });
  } catch (error) { return billingError(error); }
}
