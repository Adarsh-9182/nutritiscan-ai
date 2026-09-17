import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/lib/workspace/database";
import { ApiError, WorkspaceService } from "@/lib/workspace/service";
import { readJsonCapped } from "@/lib/http/guard";
import { sameOrigin } from "@/lib/workspace/http";
import { escalation } from "@/lib/workspace/escalation";
import { speaksHinglish } from "@/lib/workspace/voice";
import { ProfileSchema, type Workspace } from "@/lib/workspace/types";
import { buildMessages } from "@/lib/companion/prompt";
import {
  cloudModelReady,
  ModelUnavailable,
  streamChat,
} from "@/lib/companion/llm";
import { boundaryText, unsafeOutput } from "@/lib/companion/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(12000),
      }),
    )
    .min(1)
    .max(40),
});

const json = (value: unknown, status: number) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * Streams one AI answer as NDJSON lines:
 *   {"t":"delta","v":"text"}   append
 *   {"t":"replace","v":"text"} replace everything so far (safety)
 *   {"t":"done"} | {"t":"error","v":"message"}
 * Signed-in people get their own records as context; everyone else gets
 * general answers. The emergency check always runs first, on the server.
 */
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req))
      throw new ApiError(
        403,
        "This request must come from the NutritiScan app.",
      );
    if (!cloudModelReady())
      throw new ApiError(503, "AI answers are not switched on yet.");
    const parsed = await readJsonCapped(req, 120_000);
    if (!parsed.ok) throw new ApiError(parsed.status, parsed.error);
    const { messages } = Body.parse(parsed.value);
    const last = messages[messages.length - 1];
    if (last.role !== "user") throw new ApiError(400, "Send a question.");

    const service = new WorkspaceService(await database());
    let workspace: Workspace | null = null;
    const session = req.cookies.get("ns-session")?.value;
    if (session) {
      try {
        const id = await service.authenticate(session);
        await service.rate(`companion:${id}`, 15, 60);
        await service.rate(`companion-day:${id}`, 300, 86_400);
        workspace = await service.workspace(id);
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) throw error;
        workspace = null;
      }
    }
    if (!workspace) {
      const ip = process.env.VERCEL
        ? (req.headers.get("x-vercel-forwarded-for") ?? "unknown")
        : "local";
      await service.rate(`companion-guest:${ip}`, 8, 60);
      await service.rate(`companion-guest-day:${ip}`, 60, 86_400);
    }

    const profile =
      workspace?.profile ?? ProfileSchema.parse({ name: "Guest" });
    const hinglish = speaksHinglish(last.text, profile);
    const recentUser = messages
      .filter((m) => m.role === "user")
      .slice(-3)
      .map((m) => m.text)
      .join("\n");
    const urgent = escalation(recentUser, profile);

    const encoder = new TextEncoder();
    const line = (value: unknown) =>
      encoder.encode(`${JSON.stringify(value)}\n`);
    const controller = new AbortController();
    req.signal.addEventListener("abort", () => controller.abort());

    const stream = new ReadableStream<Uint8Array>({
      async start(out) {
        if (urgent) {
          out.enqueue(
            line({ t: "replace", v: urgent.text, mode: "escalation" }),
          );
          out.enqueue(line({ t: "done" }));
          out.close();
          return;
        }
        let text = "";
        try {
          const timeout = setTimeout(() => controller.abort(), 55_000);
          for await (const delta of streamChat(
            buildMessages(messages, workspace),
            controller.signal,
          )) {
            text += delta;
            if (unsafeOutput(text)) {
              controller.abort();
              out.enqueue(line({ t: "replace", v: boundaryText(hinglish) }));
              break;
            }
            out.enqueue(line({ t: "delta", v: delta }));
          }
          clearTimeout(timeout);
          out.enqueue(line({ t: "done" }));
        } catch (error) {
          // Never log prompts, answers or health context.
          console.error("[companion] stream failed", {
            code:
              error instanceof ModelUnavailable
                ? "MODEL_UNAVAILABLE"
                : "STREAM_FAILED",
          });
          out.enqueue(
            line({
              t: "error",
              v: text
                ? "The answer was cut off. Please try again."
                : "The AI is busy right now. Please try again in a minute.",
            }),
          );
        } finally {
          out.close();
        }
      },
      cancel() {
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: "Check the message and try again." }, 400);
    console.error("[companion] request failed", {
      code: "COMPANION_UNAVAILABLE",
    });
    return json(
      { error: "The AI is unavailable. Please try again later." },
      503,
    );
  }
}
