import OpenAI from "openai";

// Build an OpenAI client. In the Perplexity sandbox, HTTPS_PROXY points to the
// agent proxy which injects the real Authorization header, so we route through
// it and use a placeholder key. In production (Railway) there is no proxy and
// OPENAI_API_KEY holds the real key.
function makeClient(): OpenAI {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy) {
    // Sandbox only: route through the agent proxy via undici if available.
    // Wrapped in try/catch and an indirect require so production bundles
    // (which have no proxy and may not include undici) never hard-fail.
    try {
      const req = eval("require") as NodeRequire;
      const { ProxyAgent, fetch: undiciFetch } = req("undici");
      const dispatcher = new ProxyAgent(proxy);
      const proxyFetch = (url: any, init: any = {}) => undiciFetch(url, { ...init, dispatcher });
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "proxy", fetch: proxyFetch as any });
    } catch {
      // fall through to the standard client
    }
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

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
  const client = makeClient();

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
    model: process.env.OPENAI_MODEL || "gpt-4o",
    instructions: SYSTEM,
    input: inputContent,
  });

  const text = (response as any).output_text ?? "";
  return parseReview(text);
}

// ---------------------------------------------------------------------------
// Maintenance troubleshooting
// ---------------------------------------------------------------------------
export interface MaintReview {
  diagnosis: string;
  steps: string[];
  urgency: "routine" | "soon" | "urgent" | "emergency";
  advice: string;
}

const MAINT_LABELS: Record<string, string> = {
  plumbing: "plumbing", electrical: "electrical", heating_gas: "heating/gas",
  appliance: "appliance", structural: "structural", damp_mould: "damp & mould",
  roofing: "roofing", pest: "pest control", locks_security: "locks & security",
  decorating: "decorating", garden_exterior: "garden & exterior", cleaning: "cleaning", other: "general",
};

const MAINT_SYSTEM = `You are a UK property maintenance assistant for a lettings / temporary-accommodation business.
A property manager logs a maintenance issue and you provide practical, safe, step-by-step troubleshooting.
You are pragmatic and safety-first. For gas, electrical, structural or anything dangerous, you tell them to stop and call a qualified professional (Gas Safe registered engineer for gas, qualified electrician for electrics).
Never advise unsafe DIY. Keep steps concrete and ordered.`;

export async function troubleshootMaintenance(opts: {
  category: string; title: string; description: string;
}): Promise<MaintReview> {
  const client = makeClient();
  const cat = MAINT_LABELS[opts.category] || "general";
  const prompt = `A ${cat} maintenance issue has been logged at a rental property.
Title: ${opts.title || "(none)"}
Description: ${opts.description || "(none)"}

Provide troubleshooting guidance. Return ONLY a JSON object with exactly these keys:
{
  "diagnosis": "1-2 sentences on the likely cause(s)",
  "steps": ["ordered, concrete troubleshooting/triage step", "..."],
  "urgency": "routine" | "soon" | "urgent" | "emergency",
  "advice": "when to call a qualified professional, any safety warnings, and likely trade needed"
}

Guidance:
- "urgency": "emergency" = immediate danger (gas smell, electrical burning, major leak/flood, no heating in freezing weather for vulnerable tenants); "urgent" = within 24-48h; "soon" = within a week; "routine" = can be scheduled.
- For gas: always advise to turn off at the meter if a gas smell and call the National Gas Emergency line 0800 111 999 and a Gas Safe engineer; do not DIY.
- For electrical hazards: advise isolating the circuit and calling a qualified electrician.
- Steps should be things the manager or tenant can safely check first (e.g. "Check the boiler pressure gauge reads 1-1.5 bar").`;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    instructions: MAINT_SYSTEM,
    input: prompt,
  });
  const text = (response as any).output_text ?? "";
  return parseMaint(text);
}

function parseMaint(raw: string): MaintReview {
  const fallback: MaintReview = { diagnosis: "Could not generate guidance.", steps: [], urgency: "routine", advice: "" };
  if (!raw) return fallback;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s);
    return {
      diagnosis: typeof o.diagnosis === "string" ? o.diagnosis : "",
      steps: Array.isArray(o.steps) ? o.steps.filter((x: unknown) => typeof x === "string") : [],
      urgency: ["routine", "soon", "urgent", "emergency"].includes(o.urgency) ? o.urgency : "routine",
      advice: typeof o.advice === "string" ? o.advice : "",
    };
  } catch {
    return { ...fallback, diagnosis: raw.slice(0, 500) };
  }
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
