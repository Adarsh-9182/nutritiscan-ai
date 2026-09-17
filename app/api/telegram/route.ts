import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/workspace/database";
import { readJsonCapped } from "@/lib/http/guard";
import { NotifyService } from "@/lib/notify/service";
import {
  telegram,
  telegramConfigured,
  type TelegramUpdate,
} from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secretMatches(given: string | null) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!given || !expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Telegram webhook. Only requests carrying the registered secret token are
 * processed; the response is always 200 so Telegram does not retry. */
export async function POST(req: NextRequest) {
  if (!telegramConfigured())
    return NextResponse.json({ error: "Not configured" }, { status: 404 });
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = await readJsonCapped(req, 64_000);
  if (!parsed.ok) return NextResponse.json({ ok: true });
  try {
    await new NotifyService(await database(), telegram()).handleUpdate(
      parsed.value as TelegramUpdate,
    );
  } catch {
    // Never log message content or chat identifiers.
    console.error("[telegram] update failed", { code: "TELEGRAM_UPDATE" });
  }
  return NextResponse.json({ ok: true });
}
