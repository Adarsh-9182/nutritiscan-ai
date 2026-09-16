# NutritiScan

A personal health workspace for confirmed lab records, follow-ups and better-prepared doctor visits. Built with Next.js, TypeScript and Postgres.

**Early access:** this is an educational records product, not a clinically validated doctor. AI generation is optional and explicitly unavailable when no approved endpoint is configured.

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
