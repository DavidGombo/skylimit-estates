import {
  Droplet, Zap, Flame, Plug, Building2, CloudRain, Home, Bug, Lock,
  Paintbrush, Trees, Sparkles, Wrench, type LucideIcon,
} from "lucide-react";

export const MAINT_CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Plumbing", electrical: "Electrical", heating_gas: "Heating & Gas",
  appliance: "Appliance", structural: "Structural", damp_mould: "Damp & Mould",
  roofing: "Roofing", pest: "Pest Control", locks_security: "Locks & Security",
  decorating: "Decorating", garden_exterior: "Garden & Exterior", cleaning: "Cleaning",
  other: "Other",
};

// Per-category icon + accent colour chip for visual identification of repair types.
export const MAINT_CATEGORY_META: Record<string, { icon: LucideIcon; chip: string; iconColor: string }> = {
  plumbing: { icon: Droplet, chip: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", iconColor: "text-blue-600 dark:text-blue-400" },
  electrical: { icon: Zap, chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", iconColor: "text-amber-600 dark:text-amber-400" },
  heating_gas: { icon: Flame, chip: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", iconColor: "text-orange-600 dark:text-orange-400" },
  appliance: { icon: Plug, chip: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300", iconColor: "text-violet-600 dark:text-violet-400" },
  structural: { icon: Building2, chip: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-300", iconColor: "text-stone-600 dark:text-stone-400" },
  damp_mould: { icon: CloudRain, chip: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300", iconColor: "text-cyan-600 dark:text-cyan-400" },
  roofing: { icon: Home, chip: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300", iconColor: "text-rose-600 dark:text-rose-400" },
  pest: { icon: Bug, chip: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300", iconColor: "text-lime-600 dark:text-lime-400" },
  locks_security: { icon: Lock, chip: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300", iconColor: "text-slate-600 dark:text-slate-400" },
  decorating: { icon: Paintbrush, chip: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300", iconColor: "text-pink-600 dark:text-pink-400" },
  garden_exterior: { icon: Trees, chip: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300", iconColor: "text-green-600 dark:text-green-400" },
  cleaning: { icon: Sparkles, chip: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300", iconColor: "text-teal-600 dark:text-teal-400" },
  other: { icon: Wrench, chip: "bg-muted text-muted-foreground", iconColor: "text-muted-foreground" },
};

export function maintCategoryMeta(cat: string) {
  return MAINT_CATEGORY_META[cat] || MAINT_CATEGORY_META.other;
}

// Parse the new aiAdvice JSON blob with backward-compat for old plain-string records.
export interface MaintAiAdvice {
  advice: string;
  likelyCauses: string[];
  trade: string;
  partsLikely: string[];
  estimatedCost: string;
  preventMeasures: string[];
}
export function parseAiAdvice(raw: string): MaintAiAdvice {
  const empty: MaintAiAdvice = { advice: "", likelyCauses: [], trade: "", partsLikely: [], estimatedCost: "", preventMeasures: [] };
  if (!raw) return empty;
  try {
    const o = JSON.parse(raw);
    if (o && typeof o === "object" && !Array.isArray(o)) {
      return {
        advice: typeof o.advice === "string" ? o.advice : "",
        likelyCauses: Array.isArray(o.likelyCauses) ? o.likelyCauses.filter((x: unknown) => typeof x === "string") : [],
        trade: typeof o.trade === "string" ? o.trade : "",
        partsLikely: Array.isArray(o.partsLikely) ? o.partsLikely.filter((x: unknown) => typeof x === "string") : [],
        estimatedCost: typeof o.estimatedCost === "string" ? o.estimatedCost : "",
        preventMeasures: Array.isArray(o.preventMeasures) ? o.preventMeasures.filter((x: unknown) => typeof x === "string") : [],
      };
    }
  } catch {
    // old records stored a plain string advice
  }
  return { ...empty, advice: raw };
}

export const PRIORITY_STYLE: Record<string, { label: string; chip: string }> = {
  low: { label: "Low", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  medium: { label: "Medium", chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  high: { label: "High", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  urgent: { label: "Urgent", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};

export const STATUS_STYLE: Record<string, { label: string; chip: string; dot: string }> = {
  open: { label: "Open", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", dot: "bg-red-500" },
  in_progress: { label: "In progress", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", dot: "bg-amber-500" },
  awaiting_parts: { label: "Awaiting parts", chip: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300", dot: "bg-purple-500" },
  completed: { label: "Completed", chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export const URGENCY_STYLE: Record<string, { label: string; chip: string }> = {
  routine: { label: "Routine", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  soon: { label: "Within a week", chip: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  urgent: { label: "Urgent (24-48h)", chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  emergency: { label: "Emergency", chip: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
};
