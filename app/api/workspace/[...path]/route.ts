import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/workspace/database";
import {
  ApiError,
  WorkspaceService,
  SESSION_SECONDS,
} from "@/lib/workspace/service";
import {
  ConversationSchema,
  DayLogSchema,
  ProfileSchema,
  ReportSchema,
  TaskSchema,
} from "@/lib/workspace/types";
import { readJsonCapped } from "@/lib/http/guard";
import { sameOrigin } from "@/lib/workspace/http";
import { answer, modelConfigured } from "@/lib/workspace/assistant";
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
        model: modelConfigured(),
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
    const service = new WorkspaceService(await database());
    let body: unknown = {};
    if (req.method !== "GET") {
      const parsed = await readJsonCapped(req, 200_000);
      if (!parsed.ok) throw new ApiError(parsed.status, parsed.error);
      body = parsed.value;
    }
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
          kind: z.enum(["report", "task", "day", "message"]),
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
            : entry.kind === "message"
              ? ConversationSchema.parse(entry.data)
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
      const { question } = z
        .object({ question: z.string().trim().min(1).max(3000) })
        .parse(body);
      await service.rate(`assistant:${id}`, 10);
      return json(
        await answer(question, await service.workspace(id), req.signal),
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
