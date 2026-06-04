import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Statement, RentalRow, DisbursementRow } from "@shared/schema";
import { computeTotals, gbp } from "@/lib/statement";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Home as HomeIcon, FileText, ChevronRight, Building2 } from "lucide-react";

function parseRows<T>(json: string): T[] {
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

export default function Home() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [to, setTo] = useState("");
  const [feePercent, setFeePercent] = useState(10);
  const [feeBase, setFeeBase] = useState("total_income");

  const { data: properties, isLoading: loadingProps } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: statements } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });

  const create = useMutation({
    mutationFn: async (): Promise<Property> => {
      const res = await apiRequest("POST", "/api/properties", {
        propertyAddress: addr, statementTo: to, deliveryMethod: "By Email",
        companyName: "Skylimit Estates Limited",
        companyAddress: "45 Stamford Hill, London N16 5SR",
        companyEmail: "dg@skylimitestates.com",
        managementFeePercent: feePercent, managementFeeBase: feeBase,
        footerNote: "We thank you for your custom!",
      });
      return res.json();
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      setOpen(false); setAddr(""); setTo(""); setFeePercent(10); setFeeBase("total_income");
      toast({ title: "Property added", description: "Now add its tenants." });
      navigate(`/property/${p.id}`);
    },
  });

  function submit() {
    if (!addr.trim()) { toast({ title: "Address required", variant: "destructive" }); return; }
    create.mutate();
  }

  const recent = (statements ?? []).slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        title="Landlord Statements"
        subtitle="Skylimit Estates Limited"
        right={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-property" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
                <Plus className="h-4 w-4 mr-1.5" /> Add Property
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a property</DialogTitle>
                <DialogDescription>Save a property once; reuse it for every monthly statement.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Property address</Label>
                  <Input data-testid="input-new-property-address" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="15 Princes Avenue, Greenford, UB6 9BS" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Statement to (landlord / recipient)</Label>
                  <Input data-testid="input-new-property-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Better Mansions Ltd" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Management fee (%)</Label>
                    <Input type="number" step="0.5" data-testid="input-new-property-fee" value={feePercent} onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Fee charged on</Label>
                    <Select value={feeBase} onValueChange={setFeeBase}>
                      <SelectTrigger data-testid="select-new-property-base"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total_income">Rent Collected (Total Income)</SelectItem>
                        <SelectItem value="sub_total">Sub Total (after disbursements)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-testid="button-save-new-property" className="bg-primary text-primary-foreground" onClick={submit} disabled={create.isPending}>
                  {create.isPending ? "Adding…" : "Add property"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">
        {/* Properties */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Properties</h2>
            <p className="text-sm text-muted-foreground">Open a property to manage tenants and produce a statement.</p>
          </div>

          {loadingProps && <div className="grid sm:grid-cols-2 gap-3">{[1,2].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>}

          {!loadingProps && (!properties || properties.length === 0) && (
            <div className="rounded-xl border border-dashed border-border bg-card py-14 text-center">
              <HomeIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="font-medium text-foreground">No properties yet</p>
              <p className="text-sm text-muted-foreground mb-5">Add your first property to start producing statements.</p>
              <Button data-testid="button-add-property-empty" className="bg-primary text-primary-foreground" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Add Property
              </Button>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            {properties?.map((p) => (
              <button
                key={p.id}
                data-testid={`card-property-${p.id}`}
                onClick={() => navigate(`/property/${p.id}`)}
                className="text-left rounded-xl border border-card-border bg-card p-5 hover-elevate flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-foreground truncate" data-testid={`text-property-name-${p.id}`}>{p.propertyAddress}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">To {p.statementTo || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Fee {p.managementFeePercent}% on {p.managementFeeBase === "sub_total" ? "Sub Total" : "Rent Collected"}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </section>

        {/* Recent statements */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Recent statements</h2>
            <p className="text-sm text-muted-foreground">Every statement you produce is saved here.</p>
          </div>
          {recent.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card py-10 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              No statements produced yet.
            </div>
          )}
          <div className="space-y-3">
            {recent.map((s) => {
              const totals = computeTotals({
                rentalRows: parseRows<RentalRow>(s.rentalRows),
                disbursementRows: parseRows<DisbursementRow>(s.disbursementRows),
                managementFeePercent: s.managementFeePercent,
                managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
              });
              return (
                <div key={s.id} data-testid={`card-statement-${s.id}`} className="rounded-xl border border-card-border bg-card p-4 flex items-center gap-4 hover-elevate">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">{s.propertyAddress}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{s.periodFrom} – {s.periodTo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Transferable <span className="font-semibold text-primary">{gbp(totals.profitTransferable)}</span> · Dated {s.statementDate}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" data-testid={`button-edit-statement-${s.id}`} onClick={() => navigate(`/edit/${s.id}`)}>Edit</Button>
                    <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-print-statement-${s.id}`} onClick={() => navigate(`/print/${s.id}`)}>PDF</Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
