import {
  createAgentUIStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { buildSupervisor } from "@/lib/agents";
import { demoAnswer, routeOf } from "@/lib/agents/demo";
import { demoProfile, type HealthProfile } from "@/lib/memory/profile";

export const maxDuration = 60;

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: UIMessage[]; profile?: HealthProfile };
  const messages = body.messages ?? [];
  const profile = body.profile ?? demoProfile;

  // Real multi-agent brain when a gateway key is configured.
  if (process.env.AI_GATEWAY_API_KEY) {
    try {
      const supervisor = buildSupervisor(profile);
      return createAgentUIStreamResponse({ agent: supervisor, uiMessages: messages });
    } catch {
      // fall through to demo mode on any provider error
    }
  }

  // Demo brain — streams a safe, structured answer word-by-word,
  // with a live "consulting specialist" trace so the multi-agent
  // routing is visible in the UI.
  const userText = lastUserText(messages);
  const route = routeOf(userText);
  const answer = demoAnswer(userText, profile);
  const words = answer.split(/(\s+)/); // keep whitespace tokens

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const consulting = route === "supervisor" ? [] : [route];
      if (consulting.length) {
        writer.write({ type: "data-trace", id: "trace", data: { agents: consulting, done: false } });
        await new Promise((r) => setTimeout(r, 550));
      }
      const id = "msg-" + Date.now();
      writer.write({ type: "text-start", id });
      for (const w of words) {
        writer.write({ type: "text-delta", id, delta: w });
        await new Promise((r) => setTimeout(r, w.trim() ? 16 : 6));
      }
      writer.write({ type: "text-end", id });
      if (consulting.length) {
        writer.write({ type: "data-trace", id: "trace", data: { agents: consulting, done: true } });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
