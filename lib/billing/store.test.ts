import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BillingStore, type BillingSnapshot } from "./store";
let db: PGlite;
let store: BillingStore;
const owner = "bdc902f1-b72e-40c0-afd6-996db3cb8704";
const start = new Date(Date.now()-3_600_000).toISOString();
const end = new Date(Date.now()+86400_000).toISOString();
const snapshot: BillingSnapshot = { id: "sub_test", checkoutId: "13c6d886-b6e0-4cf1-8bdd-fde8b3d4e0e0", customerId: "cus_test", plan: "pro", status: "active", livemode: false, periodStart: start, periodEnd: end, cancelAtPeriodEnd: false };
beforeAll(async () => { db = new PGlite(); await db.exec(await readFile("migrations/billing/0001_subscriptions.sql", "utf8")); store = new BillingStore({ query: async <T>(sql: string, values: unknown[] = []) => (await db.query<T>(sql, values)).rows, close: async () => {} }); }, 15_000);
beforeEach(async () => { vi.stubEnv("NODE_ENV", "test"); await db.exec("TRUNCATE ns_billing_subscriptions,ns_billing_checkouts,ns_billing_events,ns_billing_holds,ns_billing_payment_holds,ns_billing_usage,ns_billing_reservations"); });
afterEach(() => vi.unstubAllEnvs()); afterAll(async () => db.close());
async function activate(overrides: Partial<BillingSnapshot> = {}) {
  const s = { ...snapshot, ...overrides };
  await db.query("INSERT INTO ns_billing_checkouts(id,account_id,provider,plan,expires_at) VALUES ($1,$2,'stripe','pro',$3)", [s.checkoutId,owner,end]);
  await store.applyEvent("stripe", "evt_initial", s, new Date().toISOString());
  return s;
}
describe("subscription entitlements and atomic allowance", () => {
  it("never accepts an entitlement without an authenticated checkout binding", async () => {
    await store.applyEvent("stripe", "evt_unbound", snapshot, new Date().toISOString());
    expect(await store.subscription(owner)).toBeNull();
    await activate(); expect((await store.subscription(owner))?.plan).toBe("pro");
    expect(await store.subscription("other-account")).toBeNull();
  });
  it("rejects expired, future, past-due, held and production test subscriptions", async () => {
    await activate();
    vi.stubEnv("NODE_ENV", "production"); expect(await store.subscription(owner)).toBeNull(); vi.stubEnv("NODE_ENV", "test");
    for (const clause of ["status='past_due'", "period_end=now()-interval '1 second'", "period_start=now()+interval '1 hour'"]) {
      await db.exec(`UPDATE ns_billing_subscriptions SET ${clause}`); expect(await store.subscription(owner)).toBeNull();
      await db.query("UPDATE ns_billing_subscriptions SET status='active',period_start=$1,period_end=$2", [start,end]);
    }
    await store.hold("stripe", snapshot.id, "payment_review"); expect(await store.subscription(owner)).toBeNull();
  });
  it("deduplicates webhook events and prevents stale fetches restoring canceled access", async () => {
    await activate();
    const future = new Date(Date.now()+10_000).toISOString();
    await store.applyEvent("stripe", "evt_cancel", { ...snapshot, status: "canceled" }, future);
    await store.applyEvent("stripe", "evt_stale", snapshot, new Date().toISOString());
    await store.applyEvent("stripe", "evt_cancel", snapshot, new Date(Date.now()+20_000).toISOString());
    expect(await store.subscription(owner)).toBeNull();
    expect((await db.query("SELECT * FROM ns_billing_events")).rows).toHaveLength(3);
  });
  it("atomically admits only the requests that fit, and settles exactly once", async () => {
    await activate(); const subscription = (await store.subscription(owner))!;
    const reserve = Math.floor(subscription.budgetMicrousd * .6);
    const attempts = await Promise.allSettled([store.reserve(owner, subscription, reserve), store.reserve(owner, subscription, reserve)]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const id = (attempts.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<string>).value;
    await Promise.all([store.settle(id, 1000),store.settle(id, 1000)]);
    expect((await store.subscription(owner))?.usedMicrousd).toBe(1000);
  });
  it("rechecks ownership and fresh entitlement at reservation time", async () => {
    await activate(); const subscription = (await store.subscription(owner))!;
    await expect(store.reserve("other-account", subscription, 1000)).rejects.toThrow();
    await db.exec("UPDATE ns_billing_subscriptions SET plan='max'");
    await expect(store.reserve(owner, subscription, 1000)).rejects.toThrow();
    expect((await store.subscription(owner))?.usedMicrousd).toBe(0);
  });
  it("does not create duplicate or conflicting recurring checkouts", async () => {
    const attempts = await Promise.all([store.openCheckout(owner,"stripe","pro"),store.openCheckout(owner,"stripe","pro")]);
    expect(attempts[0].id).toBe(attempts[1].id);
    await expect(store.openCheckout(owner,"stripe","max")).rejects.toThrow();
    expect((await db.query("SELECT * FROM ns_billing_checkouts")).rows).toHaveLength(1);
  });
  it("retains unknown usage and records unexpected overages rather than hiding costs", async () => {
    await activate(); const s = (await store.subscription(owner))!;
    const id = await store.reserve(owner,s,1000); expect((await store.subscription(owner))?.usedMicrousd).toBe(1000);
    await store.settle(id,1200); expect((await store.subscription(owner))?.usedMicrousd).toBe(1200);
  });
  it("honors refunds arriving before the first subscription event", async () => {
    await store.holdReferences("stripe",[snapshot.customerId!],"payment_review");
    await activate(); expect(await store.subscription(owner)).toBeNull();
  });
});
