# Sample biology workspace

These files contain fictional measurements for testing NutritiScan. They are
not experiments and provide no evidence about disease or treatment.

- `instrument-readings.csv`: six fictional observations in arbitrary signal
  units. Overall mean of `signal_au`: 107.8333333333.
- `synthetic-cohort.csv`: eight fictional rows. Mean `signal_au` is 5 for
  `model_A` and 12 for `model_B`; one signal is missing. Seven complete
  `signal_au`/`readout_au` pairs have Pearson r = 1 by construction.

Try this in a new investigation:

> Inspect synthetic-cohort.csv. Propose grouped summaries of signal_au by cohort
> and a correlation with readout_au. Use blank cells as the only missing values.
> Wait for me to review and approve the plan in Analysis.

Then review the exact inputs and operations in **Analysis** and choose **Approve
& run analysis** or reject it. After a completed run, ask:

> Inspect the completed analysis, explain the actual results and exclusions,
> save a Markdown report with the source fingerprint and synthetic-data limits,
> and update the project handoff.

You can also propose a dataset profile directly from the Analysis panel without
connecting a model. Proposing does not execute an analysis. Receipts are saved as
new JSON files in `artifacts/`; original data is preserved.

Group differences and correlations in these tiny fictional files establish no
efficacy, causation, measurement validity or biological relevance. Public
literature searches are independent of these files. NCI GDC, GEO and Open Targets
catalogue entries are reference links, not integrated dataset downloads.

Files and project context requested by the agent go to your connected provider.
Use public or appropriately de-identified research data. Imported instrument files
are recordings; NutritiScan does not connect to or operate an instrument.

## Fictional paper

`sample-paper.pdf` is an invented three-page software-test document. Pages 1 and 2
contain readable text; page 3 is intentionally blank. It describes the constructed
cohort values above and is not a published study or biological evidence.

Open Papers, select this project PDF and import it. Read page 2 beside its original
image, search a phrase and check an exact quotation. An agent can perform the same
workflow in a new investigation and save a report with clickable passage links.
No model connection is needed for manual reading or quotation membership checks.
