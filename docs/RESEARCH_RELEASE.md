# Research-first release status

Updated 3 November 2026. This is the current release snapshot; older health-first
roadmap documents are historical context.

## Working journey

Public question → PubMed and ClinicalTrials.gov retrieval → bounded AI drafting
and passage checking → source inspection → manual relevance decisions and notes
→ included-source comparison and editable evidence brief → CSV/text/PDF/RIS
export → research backup → preview and restore → follow-up.

Research projects can be renamed. Backups contain only research conversations,
source records, drafts and saved review notes. They do not include health storage
or account credentials. Import preserves existing conversations, skips identical
content, forks conflicts and refuses capacity overflow without evicting data.
Imported content is labelled as not revalidated, including copied/text exports.

Device research history remains browser-local (eight conversations, twelve turns
each, one megabyte). Signed-in users can explicitly save and restore an encrypted
account snapshot, with revision conflicts blocking stale updates. Account deletion
erases that snapshot. File backups remain available without sign-in. RIS includes only
manually included records and available metadata; missing authors and DOIs are
not inferred. Scientific validity is not established by schema or software tests.

The included-source agent fetches selected IDs again from PubMed/ClinicalTrials.gov,
checks exact extraction passages and field placement, and attempts a reviewed narrative.
It keeps two versions per question and separates editable researcher interpretation
from AI output. Quota failures leave source records usable; cancellation preserves
previous versions. See [RESEARCH_CHAT.md](RESEARCH_CHAT.md) for scope and bounds.

## Verification

- Full local suite: 687 unit/integration tests, 59 UI tests and 44 offline gate
  checks passed; production build passed. All 31 API backend tests passed. Live model evals are separate from the
  offline gate and are not included in those numbers.
- Isolated browser flow at 1440, 390 and 320 pixels: decisions, notes, source
  inspection, CSV/RIS, rename, backup download, delete, import preview, restore
  and reload. Mobile sidebar overlap found by the flow was fixed. Account snapshot
  UI checks also passed explicit save consent, empty-device restore, saved review
  notes and cloud deletion that preserves device copies at all three widths.
- Included-source browser QA passed at 1440, 390 and 320 pixels: selection-only
  inference requests, quote inspection, editable title/interpretation, review marks,
  reload, two versions, both themes, TXT/CSV, backup restore and escaped print/PDF.
  These checks use labelled synthetic fixtures. A separate keyless API smoke fetched
  both real public PubMed/trial records, enrollment and planned endpoint metadata;
  it correctly returned unavailable extraction without model credentials.
- Live synthetic account smoke: signup, root HttpOnly session cookies, shared
  identity and free-plan read, logout revocation, login, account deletion and
  session revocation. The temporary account was removed.
- Live research account checks passed private reads, owner/account binding,
  simultaneous-save conflicts, delete tombstones, logout revocation and sign-in
  restoration. Both temporary accounts were removed.
- Health chat roles are described in [HEALTH_AGENTS.md](HEALTH_AGENTS.md).
  Reference fallback and deterministic safety responses do not claim AI specialist
  consultations. The user-facing Doctor Agent label is Health information.
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
- Manual encrypted account snapshots are implemented. Automatic background sync
  and collaborative projects are not implemented.
- Researcher pilots, retrieval-quality measurements, expert review and validated
  clinical/institutional workflows remain work to do. Hospital records workflows,
  participant screening, protocol approvals and autonomous discovery are not
  capabilities of the public research release.
