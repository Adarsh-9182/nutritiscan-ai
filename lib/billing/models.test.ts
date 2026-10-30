import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { BillingStore, Subscription } from "./store";
import { budgetMiddleware, premiumForRequest, premiumModel, withPremium } from "./models";
import { hasAnyModel, resolveModel } from "@/lib/agents/provider";
const subscription: Subscription = { plan: "pro", provider: "stripe", subscriptionId: "sub_test", customerId: null, periodStart: "2026-10-01", periodEnd: "2026-11-01", cancelAtPeriodEnd: false, budgetMicrousd: 5_000_000, usedMicrousd: 0 };
const params: LanguageModelV4CallOptions = { prompt: [{ role: "user", content: [{ type: "text", text: "Explain insulin resistance." }] }], maxOutputTokens: 3000 };
afterEach(() => vi.unstubAllEnvs());
describe("premium model access and cost guard", () => {
  it("never unlocks a paid model for anonymous requests or gateway-only Free callers", async () => {
    vi.stubEnv("NODE_ENV","production");
    vi.stubEnv("AI_GATEWAY_API_KEY","synthetic_gateway_key_for_tests"); vi.stubEnv("PREMIUM_AI_ENABLED","true"); vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY",""); vi.stubEnv("VERCEL_OIDC_TOKEN","");
    expect(await premiumForRequest(new Request("https://www.nutritiscan.com/api/chat"))).toBeNull();
    expect(hasAnyModel()).toBe(false); expect(resolveModel().id).toMatch(/^google\//);
    expect(premiumModel()).toBeUndefined();
  });
  it("scopes a trusted paid model to its request without leaking to another", async () => {
    const scope = { model: "synthetic-model", id: "test-premium" };
    await Promise.all([withPremium(scope, async () => { await Promise.resolve(); expect(resolveModel().id).toBe("test-premium"); }), Promise.resolve().then(() => expect(premiumModel()).toBeUndefined())]);
    expect(premiumModel()).toBeUndefined();
  });
  it("reserves before contacting a provider and settles actual usage", async () => {
    const reserve = vi.fn().mockResolvedValue("reservation-test"); const settle = vi.fn().mockResolvedValue(undefined);
    const middleware = budgetMiddleware({ reserve,settle } as unknown as BillingStore,"account-test",subscription);
    const generate = vi.fn(async () => ({ usage: { inputTokens: { total: 100 }, outputTokens: { total: 50 } } }));
    await middleware.wrapGenerate!({ params, doGenerate: generate } as never);
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(generate.mock.invocationCallOrder[0]);
    expect(settle).toHaveBeenCalledWith("reservation-test",700);
    reserve.mockRejectedValueOnce(new Error("Allowance exhausted")); generate.mockClear();
    await expect(middleware.wrapGenerate!({ params, doGenerate: generate } as never)).rejects.toThrow(); expect(generate).not.toHaveBeenCalled();
  });
  it("keeps unknown timeout usage reserved and rejects oversized or multimodal input before billing", async () => {
    const reserve = vi.fn().mockResolvedValue("reservation-test"); const settle = vi.fn();
    const middleware = budgetMiddleware({ reserve,settle } as unknown as BillingStore,"account-test",subscription);
    await expect(middleware.wrapGenerate!({ params, doGenerate: () => Promise.reject(new Error("Timeout")) } as never)).rejects.toThrow(); expect(settle).not.toHaveBeenCalled();
    reserve.mockClear();
    for (const content of [[{ type: "text", text: "x".repeat(81_000) }],[{ type: "file", data: new URL("https://example.com/report"), mediaType: "application/pdf" }]]) {
      await expect(middleware.wrapGenerate!({ params: { ...params, prompt: [{ role: "user",content }] }, doGenerate: vi.fn() } as never)).rejects.toThrow();
    }
    expect(reserve).not.toHaveBeenCalled();
  });
  it("settles streaming usage only on a reported finish", async () => {
    const reserve = vi.fn().mockResolvedValue("reservation-test"); const settle = vi.fn().mockResolvedValue(undefined);
    const middleware = budgetMiddleware({ reserve,settle } as unknown as BillingStore,"account-test",subscription);
    const result = await middleware.wrapStream!({ params, doStream: async () => ({ stream: new ReadableStream({ start(c) { c.enqueue({ type: "finish",usage: { inputTokens: { total: 10 },outputTokens: { total: 20 } } }); c.close(); } }) }) } as never);
    const reader = result.stream.getReader(); while (!(await reader.read()).done) {} expect(settle).toHaveBeenCalledWith("reservation-test",220);
  });
});
