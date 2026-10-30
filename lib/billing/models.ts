import { AsyncLocalStorage } from "node:async_hooks";
import { createGateway, wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import type { LanguageModelV4CallOptions, LanguageModelV4Usage } from "@ai-sdk/provider";
import { authenticatedAccount } from "@/lib/account/session";
import { liveBilling, premiumModelsEnabled } from "./config";
import { billingStore, type BillingStore, type Subscription, PremiumLimit } from "./store";

export const PREMIUM_MODELS = { pro: "openai/gpt-6.1-sol", max: "openai/gpt-6-astra" } as const;
type Scope = { model: LanguageModel; id: string };
const context = new AsyncLocalStorage<Scope>();
export const premiumModel = () => context.getStore();
export function withPremium<T>(scope: Scope | null, work: () => T): T { return scope ? context.run(scope, work) : work(); }

/** Text-only, function-tool-only calls at standard short-context pricing.
 * UTF-8 byte count upper-bounds text tokens; generous framing headroom covers
 * message/tool boundaries. No external retrieval, images or billed hosted tools.
 * Pinned rates must be rechecked before enabling or changing a model. */
export function budgetMiddleware(store: BillingStore, accountId: string, subscription: Subscription): LanguageModelMiddleware {
  const rates = subscription.plan === "max" ? { input: 10, output: 50 } : { input: 2, output: 10 }; // USD micros / token
  let calls = 0;
  function maximum(params: LanguageModelV4CallOptions) {
    if (++calls > 6) throw new PremiumLimit("This turn reached its premium call limit. Shorten the question and retry.");
    if (params.prompt.some((m) => typeof m.content !== "string" && m.content.some((p) => p.type === "file" || p.type === "custom")) || params.tools?.some((t) => t.type !== "function")) throw new PremiumLimit("Premium currently supports extracted text and app tools only.");
    const bytes = Buffer.byteLength(JSON.stringify({ prompt: params.prompt, tools: params.tools, responseFormat: params.responseFormat }), "utf8");
    if (bytes > 80_000) throw new PremiumLimit("The context is too long for a premium turn. Start a shorter conversation.");
    return (bytes + 8192) * rates.input + (params.maxOutputTokens ?? 3000) * rates.output;
  }
  async function settle(id: string, usage: LanguageModelV4Usage) {
    const input = usage.inputTokens.total; const output = usage.outputTokens.total;
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input! < 0 || output! < 0) return;
    await store.settle(id, input! * rates.input + output! * rates.output);
  }
  return {
    transformParams: async ({ params }) => ({ ...params, maxOutputTokens: Math.min(params.maxOutputTokens ?? 3000, 3000) }),
    wrapGenerate: async ({ doGenerate, params }) => {
      const id = await store.reserve(accountId, subscription, maximum(params));
      // On unknown provider failure, retain the reservation: a timeout is not
      // proof the provider did no work. No automatic paid retries.
      const result = await doGenerate(); await settle(id, result.usage); return result;
    },
    wrapStream: async ({ doStream, params }) => {
      const id = await store.reserve(accountId, subscription, maximum(params));
      const result = await doStream();
      return { ...result, stream: result.stream.pipeThrough(new TransformStream({
        async transform(chunk, controller) { if (chunk.type === "finish") await settle(id, chunk.usage); controller.enqueue(chunk); },
      })) };
    },
  };
}

/** No client plan, model ID, return URL or local storage can grant access. */
export async function premiumForRequest(request: Request): Promise<Scope | null> {
  if (!premiumModelsEnabled() || !liveBilling()) return null;
  const account = await authenticatedAccount(request); if (!account) return null;
  const store = await billingStore(); const subscription = await store.subscription(account.id);
  if (!subscription) return null;
  if (subscription.usedMicrousd >= subscription.budgetMicrousd) throw new PremiumLimit("Your premium allowance is used up. Basic chat remains available until the next billing period.");
  const id = PREMIUM_MODELS[subscription.plan];
  const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
  return { id, model: wrapLanguageModel({ model: gateway(id), middleware: budgetMiddleware(store, account.id, subscription) }) };
}
