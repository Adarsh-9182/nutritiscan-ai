type Card = { tag: string; title: string; meta: string; hot?: string; tall?: boolean };

// Decorative only: sample research questions and source labels, no study data or claims.
const COLUMNS: Card[][] = [
  [
    { tag: "PubMed", title: "Does exercise lower blood pressure in older adults?", meta: "Abstract · source linked", tall: true },
    { tag: "Trial registry", title: "Recruiting studies, by condition", meta: "ClinicalTrials.gov" },
    { tag: "Evidence", title: "Which designs answer this question?", meta: "Index · 8 sources", tall: true },
  ],
  [
    { tag: "Question", title: "Vitamin D and respiratory infection", meta: "Search logged" },
    { tag: "Cited", title: "Every line points to its source", meta: "Source linked", hot: "Cited", tall: true },
    { tag: "PubMed", title: "Review articles, newest first", meta: "Abstract · source linked" },
  ],
  [
    { tag: "Trial registry", title: "Completed and terminated studies", meta: "ClinicalTrials.gov", tall: true },
    { tag: "Question", title: "Screening tools in primary care", meta: "Search logged" },
    { tag: "Evidence", title: "Gaps the search could not fill", meta: "Stated, not hidden", tall: true },
  ],
  [
    { tag: "PubMed", title: "Systematic reviews on sleep and diabetes", meta: "Abstract · source linked" },
    { tag: "Question", title: "Does the evidence differ by age group?", meta: "Search logged", tall: true },
    { tag: "Cited", title: "People keep the decisions", meta: "Reviewed by a person" },
  ],
  [
    { tag: "Trial registry", title: "Phase 3 studies, by status", meta: "ClinicalTrials.gov", tall: true },
    { tag: "PubMed", title: "Cohort studies on statin use", meta: "Abstract · source linked" },
    { tag: "Evidence", title: "What the abstract does not say", meta: "Limits shown", tall: true },
  ],
  [
    { tag: "Question", title: "Nutrition and recovery after surgery", meta: "Search logged" },
    { tag: "Traceable", title: "Every step recorded", meta: "Audit trail", hot: "Traceable", tall: true },
    { tag: "PubMed", title: "Randomised trials, ranked by relevance", meta: "Abstract · source linked" },
  ],
  [
    { tag: "Evidence", title: "Source index, ready to export", meta: "Index · 8 sources", tall: true },
    { tag: "Trial registry", title: "Registered, not yet proven", meta: "ClinicalTrials.gov" },
    { tag: "Question", title: "Which outcomes do studies measure?", meta: "Search logged", tall: true },
  ],
];

export function HeroBackdrop() {
  return (
    <div className="nl-backdrop" aria-hidden="true">
      <div className="nl-bd-grid">
        {COLUMNS.map((column, c) => (
          <div key={c} className="nl-bd-col" style={{ animationDuration: `${34 + (c % 4) * 7}s`, animationDirection: c % 2 ? "reverse" : "normal" }}>
            {[...column, ...column].map((card, i) => (
              <div key={i} className={`nl-bd-card${card.tall ? " tall" : ""}${card.hot ? " hot" : ""}`}>
                {card.hot && <b className="nl-bd-flag">{card.hot}</b>}
                <span className="nl-bd-tag">{card.tag}</span>
                <p>{card.title}</p>
                <i className="nl-bd-line" />
                <i className="nl-bd-line short" />
                <small>{card.meta}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
