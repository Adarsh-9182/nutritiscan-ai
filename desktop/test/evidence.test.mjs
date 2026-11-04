import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyEvidence } from "../src/evidence-check.mjs";
const source = { id: "pubmed:123", kind: "paper", detail: "Synthetic evidence only. A cohort of 42 adults was described. No causal effect was established.", metadata: { hasAbstract: true, publicationTypes: ["Observational Study"] } };
const claim = { sourceId: source.id, claim: "A synthetic cohort was described.", quote: "A cohort of 42 adults was described." };
test("exact quoted text must belong to the specified source", () => {
  assert.equal(verifyEvidence([claim], [source])[0].status, "quote-found");
  assert.equal(verifyEvidence([{ ...claim, quote: "An invented cure was established for every disease." }], [source])[0].status, "withheld");
  assert.equal(verifyEvidence([{ ...claim, sourceId: "pubmed:456" }], [source])[0].status, "withheld");
});
test("retracted and abstract-less papers cannot support substantive claims", () => {
  for (const metadata of [{ hasAbstract: false }, { hasAbstract: true, publicationTypes: ["Retracted Publication"] }]) assert.equal(verifyEvidence([claim], [{ ...source, metadata }])[0].status, "withheld");
});
test("registry quote membership never becomes efficacy validation", () => {
  const result = verifyEvidence([claim], [{ ...source, kind: "trial" }])[0]; assert.equal(result.status, "quote-found"); assert.match(result.reason, /no efficacy/);
});
test("quote checks are bounded and reject unsupported fields", () => {
  assert.throws(() => verifyEvidence(Array(7).fill(claim), [source])); assert.throws(() => verifyEvidence([{ ...claim, scientificallyValidated: true }], [source]));
});
