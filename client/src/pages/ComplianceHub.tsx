import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Certificate, Property } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { certLabel, statusOf, daysUntil, fmtDate, STATUS_STYLE, OUTCOME_STYLE } from "@/lib/compliance";
import { ShieldCheck, ShieldAlert, ShieldX, ChevronRight } from "lucide-react";

export default function ComplianceHub() {
  const [, navigate] = useLocation();
  const { data: certs, isLoading } = useQuery<Certificate[]>({ queryKey: ["/api/certificates"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const propName = (id: number) => properties?.find((p) => p.id === id)?.propertyAddress || "Property";

  let valid = 0, expiring = 0, overdue = 0;
  (certs ?? []).forEach((c) => { const s = statusOf(c); if (s === "valid") valid++; else if (s === "expiring") expiring++; else if (s === "overdue") overdue++; });

  const cards = [
    { label: "Valid", count: valid, icon: ShieldCheck, cls: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Expiring soon", count: expiring, icon: ShieldAlert, cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Overdue", count: overdue, icon: ShieldX, cls: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
  ];

  const sorted = [...(certs ?? [])].sort((a, b) => {
    const da = daysUntil(a.expiryDate) ?? 99999, db = daysUntil(b.expiryDate) ?? 99999;
    return da - db;
  });

  return (
    <AppShell title="Compliance">
      <div className="grid grid-cols-3 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border border-card-border p-4 ${c.bg}`}>
            <div className="flex items-center gap-2">
              <c.icon className={`h-5 w-5 ${c.cls}`} />
              <span className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.count}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && (certs?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No certificates yet</p>
          <p className="text-sm text-muted-foreground">Open a property to add and AI-check compliance certificates.</p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card divide-y divide-border">
          {sorted.map((c) => {
            const s = statusOf(c); const ss = STATUS_STYLE[s]; const d = daysUntil(c.expiryDate);
            return (
              <button key={c.id} onClick={() => navigate(`/property/${c.propertyId}`)} className="w-full flex items-center gap-3 p-4 text-left hover-elevate first:rounded-t-xl last:rounded-b-xl" data-testid={`hub-cert-${c.id}`}>
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ss.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{certLabel(c)}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`}>{ss.label}</span>
                    {c.aiOutcome && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLE[c.aiOutcome]?.chip || ""}`}>AI: {OUTCOME_STYLE[c.aiOutcome]?.label}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {propName(c.propertyId)} · expires {fmtDate(c.expiryDate)}
                    {d !== null && s !== "valid" && s !== "no_date" && <span> · {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}</span>}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
