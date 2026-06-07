import OpenAI from "openai";

// Result shape returned to the client and stored on the certificate
export interface CertReview {
  outcome: "pass" | "advisory" | "fail" | "unknown";
  summary: string;
  recommendations: string[];
  extractedExpiry: string; // YYYY-MM-DD or ""
  extractedIssue: string;  // YYYY-MM-DD or ""
  provider: string;
  reference: string;
}

const CERT_LABELS: Record<string, string> = {
  gas_safety: "Gas Safety Certificate (CP12)",
  eicr: "Electrical Installation Condition Report (EICR)",
  epc: "Energy Performance Certificate (EPC)",
  pat: "Portable Appliance Testing (PAT) report",
  fire_risk: "Fire Risk Assessment",
  legionella: "Legionella Risk Assessment",
  smoke_co: "Smoke & CO Alarm check",
  insurance: "Landlord/Buildings Insurance document",
  other: "compliance document",
};

const SYSTEM = `You are a UK property compliance assistant for a temporary-accommodation / lettings business.
You review uploaded safety certificates and compliance documents for residential properties.
You understand UK regulations: Gas Safety (Installation and Use) Regulations 1998 (annual CP12),
Electrical Safety Standards in the Private Rented Sector 2020 (EICR every 5 years), EPC (minimum band E, MEES),
fire safety, PAT, legionella, smoke & CO alarm requirements.
Be precise, practical and cautious. Never invent findings that are not supported by the document text.
If the document text is unreadable or missing, say so and set outcome to "unknown".`;

function buildPrompt(certTypeLabel: string, docText: string): string {
  return `Review the following ${certTypeLabel}. Extract key facts and give compliance recommendations.

Return ONLY a JSON object with exactly these keys:
{
  "outcome": "pass" | "advisory" | "fail" | "unknown",
  "summary": "2-3 sentence plain-English summary of the document and its compliance status",
  "recommendations": ["actionable recommendation", "..."],
  "extractedExpiry": "YYYY-MM-DD or empty string",
  "extractedIssue": "YYYY-MM-DD or empty string",
  "provider": "issuing engineer/company name or empty string",
  "reference": "certificate/serial number or empty string"
}

Guidance:
- "outcome": "pass" if satisfactory/compliant with no required actions; "advisory" if compliant but with recommendations or minor items (e.g. EICR C3 codes); "fail" if there are dangerous/unsatisfactory findings requiring urgent action (e.g. gas "At Risk"/"Immediately Dangerous", EICR C1/C2 codes, expired); "unknown" if you cannot tell.
- "recommendations": concrete next steps for the landlord (e.g. "Arrange remedial work for C2 coded item in consumer unit", "Renew before 14/04/2027"). Empty array if none.
- Dates must be ISO YYYY-MM-DD. If only the expiry/next-due date is present, fill extractedExpiry.

Document text:
"""
${docText.slice(0, 18000)}
"""`;
}

export async function reviewCertificate(opts: {
  certType: string;
  pdfText?: string;
  imageBase64?: string;
  imageMime?: string;
}): Promise<CertReview> {
  const label = CERT_LABELS[opts.certType] || CERT_LABELS.other;
  const client = new OpenAI();

  let inputContent: any;
  if (opts.imageBase64) {
    // Vision: send the image plus instructions
    inputContent = [
      {
        role: "user",
        content: [
          { type: "input_text", text: buildPrompt(label, "(see attached image of the certificate)") },
          { type: "input_image", image_url: `data:${opts.imageMime || "image/jpeg"};base64,${opts.imageBase64}` },
        ],
      },
    ];
  } else {
    inputContent = buildPrompt(label, opts.pdfText || "");
  }

  const response = await client.responses.create({
    model: "gpt_5_1",
    instructions: SYSTEM,
    input: inputContent,
  });

  const text = (response as any).output_text ?? "";
  return parseReview(text);
}

function parseReview(raw: string): CertReview {
  const fallback: CertReview = {
    outcome: "unknown", summary: "Could not interpret the document.",
    recommendations: [], extractedExpiry: "", extractedIssue: "", provider: "", reference: "",
  };
  if (!raw) return fallback;
  let jsonStr = raw.trim();
  const fence = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1);
  try {
    const o = JSON.parse(jsonStr);
    return {
      outcome: ["pass", "advisory", "fail", "unknown"].includes(o.outcome) ? o.outcome : "unknown",
      summary: typeof o.summary === "string" ? o.summary : "",
      recommendations: Array.isArray(o.recommendations) ? o.recommendations.filter((x: unknown) => typeof x === "string") : [],
      extractedExpiry: typeof o.extractedExpiry === "string" ? o.extractedExpiry : "",
      extractedIssue: typeof o.extractedIssue === "string" ? o.extractedIssue : "",
      provider: typeof o.provider === "string" ? o.provider : "",
      reference: typeof o.reference === "string" ? o.reference : "",
    };
  } catch {
    return { ...fallback, summary: raw.slice(0, 500) };
  }
}
