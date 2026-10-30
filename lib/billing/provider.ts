import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { billingProvider, liveBilling, publicPlans } from "./config";
import type { PaidPlan } from "./plans";
import type { BillingSnapshot } from "./store";

export type PaymentProvider = "stripe" | "razorpay";
export class PaymentUnavailable extends Error { readonly status = 503; }
const fail = () => new PaymentUnavailable("Billing could not be verified. Please retry or contact support.");
type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const identifier = (value: unknown) => text(typeof value === "object" ? object(value).id : value);
function pathId(id: string) { if (!/^[a-zA-Z0-9_]+$/.test(id)) throw fail(); return encodeURIComponent(id); }
function planId(provider: PaymentProvider, plan: PaidPlan) { const id = process.env[`${provider.toUpperCase()}_${plan.toUpperCase()}_${provider === "stripe" ? "PRICE" : "PLAN"}_ID`]; if (!id) throw fail(); return id; }
async function api(provider: PaymentProvider, path: string, params?: Record<string, string> | Obj, idempotency?: string) {
  const stripe = provider === "stripe";
  const headers: Record<string, string> = { authorization: stripe ? `Bearer ${process.env.STRIPE_SECRET_KEY}` : `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}` };
  if (stripe) headers["stripe-version"] = "2026-10-28.endive";
  if (idempotency && stripe) headers["idempotency-key"] = idempotency;
  if (params) headers["content-type"] = stripe ? "application/x-www-form-urlencoded" : "application/json";
  try {
    const response = await fetch(`${stripe ? "https://api.stripe.com/v1" : "https://api.razorpay.com/v1"}/${path}`, { method: params ? "POST" : "GET", headers, ...(params ? { body: stripe ? new URLSearchParams(params as Record<string, string>).toString() : JSON.stringify(params) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) { await response.body?.cancel(); throw fail(); }
    return object(await response.json());
  } catch { throw fail(); }
}

/** Refuse a merchant price that differs from the public recurring offer. */
export async function verifyPrice(provider: PaymentProvider, plan: PaidPlan) {
  const expected = publicPlans().find((p) => p.id === plan);
  if (!expected?.amountMinor) throw fail();
  const p = await api(provider, `${provider === "stripe" ? "prices" : "plans"}/${pathId(planId(provider, plan))}`);
  if (provider === "stripe") {
    const recurrence = object(p.recurring);
    if (p.active !== true || p.livemode !== liveBilling() || p.unit_amount !== expected.amountMinor || p.currency !== expected.currency.toLowerCase() || recurrence.interval !== "month" || recurrence.interval_count !== 1 || recurrence.usage_type !== "licensed") throw fail();
  } else {
    const item = object(p.item);
    if (p.period !== "monthly" || p.interval !== 1 || item.amount !== expected.amountMinor || item.currency !== expected.currency) throw fail();
  }
  return planId(provider, plan);
}
export function safePaymentUrl(value: unknown, portal = false) {
  const url = new URL(text(value));
  const allowed = portal ? ["billing.stripe.com"] : ["checkout.stripe.com", "rzp.io", "pay.razorpay.com"];
  if (url.protocol !== "https:" || url.username || url.password || !allowed.includes(url.hostname)) throw fail();
  return url.href;
}
export async function createCheckout(provider: PaymentProvider, checkoutId: string, plan: PaidPlan, origin: string) {
  const price = await verifyPrice(provider, plan);
  if (provider === "stripe") {
    const result = await api(provider, "checkout/sessions", { mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1", "subscription_data[metadata][nutritiscan_checkout]": checkoutId, "metadata[nutritiscan_checkout]": checkoutId, client_reference_id: checkoutId, success_url: `${origin}/account?checkout=complete`, cancel_url: `${origin}/pricing`, expires_at: String(Math.floor(Date.now() / 1000) + 3600) }, checkoutId);
    if (result.livemode !== liveBilling() || !identifier(result.id)) throw fail();
    return { id: identifier(result.id), subscriptionId: null, url: safePaymentUrl(result.url) };
  }
  // Razorpay requires a finite mandate duration. The owner explicitly sets it;
  // it is shown by the hosted checkout rather than silently assumed unlimited.
  const count = Number(process.env.RAZORPAY_TOTAL_COUNT);
  if (!Number.isInteger(count) || count < 1 || count > 120) throw fail();
  const result = await api(provider, "subscriptions", { plan_id: price, total_count: count, quantity: 1, customer_notify: false, expire_by: Math.floor(Date.now() / 1000) + 3600, notes: { nutritiscan_checkout: checkoutId } });
  if (!identifier(result.id)) throw fail();
  return { id: identifier(result.id), subscriptionId: identifier(result.id), url: safePaymentUrl(result.short_url) };
}
function date(seconds: unknown) { return typeof seconds === "number" && seconds > 0 && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : new Date(0).toISOString(); }
export async function fetchSubscription(provider: PaymentProvider, id: string): Promise<BillingSnapshot> {
  const s = await api(provider, `subscriptions/${pathId(id)}${provider === "stripe" ? "?expand[]=latest_invoice" : ""}`);
  const checkoutId = text(object(provider === "stripe" ? s.metadata : s.notes).nutritiscan_checkout);
  if (!z.string().uuid().safeParse(checkoutId).success || identifier(s.id) !== id) throw fail();
  const items = object(s.items).data;
  const item = Array.isArray(items) && items.length === 1 ? object(items[0]) : {};
  const remotePrice = provider === "stripe" ? identifier(item.price) : text(s.plan_id);
  const plan = (["pro", "max"] as const).find((p) => remotePrice === planId(provider, p));
  // Unknown/changed offers never keep premium enabled.
  const invoice = object(s.latest_invoice);
  const paid = provider === "stripe" ? invoice.status === "paid" && typeof invoice.amount_paid === "number" && invoice.amount_paid > 0 && item.quantity === 1 : typeof s.paid_count === "number" && s.paid_count > 0 && s.quantity === 1;
  const validPrice = plan ? await verifyPrice(provider, plan).then(() => true, () => false) : false;
  return { id, checkoutId, customerId: identifier(s.customer) || text(s.customer_id) || null, plan: plan ?? "pro", status: s.status === "active" && (!paid || !validPrice) ? "unverified" : text(s.status), livemode: provider === "stripe" ? s.livemode === true : liveBilling(), periodStart: date(provider === "stripe" ? item.current_period_start : s.current_start), periodEnd: date(provider === "stripe" ? item.current_period_end : s.current_end), cancelAtPeriodEnd: s.cancel_at_period_end === true || s.cancel_at_cycle_end === true };
}
export async function manageSubscription(provider: PaymentProvider, subscriptionId: string, customerId: string | null, origin: string) {
  if (provider === "stripe") {
    if (!customerId) throw fail();
    const result = await api(provider, "billing_portal/sessions", { customer: customerId, return_url: `${origin}/account` });
    return { url: safePaymentUrl(result.url, true) };
  }
  throw new PaymentUnavailable("Use Cancel renewal below to manage this subscription.");
}
export async function cancelRenewal(provider: PaymentProvider, id: string) {
  await api(provider, `subscriptions/${pathId(id)}${provider === "razorpay" ? "/cancel" : ""}`, provider === "stripe" ? { cancel_at_period_end: "true" } : { cancel_at_cycle_end: true });
}
function constantEqual(a: string, b: string) { return /^[a-f0-9]{64}$/i.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex")); }
export function verifyWebhook(provider: PaymentProvider, raw: string, headers: Headers) {
  const secret = process.env[provider === "stripe" ? "STRIPE_WEBHOOK_SECRET" : "RAZORPAY_WEBHOOK_SECRET"];
  if (!secret) return false;
  if (provider === "razorpay") return constantEqual(headers.get("x-razorpay-signature") ?? "", createHmac("sha256", secret).update(raw).digest("hex"));
  const parts = (headers.get("stripe-signature") ?? "").split(",");
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return parts.some((p) => p.startsWith("v1=") && constantEqual(p.slice(3), expected));
}
export async function webhookReference(provider: PaymentProvider, event: Obj) {
  const type = text(provider === "stripe" ? event.type : event.event);
  const payload = object(event.payload);
  const data = object(object(event.data).object);
  const hold = /refund|dispute/.test(type);
  let subscription = "";
  const holdReferences: string[] = [];
  if (provider === "stripe") {
    if (type.startsWith("customer.subscription.")) subscription = identifier(data.id);
    else if (type.startsWith("checkout.session.")) subscription = identifier(data.subscription);
    else if (type.startsWith("invoice.")) subscription = identifier(data.subscription) || identifier(object(object(data.parent).subscription_details).subscription);
    else if (hold) {
      const chargeId = type.startsWith("charge.dispute.") ? identifier(data.charge) : identifier(data.id);
      const charge = chargeId ? await api(provider, `charges/${pathId(chargeId)}`) : {};
      if (identifier(charge.customer)) holdReferences.push(identifier(charge.customer));
      let invoiceId = identifier(charge.invoice);
      if (!invoiceId && identifier(charge.payment_intent)) {
        const pi = await api(provider, `payment_intents/${pathId(identifier(charge.payment_intent))}`); invoiceId = identifier(pi.invoice);
      }
      if (invoiceId) { const invoice = await api(provider, `invoices/${pathId(invoiceId)}`); subscription = identifier(invoice.subscription) || identifier(object(object(invoice.parent).subscription_details).subscription); }
    }
  } else {
    subscription = identifier(object(payload.subscription).entity);
    if (hold && !subscription) {
      const entity = object(object(payload.refund).entity);
      const dispute = object(object(payload.dispute).entity);
      const paymentId = text(entity.payment_id) || text(dispute.payment_id);
      if (paymentId) { const payment = await api(provider, `payments/${pathId(paymentId)}`); if (text(payment.customer_id)) holdReferences.push(text(payment.customer_id)); if (payment.invoice_id) { const invoice = await api(provider, `invoices/${pathId(text(payment.invoice_id))}`); subscription = text(invoice.subscription_id); } }
    }
  }
  if (hold && subscription) holdReferences.push(subscription);
  if (hold && !holdReferences.length) throw fail();
  return { subscription, hold, holdReferences, type };
}
export { billingProvider };
