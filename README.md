# NutritiScan

NutritiScan is a chat-first, agentic AI health agent for a person managing their health. The chat is the main interface; a bounded agent uses permissioned plugins/tools, source-linked history, and user-approved actions to help with supported health tasks. It verifies completed actions and hands off when a task exceeds its safe scope. History organization is a core capability, not the whole product. The proposed target design is in [PRODUCT_SYSTEM_DESIGN.md](docs/PRODUCT_SYSTEM_DESIGN.md).

The product is educational early access for adults 18+. It is not a diagnosis, prescription, emergency service or replacement for a clinician. Agent availability depends on the configured model and reference coverage is limited.

The active web app is still an educational chat prototype; the agentic workflows, server-backed health history, and user-approved action loop in the system design are target capabilities, not shipped features. A supervised hospital discharge workflow is a possible later extension; its problem research is retained in [the hospital workflow research note](docs/ACTIVE_PRODUCT_STRATEGY.md).

## Start locally

```sh
npm ci
npm run dev
```

Open http://localhost:3000 for the marketing page and choose **Start a conversation**, or open http://localhost:3000/chat directly. Chat history, the optional health profile and meal notes are stored in this browser. Messages and that context are sent to `/api/chat` when you submit a turn.

To enable hosted agent responses, configure `GOOGLE_GENERATIVE_AI_API_KEY` or an AI Gateway credential in the ignored `.env.local`. Without a working model credential, the chat can fall back to its limited demonstration behavior. Review provider data terms before using sensitive information.

## Product surfaces

- `/` — marketing page
- `/chat` — supervisor and specialist-agent conversation
- `/discharge-demo` — two synthetic pending-result cases, including a missed-deadline escalation; fictional event history is saved per case in this browser, with no real records or messages
- `/privacy` and `/terms` — current product notices

The former account workspace, report-management screens, and their APIs have been removed from the active app. Existing database files or hosted records are not erased by this code change. Historical implementation and deployment notes remain under `docs/` for reference.

## Checks

```sh
npm run lint
npx tsc --noEmit
```

Do not commit API keys or real health information.
