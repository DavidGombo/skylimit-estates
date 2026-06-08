import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Tenant } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { HubToolbar } from "@/components/HubToolbar";
import { gbp, penceToPounds } from "@/lib/statement";
import { fmtDate } from "@/lib/compliance";
import { Users, UserCheck, UserX, PoundSterling, ChevronRight } from "lucide-react";

type TenantWithProp = Tenant & { propertyAddress: string };

export default function TenantsHub() {
  const [, navigate] = useLocation();
  const { data: tenants, isLoading } = useQuery<TenantWithProp[]>({ queryKey: ["/api/tenants"] });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const all = tenants ?? [];
  const active = all.filter((t) => t.active === 1);
  const past = all.filter((t) => t.active === 0);
  const monthlyRentTotal = active.reduce((s, t) => s + (t.monthlyRent || 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((t) => statusFilter === "all" || (statusFilter === "active" ? t.active === 1 : t.active === 0))
      .filter((t) => !q || [t.tenantName, t.propertyAddress, t.flat].some((v) => (v || "").toLowerCase().includes(q)));
  }, [all, search, statusFilter]);

  const filteredActive = filtered.filter((t) => t.active === 1);
  const filteredPast = filtered.filter((t) => t.active === 0);

  return (
    <AppShell title="Tenants">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <HubStat label="Active tenants" count={active.length} icon={UserCheck} tone="good" />
        <HubStat label="Past tenants" count={past.length} icon={UserX} tone="neutral" />
        <HubStat label="Total monthly rent" count={gbp(penceToPounds(monthlyRentTotal))} icon={PoundSterling} tone="neutral" />
      </div>

      <HubToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search tenant, flat or property…"
        selects={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            testId: "filter-tenant-status",
            options: [
              { value: "all", label: "All tenants" },
              { value: "active", label: "Active" },
              { value: "past", label: "Past" },
            ],
          },
        ]}
      />

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && all.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center" data-testid="tenants-empty">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No tenants yet</p>
          <p className="text-sm text-muted-foreground">Open a property to add tenants and track their rent.</p>
        </div>
      )}

      {!isLoading && all.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center" data-testid="tenants-no-match">
          <Users className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No tenants match your filters.</p>
        </div>
      )}

      {filteredActive.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Active ({filteredActive.length})</p>
          <div className="rounded-xl border border-card-border bg-card divide-y divide-border">
            {filteredActive.map((t) => <Row key={t.id} t={t} onClick={() => navigate(`/property/${t.propertyId}`)} />)}
          </div>
        </section>
      )}

      {filteredPast.length > 0 && (
        <section>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Past ({filteredPast.length})</p>
          <div className="rounded-xl border border-card-border bg-card divide-y divide-border opacity-75">
            {filteredPast.map((t) => <Row key={t.id} t={t} onClick={() => navigate(`/property/${t.propertyId}`)} />)}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Row({ t, onClick }: { t: TenantWithProp; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 p-4 text-left hover-elevate first:rounded-t-xl last:rounded-b-xl" data-testid={`tenant-row-${t.id}`}>
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Users className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{t.tenantName || "Unnamed tenant"}</p>
        <p className="text-xs text-muted-foreground truncate">
          Flat {t.flat || "—"} · {t.propertyAddress}
          {t.tenancyStart && ` · since ${fmtDate(t.tenancyStart)}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold tabular-nums">{gbp(penceToPounds(t.monthlyRent))}</p>
        <p className="text-xs text-muted-foreground">/ month</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}
