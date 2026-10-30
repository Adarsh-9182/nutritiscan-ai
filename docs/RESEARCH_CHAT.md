# Research chat

The `/research` entry is a conversation-first research assistant using the same
dark/mint theme, full-height transcript and bottom composer as Health chat.
Research conversations have their own storage key and do not read health
profiles, meals, health conversations or Agent Studio saved results.

## Implemented journey

1. Choose Evidence review, Develop hypotheses or Plan a study.
2. Enter a research message. The first question becomes the initial public search
   query; edit it in Research settings for subsequent turns if needed.
3. Select PubMed and/or ClinicalTrials.gov. Disabled sources cannot execute.
4. See actual retrieval/model/check activity in the conversation; Stop aborts the
   request. All work shares a 50-second server deadline.
5. Inspect source-linked findings, explicitly untested hypotheses, proposed study
   plans, source coverage and limitations in the assistant turn.
6. Open a citation to inspect the exact excerpt and original source link.
7. Continue with bounded research history, copy/export with sources, or reopen a
   conversation from the device-local sidebar. A retry performs a fresh search.

## Model and evidence boundaries

`lib/research/provider.ts` pins Google's documented free-tier-eligible models.
The server requires `GOOGLE_GENERATIVE_AI_API_KEY`; it never routes research to
the AI Gateway, nor assumes an existing key has a particular billing tier.
See Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing) and
[account-specific limits](https://ai.google.dev/gemini-api/docs/rate-limits).

The bounded pipeline retrieves up to six PubMed records and four trial records.
Only metadata and available abstracts are read. Empty or failed reads leave
explicit coverage uncertainty. Registry records cannot establish efficacy.

Structured model findings require valid source IDs and continuous excerpts that
match retrieved text. Each cited source needs a matching excerpt. A separate
model pass reviews entailment; only supported findings survive. This model pass
is not independent scientific validation. Hypotheses and study plans are clearly
marked proposals. Prompt history is untrusted context, not verified evidence.

No usable model output produces `sources-only`, retaining successful retrievals.
Missing/invalid model access and quotas never produce a canned scientific answer.
The legacy `/api/research` source index remains available for compatibility.

## Persistence and API

`POST /api/research/chat` checks same-origin requests, limits JSON bytes, validates
strict schemas and uses the existing shared rate limiter when configured, with
a per-instance fallback. The typed NDJSON stream
contains step events and one terminal result/error. The client rejects truncated,
oversized or inconsistent streams. `GET` exposes configuration status and model
IDs, never credentials.

Storage is bounded to eight conversations, twelve questions per conversation and
1 MB. Writes fail visibly; work remains in memory for export. Refresh converts an
interrupted request to a stopped turn. There is no background execution, automatic
resume, account sync or cross-device guarantee.

## Current limits

This is a research-assistant implementation, not a validated autonomous scientist.
Code execution, dataset uploads/analysis, full-text retrieval, experimental/lab
connectors and independently verified discoveries are not implemented. Scientific
review and domain validation are necessary to make research outcome claims.

## Verification

Focused checks:

```sh
npm test -- lib/research
npm run test:ui -- components/research-workspace.test.tsx
```

Tests use synthetic sources and mocked models. They cover unsupported citations
and excerpts, source permissions, partial retrieval, model fallback, source-review
gating, cancellation, stream framing, conversation continuity, source inspection,
history isolation, refresh recovery and interrupted requests. Live provider and
scientific validity checks are separate from deterministic tests. The development
checkout had no local Google credential. Vercel's env-pull redacts sensitive
production secrets as `[SENSITIVE]`; testing that placeholder returned HTTP 400
and did not establish that the actual production key was invalid. The provider
check script rejects that placeholder without a network call. Verify the live
runtime to establish model availability. Use `scripts/check-research-provider.mjs` with an
appropriate ignored environment file to verify access. The optional `--generate`
flag sends one small public connectivity prompt; it does not change billing.

Release verification against production baseline `eb90e47`: `npm run verify`
passed lint (one pre-existing unused import warning), TypeScript, 604 unit tests,
34 component tests, 44 evaluation-gate checks (30 excluded/skipped checks), and
the optimized production build. These are engineering checks, not evidence
of biological or clinical validity.
