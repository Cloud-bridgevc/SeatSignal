// Amazon Bedrock access for SeatSignal (Claude via the Bedrock Mantle Messages endpoint).
//
// Division of labour:
//   * extractContractFields  — reads a contract PDF and returns fields WITH the source passage.
//   * draftNarrative         — writes prose around facts the analysis engine already computed.
// The model never computes seat counts, utilization or savings. Narratives are checked so they
// contain no figures absent from the facts; failures fall back to a deterministic template.
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

const MODEL = process.env.BEDROCK_MODEL_ID || "anthropic.claude-opus-5-5";
const client = new AnthropicBedrockMantle({ awsRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION });

const FIELD = {
  type: "object",
  additionalProperties: false,
  required: ["value", "confidence", "page", "snippet"],
  properties: {
    value: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
    page: { anyOf: [{ type: "integer" }, { type: "null" }] },
    snippet: { type: "string" },
  },
};
const FIELD_NAMES = ["subscriptionName", "seats", "annualCost", "termMonths", "renewalDate", "autoRenew", "noticeDays", "priceIncreaseCap"];
const CONTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...FIELD_NAMES, "seatReductionAllowedAtRenewal"],
  properties: { ...Object.fromEntries(FIELD_NAMES.map((n) => [n, FIELD])), seatReductionAllowedAtRenewal: FIELD },
};

const EXTRACTION_SYSTEM = `You extract commercial terms from software subscription contracts for an IT and finance review tool.
Rules:
- Report only what the document states. If a term is absent or ambiguous, set value to null, confidence to "none", page to null, and explain briefly in snippet.
- snippet must be a verbatim quotation of the passage the value came from (max ~40 words).
- Normalise values: seats and termMonths and noticeDays as plain integers in a string ("60"), annualCost as a number string in the contract currency without symbols ("15840"), renewalDate as YYYY-MM-DD, autoRenew and seatReductionAllowedAtRenewal as "true"/"false", priceIncreaseCap as written ("5%").
- If the renewal date is not stated but can be derived from a stated start date and term, give the derived date with confidence "medium" and say so in snippet.
- Never infer usage, adoption or value of the product. That is outside the scope of extraction.`;

/** @param {Buffer} pdf */
export async function extractContractFields(pdf, { filename }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: EXTRACTION_SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: CONTRACT_SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
        { type: "text", text: `Extract the contract terms from ${filename}.` },
      ],
    }],
  });

  // Refusals and truncation are routed to a person instead of being retried or guessed around.
  if (response.stop_reason === "refusal") return { status: "needs_manual_review", reason: `model declined (${response.stop_details?.category ?? "unspecified"})` };
  if (response.stop_reason === "max_tokens") return { status: "needs_manual_review", reason: "output truncated" };
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let fields;
  try {
    fields = JSON.parse(text);
  } catch {
    return { status: "needs_manual_review", reason: "unparseable extraction output" };
  }
  return { status: "extracted", model: MODEL, fields: normaliseFields(fields) };
}

function normaliseFields(raw) {
  const out = {};
  for (const [name, f] of Object.entries(raw)) {
    let v = f.value;
    if (v != null) {
      if (["seats", "termMonths", "noticeDays"].includes(name)) v = Number.parseInt(v, 10);
      else if (name === "annualCost") v = Number.parseFloat(String(v).replace(/[^0-9.]/g, ""));
      else if (["autoRenew", "seatReductionAllowedAtRenewal"].includes(name)) v = String(v).toLowerCase() === "true";
      if (typeof v === "number" && !Number.isFinite(v)) v = null;
    }
    out[name] = { value: v, confidence: v == null ? "none" : f.confidence, page: f.page, snippet: f.snippet };
  }
  return out;
}

const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narrative"],
  properties: { narrative: { type: "string" } },
};

const NARRATIVE_SYSTEM = `You write short recommendation summaries (80–130 words) for IT and finance reviewers.
Rules:
- Use only the facts in the JSON you are given. Do not add numbers, dates, names or percentages that are not in it.
- Describe application usage only from facts under "usage" when usage.status is "imported", and name the report it comes from. If usage.status is "not_imported", say that utilization is unknown.
- Present money amounts as estimates unless the facts mark them verified.
- SeatSignal never changes accounts or subscriptions. Phrase actions as things the named owner may decide to do after review.
- Plain, neutral language. No marketing tone, no urgency beyond the stated deadline.`;

/**
 * @param {object} facts  compact fact sheet built from engine output (see factSheet in scheduled-checks)
 * @param {string} fallback deterministic template narrative used if the draft fails validation
 */
export async function draftNarrative(facts, fallback) {
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: NARRATIVE_SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: NARRATIVE_SCHEMA } },
      messages: [{ role: "user", content: `Facts:\n${JSON.stringify(facts, null, 2)}` }],
    });
    if (response.stop_reason !== "end_turn") return { text: fallback, source: "template", reason: response.stop_reason };
    const { narrative } = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    const problem = validateNarrative(narrative, facts);
    if (problem) return { text: fallback, source: "template", reason: problem };
    return { text: narrative, source: "bedrock", model: MODEL };
  } catch (err) {
    console.error("narrative draft failed", err);
    return { text: fallback, source: "template", reason: "bedrock_error" };
  }
}

/** Every number in the narrative must appear in the facts; usage talk requires imported usage. */
export function validateNarrative(text, facts) {
  const factText = JSON.stringify(facts);
  const allowed = new Set((factText.match(/\d[\d,.]*/g) || []).map(normNum));
  for (const n of text.match(/\d[\d,.]*\d|\d/g) || []) {
    if (!allowed.has(normNum(n))) return `unsupported figure "${n}"`;
  }
  if (facts.usage?.status !== "imported" && /\b(active|inactive|logged in|unused|idle)\b/i.test(text) && !/unknown/i.test(text)) {
    return "usage language without imported usage data";
  }
  if (/\b(we|seatsignal) (will|has|have) (cancel|disable|remove|deprovision)/i.test(text)) return "claims automatic action";
  return null;
}
const normNum = (s) => String(s).replace(/,/g, "").replace(/\.0+$/, "").replace(/\.$/, "");
