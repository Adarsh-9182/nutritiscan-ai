import type { Database } from "@/lib/workspace/database";
import { database } from "@/lib/workspace/database";
import { randomUUID } from "node:crypto";
import { isPaidPlan, planCredits, type PlanId, type PaidPlan } from "./plans";
import { liveBilling } from "./config";

export class BillingUnavailable extends Error { readonly status = 503; }
export class PremiumLimit extends Error { readonly status = 429; }
export type Subscription = { plan: PaidPlan; provider: "stripe" | "razorpay"; subscriptionId: string; customerId: string | null; periodStart: string; periodEnd: string; cancelAtPeriodEnd: boolean; budgetMicrousd: number; usedMicrousd: number };

export class BillingStore {
  constructor(private db: Database) {}
  async management(accountId: string) {
    const rows = await this.db.query<{ provider: "stripe" | "razorpay"; subscription_id: string; customer_id: string | null; cancel_at_period_end: boolean }>(`SELECT provider,subscription_id,customer_id,cancel_at_period_end FROM ns_billing_subscriptions WHERE account_id=$1 AND status NOT IN ('canceled','cancelled','completed','expired','incomplete_expired') ORDER BY updated_at DESC LIMIT 1`, [accountId]);
    return rows[0] ?? null;
  }
  async openCheckout(accountId: string, provider: string, plan: PaidPlan) {
    await this.db.query(`UPDATE ns_billing_checkouts SET status='expired' WHERE account_id=$1 AND expires_at<=now() AND status IN ('creating','open')`, [accountId]);
    const id = randomUUID();
    await this.db.query(`INSERT INTO ns_billing_checkouts(id,account_id,provider,plan,expires_at) SELECT $1,$2,$3,$4,now()+interval '1 hour' WHERE NOT EXISTS (SELECT 1 FROM ns_billing_subscriptions WHERE account_id=$2 AND status NOT IN ('canceled','cancelled','completed','expired','incomplete_expired')) AND NOT EXISTS(SELECT 1 FROM ns_billing_holds WHERE account_id=$2) ON CONFLICT DO NOTHING`, [id, accountId, provider, plan]);
    const rows = await this.db.query<{ id: string; provider: string; plan: PaidPlan; url: string | null }>(`SELECT id,provider,plan,url FROM ns_billing_checkouts WHERE account_id=$1 AND status IN ('creating','open') AND expires_at>now()`, [accountId]);
    const row = rows[0];
    if (!row || row.provider !== provider || row.plan !== plan) throw new BillingUnavailable("Manage your existing subscription or pending checkout before choosing another plan.");
    return { ...row, created: row.id === id };
  }
  async saveCheckout(id: string, providerId: string, subscriptionId: string | null, url: string) {
    await this.db.query(`UPDATE ns_billing_checkouts SET provider_id=$2,subscription_id=COALESCE(subscription_id,$3),url=$4,status=CASE WHEN status='creating' THEN 'open' ELSE status END WHERE id=$1`, [id, providerId, subscriptionId, url]);
  }
  async applyEvent(provider: string, eventId: string, s: BillingSnapshot, checkedAt: string) {
    // The account binding must have been minted by our authenticated checkout.
    // Record the event and update state in one statement. Duplicate events do
    // nothing; an older authoritative fetch cannot overwrite a newer one.
    await this.db.query(`WITH owner AS (
      SELECT account_id FROM ns_billing_checkouts WHERE provider=$1 AND id=$3 AND (subscription_id IS NULL OR subscription_id=$4)
    ), event AS (
      INSERT INTO ns_billing_events(provider,event_id) SELECT $1,$2 FROM owner ON CONFLICT DO NOTHING RETURNING event_id
    ), bound AS (
      UPDATE ns_billing_checkouts SET subscription_id=$4,status='complete' WHERE id=$3 AND EXISTS(SELECT 1 FROM event) RETURNING account_id
    ) INSERT INTO ns_billing_subscriptions(provider,subscription_id,account_id,customer_id,plan,status,livemode,period_start,period_end,cancel_at_period_end,updated_at)
      SELECT $1,$4,account_id,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::timestamptz FROM bound
      ON CONFLICT(provider,subscription_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,livemode=EXCLUDED.livemode,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end,cancel_at_period_end=(EXCLUDED.cancel_at_period_end OR ns_billing_subscriptions.cancel_at_period_end),updated_at=EXCLUDED.updated_at
      WHERE ns_billing_subscriptions.account_id=EXCLUDED.account_id AND ns_billing_subscriptions.updated_at<=EXCLUDED.updated_at`,
      [provider,eventId,s.checkoutId,s.id,s.customerId,s.plan,s.status,s.livemode,s.periodStart,s.periodEnd,s.cancelAtPeriodEnd,checkedAt]);
  }
  async hold(provider: string, subscriptionId: string, reason: string) {
    await this.holdReferences(provider, [subscriptionId], reason);
    await this.db.query(`INSERT INTO ns_billing_holds(account_id,reason) SELECT account_id,$3 FROM ns_billing_subscriptions WHERE provider=$1 AND subscription_id=$2 ON CONFLICT(account_id) DO UPDATE SET reason=EXCLUDED.reason,updated_at=now()`, [provider,subscriptionId,reason]);
  }
  async holdReferences(provider: string, references: string[], reason: string) {
    for (const reference of references) await this.db.query(`INSERT INTO ns_billing_payment_holds(provider,reference,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[provider,reference,reason]);
  }
  async markCancellation(provider: string, id: string) { await this.db.query(`UPDATE ns_billing_subscriptions SET cancel_at_period_end=true WHERE provider=$1 AND subscription_id=$2`, [provider,id]); }
  async subscription(accountId: string): Promise<Subscription | null> {
    const rows = await this.db.query<{ plan: string; provider: "stripe" | "razorpay"; subscription_id: string; customer_id: string | null; period_start: Date | string; period_end: Date | string; cancel_at_period_end: boolean; used: string | number }>(
      `SELECT s.*, COALESCE(u.used_microusd,0) AS used FROM ns_billing_subscriptions s
       LEFT JOIN ns_billing_usage u ON u.account_id=s.account_id AND u.period_start=s.period_start
       WHERE s.account_id=$1 AND s.livemode=$2 AND s.status='active' AND s.period_start<=now() AND s.period_end>now()
       AND NOT EXISTS (SELECT 1 FROM ns_billing_holds h WHERE h.account_id=s.account_id)
       AND NOT EXISTS (SELECT 1 FROM ns_billing_payment_holds h WHERE h.provider=s.provider AND h.reference IN (s.subscription_id,s.customer_id))
       ORDER BY CASE WHEN s.plan='max' THEN 2 ELSE 1 END DESC,s.period_end DESC LIMIT 1`, [accountId, liveBilling()]);
    const s = rows[0];
    if (!s || !isPaidPlan(s.plan)) return null;
    return { plan: s.plan, provider: s.provider, subscriptionId: s.subscription_id, customerId: s.customer_id, periodStart: new Date(s.period_start).toISOString(), periodEnd: new Date(s.period_end).toISOString(), cancelAtPeriodEnd: s.cancel_at_period_end, budgetMicrousd: planCredits(s.plan) * 10_000, usedMicrousd: Number(s.used) };
  }
  async reserve(accountId: string, subscription: Subscription, maximumMicrousd: number) {
    const id = randomUUID();
    const n = Math.ceil(maximumMicrousd);
    if (!Number.isSafeInteger(n) || n < 1 || n > subscription.budgetMicrousd) throw new PremiumLimit("This request exceeds the available premium allowance.");
    const rows = await this.db.query<{ id: string }>(
      `WITH allowed AS (
         SELECT account_id FROM ns_billing_subscriptions s WHERE s.account_id=$1 AND s.provider=$2 AND s.subscription_id=$3
         AND s.status='active' AND s.period_start<=now() AND s.period_end>now() AND s.period_start=$4::timestamptz AND s.period_end=$5::timestamptz AND s.plan=$9 AND s.livemode=$10
         AND NOT EXISTS (SELECT 1 FROM ns_billing_holds h WHERE h.account_id=s.account_id)
         AND NOT EXISTS (SELECT 1 FROM ns_billing_payment_holds h WHERE h.provider=s.provider AND h.reference IN (s.subscription_id,s.customer_id))
       ), budget AS (
         INSERT INTO ns_billing_usage(account_id,period_start,period_end,used_microusd)
         SELECT account_id,$4::timestamptz,$5::timestamptz,$6 FROM allowed
         ON CONFLICT(account_id,period_start) DO UPDATE SET used_microusd=ns_billing_usage.used_microusd+$6
         WHERE ns_billing_usage.used_microusd+$6 <= $7 RETURNING account_id
       ) INSERT INTO ns_billing_reservations(id,account_id,period_start,reserved_microusd)
       SELECT $8,account_id,$4::timestamptz,$6 FROM budget RETURNING id`,
      [accountId, subscription.provider, subscription.subscriptionId, subscription.periodStart, subscription.periodEnd, n, subscription.budgetMicrousd, id, subscription.plan, liveBilling()]);
    if (!rows.length) throw new PremiumLimit("Your premium allowance is used up or your subscription changed. Basic chat remains available.");
    return id;
  }
  async settle(reservationId: string, actualMicrousd: number) {
    const actual = Math.max(0, Math.ceil(actualMicrousd));
    if (!Number.isSafeInteger(actual)) return;
    // Once only, including concurrent stream finish/cancel paths. Unknown usage
    // retains the conservative reservation rather than inventing a free call.
    await this.db.query(`WITH settled AS (
      UPDATE ns_billing_reservations SET settled=true WHERE id=$1 AND settled=false
      RETURNING account_id,period_start,reserved_microusd
    ) UPDATE ns_billing_usage u SET used_microusd=GREATEST(0,u.used_microusd-s.reserved_microusd+$2)
      FROM settled s WHERE u.account_id=s.account_id AND u.period_start=s.period_start`, [reservationId, actual]);
  }
}
export type BillingSnapshot = { id: string; checkoutId: string; customerId: string | null; plan: PaidPlan; status: string; livemode: boolean; periodStart: string; periodEnd: string; cancelAtPeriodEnd: boolean };

export async function billingStore() {
  try { return new BillingStore(await database()); } catch { throw new BillingUnavailable("Account billing is temporarily unavailable."); }
}
export function effectivePlan(subscription: Subscription | null): PlanId { return subscription?.plan ?? "free"; }
