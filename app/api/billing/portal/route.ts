import { billingAccount, billingError, billingHeaders, BillingRequestError } from "@/lib/billing/http";
import { manageSubscription } from "@/lib/billing/provider";
import { billingStore } from "@/lib/billing/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const account = await billingAccount(request);
    const subscription = await (await billingStore()).management(account.id);
    if (!subscription) throw new BillingRequestError("There is no recurring subscription to manage.", 404);
    const result = await manageSubscription(subscription.provider, subscription.subscription_id, subscription.customer_id, new URL(request.url).origin);
    return Response.json(result, { headers: billingHeaders });
  } catch (error) { return billingError(error); }
}
