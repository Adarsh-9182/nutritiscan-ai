# NutritiScan architecture v2: the health chat

Status: design for the stack in PRs #20–#25 and the work that follows. The product is a health-specific ChatGPT: one conversation, reached from the web or Telegram, that knows the person's records and log, acts only with confirmation, and never lets a model be the last thing that runs before a person sees an answer.

## 1. Problem

| Need | Today (PR #25) | Gap |
| --- | --- | --- |
| One behaviour everywhere | Web: routing runs in the browser (`runHealthAgent`), then AI runs on the server (`/api/companion`). Telegram: a third path with no AI. | Safety and behaviour can drift between channels, and a browser can skip its own routing. |
| Model is never last | The output guard checks text **after** it has been streamed. | Unsafe text can flash on screen before it is replaced. |
| Know when it breaks | Logs are one-line error codes. | No latency, provider, fallback, guard or escalation signal; production failures are invisible. |
| Know it answers well | Clinical evals exist for triage, labs, nutrition and injection. | No evals for AI answers (safety, language mirroring, grounding). |

## 2. Target architecture

```
 Web chat ─┐                                   ┌─> Groq (primary → fallback model)
 Telegram ─┼─> Turn pipeline (server, one) ─────┤
 Cron ─────┘    1 triage (deterministic, EN/HI) └─> On-device model (browser only, opt-in)
                2 route: records · drafts · next steps · log  → deterministic answer
                3 context: profile + permitted reports + 7-day log + reminders
                4 generate (stream)
                5 guard with hold-back: only text that passed is released
                6 persist (encrypted chat) · telemetry (PHI-free trace)
```

### Components

| # | Component | Module | Owns |
| --- | --- | --- | --- |
| C1 | Safety triage | `lib/clinical/extract.ts`, `lib/safety/*`, `lib/workspace/escalation.ts` | Red flags in English, Hindi and Hinglish; fixed escalation text |
| C2 | Router and tools | `lib/workspace/health-agent.ts`, `daily.ts`, `actions.ts`, `record-tools.ts` | Record summaries, log and reminder drafts, next steps |
| C3 | Context builder | `lib/companion/prompt.ts` | What personal data a model may see (permission-filtered) |
| C4 | Model gateway | `lib/companion/llm.ts` | Provider, fallback, streaming, timeouts |
| C5 | Output guard | `lib/companion/guard.ts` | Dose, stop-medicine and certainty checks; hold-back release |
| C6 | Turn pipeline | `lib/companion/turn.ts` (new) | Runs C1→C5 for every channel; emits events |
| C7 | Channels | `app/api/companion`, `lib/notify/*`, `components/health-agent.tsx` | Transport only, no business rules |
| C8 | Persistence | `lib/workspace/service.ts` | Encrypted records, chats, day logs, channels |
| C9 | Telemetry | `lib/obs/*` (new) | Per-turn trace with timings and outcomes; never content |
| C10 | Evals | `evals/companion/*` (new) | Golden conversations scored for safety and quality |

### Rules
1. Triage runs on the server for every channel, before routing, and cannot be skipped by a client.
2. Personal data reaches a model only through C3, and only reports the person allowed.
3. C5 releases text only after it has passed. A trailing window stays held until the next check or the end of the stream.
4. Traces carry ids, timings, counts and outcome codes, and never message text, record values or chat ids.
5. A behaviour change in C1–C5 ships with an eval case.

## 3. Work plan

| Step | Owner | Output |
| --- | --- | --- |
| C9 telemetry | agent A | `lib/obs/trace.ts` plus tests proving no content leaks |
| C10 evals | agent B | `evals/companion/` golden set plus scorer and runner |
| C6 pipeline, C5 hold-back, Telegram AI | lead | `lib/companion/turn.ts`; route and Telegram use it |
| Review, tests, traces, debug | lead | Findings fixed; this document updated |
