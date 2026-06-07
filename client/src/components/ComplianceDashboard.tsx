import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Certificate, Property } from "@shared/schema";
import { certLabel, statusOf, daysUntil, fmtDate, STATUS_STYLE } from "@/lib/compliance";
import { ShieldCheck, ShieldAlert, ShieldX, ChevronRight } from "lucide-react";

export function ComplianceDashboard({ properties }: { properties: Property[] }) {
  const [, navigate] = useLocation();
  const { data: certs, isLoading } = useQuery<Certificate[]>({ queryKey: ["/api/certificates"] });

  if (isLoading) return <div className="h-28 rounded-xl bg-muted animate-pulse" />;
  if (!certs || certs.length === 0) return null; // nothing to show until certs exist

  const propName = (id: number) => properties.find((p) => p.id === id)?.propertyAddress || "Property";

  let valid = 0, expiring = 0, overdue = 0;
  const attention: { cert: Certificate; status: string; days: number | null }[] = [];
  for (const c of certs) {
    const s = statusOf(c);
    if (s === "valid") valid++;
    else if (s === "expiring") { expiring++; attention.push({ cert: c, status: s, days: daysUntil(c.expiryDate) }); }
    else if (s === "overdue") { overdue++; attention.push({ cert: c, status: s, days: daysUntil(c.expiryDate) }); }
  }
  // sort attention: overdue first (most overdue), then soonest expiring
  attention.sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  const cards = [
    { label: "Valid", count: valid, icon: ShieldCheck, cls: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
    { label: "Expiring soon", count: expiring, icon: ShieldAlert, cls: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20" },
    { label: "Overdue", count: overdue, icon: ShieldX, cls: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
  ];

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Compliance overview</h2>
        <p className="text-sm text-muted-foreground">Certificate status across all your properties.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border border-card-border p-4 ${c.bg}`} data-testid={`stat-${c.label.replace(/\s/g, "-").toLowerCase()}`}>
            <div className="flex items-center gap-2">
              <c.icon className={`h-5 w-5 ${c.cls}`} />
              <span className={`text-2xl font-bold tabular-nums ${c.cls}`}>{c.count}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card divide-y divide-border">
          {attention.slice(0, 6).map(({ cert, status, days }) => {
            const ss = STATUS_STYLE[status as keyof typeof STATUS_STYLE];
            return (
              <button
                key={cert.id}
                onClick={() => navigate(`/property/${cert.propertyId}`)}
                className="w-full flex items-center gap-3 p-3.5 text-left hover-elevate first:rounded-t-xl last:rounded-b-xl"
                data-testid={`attention-cert-${cert.id}`}
              >
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ss.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{certLabel(cert)} — {propName(cert.propertyId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {status === "overdue" ? `Overdue by ${Math.abs(days ?? 0)} days` : `Due in ${days} days`} · expires {fmtDate(cert.expiryDate)}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`}>{ss.label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
