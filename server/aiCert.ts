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
export interface FraRec { action: string; priority: "low" | "medium" | "high"; timeLimitDays: number | null; }

export interface CertReview {
  outcome: "pass" | "advisory" | "fail" | "unknown";
  summary: string;
  recommendations: string[];
  extractedExpiry: string; // YYYY-MM-DD or ""
  extractedIssue: string;  // YYYY-MM-DD or ""
  provider: string;
  reference: string;
  // EPC-specific
  epcRating: string; // A–G or ""
  epcScore: number;  // 0 if unknown
  // HMO licence-specific
  licenceNumber: string;
  licenceCouncil: string;
  maxOccupants: number;
  // FRA-specific: structured recommendations with time limits
  fraActions: FraRec[];
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
  hmo_licence: "HMO Licence",
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
  "reference": "certificate/serial number or empty string",
  "epcRating": "single letter A-G if this is an EPC, else empty string",
  "epcScore": "SAP energy efficiency score 1-100 if this is an EPC, else 0",
  "licenceNumber": "HMO licence number if this is an HMO licence, else empty string",
  "licenceCouncil": "issuing council/local authority if this is an HMO licence, else empty string",
  "maxOccupants": "maximum permitted occupants/persons if stated on an HMO licence, else 0",
  "fraActions": [{"action": "specific remedial action", "priority": "low|medium|high", "timeLimitDays": number of days to complete or null}]
}

Guidance:
- "outcome": "pass" if satisfactory/compliant with no required actions; "advisory" if compliant but with recommendations or minor items (e.g. EICR C3 codes); "fail" if there are dangerous/unsatisfactory findings requiring urgent action (e.g. gas "At Risk"/"Immediately Dangerous", EICR C1/C2 codes, expired); "unknown" if you cannot tell.
- "recommendations": concrete next steps for the landlord (e.g. "Arrange remedial work for C2 coded item in consumer unit", "Renew before 14/04/2027"). Empty array if none.
- Dates must be ISO YYYY-MM-DD. If only the expiry/next-due date is present, fill extractedExpiry. For an EPC the expiry is typically 10 years from issue; for an HMO licence use the licence expiry date.
- "epcRating"/"epcScore": ONLY fill for an EPC. The rating is the current energy efficiency band (A best to G worst); the score is the SAP points.
- "licenceNumber"/"licenceCouncil"/"maxOccupants": ONLY fill for an HMO licence.
- "fraActions": ONLY fill for a Fire Risk Assessment. Each significant finding/recommendation becomes one action with a realistic priority and a stated or sensible time limit in days (e.g. urgent fire-door defect = high, ~7 days; signage = low, ~90 days). Use null for timeLimitDays only if truly open-ended. Empty array for non-FRA documents.

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
  // Enhanced fields
  likelyCauses: string[];
  trade: string;          // e.g. "Gas Safe engineer", "Plumber"
  partsLikely: string[];  // parts/materials likely needed
  estimatedCost: string;  // rough GBP range, e.g. "£80–£150"
  preventMeasures: string[]; // how to prevent recurrence
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

Provide thorough troubleshooting guidance. Return ONLY a JSON object with exactly these keys:
{
  "diagnosis": "1-2 sentences on the single most likely cause",
  "likelyCauses": ["other plausible cause", "..."],
  "steps": ["ordered, concrete troubleshooting/triage step", "..."],
  "urgency": "routine" | "soon" | "urgent" | "emergency",
  "trade": "the trade/professional best suited (e.g. Gas Safe engineer, Plumber, Electrician, Roofer, Handyman)",
  "partsLikely": ["part or material likely needed", "..."],
  "estimatedCost": "rough typical UK cost range in GBP for this repair, e.g. £80–£150",
  "preventMeasures": ["how to prevent this recurring", "..."],
  "advice": "when to call a qualified professional, any safety warnings"
}

Guidance:
- "urgency": "emergency" = immediate danger (gas smell, electrical burning, major leak/flood, no heating in freezing weather for vulnerable tenants); "urgent" = within 24-48h; "soon" = within a week; "routine" = can be scheduled.
- For gas: always advise to turn off at the meter if a gas smell and call the National Gas Emergency line 0800 111 999 and a Gas Safe engineer; do not DIY.
- For electrical hazards: advise isolating the circuit and calling a qualified electrician.
- Steps should be things the manager or tenant can safely check first (e.g. "Check the boiler pressure gauge reads 1-1.5 bar").
- Cost estimate should reflect typical UK contractor pricing including a call-out where relevant. Keep it a range.`;

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    instructions: MAINT_SYSTEM,
    input: prompt,
  });
  const text = (response as any).output_text ?? "";
  return parseMaint(text);
}

function parseMaint(raw: string): MaintReview {
  const fallback: MaintReview = { diagnosis: "Could not generate guidance.", steps: [], urgency: "routine", advice: "", likelyCauses: [], trade: "", partsLikely: [], estimatedCost: "", preventMeasures: [] };
  if (!raw) return fallback;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  const arr = (x: unknown) => Array.isArray(x) ? x.filter((y) => typeof y === "string") : [];
  try {
    const o = JSON.parse(s);
    return {
      diagnosis: typeof o.diagnosis === "string" ? o.diagnosis : "",
      steps: arr(o.steps),
      urgency: ["routine", "soon", "urgent", "emergency"].includes(o.urgency) ? o.urgency : "routine",
      advice: typeof o.advice === "string" ? o.advice : "",
      likelyCauses: arr(o.likelyCauses),
      trade: typeof o.trade === "string" ? o.trade : "",
      partsLikely: arr(o.partsLikely),
      estimatedCost: typeof o.estimatedCost === "string" ? o.estimatedCost : "",
      preventMeasures: arr(o.preventMeasures),
    };
  } catch {
    return { ...fallback, diagnosis: raw.slice(0, 500) };
  }
}

// ---------------------------------------------------------------------------
// Tenancy agreement extraction — pull key fields for review-then-confirm
// ---------------------------------------------------------------------------
export interface TenancyExtract {
  tenantName: string;
  monthlyRent: number; // pounds (decimal), 0 if unknown
  tenancyStart: string; // YYYY-MM-DD
  tenancyEnd: string;   // YYYY-MM-DD
  depositAmount: number; // pounds
  depositScheme: string;
  landlord: string;
  propertyAddress: string;
  summary: string;
}

export async function extractTenancy(opts: { pdfText?: string; imageBase64?: string; imageMime?: string }): Promise<TenancyExtract> {
  const client = makeClient();
  const instructions = `You are a UK lettings assistant. You read Assured Shorthold Tenancy (AST) and licence agreements and extract the key terms accurately. Never invent values; leave blank/0 if not present.`;
  const promptText = `Extract the key terms from this tenancy/licence agreement. Return ONLY a JSON object with exactly these keys:
{
  "tenantName": "primary tenant full name or empty",
  "monthlyRent": monthly rent as a number in GBP (convert weekly rent to monthly = weekly*52/12) or 0,
  "tenancyStart": "YYYY-MM-DD start date or empty",
  "tenancyEnd": "YYYY-MM-DD end date or empty",
  "depositAmount": deposit as a number in GBP or 0,
  "depositScheme": "deposit scheme name (DPS / MyDeposits / TDS) or empty",
  "landlord": "landlord name or empty",
  "propertyAddress": "property address or empty",
  "summary": "1-2 sentence plain summary of the agreement"
}`;
  let input: any;
  if (opts.imageBase64) {
    input = [{ role: "user", content: [ { type: "input_text", text: promptText + "\n\n(see attached image of the agreement)" }, { type: "input_image", image_url: `data:${opts.imageMime || "image/jpeg"};base64,${opts.imageBase64}` } ] }];
  } else {
    input = `${promptText}\n\nDocument text:\n"""\n${(opts.pdfText || "").slice(0, 18000)}\n"""`;
  }
  const response = await client.responses.create({ model: process.env.OPENAI_MODEL || "gpt-4o", instructions, input });
  const text = (response as any).output_text ?? "";
  return parseTenancy(text);
}

function parseTenancy(raw: string): TenancyExtract {
  const fallback: TenancyExtract = { tenantName: "", monthlyRent: 0, tenancyStart: "", tenancyEnd: "", depositAmount: 0, depositScheme: "", landlord: "", propertyAddress: "", summary: "" };
  if (!raw) return fallback;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try {
    const o = JSON.parse(s);
    const num = (x: unknown) => Number.isFinite(Number(x)) ? Number(x) : 0;
    return {
      tenantName: typeof o.tenantName === "string" ? o.tenantName : "",
      monthlyRent: num(o.monthlyRent),
      tenancyStart: typeof o.tenancyStart === "string" ? o.tenancyStart : "",
      tenancyEnd: typeof o.tenancyEnd === "string" ? o.tenancyEnd : "",
      depositAmount: num(o.depositAmount),
      depositScheme: typeof o.depositScheme === "string" ? o.depositScheme : "",
      landlord: typeof o.landlord === "string" ? o.landlord : "",
      propertyAddress: typeof o.propertyAddress === "string" ? o.propertyAddress : "",
      summary: typeof o.summary === "string" ? o.summary : "",
    };
  } catch {
    return { ...fallback, summary: raw.slice(0, 300) };
  }
}

function parseReview(raw: string): CertReview {
  const fallback: CertReview = {
    outcome: "unknown", summary: "Could not interpret the document.",
    recommendations: [], extractedExpiry: "", extractedIssue: "", provider: "", reference: "",
    epcRating: "", epcScore: 0, licenceNumber: "", licenceCouncil: "", maxOccupants: 0, fraActions: [],
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
      epcRating: typeof o.epcRating === "string" ? o.epcRating.toUpperCase().slice(0, 1).replace(/[^A-G]/, "") : "",
      epcScore: Number.isFinite(Number(o.epcScore)) ? Math.round(Number(o.epcScore)) : 0,
      licenceNumber: typeof o.licenceNumber === "string" ? o.licenceNumber : "",
      licenceCouncil: typeof o.licenceCouncil === "string" ? o.licenceCouncil : "",
      maxOccupants: Number.isFinite(Number(o.maxOccupants)) ? Math.round(Number(o.maxOccupants)) : 0,
      fraActions: Array.isArray(o.fraActions) ? o.fraActions.map((a: any) => ({
        action: typeof a?.action === "string" ? a.action : "",
        priority: ["low", "medium", "high"].includes(a?.priority) ? a.priority : "medium",
        timeLimitDays: Number.isFinite(Number(a?.timeLimitDays)) ? Math.round(Number(a.timeLimitDays)) : null,
      })).filter((a: FraRec) => a.action) : [],
    };
  } catch {
    return { ...fallback, summary: raw.slice(0, 500) };
  }
}
