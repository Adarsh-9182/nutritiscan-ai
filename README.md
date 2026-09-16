# NutritiScan

A conversational health companion with source-linked education, private on-device AI, confirmed records, follow-ups and visit preparation. Built with Next.js, TypeScript and Postgres.

The home screen brings together questions about everyday health, nutrition, sleep, medicines and wellbeing. Records remain supporting tools: compare dated values, open their sources and prepare a personalised visit brief. Review any proposed follow-up before saving it.

**Early access:** limited educational coverage, not a clinically validated doctor. Optional Qwen2.5 runs in a WebGPU-compatible browser after an explicit model download; references and record tools work without it. No cloud API key is required for this mode. AI can make mistakes.

## Delivery roadmap

See the [phased product roadmap](docs/PRODUCT_ROADMAP.md): frontend → health-data backend → connected records → evidence-based AI → agent workflows → pilot and subscriptions. It includes Hubble-inspired patient-authorized record retrieval, build-versus-partner constraints and a completion gate for every phase. Live provider retrieval, voice agents and billing are future work.

## Start

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Explore `/workspace?demo=1` for an isolated fictional example, or create an account. Development uses local PGlite without a database account or model API key.

## Checks

```sh
npm run verify
```

See [workspace release and deployment guide](docs/WORKSPACE_RELEASE.md) for configuration, encrypted storage, synthetic end-to-end checks, free-model setup, current limitations and the clinical launch requirements. `.env.example` lists supported variables; never commit real keys or health records.

The existing clinical/nutrition research modules and their tests remain in the repository. Their legacy public endpoints are disabled by default while the account-based workspace is the active product.
