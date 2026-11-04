import { test } from "node:test";
import assert from "node:assert/strict";
import { extractObservations, parseDelimited, profileDelimited } from "../src/datasets.mjs";

test("CSV preserves escaped quotes, multiline cells, BOM, CRLF and trailing empty values", () => {
  assert.deepEqual(parseDelimited('\uFEFFname,value,note\r\n"sample, A",12,"a ""quote""\nnext line"\r\nsample B,,\r\n'), { headers: ["name", "value", "note"], rows: [["sample, A", "12", 'a "quote"\nnext line'], ["sample B", "", ""]] });
});
test("descriptive statistics handle blank values without silently interpreting missing-value codes", () => {
  const p = profileDelimited("sample,value,mixed\na,1,1\nb,2,NA\nc,,3\nd,3,4\n");
  assert.deepEqual(p.columns[1].statistics, { count: 3, min: 1, max: 3, mean: 2, sampleStdDev: 1 });
  assert.equal(p.columns[1].missing, 1); assert.equal(p.columns[2].statistics, null); assert.equal(p.columns[2].textCount, 1);
});
test("malformed data is rejected instead of repaired or dropped", () => {
  for (const text of ['x,x\n1,2', 'x,y\n1', 'x\n"unfinished', 'x\n"one"two', 'x\na"b']) assert.throws(() => parseDelimited(text));
  assert.throws(() => profileDelimited("x\n1e308\n-1e308"), /range/);
  assert.throws(() => parseDelimited("x\n" + "1\n".repeat(20001)), /20,000/);
});
test("TSV and single-record statistics preserve measurement values and unknown variance", () => {
  const p = profileDelimited("well\tsignal_au\nA1\t12.5", "\t");
  assert.equal(p.rowCount, 1); assert.equal(p.columns[1].statistics.mean, 12.5); assert.equal(p.columns[1].statistics.sampleStdDev, null);
});
test("FHIR imports expose measurements, not patient identifiers or clinical decisions", () => {
  const result = extractObservations(JSON.stringify({ resourceType: "Bundle", entry: [{ resource: { resourceType: "Patient", id: "secret-patient" } }, { resource: { resourceType: "Observation", subject: { reference: "Patient/secret-patient" }, code: { text: "Synthetic analyte" }, status: "preliminary", valueQuantity: { value: 42 }, component: [{ valueQuantity: { value: 100 } }] } }] }));
  assert.equal(result.resourceCount, 2); assert.equal(result.extractedCount, 1); assert.equal(result.skippedResources, 1);
  assert.equal(result.observations[0].value, 42); assert.equal(result.observations[0].unit, null); assert.ok(!JSON.stringify(result).includes("secret-patient"));
});
test("FHIR components, unsupported resources and non-finite numbers are not invented as top-level measurements", () => {
  assert.throws(() => extractObservations('{"resourceType":"Patient"}'), /No FHIR/);
  const result = extractObservations('{"resourceType":"Observation","valueQuantity":{"value":1e500}}');
  assert.equal(result.observations[0].value, null); assert.match(result.observations[0].missingReason, /finite/);
});
