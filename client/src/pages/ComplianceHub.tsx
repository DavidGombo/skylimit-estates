import { useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Certificate, Property, FraAction } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { certLabel, statusOf, daysUntil, fmtDate, STATUS_STYLE, OUTCOME_STYLE, FRA_PRIORITY_STYLE } from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, ShieldX, ChevronRight, ChevronDown, Flame, Archive, RotateCcw, Building2 } from "lucide-react";

export default function ComplianceHub() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: certs, isLoading } = useQuery<Certificate[]>({ queryKey: ["/api/certificates"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const propName = (id: number) => properties?.find((p) => p.id === id)?.propertyAddress || "Property";

  const [showHistory, setShowHistory] = useState(false);

  const archiveMut = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: number }) => apiRequest("PUT", `/api/certificates/${id}`, { archived }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/certificates"] }); toast({ title: "Compliance updated" }); },
    onError: () => toast({ title: "Could not update", variant: "destructive" }),
  });

  const all = certs ?? [];
  const active = all.filter((c) => c.archived !== 1);
  const archived = all.filter((c) => c.archived === 1);

  // Stat counts over ACTIVE certs only
  let valid = 0, expiring = 0, overdue = 0;
  active.forEach((c) => { const s = statusOf(c); if (s === "valid") valid++; else if (s === "expiring") expiring++; else if (s === "overdue") overdue++; });

  // Group active certs by property, each property's certs sorted by soonest expiry
  const byProperty = new Map<number, Certificate[]>();
  for (const c of active) {
    const arr = byProperty.get(c.propertyId) ?? [];
    arr.push(c); byProperty.set(c.propertyId, arr);
  }
  const propGroups = Array.from(byProperty.entries())
    .map(([pid, list]) => ({
      pid,
      name: propName(pid),
      certs: [...list].sort((a, b) => (daysUntil(a.expiryDate) ?? 99999) - (daysUntil(b.expiryDate) ?? 99999)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const archivedSorted = [...archived].sort((a, b) => (b.expiryDate || "").localeCompare(a.expiryDate || ""));

  // Surface open fire-safety (FRA) actions across all properties.
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

  function CertRow({ c, archivedRow }: { c: Certificate; archivedRow?: boolean }) {
    const s = statusOf(c); const ss = STATUS_STYLE[s]; const d = daysUntil(c.expiryDate);
    return (
      <div className="w-full flex items-center gap-3 p-3.5 hover-elevate" data-testid={`hub-cert-${c.id}`}>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${archivedRow ? "bg-muted-foreground/40" : ss.dot}`} />
        <button onClick={() => navigate(`/property/${c.propertyId}`)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold truncate ${archivedRow ? "text-muted-foreground" : "text-foreground"}`}>{certLabel(c)}</span>
            {!archivedRow && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`}>{ss.label}</span>}
            {archivedRow && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">Superseded</span>}
            {c.aiOutcome && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLE[c.aiOutcome]?.chip || ""}`}>AI: {OUTCOME_STYLE[c.aiOutcome]?.label}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {c.issueDate && <>issued {fmtDate(c.issueDate)} · </>}expires {fmtDate(c.expiryDate)}
            {!archivedRow && d !== null && s !== "valid" && s !== "no_date" && <span> · {d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}</span>}
          </p>
        </button>
        {archivedRow ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0" data-testid={`unarchive-${c.id}`}
            onClick={() => archiveMut.mutate({ id: c.id, archived: 0 })}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-muted-foreground shrink-0" data-testid={`archive-${c.id}`}
            onClick={() => archiveMut.mutate({ id: c.id, archived: 1 })}>
            <Archive className="h-3.5 w-3.5 mr-1" /> Archive
          </Button>
        )}
      </div>
    );
  }

  return (
    <AppShell title="Compliance">
      <div className="grid grid-cols-3 gap-3 mb-6">
        <HubStat label="Valid" count={valid} icon={ShieldCheck} tone="good" />
        <HubStat label="Expiring soon" count={expiring} icon={ShieldAlert} tone={expiring ? "warn" : "neutral"} />
        <HubStat label="Overdue" count={overdue} icon={ShieldX} tone={overdue ? "bad" : "neutral"} />
      </div>

      {openFra.length > 0 && (
        <div className="mb-6 rounded-xl border border-card-border bg-card overflow-hidden" data-testid="hub-fra-actions">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-red-50 dark:bg-red-900/20">
            <Flame className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-semibold text-foreground">Open fire-safety actions</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">{openFra.length}</span>
          </div>
          <div className="divide-y divide-border">
            {openFra.map((a) => {
              const fp = FRA_PRIORITY_STYLE[a.priority] || FRA_PRIORITY_STYLE.medium;
              const d = daysUntil(a.dueDate);
              const isOverdue = d !== null && d < 0;
              return (
                <button key={a.id} onClick={() => navigate(`/property/${a.propertyId}`)} className="w-full flex items-center gap-3 p-4 text-left hover-elevate" data-testid={`hub-fra-${a.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{a.action}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${fp.chip}`}>{fp.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {a._prop?.propertyAddress || "Property"}
                      {a.dueDate && <span> · due {fmtDate(a.dueDate)}{d !== null && <span className={isOverdue ? "text-destructive font-medium" : ""}> · {isOverdue ? `${Math.abs(d)}d overdue` : `${d}d left`}</span>}</span>}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && all.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No certificates yet</p>
          <p className="text-sm text-muted-foreground">Open a property to add and AI-check compliance certificates.</p>
        </div>
      )}

      {/* Active certificates grouped by property */}
      {propGroups.length > 0 && (
        <div className="space-y-5">
          {propGroups.map((g) => (
            <div key={g.pid} className="rounded-xl border border-card-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">{g.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{g.certs.length}</span>
              </div>
              <div className="divide-y divide-border">
                {g.certs.map((c) => <CertRow key={c.id} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expired / superseded history */}
      {archivedSorted.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide mb-3" data-testid="toggle-cert-history">
            {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Archive className="h-3.5 w-3.5" /> Expired / superseded ({archivedSorted.length})
          </button>
          {showHistory && (
            <div className="rounded-xl border border-card-border bg-card/60 divide-y divide-border">
              {archivedSorted.map((c) => (
                <div key={c.id}>
                  <div className="px-3.5 pt-2 text-[11px] text-muted-foreground">{propName(c.propertyId)}</div>
                  <CertRow c={c} archivedRow />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
