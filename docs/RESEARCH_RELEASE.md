# Research-first release status

Updated 2 November 2026. This is the current release snapshot; older health-first
roadmap documents are historical context.

## Working journey

Public question → PubMed and ClinicalTrials.gov retrieval → bounded AI drafting
and passage checking → source inspection → manual relevance decisions and notes
→ CSV/text/RIS export → research backup → preview and restore → follow-up.

Research projects can be renamed. Backups contain only research conversations,
source records, drafts and saved review notes. They do not include health storage
or account credentials. Import preserves existing conversations, skips identical
content, forks conflicts and refuses capacity overflow without evicting data.
Imported content is labelled as not revalidated, including copied/text exports.

Research history remains browser-local (eight conversations, twelve turns each,
one megabyte). Backups are portable files, not account sync. RIS includes only
manually included records and available metadata; missing authors and DOIs are
not inferred. Scientific validity is not established by schema or software tests.

## Verification

- Full local suite: 663 unit/integration tests, 47 UI tests and 44 offline gate
  checks passed; production build passed. Live model evals are separate from the
  offline gate and are not included in those numbers.
- Isolated browser flow at 1440, 390 and 320 pixels: decisions, notes, source
  inspection, CSV/RIS, rename, backup download, delete, import preview, restore
  and reload. Mobile sidebar overlap found by the flow was fixed.
- Live synthetic account smoke: signup, root HttpOnly session cookies, shared
  identity and free-plan read, logout revocation, login, account deletion and
  session revocation. The temporary account was removed.
- One live public research question returned six PubMed and four registry
  records and two model-assisted findings. Gemini 3.6 was unavailable; the
  existing Gemini 3.5 Flash-Lite fallback completed. This is a functional check,
  not a scientific accuracy benchmark or a reliability guarantee.

## Remaining launch work

- Google and GitHub OAuth code exists but both production providers report
  disabled. Owner provider applications and client credentials must be configured
  as described in [SOCIAL_SIGN_IN.md](SOCIAL_SIGN_IN.md), then verified interactively.
- Pro/Max code exists; production checkout and premium inference report disabled.
  Merchant setup, approved prices, live credentials and billing lifecycle checks
  are required before charging. See [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md).
- Account-backed research sync and collaborative projects are not implemented.
- Researcher pilots, retrieval-quality measurements, expert review and validated
  clinical/institutional workflows remain work to do. Hospital records workflows,
  participant screening, protocol approvals and autonomous discovery are not
  capabilities of the public research release.
