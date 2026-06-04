import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Statement, RentalRow, DisbursementRow } from "@shared/schema";
import { computeTotals, gbp } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Building2, Plus, FileText, Pencil, Printer, Trash2 } from "lucide-react";

function parseRows<T>(json: string): T[] {
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

export default function StatementsList() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: statements, isLoading } = useQuery<Statement[]>({
    queryKey: ["/api/statements"],
  });

  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/statements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/statements"] });
      toast({ title: "Statement deleted" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Landlord Statements</h1>
              <p className="text-xs text-sidebar-foreground/70">Skylimit Estates Limited</p>
            </div>
          </div>
          <Link href="/new">
            <Button data-testid="button-new-statement" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
              <Plus className="h-4 w-4 mr-1.5" /> New Statement
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-foreground">Saved statements</h2>
          <p className="text-sm text-muted-foreground">Every statement you produce is stored here. Open one to edit, reprint, or duplicate.</p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && (!statements || statements.length === 0) && (
          <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="font-medium text-foreground">No statements yet</p>
            <p className="text-sm text-muted-foreground mb-5">Create your first landlord statement to get started.</p>
            <Link href="/new">
              <Button data-testid="button-new-statement-empty" className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1.5" /> New Statement
              </Button>
            </Link>
          </div>
        )}

        <div className="space-y-3">
          {statements?.map((s) => {
            const rentalRows = parseRows<RentalRow>(s.rentalRows);
            const disbRows = parseRows<DisbursementRow>(s.disbursementRows);
            const totals = computeTotals({
              rentalRows, disbursementRows: disbRows,
              managementFeePercent: s.managementFeePercent,
              managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
            });
            return (
              <div
                key={s.id}
                data-testid={`card-statement-${s.id}`}
                className="rounded-xl border border-card-border bg-card p-5 hover-elevate flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate" data-testid={`text-property-${s.id}`}>
                      {s.propertyAddress || "Untitled property"}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {s.periodFrom} – {s.periodTo}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    To {s.statementTo} · Dated {s.statementDate}
                  </p>
                  <div className="flex gap-4 mt-2 text-xs">
                    <span className="text-muted-foreground">Income <span className="font-semibold text-foreground">{gbp(totals.totalIncome)}</span></span>
                    <span className="text-muted-foreground">Transferable <span className="font-semibold text-primary">{gbp(totals.profitTransferable)}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" data-testid={`button-edit-${s.id}`} onClick={() => navigate(`/edit/${s.id}`)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-print-${s.id}`} onClick={() => navigate(`/print/${s.id}`)}>
                    <Printer className="h-3.5 w-3.5 mr-1" /> PDF
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" data-testid={`button-delete-${s.id}`} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this statement?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently removes the statement for {s.propertyAddress}. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          data-testid={`button-confirm-delete-${s.id}`}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => del.mutate(s.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
