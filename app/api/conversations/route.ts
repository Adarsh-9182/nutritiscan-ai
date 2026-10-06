import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/workspace/database";
import { ApiError, WorkspaceService } from "@/lib/workspace/service";
import { ConversationService } from "@/lib/workspace/conversations";
import { sameOrigin } from "@/lib/workspace/http";
import { readJsonCapped } from "@/lib/http/guard";

export const runtime = "nodejs";
const COOKIE = "ns_session";
const MAX_BODY_BYTES = 1_600_000;
const ImportBody = z.object({ action: z.literal("enable"), conversations: z.array(z.unknown()).max(40) }).strict();
const SaveBody = z.object({ conversation: z.unknown() }).strict();

async function context() {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) throw new ApiError(401, "Sign in to sync conversations.");
  const db = await database();
  const userId = await new WorkspaceService(db).authenticate(value);
  return { db, userId };
}

function failure(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof ApiError ? error.message : "Conversation storage is unavailable. Please try again.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const { db, userId } = await context();
    const conversations = new ConversationService(db);
    const enabled = await conversations.enabled(userId);
    return Response.json({ enabled, conversations: enabled ? await conversations.list(userId) : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  const body = await readJsonCapped(req, MAX_BODY_BYTES);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = ImportBody.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Conversation import is invalid." }, { status: 400 });
  try {
    const { db, userId } = await context();
    const conversations = await new ConversationService(db).enableAndImport(userId, parsed.data.conversations);
    return Response.json({ enabled: true, conversations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function PUT(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  const body = await readJsonCapped(req, 300_000);
  if (!body.ok) return Response.json({ error: body.error }, { status: body.status });
  const parsed = SaveBody.safeParse(body.value);
  if (!parsed.success) return Response.json({ error: "Conversation is invalid." }, { status: 400 });
  try {
    const { db, userId } = await context();
    await new WorkspaceService(db).rate(`conversations:${userId}`, 120, 60);
    await new ConversationService(db).put(userId, parsed.data.conversation);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });
  try {
    const { db, userId } = await context();
    await new WorkspaceService(db).rate(`conversations:${userId}`, 120, 60);
    const id = new URL(req.url).searchParams.get("id") ?? undefined;
    await new ConversationService(db).remove(userId, id);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
