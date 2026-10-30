import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSubscription, safePaymentUrl, verifyPrice, verifyWebhook } from "./provider";
import { checkoutConfigured } from "./config";
const checkout = "13c6d886-b6e0-4cf1-8bdd-fde8b3d4e0e0";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("BILLING_PROVIDER", "stripe"); vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_key");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_synthetic_key_for_tests"); vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "razorpay_synthetic_key_for_tests");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro"); vi.stubEnv("STRIPE_MAX_PRICE_ID", "price_max"); vi.stubEnv("PRO_MONTHLY_PRICE_MINOR", "1000"); vi.stubEnv("BILLING_CURRENCY", "USD");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const price = { active: true, livemode: false, unit_amount: 1000, currency: "usd", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
describe("payment trust boundary", () => {
  it("validates exact raw signed payloads and Stripe replay age", () => {
    const raw = '{"id":"evt_test","type":"checkout.session.completed"}'; const t = Math.floor(Date.now()/1000);
    const signed = (timestamp: number) => new Headers({ "stripe-signature": `t=${timestamp},v1=${createHmac("sha256",process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${raw}`).digest("hex")}` });
    expect(verifyWebhook("stripe",raw,signed(t))).toBe(true);
    expect(verifyWebhook("stripe",raw+" ",signed(t))).toBe(false);
    expect(verifyWebhook("stripe",raw,signed(t-600))).toBe(false);
    const razor = new Headers({ "x-razorpay-signature": createHmac("sha256",process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex") });
    expect(verifyWebhook("razorpay",raw,razor)).toBe(true); expect(verifyWebhook("razorpay",raw.replace("evt_test","other"),razor)).toBe(false);
  });
  it("refuses altered merchant prices and wrong live/test mode", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(price)).mockResolvedValueOnce(Response.json({ ...price, unit_amount: 2000 })).mockResolvedValueOnce(Response.json(price)); vi.stubGlobal("fetch",fetch);
    await expect(verifyPrice("stripe","pro")).resolves.toBe("price_pro");
    await expect(verifyPrice("stripe","pro")).rejects.toThrow("Billing could not be verified");
    vi.stubEnv("NODE_ENV","production"); await expect(verifyPrice("stripe","pro")).rejects.toThrow();
  });
  it("does not treat a trial, authorization or unpaid subscription as paid", async () => {
    const sub = { id: "sub_test", metadata: { nutritiscan_checkout: checkout }, status: "active", livemode: false, items: { data: [{ price: { id: "price_pro" }, quantity: 1, current_period_start: 1_790_000_000, current_period_end: 1_793_000_000 }] }, latest_invoice: { status: "open", amount_paid: 0 } };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(sub)).mockResolvedValueOnce(Response.json(price)).mockResolvedValueOnce(Response.json({ ...sub, latest_invoice: { status: "paid", amount_paid: 1000 } })).mockResolvedValueOnce(Response.json(price)); vi.stubGlobal("fetch",fetch);
    expect((await fetchSubscription("stripe","sub_test")).status).toBe("unverified");
    expect((await fetchSubscription("stripe","sub_test")).status).toBe("active");
  });
  it("never enables production checkout with sandbox credentials", () => {
    vi.stubEnv("BILLING_ENABLED","true"); vi.stubEnv("PREMIUM_AI_ENABLED","true"); vi.stubEnv("AI_GATEWAY_API_KEY","synthetic_gateway_key_for_tests");
    expect(checkoutConfigured()).toBe(true); vi.stubEnv("NODE_ENV","production"); expect(checkoutConfigured()).toBe(false);
    vi.stubEnv("VERCEL_ENV","preview"); expect(checkoutConfigured()).toBe(true);
  });
  it("refuses arbitrary payment redirects", () => {
    expect(safePaymentUrl("https://checkout.stripe.com/c/pay/synthetic")).toContain("checkout.stripe.com");
    for (const url of ["https://checkout.stripe.com.evil.example/", "http://checkout.stripe.com/", "https://evil.example/", "https://user@checkout.stripe.com/"]) expect(() => safePaymentUrl(url)).toThrow();
  });
});
