# Research chat

The active product sequence and release gates are in the
[research product roadmap](RESEARCH_PRODUCT_ROADMAP.md).

## Working study protocols

Mark one or more sources Include, then choose **Create protocol draft** after
the evidence brief tools. This works with a sources-only response and makes no
additional model request. The originating question and selected bibliography
are retained; methodology and statistics are investigator input. Eleven bounded
sections cover question, rationale, population, eligibility, exposure, comparator,
outcomes/timing, methods, sample-size rationale, analysis and ethics/data management.

An existing model response's proposed steps can be copied explicitly into an
empty methods section with an unvalidated-proposal label. Existing methods are
never overwritten; proposals over the field limit are not silently truncated.
Protocol fields are not added to follow-up model history.

Section completeness is distinct from methodological quality. The personal
review checkbox requires nonblank sections and the original source selection;
edits and source decisions clear it. Source changes preserve the original
bibliography until an explicit update. A personal mark is not supervisor sign-off
or ethics approval. Imported drafts keep their unvalidated provenance and cannot
display a current personal-review claim.

Drafts persist with their conversation and roundtrip through the existing
versioned file/account backup schema. Failed device writes leave the in-memory
draft available for export. TXT and browser print/PDF include timestamps, sources,
missing fields, draft/review state and import/selection warnings. The print view
escapes all content and loads no remote assets. General copy/export also includes
the protocol. Repeating a sources-only search appends a new question if a protocol
already exists, preserving the original draft and sources. The eight-conversation,
twelve-turn and one-megabyte history/backup limits remain enforced.

This is an editable planning artifact, not automatic methodology generation,
an executed study, participant screening or scientific/ethical approval.

The `/research` entry is a conversation-first research assistant using the same
dark/mint theme, full-height transcript and bottom composer as Health chat.
Research conversations have their own storage key and do not read health
profiles, meals, health conversations or Agent Studio saved results.

## Manual source review

Each completed question has a **Review sources** panel, including sources-only
results when AI drafting is unavailable. Researchers can mark each record Include,
Exclude or Needs review, add a reason (up to 1,000 characters), and reset a mark.
Unreviewed means no decision has been made; it is distinct from Needs review.
Counts and a filter help work through up to ten retrieved records.

Decisions belong to that question's retrieved result. They persist in the existing
browser history, with source IDs and UTC decision timestamps. Old histories without
decisions still load. A fresh retry clears decisions even if the new retrieval
returns the same source IDs. Storage rejects unknown source references, duplicate
marks, invalid timestamps and oversized notes. Existing history limits still apply:
eight conversations, twelve questions each and one megabyte total. Storage failures
are surfaced in the workspace. Optional encrypted account snapshots are described
below; there is no automatic background sync or durable scientific audit log.

**Export all sources · CSV** exports every source regardless of the active filter,
including the question, original URL, retrieval time, decision, note and review
time. CSV cells are quoted and spreadsheet formula prefixes are neutralized.
Copy with sources and Export research also include saved decisions after the AI
draft. Review notes are never included in model context or inference API requests;
review actions make no model calls. Explicit account snapshots include saved notes.

These are manual relevance decisions. They do not remove findings from the AI
draft, rate evidence certainty or risk of bias, validate a result, or constitute a
systematic review. AI source checking and researcher relevance decisions remain
separate. Notes become part of downloaded/copied exports, so use public research
information only.

## Implemented journey

Research conversations can be renamed from the project header. Open conversation
history to use **Back up all** (versioned JSON) and **Restore backup**. Imports
preview conversation names before confirmation, preserve existing work, skip
identical content and keep changed versions separately when IDs collide. Imports
are rejected atomically if combined history exceeds eight conversations or 1 MB.
Interrupted runs become stopped and never restart an API call on restore.
Questions, source metadata, drafts and saved relevance notes roundtrip; unrelated
health storage, account credentials and cookies are not included.

Imported conversations show a provenance notice: the file's source content and
earlier AI checks have not been revalidated. A supported schema is not evidence
of authenticity or scientific accuracy. Use backups from trusted sources.

**Export included · RIS** downloads only records explicitly marked Include,
regardless of the current list filter. It uses available titles, URLs, IDs, years
and researcher notes, without inventing author names, journals or DOIs. Trial
records are generic registry entries, not journal articles or efficacy claims.
RIS can be imported through Zotero's File → Import; see
[Zotero's import documentation](https://www.zotero.org/support/kb/importing_standardized_formats).
Exports are device downloads. Manual encrypted account snapshots are available;
automatic background sync is not implemented.

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
7. Compare metadata and source-checked findings in the evidence table. Mark relevant
   records Include, then build the evidence brief described below for passage-based
   population, sample and study comparisons. Effect sizes are not calculated or
   pooled. Full text is not read. Retraction publication types are flagged, and findings
   based on such records are rejected. This is not complete retraction monitoring.
8. Continue with bounded research history, copy/export with sources, or reopen a
   conversation from the device-local sidebar. A retry performs a fresh search.

## Included-source evidence agent

After marking one to six sources Include, choose **Build evidence brief**. The
`POST /api/research/brief` endpoint accepts only a bounded question and canonical
PubMed/trial IDs. It refuses client-supplied evidence, URLs and authority flags.
It fetches those IDs again from fixed original database endpoints; saved or
imported source text is never trusted as the input to a fresh extraction. PubMed
IDs use one batch request; trial reads run independently. Successful records survive
another database's deadline, while missing IDs remain visible in the brief.

The agent proposes exact passages for design, population, sample size,
intervention/exposure, comparator, outcome/planned endpoint and author-stated
limitations. Each released cell must match its own source and pass a separate
model check of field placement in context. Ambiguous duplicate cells, invented
passages and negative checks are withheld. Retracted or abstract-less papers do
not support substantive extraction. Trial enrollment types, eligibility, arms and
planned endpoints are registry descriptions, never efficacy results.

`not-found` means the extractor selected no passage in available text, not that
the full paper lacks the information. `unavailable` means extraction/checking did
not finish or could not run, including model quota failures. These states remain
separate in the UI and CSV. A source-checked narrative is attempted within the
remaining time budget; failure leaves successful extraction intact. Request and
model text cannot authorize execution, experiments, prescribing or resource purchases.

Each question keeps up to two brief versions, each retaining its own source
snapshot, original selection, creation time, model IDs and run limitations.
Changing Include decisions marks old versions as based on a different selection.
The researcher can edit the title and interpretation, and mark a version reviewed;
editing resets the review mark. Researcher notes are not AI verified and are never
sent to the model. Generating or cancelling a new version preserves earlier work.
File backups and explicit account snapshots include versions and interpretation;
imports are marked unvalidated. Retrying the underlying question clears its source
decisions and briefs. Existing 1 MB history/backup limits still apply.

Exports include a full TXT brief, comparison CSV with per-cell status and formula
escaping, and browser **Print / Save PDF**. Print content is escaped text with no
remote assets or scripts; imported notes cannot inject HTML. PDF uses the browser
print dialog, not a server document service. Full-text extraction, meta-analysis,
formal risk-of-bias appraisal, lab automation and independent scientific validation
are outside this workflow.

The route has a 55-second deadline, at most six records, a 24-second extraction
budget and at most 18 seconds for narrative. Existing shared rate limiting is used
when configured, with per-instance fallback; this does not guarantee a fleet-wide
quota without shared storage. The route uses existing basic research models and
does not activate premium routing, new API services or billing. Free-provider quotas
can still interrupt inference; sources and researcher work remain usable.

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

## Research appearance

The header includes explicit Light and Dark buttons with selected-state labels.
The preference is stored separately as `ns-research-theme` on this device. Light
mode scopes its backgrounds, panels, text, borders, citations, controls and hero
heading to Research; the original dark green palette remains selectable. The
light text/accent palette clears 4.5:1 contrast on its intended surfaces. Saved
appearance does not enter research requests or Health profile data.

## Account research snapshots

Conversation history contains an Account research backup panel. Signed-in users
first check the existing snapshot, then explicitly save device research or restore
the account snapshot. Saving requires a fresh explicit storage choice; replacing
an existing account snapshot is stated alongside that choice. Restore uses the
same non-destructive merge/capacity checks as file imports. There is no automatic
upload, automatic restore or background synchronization. Public research runs and
file backups still work without signing in.

The web `/api/research/backup` route validates the complete versioned backup,
requires same-origin writes, verifies the live account session and binds mutations
to the inspected account ID. A changed account or revision fails closed. The API
service stores one encrypted snapshot in `research_workspaces`, using the existing
account encryption key with owner-and-purpose associated data. It does not read
health records, grant health-storage consent or send notes to a model. The API
requires an explicit research-storage choice and caps uploads; web reads validate
the full schema again before restoration. The backend stores a bounded opaque
snapshot envelope, not independently verified scientific claims.

Concurrent writes use a single conditional database update. Deletes retain an
empty revision tombstone so stale clients cannot recreate deleted content. Account
deletion removes the snapshot and tombstone in the account-deletion transaction.
Research response bodies are never cached. The existing API pre-deploy migration
adds only the new table; deployment requires updating the account API before the
web UI. `node scripts/smoke-research-account.mjs` verifies isolated synthetic
accounts, conflicts, delete/recreate, logout revocation and sign-in restoration.
