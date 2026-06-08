import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export type HubStatTone = "neutral" | "good" | "warn" | "bad";

const TONE: Record<HubStatTone, { bg: string; text: string }> = {
  neutral: { bg: "bg-card", text: "text-primary" },
  good: { bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-600 dark:text-emerald-400" },
  warn: { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400" },
  bad: { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600 dark:text-red-400" },
};

export function HubStat({
  label, count, icon: Icon, tone = "neutral", onClick, testId,
}: {
  label: string;
  count: string | number;
  icon: LucideIcon;
  tone?: HubStatTone;
  onClick?: () => void;
  testId?: string;
}) {
  const t = TONE[tone];
  const tid = testId ?? `stat-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "")}`;
  const body = (
    <>
      <div className="flex items-center justify-between">
        <Icon className={`h-5 w-5 ${t.text}`} />
        {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      <p className={`text-2xl font-bold mt-2 tabular-nums ${t.text}`}>{count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </>
  );
  const cls = `rounded-xl border border-card-border p-4 ${t.bg}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-testid={tid} className={`${cls} text-left hover-elevate`}>
        {body}
      </button>
    );
  }
  return <div data-testid={tid} className={cls}>{body}</div>;
}
