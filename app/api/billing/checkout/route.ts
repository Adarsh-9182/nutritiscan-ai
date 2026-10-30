import { z } from "zod";
import { readJsonCapped } from "@/lib/http/guard";
import { checkoutConfigured } from "@/lib/billing/config";
import { billingAccount, billingError, billingHeaders, BillingRequestError } from "@/lib/billing/http";
import { billingProvider, createCheckout, safePaymentUrl } from "@/lib/billing/provider";
import { billingStore } from "@/lib/billing/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const account = await billingAccount(request);
    if (!checkoutConfigured()) throw new BillingRequestError("Subscriptions are not open yet. Free chat remains available.", 503);
    const body = await readJsonCapped(request, 1024);
    const parsed = body.ok && z.object({ plan: z.enum(["pro", "max"]) }).strict().safeParse(body.value);
    if (!parsed || !parsed.success) throw new BillingRequestError("Choose a valid plan.", 400);
    const provider = billingProvider()!;
    const store = await billingStore();
    const checkout = await store.openCheckout(account.id, provider, parsed.data.plan);
    if (checkout.url) return Response.json({ url: safePaymentUrl(checkout.url) }, { headers: billingHeaders });
    // Stripe retries use the SAME idempotency key. Razorpay has no such
    // guarantee: retain an uncertain attempt until its hosted link expires.
    if (!checkout.created && provider === "razorpay") throw new BillingRequestError("A checkout is being verified. Please wait; another subscription has not been created.", 409);
    const result = await createCheckout(provider, checkout.id, parsed.data.plan, new URL(request.url).origin);
    await store.saveCheckout(checkout.id, result.id, result.subscriptionId, result.url);
    return Response.json({ url: result.url }, { headers: billingHeaders });
  } catch (error) { return billingError(error); }
}
