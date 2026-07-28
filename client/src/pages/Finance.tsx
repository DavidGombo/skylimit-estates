import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Property, Statement, RentalRow, DisbursementRow } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { computeTotals, gbp } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import { FileText, PoundSterling, Building2, ArrowRight, Send, Coins } from "lucide-react";

function parseRows<T>(j: string): T[] { try { return JSON.parse(j) as T[]; } catch { return []; } }

export default function Finance() {
  const [, navigate] = useLocation();

  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: statements } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });

  const totalsOf = (s: Statement) => computeTotals({
    rentalRows: parseRows<RentalRow>(s.rentalRows), disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
    managementFeePercent: s.managementFeePercent, managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
  });

  const totalTransferable = (statements ?? []).reduce((sum, s) => sum + totalsOf(s).profitTransferable, 0);
  const totalIncome = (statements ?? []).reduce((sum, s) => sum + totalsOf(s).totalIncome, 0);
  const totalFees = (statements ?? []).reduce((sum, s) => sum + totalsOf(s).managementFee, 0);
  const totalPaidEarly = (statements ?? []).reduce((sum, s) => sum + totalsOf(s).alreadyTransferred, 0);

  // Most recent statements for a quick glance
  const recent = (statements ?? []).slice(0, 5);

  return (
    <AppShell title="Finance">
      {/* Headline totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <HubStat label="Total rent collected" count={gbp(totalIncome)} icon={PoundSterling} tone="neutral" />
        <HubStat label="Management fees" count={gbp(totalFees)} icon={Coins} tone="neutral" />
        <HubStat label="Paid early (transferred)" count={gbp(totalPaidEarly)} icon={Send} tone="neutral" />
        <HubStat label="Total transferable" count={gbp(totalTransferable)} icon={PoundSterling} tone="neutral" />
      </div>

      {/* Link into Statements */}
      <div className="rounded-xl border border-card-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Statements</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Produce, edit, download and email rent statements. {statements?.length ?? 0} produced so far.</p>
        </div>
        <Button className="bg-primary text-primary-foreground" data-testid="button-open-statements" onClick={() => navigate("/statements")}>
          Open Statements <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>

      {/* Recent statements snapshot */}
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Recent statements</p>
      {(recent.length === 0) ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No statements yet. Open Statements to produce one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((s) => {
            const t = totalsOf(s);
            return (
              <button key={s.id} data-testid={`finance-statement-${s.id}`} onClick={() => navigate(`/print/${s.id}`)}
                className="w-full rounded-xl border border-card-border bg-card p-4 flex items-center gap-3 text-left hover-elevate">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{s.propertyAddress}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s.periodFrom} – {s.periodTo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Income {gbp(t.totalIncome)}
                    {t.alreadyTransferred > 0 && <> · Paid early {gbp(t.alreadyTransferred)}</>}
                    {" "}· Transferable <span className="font-semibold text-primary">{gbp(t.profitTransferable)}</span>
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
