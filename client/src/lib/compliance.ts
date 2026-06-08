import type { Certificate } from "@shared/schema";

export const CERT_META: Record<string, { label: string; validityMonths: number | null }> = {
  gas_safety: { label: "Gas Safety (CP12)", validityMonths: 12 },
  eicr: { label: "EICR (Electrical)", validityMonths: 60 },
  epc: { label: "EPC", validityMonths: 120 },
  pat: { label: "PAT Testing", validityMonths: 12 },
  fire_risk: { label: "Fire Risk Assessment", validityMonths: 12 },
  legionella: { label: "Legionella Assessment", validityMonths: 24 },
  smoke_co: { label: "Smoke & CO Alarms", validityMonths: 12 },
  insurance: { label: "Landlord Insurance", validityMonths: 12 },
  hmo_licence: { label: "HMO Licence", validityMonths: 60 },
  other: { label: "Other", validityMonths: null },
};

// EPC rating band colours (A best → G worst)
export const EPC_BAND_STYLE: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-green-500 text-white",
  C: "bg-lime-500 text-white",
  D: "bg-yellow-400 text-black",
  E: "bg-amber-500 text-white",
  F: "bg-orange-500 text-white",
  G: "bg-red-600 text-white",
};

// Shared priority chip styling for FRA actions (low | medium | high)
export const FRA_PRIORITY_STYLE: Record<string, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  high: { label: "High", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

export function certLabel(c: Pick<Certificate, "certType" | "title">): string {
  if (c.certType === "other" && c.title) return c.title;
  return CERT_META[c.certType]?.label || c.title || "Certificate";
}

export type ComplianceStatus = "valid" | "expiring" | "overdue" | "no_date";

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Expiring window: 30 days
export function statusOf(c: Pick<Certificate, "expiryDate">): ComplianceStatus {
  const d = daysUntil(c.expiryDate);
  if (d === null) return "no_date";
  if (d < 0) return "overdue";
  if (d <= 30) return "expiring";
  return "valid";
}

export const STATUS_STYLE: Record<ComplianceStatus, { label: string; chip: string; dot: string }> = {
  valid: { label: "Valid", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  expiring: { label: "Expiring soon", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  overdue: { label: "Overdue", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  no_date: { label: "No expiry set", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export const OUTCOME_STYLE: Record<string, { label: string; chip: string }> = {
  pass: { label: "Pass", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  advisory: { label: "Advisory", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  fail: { label: "Action needed", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  unknown: { label: "Unclear", chip: "bg-muted text-muted-foreground" },
};

export function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// add months to a YYYY-MM-DD date string -> YYYY-MM-DD (minus 1 day for "valid until")
export function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
