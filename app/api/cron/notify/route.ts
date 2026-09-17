import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/workspace/database";
import { NotifyService } from "@/lib/notify/service";
import { telegram, telegramConfigured } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return (
    secret.length >= 16 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  );
}

/** Scheduled pass for due reminders and daily check-ins. Called by the
 * GitHub Actions schedule (and Vercel Cron if configured) with CRON_SECRET. */
export async function GET(req: NextRequest) {
  if (!authorised(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!telegramConfigured())
    return NextResponse.json({ skipped: "Telegram is not configured" });
  const result = await new NotifyService(await database(), telegram()).runDue();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
export { GET as POST };
