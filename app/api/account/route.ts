import { accountConfigured, authenticatedAccount } from "@/lib/account/session";
import { billingStore } from "@/lib/billing/store";
import { checkoutConfigured, premiumModelsEnabled, publicPlans } from "@/lib/billing/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export async function GET(request: Request) {
  try {
    const account = await authenticatedAccount(request);
    const common = { configured: accountConfigured(), plans: publicPlans(), checkoutAvailable: checkoutConfigured(), premiumModelsEnabled: premiumModelsEnabled() };
    if (!account) return Response.json({ ...common, account: null, plan: "free", subscription: null, billingAvailable: true }, { headers });
    try {
      const store = await billingStore();
      const subscription = await store.subscription(account.id);
      const management = await store.management(account.id);
      const visible = subscription ? { plan: subscription.plan, periodEnd: subscription.periodEnd, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, budgetMicrousd: subscription.budgetMicrousd, usedMicrousd: subscription.usedMicrousd } : null;
      return Response.json({ ...common, account, plan: subscription?.plan ?? "free", subscription: visible, management: management ? { provider: management.provider, cancelAtPeriodEnd: management.cancel_at_period_end } : null, billingAvailable: true }, { headers });
    } catch {
      // Preserve identity while failing closed on premium access. A billing
      // outage must not masquerade as cancellation or create another account.
      return Response.json({ ...common, account, plan: null, subscription: null, billingAvailable: false }, { headers });
    }
  } catch { return Response.json({ error: "Your account could not be checked. Please retry." }, { status: 503, headers }); }
}
