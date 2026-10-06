import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/workspace/database";
import { ApiError, SESSION_SECONDS, WorkspaceService } from "@/lib/workspace/service";
import { sameOrigin } from "@/lib/workspace/http";

export const runtime = "nodejs";
const COOKIE = "ns_session";
const Credentials = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(12).max(128),
  name: z.string().trim().min(1).max(70).optional(),
  mode: z.enum(["login", "register", "recover"]),
  recovery: z.string().max(100).optional(),
});

async function service() {
  return new WorkspaceService(await database());
}

export async function GET() {
  try {
    const value = (await cookies()).get(COOKIE)?.value;
    if (!value) return Response.json({ user: null });
    await (await service()).authenticate(value);
    return Response.json({ user: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  try {
    const input = Credentials.parse(await req.json());
    const auth = await service();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    await auth.rate(`auth:${input.mode}:${ip}`, 10, 900);
    let result: { id: string; session: string; recovery?: string };
    if (input.mode === "register") {
      if (!input.name) return Response.json({ error: "Enter your name." }, { status: 400 });
      result = await auth.register(input.username, input.password, {
        name: input.name,
        language: "English",
        allergies: "",
        medicines: "",
        conditions: "",
      });
    } else if (input.mode === "recover") {
      if (!input.recovery) return Response.json({ error: "Enter your recovery key." }, { status: 400 });
      const reset = await auth.recover(input.username, input.recovery, input.password);
      const login = await auth.login(input.username, input.password);
      result = { ...login, recovery: reset.recovery };
    } else {
      result = await auth.login(input.username, input.password);
    }
    (await cookies()).set(COOKIE, result.session, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return Response.json({ user: { id: result.id }, recovery: result.recovery }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof ApiError ? error.message : status === 400 ? "Enter a valid username and a password of at least 12 characters." : "Account service is unavailable. Please try again later.";
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  if (value) {
    try { await (await service()).logout(value); } catch { /* Cookie is still cleared locally. */ }
  }
  jar.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
