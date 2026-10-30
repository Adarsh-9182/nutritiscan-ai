// Run with an ignored environment file; never print keys or provider bodies.
// Inventory is read-only. --generate adds one small public connectivity prompt.
const candidates = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) { console.log("Google credential: missing"); process.exit(1); }
if (key === "[SENSITIVE]") { console.log("Google credential is a Vercel redaction placeholder. Verify the deployed runtime; this is not a usable local secret."); process.exit(1); }
const headers = { "x-goog-api-key": key, "content-type": "application/json" };
try {
  const inventory = await fetch("https://generativelanguage.googleapis.com/v1beta/models", { headers, signal: AbortSignal.timeout(15_000) });
  console.log("Model inventory HTTP:", inventory.status);
  if (!inventory.ok) process.exit(1);
  const json = await inventory.json();
  const available = candidates.filter((id) => json.models?.some((m) => m.name === `models/${id}` && m.supportedGenerationMethods?.includes("generateContent")));
  console.log("Available research models:", available.join(", ") || "none");
  if (process.argv.includes("--generate") && available.length) {
    const id = available[0];
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`, { method: "POST", headers, signal: AbortSignal.timeout(30_000), body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with RESEARCH_READY only. Public connectivity check." }] }], generationConfig: { maxOutputTokens: 256, thinkingConfig: id === "gemini-3.8-flash" ? { thinkingLevel: "low" } : { thinkingBudget: 0 } } }) });
    console.log("Connectivity model:", id, "HTTP:", response.status);
    if (!response.ok) process.exit(1);
    const result = await response.json();
    const hasText = result.candidates?.some((c) => c.content?.parts?.some((p) => typeof p.text === "string" && p.text.trim()));
    console.log("Provider returned text:", Boolean(hasText));
    if (!hasText) process.exit(1);
  }
} catch (error) { console.log("Network check failed:", error.cause?.code ?? error.name); process.exit(2); }
