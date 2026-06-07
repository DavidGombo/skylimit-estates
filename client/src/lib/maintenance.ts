export const MAINT_CATEGORY_LABELS: Record<string, string> = {
  plumbing: "Plumbing", electrical: "Electrical", heating_gas: "Heating & Gas",
  appliance: "Appliance", structural: "Structural", damp_mould: "Damp & Mould",
  roofing: "Roofing", pest: "Pest Control", locks_security: "Locks & Security",
  decorating: "Decorating", garden_exterior: "Garden & Exterior", cleaning: "Cleaning",
  other: "Other",
};

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
