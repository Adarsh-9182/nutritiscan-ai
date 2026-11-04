/** Deterministic descriptive analysis. No model, inferred units or clinical decisions. */
export function parseDelimited(text, delimiter = ",") {
  if (Buffer.byteLength(text) > 2_000_000) throw new Error("Dataset exceeds the 2 MB analysis limit.");
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += ch; continue; }
    if (ch === '"') { if (cell || closed) throw new Error("Malformed quoted dataset cell."); quoted = true; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; closed = false; continue; }
    if (ch === "\r" || ch === "\n") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; closed = false; if (rows.length > 20001) throw new Error("Dataset exceeds 20,000 rows."); continue; }
    if (closed) throw new Error("Unexpected text after a quoted cell.");
    cell += ch;
  }
  if (quoted) throw new Error("Unclosed quoted dataset cell.");
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  if (rows.length > 20001) throw new Error("Dataset exceeds 20,000 rows.");
  if (!rows.length || !rows[0].length || rows[0].length > 80) throw new Error("Use a dataset with a header and at most 80 columns.");
  const headers = rows.shift().map((h) => h.trim());
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length) throw new Error("Dataset headers must be non-empty and unique.");
  const invalid = rows.findIndex((r) => r.length !== headers.length);
  if (invalid !== -1) throw new Error(`Dataset row ${invalid + 2} has a different column count. No values were repaired or analysed.`);
  return { headers, rows };
}

export function profileDelimited(text, delimiter = ",") {
  const { headers, rows } = parseDelimited(text, delimiter);
  const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  const columns = headers.map((name, i) => {
    let missing = 0, count = 0, mean = 0, m2 = 0, min = Infinity, max = -Infinity, nonNumeric = 0;
    for (const row of rows) {
      const raw = row[i].trim(); if (!raw) { missing++; continue; }
      if (!numeric.test(raw) || !Number.isFinite(Number(raw))) { nonNumeric++; continue; }
      const value = Number(raw); count++; const delta = value - mean; mean += delta / count; m2 += delta * (value - mean); min = Math.min(min, value); max = Math.max(max, value);
    }
    const stats = count && !nonNumeric ? { count, min, max, mean, sampleStdDev: count > 1 ? Math.sqrt(m2 / (count - 1)) : null } : null;
    if (stats && Object.values(stats).some((v) => v !== null && !Number.isFinite(v))) throw new Error("Numeric range exceeds reliable descriptive calculations. No summary was returned.");
    return { name, missing, numericCount: count, textCount: nonNumeric, statistics: stats, ...(nonNumeric && count ? { notice: "Mixed numeric/text column; no numeric summary computed." } : {}) };
  });
  return { type: "delimited", rowCount: rows.length, columns, preview: rows.slice(0, 5), limitations: ["Only blank cells count as missing. Codes such as NA remain text.", "Column names and values are preserved; units are not inferred.", "Descriptive statistics do not establish efficacy, causation or a diagnosis."] };
}

export function extractObservations(text) {
  if (Buffer.byteLength(text) > 2_000_000) throw new Error("Measurement file exceeds 2 MB.");
  const data = JSON.parse(text);
  const resources = data?.resourceType === "Bundle" ? data.entry?.map((e) => e?.resource) : [data];
  if (!Array.isArray(resources) || resources.length > 1000) throw new Error("Use at most 1,000 FHIR Observation records.");
  const observations = resources.filter((r) => r?.resourceType === "Observation").map((r) => ({
    name: String(r.code?.text ?? r.code?.coding?.[0]?.display ?? r.code?.coding?.[0]?.code ?? "Unnamed measurement").slice(0, 300),
    status: String(r.status ?? "unknown").slice(0, 80), value: typeof r.valueQuantity?.value === "number" && Number.isFinite(r.valueQuantity.value) ? r.valueQuantity.value : null,
    unit: typeof r.valueQuantity?.unit === "string" ? r.valueQuantity.unit.slice(0, 100) : null,
    effectiveAt: typeof r.effectiveDateTime === "string" ? r.effectiveDateTime.slice(0, 100) : null,
    missingReason: typeof r.valueQuantity?.value !== "number" || !Number.isFinite(r.valueQuantity.value) ? "No finite top-level numeric valueQuantity; components or other value types were not extracted." : null,
  }));
  if (!observations.length) throw new Error("No FHIR Observation resources found.");
  return { type: "fhir-observations", resourceCount: resources.length, extractedCount: observations.length, skippedResources: resources.length - observations.length, observations, limitations: ["Subject identifiers, reference ranges and clinical interpretations are not extracted.", "This is a file import, not a live device connection or confirmation of measurement accuracy.", "Component measurements are not extracted; missing units remain unknown."] };
}
