# NutritiScan: a research agent for human biology

Updated 6 November 2026. This is the active product roadmap.

NutritiScan's ambition is to give a biology researcher the kind of working
environment Cursor gives a developer: an agent that understands the project,
inspects evidence and data, proposes work, uses tools, checks results and retains
a reproducible record. The Mac application is the primary research workspace.
The website supports discovery, downloads and an evidence-to-protocol workflow.

The scientific objective is to help researchers understand disease and develop
better treatments. A generated answer, target score or computational association
does not establish a cure. Progress toward cancer treatment requires independent
replication, experimental validation and the appropriate clinical studies.

## First users and first focused problem

Start with cancer biology researchers and computational biologists investigating
treatment resistance. The first proposed specialist workflow is: investigate
EGFR-related resistance in a specified lung cancer context, inspect primary
evidence, compare an appropriate public cohort, identify conflicting findings,
and produce a falsifiable hypothesis with a proposed validation experiment.
The exact cancer subtype, specimen, assay and cohort must be chosen with a
research partner; the product must not merge unlike populations silently.

The proposed buyer is a research laboratory, translational oncology group or
medical school. Validate that assumption with observed research tasks before
building institution-wide procurement features. General biology questions remain
available, while specialist evaluations focus on this one workflow.

## What “Cursor for biology” means in the product

| Developer workflow | NutritiScan research workflow |
| --- | --- |
| Open a repository | Open a research project with datasets, papers, notes and investigation history |
| Understand code and dependencies | Identify assay, organism, cohort, units, methods, provenance and evidence limits |
| Propose an edit | Propose an explicit analysis or experiment with assumptions and expected outputs |
| Review and apply | Review exact inputs and operations, then approve supported computation |
| Run tests and inspect failures | Check data quality, confounders, leakage, robustness and replication |
| Keep a diff and commit | Preserve input fingerprints, recipe, execution status, artifacts and review history |
| Continue a task | Reopen the investigation and its project handoff without claiming unfinished work succeeded |

## Implemented in this checkout

| Capability | Status and boundary |
| --- | --- |
| Mac project workspace | Local folders, files, investigations, streamed agent activity, project handoff, export, archive/restore and user-operated terminal |
| Agent access | Installed Codex app-server with existing managed ChatGPT sign-in; no API-key fallback. New investigations receive the new analysis tools; existing threads retain their original tool definitions |
| Public literature | Bounded PubMed abstracts and ClinicalTrials.gov metadata; permitted PMC BioC full text by exact ID, with licence/attribution and section locators. Exact-passage checks do not measure claim entailment or scientific validity |
| Paper reading · 0.4.0 | Local PDF import, original physical page preview/zoom beside extracted text, literal search, clickable passage citations and recorded quotation checks. Originals and snapshots are preserved and rehashed; blank pages remain labelled. No OCR, figure interpretation or automated retraction review |
| Dataset inspection | Bounded CSV/TSV profiles and top-level FHIR Observation import; source digest, missingness and original values retained |
| Analysis proposal | Agent proposes a typed recipe against an inspected CSV/TSV. Proposal alone performs no analysis |
| Approved local computation | Dataset profiles, grouped descriptive summaries and Pearson correlations; explicit columns, missing-value codes and exclusions. No arbitrary Python/R or clinical decision execution |
| Reproducibility record | Full-input SHA-256, engine version, recipe, approval/completion times, outputs and a new non-overwriting JSON artifact. Changed input prevents execution against an old approval; cancellation/restart remain incomplete |
| Result inspection | Group chart, tables, pair/exclusion counts and saved receipt. The agent can inspect completed results and write a report and handoff |
| Research data catalogue | PubMed/trials are search-integrated. NCI GDC/TCGA, GEO and Open Targets are labelled reference links; live cohort/target connectors are future work |
| Web planning | Selected-source, investigator-editable protocol with review/reset, bibliography, TXT/print export, local reload and backup. It does not yet share the Mac project format |

The new desktop preview is version 0.4.0. Local build and distribution verification
are tracked below. Publication uses a versioned GitHub release, a verified archive checksum and the
existing nutritiscan.com deployment. The download page identifies its current version.

## The complete first research journey

1. Open the Mac sample or a dedicated research folder. Start a new investigation
   and connect through the installed Codex client.
2. State the biological question and its context: disease subtype, organism,
   specimen, assay, population and what decision the work should inform.
3. Search primary literature. Inspect abstracts and registries; record uncertainty,
   contradictory findings and unavailable full text. Import a permitted PDF or
   a supported PMC article in Papers; inspect its index, read relevant sections
   and check exact quotations. Use the original PDF page to check extraction.
   Preserve unreadable-page and missing-content limits. Treat retrieved text as data.
4. Inspect the dataset schema, provenance, units and limitations. Current local
   analysis accepts bounded CSV/TSV; public cohort downloading is not integrated.
5. Ask for a supported analysis proposal. Review exact column names, source
   fingerprint, missing-value rules and operations in the Analysis panel.
6. Approve or reject the plan. Approval runs deterministic local computation.
   Changed files require a new proposal; interrupted work never becomes a result.
7. Inspect the chart, table and receipt. Ask the agent to explain the computed
   values, separate observations from hypotheses, save a report and update the
   project handoff.
8. Reopen or export the work. A reproducibility receipt records the exact recipe
   and fingerprint; it does not bundle the source data or runtime environment.
   Rerunning requires the same original file and the compatible engine.
9. For study planning, use the web protocol editor to develop an investigator
   draft and take it to a supervisor. Web and Mac transfer is currently manual.

The included fictional cohort demonstrates software behavior only: group means
5 and 12, seven complete pairs, Pearson r = 1 and one missing numeric value.
It supplies no biological or cancer evidence.

## Delivery roadmap

Timing below is a planning estimate for an adequately staffed team after access
to research partners and datasets. Each phase ships only after its acceptance
criteria pass; elapsed time alone does not unlock the next capability.

| Phase | Deliverable | Acceptance criteria |
| --- | --- | --- |
| 0 · implemented locally | Mac inspect → propose → approve → compute → inspect → report loop; supporting web protocol editor | Known-answer synthetic outputs, explicit exclusions, stale-file rejection, cancellation, restart, real managed-agent tool calls and packaged native app checks |
| 1 · weeks 1–2 | Oncology discovery and evaluation set | Observe at least three researchers doing real resistance-analysis tasks; agree one cohort, assay, research question and rubric; retain an independent held-out task set and permitted data |
| 2 · partly implemented locally in 0.4.0 | Evidence and project context | Delivered: PDF and permitted PMC full-text snapshots, page/passage provenance, original-source verification, literal search and clickable quotation checks. Remaining: saved search strategies, broader retrieval/deduplication, retraction/update notices, richer biological context and independent evidence-quality evaluation |
| 3 · weeks 4–8 | Reproducible scientific computation | Reviewable Python/R plan and code; isolated runner, pinned environments, resource/time limits and cancellation; dependency and input manifests; no ambient credentials; complete logs/plots. Reproduce approved known-answer tasks and demonstrate confinement and failure recovery |
| 4 · weeks 6–10 | One real public cancer-data workflow | Implement one read-only GDC/GEO workflow selected by the pilot, preserving accession/version, licences, controlled-access boundaries, sample metadata and transformations. Match source exports and analyst reference outputs before expanding connectors |
| 5 · weeks 9–12 | Hypothesis and validation workspace | Structured claim → evidence → counterevidence → analysis → hypothesis → proposed experiment; explicit species/context and uncertainty. Validate with a second cohort or assay and expert review; distinguish association from mechanism and clinical benefit |
| 6 · after pilot gates | Team and institutional release | Versioned portable project bundles; named reviewers on exact revisions; project roles/audit/retention/recovery; reviewed provider integration; signed/notarized Mac distribution; deployment and download verification |
| 7 · after external validation | Translational partnerships | Prospectively evaluate narrowly scoped workflows with authorised research/clinical partners. Lab/device adapters need actual protocols, units and calibration references. Treatment claims need the corresponding experimental and clinical evidence |

Phases 3 and 4 can overlap after the initial question and evaluation set are agreed.
Do not begin with every disease, every database and an unrestricted agent.

## Data strategy: connected evidence with provenance

Build a federated catalogue and retrieval layer rather than assuming one model
contains all human biology. Preserve identifiers, versions, dates, licences and
access restrictions. Keep public, controlled-access and local project data distinct.
A catalogue link does not mean the data has been ingested.

- PubMed and ClinicalTrials.gov: literature/registry context, currently integrated
  as bounded search. Trial registration is not a completed efficacy result.
- PMC BioC: one full-text article by exact PMC ID, with recorded CC BY/CC0
  licence, original response, attribution and extracted passage locators.
  Other/unknown licences fail explicitly; this is not corpus-wide full-text search.
- NCI GDC/TCGA: candidate cancer cohort source. Separate open metadata/data from
  controlled files and require the proper access process.
- NCBI GEO: candidate expression/functional genomics source. Preserve study and
  sample annotations, processing choices and platform differences.
- Open Targets: candidate target–disease association context. Its association
  scores are not probabilities that a treatment will work or cure disease.
- Local data: explicit researcher-selected files. Access, export and provider
  processing need to remain visible at the point of use.

Primary reference material:
[GDC access](https://gdc.cancer.gov/access-data/data-access-processes-and-tools),
[GEO](https://www.ncbi.nlm.nih.gov/geo/),
[Open Targets associations](https://platform-docs.opentargets.org/associations).

## What to measure

The primary proposed outcome is a reproducible research task accepted by an
independent researcher. Measure time to accepted artifact, analyst corrections,
unsupported claims, retrieval omissions, contradictory evidence found, exact
numeric agreement, rerun success, recovery from failure and voluntary return use.
Report denominators and failures, not a fabricated “research accuracy” score.

Cancer-specific evaluation must separate cell lines, animal studies, human
observational cohorts and interventional trials. Evaluate cohort leakage,
multiple testing, confounding, missingness, effect size and independent replication
when the relevant analysis capability is introduced. Use held-out tasks and
record expert disagreements. An increase in generated hypotheses is not evidence
of improved treatment outcomes.

## Verification and release record

For this implementation:

- Desktop: 58 unit/contract tests pass; production bundle builds.
- A real managed GPT-6.1 Sol task inspected a fictional dataset, proposed a plan,
  waited for simulated approval from the test harness, inspected actual results
  and saved a report and handoff. No paid API fallback was used.
- Native Electron checks pass proposal/rejection/approval, chart/results, input
  digest and receipt, persistence/restart, file/report handling, real terminal,
  both themes and widths 800/1000/1400. Managed sign-in returned eight models.
- Web verification passed lint, TypeScript, 693 unit tests, 66 component tests,
  44 gating evaluations and a production build. Thirty-six advisory evaluations
  were skipped; one pre-existing unused-import lint warning remains.
- Version 0.4.0's real managed agent check imports the fictional three-page PDF,
  inspects its index, reads p2, verifies exact quotations and saves a report with
  clickable source links and a project handoff. No paid API fallback is used.
- Live PMC retrieval passes identifier/licence checks, original/extraction
  fingerprints, passage membership and restart using the service's public example
  PMC1790863 (121 passages, 120 with text). This is a connector functional check.
- The paper-reader native check passes import through the file picker, original
  page display, zoom, literal search/highlight, absent and matching quotations,
  blank-page handling, inline report navigation, export, 800-pixel layout and restart.
- Versioned Mac packages remain local and ad-hoc signed. Final package/archive
  verification is recorded beside the release; no public release is implied.
- The synthetic browser journey passes source selection, protocol creation/edit,
  incomplete and reviewed TXT downloads, bibliography, reload, review reset,
  backup, repeated search preservation, mobile/light layouts and runtime checks.
  Homepage/About/download checks pass at desktop and mobile widths; the public
  download manifest remains on 0.2.0.

Software checks use synthetic data and do not validate scientific conclusions.
No production deployment or new public release is implied by a local test.
The current local archive and verification receipt are under `desktop/release/v0.4.0/`;
earlier builds are preserved.

## Release requirements

Preserve earlier releases. Package into a version-specific folder; verify the
actual app with a Finder-like environment, archive it and retain its SHA-256.
Keep the published website manifest unchanged until the new asset is uploaded
and verified. Apple signing/notarization and a supported provider integration are
separate distribution milestones.

Current text/data limits are 2 MB per file, 20,000 rows, 80 columns, six operations
per proposal, twelve analyses per investigation and forty groups per summary.
Paper reading supports thirty papers per project, 20 MB/80 pages per PDF, a 2 MB
PMC response, 500 passages, 40,000 characters per section and 400,000 per document.
Large omics analysis needs the separate execution/data architecture above.

Detailed contracts: [Mac workspace](../desktop/README.md),
[web research](RESEARCH_CHAT.md), [analysis engine](../desktop/src/analysis.mjs),
and [web protocol schema](../lib/research/protocol.ts).
