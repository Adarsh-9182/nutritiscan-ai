# Research chat

The `/research` entry is a conversation-first research assistant using the same
dark/mint theme, full-height transcript and bottom composer as Health chat.
Research conversations have their own storage key and do not read health
profiles, meals, health conversations or Agent Studio saved results.

## Implemented journey

1. Choose Evidence review, Develop hypotheses or Plan a study.
2. Enter a research message. Automatic search extracts English scientific concepts
   from the current question and earlier user questions when needed. It reuses the
   shared PICO/Boolean query composer through the direct research provider only.
   If planning fails, a bounded keyword fallback removes common Hinglish/English
   question words; it is not a general Hindi translator. A custom Public search
   terms override pins the query until cleared. Executed queries are visible.
   Research does not inherit the intervention-review default trial filter;
   study-design filters apply only when explicitly requested in the concepts.
3. Select PubMed and/or ClinicalTrials.gov. Disabled sources cannot execute.
4. See actual retrieval/model/check activity in the conversation; Stop aborts the
   request. All work shares a 55-second server deadline. Planning has 6 seconds;
   independent source reads run concurrently with an 18-second source budget.
   Drafting/review share up to 35 seconds, shortened to preserve a terminal result
   before the route deadline. Model attempts use 12 seconds and review 10 seconds.
5. Inspect source-linked findings, explicitly untested hypotheses, proposed study
   plans, source coverage and limitations in the assistant turn.
6. Open a citation to inspect the exact excerpt and original source link.
7. Compare metadata and source-checked findings in the evidence table. Population,
   sample size and effect estimates are not systematically extracted or graded.
   Full text is not read. Retraction publication types are flagged, and findings
   based on such records are rejected. This is not complete retraction monitoring.
8. Continue with bounded research history, copy/export with sources, or reopen a
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
match retrieved text. Each cited source needs a matching excerpt. Invalid findings
are omitted individually; valid findings still require a separate source review.
A separate
model pass reviews entailment; only supported findings survive. This model pass
is not independent scientific validation. Hypotheses and study plans are clearly
marked proposals. Hypothesis mode requires at least one hypothesis grounded in
the surviving reviewed starting observations; study-plan mode requires at least
three proposed steps. Evidence mode cannot accidentally return hypothesis/plan
artifacts. These checks enforce output shape, not scientific quality or novelty.
Prompt history is untrusted context, not verified evidence.

No usable model output produces `sources-only`, retaining successful retrievals.
Missing/invalid model access and quotas never produce a canned scientific answer.
Bounded diagnostics distinguish quota, access, timeout, malformed output, lack of
source support, incomplete mode output and source outage. Logs include only stage,
model and reason code, never provider exception messages or source/user text.
The Google thinking level is explicit for all three models and all stages;
review/planning no longer inherit default medium thinking.
Live diagnostics showed repeated 12-second draft timeouts on Gemini 3.8, so
Gemini 3.6 is now tried first, then 3.5 Flash-Lite, then 3.8. Source review uses 3.5 Flash-Lite to keep the bounded check fast and spread model-specific quota; if Lite quota was already reported in this run, review uses the drafting model. Both model IDs are retained in successful results and exports. The review
model selects indexes of the draft's already verified passages rather than
retyping quotes. It must still judge whole-claim support in source context;
supported findings require passages for every cited source, and selected passages
are validated again against the retrieved text in code.
Each run allows at most one revision using source-review or mode-validation
feedback. The revision is treated as untrusted context and must pass all the
same provenance, source-support and selected-mode checks. Provider outages,
quotas and timeouts do not trigger this revision. The existing overall deadline
still applies, and unsupported results remain withheld.
Per-run metrics report model-request count, elapsed time and usage returned by
successful responses. Failed responses may omit usage. Remaining project quota
and actual billing are not available; these counters are not billing estimates.
The legacy `/api/research` source index remains available for compatibility.

## Persistence and API

`POST /api/research/chat` checks same-origin requests, limits JSON bytes, validates
strict schemas and uses the existing shared rate limiter when configured, with
a per-instance fallback. The typed NDJSON stream
contains up to 32 bounded events and one terminal result/error. The client rejects truncated,
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

## Reproducibility and live benchmark

Copy/export uses the actual turn's question, not the conversation title. Exports
include mode, executed queries, quoted evidence, original source links, model ID,
retrieval timestamp, run diagnostics and reported usage. These retain an audit
trail, not a guarantee that a later live search returns identical records.

`npm run eval:research` runs six public questions sequentially against production:
Hinglish search, a known trial's methods, two-trial comparison, hypothesis mode,
replication planning, and a contextual follow-up. Set `RESEARCH_EVAL_URL` to a
localhost origin for development or `RESEARCH_CASE` to a single case ID. The
runner writes a JSON report to the system temporary directory (override with
`RESEARCH_EVAL_OUTPUT`). Live runs consume the configured provider's quota.

The opt-in benchmark checks completion, known-source retrieval, quote provenance,
selected mode and source permissions. Its case-level expert review questions
cover confounding, human/preclinical distinctions, study comparability, novelty
and biomarker interpretation. Domain-expert scientific review is **pending**;
passing the automated benchmark must never be presented as validated research.
It is skipped during the deterministic release gate.

Improvement-release verification: `npm run verify` passed lint (the existing
migration-script warning remains), TypeScript, 623 unit tests, 36 UI tests,
44 evaluation-gate checks and the optimized production build. The six new live
benchmark cases are opt-in and are not counted as scientific validation.
