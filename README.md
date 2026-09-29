# NutritiScan

NutritiScan is a conversational health companion. Its public site explains the product, and `/chat` is the agent experience: a supervisor can route supported questions to Doctor, Nutrition, Lab, Fitness and Coach specialists, then show the activity and references used.

The product is educational early access for adults 18+. It is not a diagnosis, prescription, emergency service or replacement for a clinician. Agent availability depends on the configured model and reference coverage is limited.

The next product direction is a supervised discharge-to-home agent for hospital teams. The researched problem, proposed workflow and milestones are in [the active product strategy](docs/ACTIVE_PRODUCT_STRATEGY.md). These hospital capabilities are not part of the current public chat.

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
- `/discharge-demo` — synthetic pending-result workflow simulator; fictional event history is saved in this browser across refreshes, with no real records or messages
- `/privacy` and `/terms` — current product notices

The former account workspace, report-management screens, and their APIs have been removed from the active app. Existing database files or hosted records are not erased by this code change. Historical implementation and deployment notes remain under `docs/` for reference.

## Checks

```sh
npm run lint
npx tsc --noEmit
```

Do not commit API keys or real health information.
