import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { MaintenanceJob, Property } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { MAINT_CATEGORY_LABELS, STATUS_STYLE, PRIORITY_STYLE } from "@/lib/maintenance";
import { gbp, penceToPounds } from "@/lib/statement";
import { fmtDate } from "@/lib/compliance";
import { Wrench, ChevronRight } from "lucide-react";

export default function MaintenanceHub() {
  const [, navigate] = useLocation();
  const { data: jobs, isLoading } = useQuery<MaintenanceJob[]>({ queryKey: ["/api/maintenance"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const propName = (id: number) => properties?.find((p) => p.id === id)?.propertyAddress || "Property";

  const openJobs = (jobs ?? []).filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const doneJobs = (jobs ?? []).filter((j) => j.status === "completed" || j.status === "cancelled");

  const Row = ({ j }: { j: MaintenanceJob }) => {
    const ss = STATUS_STYLE[j.status] || STATUS_STYLE.open;
    const ps = PRIORITY_STYLE[j.priority] || PRIORITY_STYLE.medium;
    return (
      <button onClick={() => navigate(`/property/${j.propertyId}`)} className="w-full flex items-center gap-3 p-4 text-left hover-elevate first:rounded-t-xl last:rounded-b-xl" data-testid={`hub-job-${j.id}`}>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ss.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{j.title || MAINT_CATEGORY_LABELS[j.category]}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ps.chip}`}>{ps.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`}>{ss.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {MAINT_CATEGORY_LABELS[j.category]} · {propName(j.propertyId)}
            {j.reportedDate && ` · ${fmtDate(j.reportedDate)}`}{j.cost ? ` · ${gbp(penceToPounds(j.cost))}` : ""}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    );
  };

  return (
    <AppShell title="Maintenance">
      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && (jobs?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Wrench className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No maintenance logged</p>
          <p className="text-sm text-muted-foreground">Open a property to log a maintenance job and get AI troubleshooting.</p>
        </div>
      )}

      {openJobs.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Open & in progress ({openJobs.length})</p>
          <div className="rounded-xl border border-card-border bg-card divide-y divide-border">
            {openJobs.map((j) => <Row key={j.id} j={j} />)}
          </div>
        </section>
      )}

      {doneJobs.length > 0 && (
        <section>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Completed & cancelled ({doneJobs.length})</p>
          <div className="rounded-xl border border-card-border bg-card divide-y divide-border opacity-75">
            {doneJobs.map((j) => <Row key={j.id} j={j} />)}
          </div>
        </section>
      )}
    </AppShell>
  );
}
