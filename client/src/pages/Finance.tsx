import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Statement, RentalRow, DisbursementRow } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { computeTotals, gbp } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, FileOutput, Pencil, Printer, Trash2, PoundSterling, Building2 } from "lucide-react";

function parseRows<T>(j: string): T[] { try { return JSON.parse(j) as T[]; } catch { return []; } }

export default function Finance() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pickOpen, setPickOpen] = useState(false);

  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: statements, isLoading } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });

  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/statements/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/statements"] }); toast({ title: "Statement deleted" }); },
  });

  const totalTransferable = (statements ?? []).reduce((sum, s) => sum + computeTotals({
    rentalRows: parseRows<RentalRow>(s.rentalRows), disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
    managementFeePercent: s.managementFeePercent, managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
  }).profitTransferable, 0);
  const totalIncome = (statements ?? []).reduce((sum, s) => sum + computeTotals({
    rentalRows: parseRows<RentalRow>(s.rentalRows), disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
    managementFeePercent: s.managementFeePercent, managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
  }).totalIncome, 0);

  const produceBtn = (
    <Dialog open={pickOpen} onOpenChange={setPickOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground" data-testid="button-produce-statement"><FileOutput className="h-4 w-4 mr-1.5" /> Produce Statement</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choose a property</DialogTitle>
          <DialogDescription>Rent fills in from that property's tenants automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
          {(properties ?? []).map((p) => (
            <button key={p.id} onClick={() => { setPickOpen(false); navigate(`/new/${p.id}`); }} data-testid={`pick-prop-${p.id}`}
              className="w-full flex items-center gap-2.5 rounded-lg border border-card-border p-3 text-left hover-elevate">
              <Building2 className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium text-foreground flex-1 truncate">{p.propertyAddress}</span>
            </button>
          ))}
          {(properties?.length ?? 0) === 0 && <p className="text-sm text-muted-foreground text-center py-4">Add a property first.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppShell title="Finance">
      <div className="flex justify-end mb-5">{produceBtn}</div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-card-border bg-card p-4">
          <PoundSterling className="h-5 w-5 text-primary" />
          <p className="text-2xl font-bold text-primary mt-2 tabular-nums">{gbp(totalTransferable)}</p>
          <p className="text-xs text-muted-foreground">Total transferable</p>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-4">
          <PoundSterling className="h-5 w-5 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{gbp(totalIncome)}</p>
          <p className="text-xs text-muted-foreground">Total rent collected</p>
        </div>
        <div className="rounded-xl border border-card-border bg-card p-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground mt-2 tabular-nums">{statements?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Statements produced</p>
        </div>
      </div>

      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Statements</p>
      {isLoading && <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}
      {!isLoading && (statements?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-14 text-center">
          <FileText className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No statements produced yet.</p>
        </div>
      )}
      <div className="space-y-3">
        {statements?.map((s) => {
          const t = computeTotals({
            rentalRows: parseRows<RentalRow>(s.rentalRows), disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
            managementFeePercent: s.managementFeePercent, managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
          });
          return (
            <div key={s.id} data-testid={`statement-${s.id}`} className="rounded-xl border border-card-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{s.propertyAddress}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s.periodFrom} – {s.periodTo}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Income {gbp(t.totalIncome)} · Transferable <span className="font-semibold text-primary">{gbp(t.profitTransferable)}</span> · {s.statementDate}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid={`button-edit-${s.id}`} onClick={() => navigate(`/edit/${s.id}`)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-print-${s.id}`} onClick={() => navigate(`/print/${s.id}`)}><Printer className="h-3.5 w-3.5 mr-1" /> PDF</Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this statement?</AlertDialogTitle>
                      <AlertDialogDescription>The statement for {s.propertyAddress} will be removed.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate(s.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
