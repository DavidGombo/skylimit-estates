import { useQuery, useQueries } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Property, Statement, Certificate, MaintenanceJob, FraAction, Utility, RentalRow, DisbursementRow } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { computeTotals, gbp } from "@/lib/statement";
import { statusOf, certLabel, daysUntil, STATUS_STYLE as CERT_STATUS, FRA_PRIORITY_STYLE } from "@/lib/compliance";
import { STATUS_STYLE as JOB_STATUS, MAINT_CATEGORY_LABELS } from "@/lib/maintenance";
import { UTILITY_LABELS } from "@shared/schema";
import { Building2, ShieldAlert, Wrench, PoundSterling, ChevronRight, ShieldCheck, ShieldX, Plug, Flame } from "lucide-react";

type UtilityRow = Utility & { propertyAddress: string; roomName: string };

function parseRows<T>(j: string): T[] { try { return JSON.parse(j) as T[]; } catch { return []; } }

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: statements } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });
  const { data: certs } = useQuery<Certificate[]>({ queryKey: ["/api/certificates"] });
  const { data: jobs } = useQuery<MaintenanceJob[]>({ queryKey: ["/api/maintenance"] });
  const { data: utilities } = useQuery<UtilityRow[]>({ queryKey: ["/api/utilities"] });

  const propCount = properties?.length ?? 0;

  // utilities renewals due within 30 days
  const utilRenewals = (utilities ?? [])
    .map((u) => ({ u, d: u.renewalDate ? daysUntil(u.renewalDate) : null }))
    .filter((x) => x.d !== null && x.d <= 30)
    .sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999));

  // open fire-safety (FRA) actions across all properties
  const fraQueries = useQueries({
    queries: (properties ?? []).map((p) => ({
      queryKey: ["/api/properties", p.id, "fra-actions"] as const,
      enabled: (properties?.length ?? 0) > 0,
    })),
  });
  const openFra = fraQueries
    .flatMap((q, i) => ((q.data as FraAction[] | undefined) ?? []).map((a) => ({ ...a, _prop: (properties ?? [])[i] })))
    .filter((a) => a.status !== "done")
    .sort((a, b) => (daysUntil(a.dueDate) ?? 99999) - (daysUntil(b.dueDate) ?? 99999));

  // compliance counts
  let valid = 0, expiring = 0, overdue = 0;
  const certAttention: { c: Certificate; d: number | null; s: string }[] = [];
  (certs ?? []).forEach((c) => {
    const s = statusOf(c);
    if (s === "valid") valid++;
    else if (s === "expiring") { expiring++; certAttention.push({ c, d: daysUntil(c.expiryDate), s }); }
    else if (s === "overdue") { overdue++; certAttention.push({ c, d: daysUntil(c.expiryDate), s }); }
  });
  certAttention.sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999));

  // maintenance counts
  const openJobs = (jobs ?? []).filter((j) => j.status !== "completed" && j.status !== "cancelled");

  // finance: latest statement profit + sum of transferable across all statements
  const totalTransferable = (statements ?? []).reduce((sum, s) => {
    const t = computeTotals({
      rentalRows: parseRows<RentalRow>(s.rentalRows),
      disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
      managementFeePercent: s.managementFeePercent,
      managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
    });
    return sum + t.profitTransferable;
  }, 0);

  const propName = (id: number) => properties?.find((p) => p.id === id)?.propertyAddress || "Property";

  return (
    <AppShell title="Dashboard">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <HubStat label="Properties" count={propCount} icon={Building2} tone="neutral" onClick={() => navigate("/properties")} />
        <HubStat label="Compliance overdue" count={overdue} icon={ShieldX} tone={overdue ? "bad" : "neutral"} onClick={() => navigate("/compliance")} />
        <HubStat label="Expiring soon" count={expiring} icon={ShieldAlert} tone={expiring ? "warn" : "neutral"} onClick={() => navigate("/compliance")} />
        <HubStat label="Open maintenance" count={openJobs.length} icon={Wrench} tone={openJobs.length ? "warn" : "neutral"} onClick={() => navigate("/maintenance")} />
        <HubStat label="Renewals due ≤30d" count={utilRenewals.length} icon={Plug} tone={utilRenewals.length ? "warn" : "neutral"} onClick={() => navigate("/utilities")} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Compliance attention */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Compliance needing attention</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/compliance")} data-testid="link-all-compliance">View all</button>
          </div>
          {certAttention.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{(certs?.length ?? 0) === 0 ? "No certificates added yet." : "All certificates valid. Nothing due."}</p>
          ) : (
            <div className="space-y-2">
              {certAttention.slice(0, 5).map(({ c, d, s }) => {
                const ss = CERT_STATUS[s as keyof typeof CERT_STATUS];
                return (
                  <button key={c.id} onClick={() => navigate(`/property/${c.propertyId}`)} className="w-full flex items-center gap-2.5 rounded-lg p-2 text-left hover-elevate" data-testid={`dash-cert-${c.id}`}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${ss.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{certLabel(c)} — {propName(c.propertyId)}</p>
                      <p className="text-xs text-muted-foreground">{s === "overdue" ? `Overdue by ${Math.abs(d ?? 0)} days` : `Due in ${d} days`}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Open maintenance */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Open maintenance</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/maintenance")} data-testid="link-all-maintenance">View all</button>
          </div>
          {openJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open maintenance jobs.</p>
          ) : (
            <div className="space-y-2">
              {openJobs.slice(0, 5).map((j) => {
                const ss = JOB_STATUS[j.status] || JOB_STATUS.open;
                return (
                  <button key={j.id} onClick={() => navigate(`/property/${j.propertyId}`)} className="w-full flex items-center gap-2.5 rounded-lg p-2 text-left hover-elevate" data-testid={`dash-job-${j.id}`}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${ss.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{j.title || MAINT_CATEGORY_LABELS[j.category]} — {propName(j.propertyId)}</p>
                      <p className="text-xs text-muted-foreground">{MAINT_CATEGORY_LABELS[j.category]} · {ss.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Fire-safety to-dos */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Flame className="h-4 w-4 text-primary" /> Fire-safety to-dos</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/compliance")} data-testid="link-all-fra">View all</button>
          </div>
          {openFra.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open fire-safety actions. You're all caught up.</p>
          ) : (
            <div className="space-y-2">
              {openFra.slice(0, 5).map((a) => {
                const fp = FRA_PRIORITY_STYLE[a.priority] || FRA_PRIORITY_STYLE.medium;
                const d = daysUntil(a.dueDate);
                const isOverdue = d !== null && d < 0;
                return (
                  <button key={a.id} onClick={() => navigate(`/property/${a.propertyId}`)} className="w-full flex items-center gap-2.5 rounded-lg p-2 text-left hover-elevate" data-testid={`dash-fra-${a.id}`}>
                    <Flame className="h-4 w-4 text-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.action} — {a._prop?.propertyAddress || "Property"}</p>
                      <p className="text-xs text-muted-foreground">
                        {fp.label}{d !== null && <span className={isOverdue ? "text-destructive font-medium" : ""}> · {isOverdue ? `${Math.abs(d)}d overdue` : `${d}d left`}</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Utilities renewals due */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /> Utilities renewals due</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/utilities")} data-testid="link-all-utilities">View all</button>
          </div>
          {utilRenewals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{(utilities?.length ?? 0) === 0 ? "No utilities recorded yet." : "No renewals due in the next 30 days."}</p>
          ) : (
            <div className="space-y-2">
              {utilRenewals.slice(0, 5).map(({ u, d }) => {
                const isOverdue = d !== null && d < 0;
                return (
                  <button key={u.id} onClick={() => navigate("/utilities")} className="w-full flex items-center gap-2.5 rounded-lg p-2 text-left hover-elevate" data-testid={`dash-util-${u.id}`}>
                    <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{UTILITY_LABELS[u.utilityType] || u.utilityType} — {u.propertyAddress}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.provider || "Renewal"}{d !== null && <span className={isOverdue ? "text-destructive font-medium" : ""}> · {isOverdue ? `${Math.abs(d)}d overdue` : `${d}d left`}</span>}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Finance snapshot */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><PoundSterling className="h-4 w-4 text-primary" /> Finance</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/finance")} data-testid="link-all-finance">View all</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-bold text-primary tabular-nums">{gbp(totalTransferable)}</p>
              <p className="text-xs text-muted-foreground">Total transferable (all statements)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{statements?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Statements produced</p>
            </div>
          </div>
        </section>

        {/* Properties quick list */}
        <section className="rounded-xl border border-card-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Properties</h2>
            <button className="text-xs text-primary font-medium" onClick={() => navigate("/properties")} data-testid="link-all-properties">View all</button>
          </div>
          {propCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No properties yet.</p>
          ) : (
            <div className="space-y-2">
              {properties!.slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => navigate(`/property/${p.id}`)} className="w-full flex items-center gap-2.5 rounded-lg p-2 text-left hover-elevate" data-testid={`dash-prop-${p.id}`}>
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate flex-1">{p.propertyAddress}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
