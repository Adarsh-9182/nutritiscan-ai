import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/workspace/database";
import {
  ApiError,
  WorkspaceService,
  SESSION_SECONDS,
} from "@/lib/workspace/service";
import {
  DayLogSchema,
  ProfileSchema,
  ReportSchema,
  TaskSchema,
  type Workspace,
} from "@/lib/workspace/types";
import {
  checkRate,
  clientKey,
  readJsonCapped,
  tooManyRequests,
} from "@/lib/http/guard";
import { sameOrigin } from "@/lib/workspace/http";
import { hostedEngine, hostedModelReady } from "@/lib/workspace/cloud-model";
import { runExpertTurn } from "@/lib/workspace/supervisor";
import { runHealthAgent } from "@/lib/workspace/health-agent";
import { hasAnyModel } from "@/lib/agents/provider";
import { DEMO } from "@/lib/workspace/demo";
import { NotifyService } from "@/lib/notify/service";
import { telegram, telegramConfigured } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const COOKIE = "ns-session";
const Username = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/);
const Password = z.string().min(12).max(128);
const authSchema = z.object({ username: Username, password: Password });
/**
 * A companion turn.
 *
 * `history` is the person's own recent messages, which is what lets a short
 * follow-up ("and the other one?") find its topic. It is capped here rather
 * than trusted from the client.
 */
const assistantSchema = z.object({
  question: z.string().trim().min(1).max(3000),
  history: z.array(z.string().max(3000)).max(3).optional(),
  today: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Run the companion server-side.
 *
 * The same agent the browser runs — escalation rules, reference retrieval,
 * record arithmetic and the output validator all unchanged. The only
 * addition is a hosted model to do the writing, so a visitor gets a real
 * answer without a 1 GB download and a WebGPU-capable browser.
 */
async function companionTurn(
  question: string,
  workspace: Workspace,
  options: { history?: string[]; today?: string; signal: AbortSignal },
) {
  const engine = hostedEngine();
  /*
   * The specialist team needs the AI SDK ladder (Gemini or the Gateway), not
   * just any completion function: it runs tool-calling agents, which an
   * operator's bare chat endpoint cannot be assumed to support. Where only
   * that endpoint is configured, the single-completion path still answers.
   */
  const expert = hasAnyModel()
    ? (question: string, o: { history?: string[]; signal?: AbortSignal }) =>
        runExpertTurn(question, workspace, {
          history: o.history,
          signal: o.signal,
          language: workspace.profile.language,
        })
    : undefined;
  return runHealthAgent(question, workspace, {
    complete: engine?.complete,
    engineLabel: engine?.label,
    expert,
    history: options.history,
    today: options.today,
    signal: options.signal,
  });
}

const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

function sessionResponse(session: string, value: unknown) {
  const response = json(value);
  response.cookies.set(COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: session ? SESSION_SECONDS : 0,
  });
  return response;
}

async function handle(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const route = (await context.params).path.join("/");
  try {
    if (route === "status" && req.method === "GET")
      return json({
        model: hostedModelReady(),
        accounts:
          Boolean(
            process.env.DATABASE_URL &&
            /^[a-f0-9]{64}$/i.test(process.env.HEALTH_DATA_KEY ?? "") &&
            process.env.APP_ORIGIN,
          ) || process.env.NODE_ENV !== "production",
      });
    if (req.method !== "GET" && !sameOrigin(req))
      throw new ApiError(
        403,
        "This request must come from the NutritiScan app.",
      );
    let body: unknown = {};
    if (req.method !== "GET") {
      const parsed = await readJsonCapped(req, 200_000);
      if (!parsed.ok) throw new ApiError(parsed.status, parsed.error);
      body = parsed.value;
    }
    /*
     * The fictional demo, which has no account and therefore no session.
     *
     * It is the only unauthenticated path to the model, so it is metered
     * separately and by network address. The limiter is the in-memory one
     * from lib/http/guard: per instance, reset on cold start, and a real
     * bound on a single warm lambda rather than on the fleet — the same
     * trade the public routes have always made, and the reason the demo
     * workspace it answers over is a copy of fixed fiction.
     */
    if (route === "assistant/demo" && req.method === "POST") {
      const verdict = checkRate(`assistant-demo:${clientKey(req)}`, 10, 60_000);
      if (!verdict.ok)
        return tooManyRequests(
          verdict.retryAfter,
          "The demo is busy right now. Wait a moment, or create an account for your own workspace.",
        );
      const turn = assistantSchema.parse(body);
      return json(
        await companionTurn(turn.question, structuredClone(DEMO), {
          history: turn.history,
          today: turn.today,
          signal: req.signal,
        }),
      );
    }
    const service = new WorkspaceService(await database());
    if (
      ["register", "login", "recover"].includes(route) &&
      req.method === "POST"
    ) {
      const { username, password } = authSchema.parse(body);
      // Account limiter cannot be bypassed by spoofing forwarded IP headers.
      await service.rate(`auth:account:${username.toLowerCase()}`, 8, 900);
      const ip = process.env.VERCEL
        ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
        : "local";
      await service.rate(`auth:network:${ip}`, 50, 900);
      if (route === "recover") {
        const { recovery } = z
          .object({ recovery: z.string().min(30).max(100) })
          .parse(body);
        return json(await service.recover(username, recovery, password));
      }
      if (route === "register") {
        const { name } = z
          .object({
            name: z.string().trim().min(1).max(70),
            consent: z.literal(true),
            adult: z.literal(true),
          })
          .parse(body);
        const result = await service.register(
          username,
          password,
          ProfileSchema.parse({ name }),
        );
        return sessionResponse(result.session, { recovery: result.recovery });
      }
      const result = await service.login(username, password);
      return sessionResponse(result.session, { ok: true });
    }
    const session = req.cookies.get(COOKIE)?.value;
    const id = await service.authenticate(session);
    await service.rate(`workspace:${id}`, 90);
    if (route === "logout" && req.method === "POST") {
      await service.logout(session!);
      return sessionResponse("", { ok: true });
    }
    if (route === "state" && req.method === "GET")
      return json(await service.workspace(id));
    if (route === "profile" && req.method === "PUT") {
      await service.profile(id, ProfileSchema.parse(body));
      return json({ ok: true });
    }
    if (route === "records" && req.method === "POST") {
      const entry = z
        .object({
          kind: z.enum(["report", "task", "day"]),
          data: z.unknown(),
          id: z.uuid().optional(),
          version: z.number().int().positive().optional(),
        })
        .parse(body);
      if (Boolean(entry.id) !== Boolean(entry.version))
        throw new ApiError(400, "An edit requires its record id and version.");
      const value =
        entry.kind === "report"
          ? ReportSchema.parse(entry.data)
          : entry.kind === "day"
            ? DayLogSchema.parse(entry.data)
            : TaskSchema.parse(entry.data);
      const savedId = await service.save(
        id,
        entry.kind,
        value,
        entry.id,
        entry.version,
      );
      return json({ id: savedId }, entry.id ? 200 : 201);
    }
    if (route === "records" && req.method === "DELETE") {
      await service.remove(id, z.object({ id: z.uuid() }).parse(body).id);
      return json({ ok: true });
    }
    if (route.startsWith("notify")) {
      const notify = new NotifyService(await database(), telegram());
      const timeZone = z.string().min(1).max(64);
      if (route === "notify" && req.method === "GET")
        return json({
          configured: telegramConfigured(),
          ...(await notify.status(id)),
        });
      if (!telegramConfigured())
        throw new ApiError(
          503,
          "Telegram reminders are not set up on this deployment yet.",
        );
      if (route === "notify/link" && req.method === "POST") {
        await service.rate(`notify-link:${id}`, 5, 900);
        const body2 = z.object({ timeZone }).parse(body);
        return json(await notify.createLink(id, body2.timeZone));
      }
      if (route === "notify" && req.method === "PUT") {
        const value = z
          .object({
            timeZone,
            settings: z.object({
              titles: z.boolean(),
              morning: z.boolean(),
              evening: z.boolean(),
            }),
          })
          .parse(body);
        await notify.updateSettings(id, value.settings, value.timeZone);
        return json({ ok: true });
      }
      if (route === "notify" && req.method === "DELETE") {
        await notify.disconnect(id);
        return json({ ok: true });
      }
    }
    if (route === "export" && req.method === "GET") {
      const response = json({
        exportedAt: new Date().toISOString(),
        ...(await service.workspace(id, true)),
      });
      response.headers.set(
        "Content-Disposition",
        'attachment; filename="nutritiscan-records.json"',
      );
      return response;
    }
    if (route === "account" && req.method === "DELETE") {
      await service.rate(`delete:${id}`, 5, 900);
      await service.deleteAccount(
        id,
        z.object({ password: Password }).parse(body).password,
      );
      return sessionResponse("", { ok: true });
    }
    if (route === "assistant" && req.method === "POST") {
      const turn = assistantSchema.parse(body);
      await service.rate(`assistant:${id}`, 20);
      return json(
        await companionTurn(turn.question, await service.workspace(id), {
          history: turn.history,
          today: turn.today,
          signal: req.signal,
        }),
      );
    }
    throw new ApiError(404, "Not found.");
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message || "Check the submitted fields." },
        400,
      );
    // Never log query parameters, provider bodies, health records, or credentials.
    console.error("[workspace] request failed", {
      route,
      code: "WORKSPACE_UNAVAILABLE",
    });
    return json(
      {
        error:
          "The secure workspace is temporarily unavailable. Please try again later.",
      },
      503,
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
