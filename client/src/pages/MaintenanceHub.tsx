import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { MaintenanceJob, Property } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { HubToolbar } from "@/components/HubToolbar";
import { MAINT_CATEGORY_LABELS, STATUS_STYLE, PRIORITY_STYLE, maintCategoryMeta } from "@/lib/maintenance";
import { gbp, penceToPounds } from "@/lib/statement";
import { fmtDate } from "@/lib/compliance";
import { Wrench, CircleDot, Loader, CheckCircle2, ChevronRight } from "lucide-react";

export default function MaintenanceHub() {
  const [, navigate] = useLocation();
  const { data: jobs, isLoading } = useQuery<MaintenanceJob[]>({ queryKey: ["/api/maintenance"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const propName = (id: number) => properties?.find((p) => p.id === id)?.propertyAddress || "Property";
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const all = jobs ?? [];
  const openCount = all.filter((j) => j.status === "open" || j.status === "awaiting_parts").length;
  const inProgressCount = all.filter((j) => j.status === "in_progress").length;
  const completedCount = all.filter((j) => j.status === "completed").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((j) => categoryFilter === "all" || j.category === categoryFilter)
      .filter((j) => statusFilter === "all" || j.status === statusFilter)
      .filter((j) => !q || [j.title, MAINT_CATEGORY_LABELS[j.category] || "", propName(j.propertyId)].some((v) => (v || "").toLowerCase().includes(q)));
  }, [all, search, categoryFilter, statusFilter, properties]);

  const openJobs = filtered.filter((j) => j.status !== "completed" && j.status !== "cancelled");
  const doneJobs = filtered.filter((j) => j.status === "completed" || j.status === "cancelled");

  const categoryOptions = [{ value: "all", label: "All categories" }, ...Object.entries(MAINT_CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v }))];
  const statusOptions = [{ value: "all", label: "All statuses" }, ...Object.entries(STATUS_STYLE).map(([k, v]) => ({ value: k, label: v.label }))];

  const Row = ({ j }: { j: MaintenanceJob }) => {
    const ss = STATUS_STYLE[j.status] || STATUS_STYLE.open;
    const ps = PRIORITY_STYLE[j.priority] || PRIORITY_STYLE.medium;
    const cm = maintCategoryMeta(j.category);
    return (
      <button onClick={() => navigate(`/property/${j.propertyId}`)} className="w-full flex items-center gap-3 p-4 text-left hover-elevate first:rounded-t-xl last:rounded-b-xl" data-testid={`hub-job-${j.id}`}>
        <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
          <cm.icon className={`h-4 w-4 ${cm.iconColor}`} />
        </div>
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
      <div className="grid grid-cols-3 gap-3 mb-6">
        <HubStat label="Open" count={openCount} icon={CircleDot} tone={openCount ? "bad" : "neutral"} />
        <HubStat label="In progress" count={inProgressCount} icon={Loader} tone={inProgressCount ? "warn" : "neutral"} />
        <HubStat label="Completed" count={completedCount} icon={CheckCircle2} tone="good" />
      </div>

      <HubToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search job, category or property…"
        selects={[
          { value: categoryFilter, onChange: setCategoryFilter, options: categoryOptions, testId: "filter-maint-category" },
          { value: statusFilter, onChange: setStatusFilter, options: statusOptions, testId: "filter-maint-status" },
        ]}
      />

      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && all.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center" data-testid="maintenance-empty">
          <Wrench className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No maintenance logged</p>
          <p className="text-sm text-muted-foreground">Open a property to log a maintenance job and get AI troubleshooting.</p>
        </div>
      )}

      {!isLoading && all.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center" data-testid="maintenance-no-match">
          <Wrench className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No jobs match your filters.</p>
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
