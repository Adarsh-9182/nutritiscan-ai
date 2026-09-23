# NutritiScan

A conversational health companion with source-linked education, a hosted or fully private AI engine, confirmed records, follow-ups and visit preparation. Built with Next.js, TypeScript and Postgres.

The home screen brings together questions about everyday health, nutrition, sleep, medicines and wellbeing. Records remain supporting tools: compare dated values, open their sources and prepare a personalised visit brief. Review any proposed follow-up before saving it.

**Early access:** limited educational coverage, not a clinically validated doctor. AI can make mistakes.

## The AI engine

The companion's agent decides urgency, retrieves references and computes record summaries without a model; only the written explanation is generated. That generation step takes whichever engine is available, in this order:

1. **Hosted** — `GOOGLE_GENERATIVE_AI_API_KEY` or an AI Gateway credential. Answers are written on the server; the model receives the question, the published reference notes and up to two earlier user messages — never stored profiles, reports or log entries. Use synthetic data on a free Gemini tier; check provider processing terms before real health questions.
2. **Operator endpoint** — `HEALTH_MODEL_BASE_URL` / `HEALTH_MODEL_NAME` with `HEALTH_MODEL_APPROVED=true`, for a self-hosted OpenAI-compatible model such as Ollama.
3. **On-device** — optional Qwen2.5 through WebLLM, after an explicit ~1 GB download in a WebGPU-capable browser. Chosen in the app, it overrides the hosted engine so the question never leaves the tab.

With none of them configured the companion answers from its reference notes and says so. Every answer carries the engine that produced it.

For local hosted AI, set a working `GOOGLE_GENERATIVE_AI_API_KEY` or `AI_GATEWAY_API_KEY` in the ignored `.env.local`. A copied `VERCEL_OIDC_TOKEN` expires and is ignored once stale. The account workspace still works without a model, but its answers are limited to the covered reference notes and confirmed records.

## Delivery roadmap

See the [phased product roadmap](docs/PRODUCT_ROADMAP.md): frontend → health-data backend → connected records → evidence-based AI → agent workflows → pilot and subscriptions. It includes Hubble-inspired patient-authorized record retrieval, build-versus-partner constraints and a completion gate for every phase. Live provider retrieval, voice agents and billing are future work.

## Start

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **Start a conversation**. The account workspace handles sign-up, sign-in, recovery and the health companion. Explore `/workspace?demo=1` for an isolated fictional example. Development uses local PGlite without a database account or model API key. Existing `/chat` links redirect to the workspace; the legacy anonymous chat API is disabled unless `LEGACY_CLINICAL_ENABLED=true` is explicitly set.

## Checks

```sh
npm run verify
```

See [workspace release and deployment guide](docs/WORKSPACE_RELEASE.md) for configuration, encrypted storage, synthetic end-to-end checks, free-model setup, current limitations and the clinical launch requirements. `.env.example` lists supported variables; never commit real keys or health records.

The existing clinical/nutrition research modules and their tests remain in the repository. Their legacy public endpoints are disabled by default while the account-based workspace is the active product.
