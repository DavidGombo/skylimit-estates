import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Statement, RentalRow, DisbursementRow, InsertStatement, Property } from "@shared/schema";
import { balanceCf, computeTotals, gbp, gbpOrDash, type FeeBase } from "@/lib/statement";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Printer, AlertTriangle } from "lucide-react";

function parseRows<T>(json: string): T[] {
  try { return JSON.parse(json) as T[]; } catch { return []; }
}
const emptyRental: RentalRow = { tenantId: null, rentalPeriod: "", flat: "", tenantName: "", balanceBf: 0, rentDemanded: 0, rentPaid: 0 };
const emptyDisb: DisbursementRow = { supplier: "", invoiceNumber: "", description: "", invoiceAmount: 0, invoiceDate: "", balance: 0 };

function todayUK() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function NumberCell({ value, onChange, testId }: { value: number; onChange: (n: number) => void; testId: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
      <Input type="number" step="0.01" inputMode="decimal" className="h-9 pl-5 text-sm text-right tabular-nums"
        value={value === 0 ? "" : value} placeholder="0.00" data-testid={testId}
        onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)} />
    </div>
  );
}

export default function StatementEditor() {
  const [, newParams] = useRoute("/new/:propertyId");
  const [, editParams] = useRoute("/edit/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const editingId = editParams?.id ? Number(editParams.id) : null;
  const newPropertyId = newParams?.propertyId ? Number(newParams.propertyId) : null;
  const isEditing = editingId != null;

  // header / meta
  const [propertyId, setPropertyId] = useState<number | null>(newPropertyId);
  const [companyName, setCompanyName] = useState("Skylimit Estates Limited");
  const [companyAddress, setCompanyAddress] = useState("45 Stamford Hill, London N16 5SR");
  const [companyEmail, setCompanyEmail] = useState("dg@skylimitestates.com");
  const [statementDate, setStatementDate] = useState(todayUK());
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [statementTo, setStatementTo] = useState("");
  const [statementToAddress, setStatementToAddress] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("By Email");
  const [footerNote, setFooterNote] = useState("We thank you for your custom!");
  const [feePercent, setFeePercent] = useState(10);
  const [feeBase, setFeeBase] = useState<FeeBase>("total_income");

  const [rentalRows, setRentalRows] = useState<RentalRow[]>([{ ...emptyRental }]);
  const [disbRows, setDisbRows] = useState<DisbursementRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  // EDIT mode: load existing statement
  const { data: existing } = useQuery<Statement>({ queryKey: ["/api/statements", editingId], enabled: isEditing });
  // NEW mode: load prepared rows for the property
  const { data: prepared } = useQuery<{ property: Property; rentalRows: RentalRow[] }>({
    queryKey: ["/api/properties", newPropertyId, "prepare"],
    queryFn: async () => (await apiRequest("GET", `/api/properties/${newPropertyId}/prepare`)).json(),
    enabled: !isEditing && newPropertyId != null,
  });

  useEffect(() => {
    if (existing && !loaded) {
      setPropertyId(existing.propertyId ?? null);
      setCompanyName(existing.companyName); setCompanyAddress(existing.companyAddress); setCompanyEmail(existing.companyEmail);
      setStatementDate(existing.statementDate); setPeriodFrom(existing.periodFrom); setPeriodTo(existing.periodTo);
      setPropertyAddress(existing.propertyAddress); setStatementTo(existing.statementTo);
      setStatementToAddress(existing.statementToAddress ?? ""); setDeliveryMethod(existing.deliveryMethod);
      setFooterNote(existing.footerNote); setFeePercent(existing.managementFeePercent);
      setFeeBase(existing.managementFeeBase as FeeBase);
      const r = parseRows<RentalRow>(existing.rentalRows);
      const d = parseRows<DisbursementRow>(existing.disbursementRows);
      setRentalRows(r.length ? r : [{ ...emptyRental }]);
      setDisbRows(d);
      setLoaded(true);
    }
  }, [existing, loaded]);

  useEffect(() => {
    if (prepared && !loaded) {
      const p = prepared.property;
      setPropertyId(p.id);
      setCompanyName(p.companyName); setCompanyAddress(p.companyAddress); setCompanyEmail(p.companyEmail);
      setPropertyAddress(p.propertyAddress); setStatementTo(p.statementTo);
      setStatementToAddress(p.statementToAddress ?? ""); setDeliveryMethod(p.deliveryMethod);
      setFooterNote(p.footerNote); setFeePercent(p.managementFeePercent);
      setFeeBase(p.managementFeeBase as FeeBase);
      setRentalRows(prepared.rentalRows.length ? prepared.rentalRows : [{ ...emptyRental }]);
      setLoaded(true);
    }
  }, [prepared, loaded]);

  const totals = computeTotals({ rentalRows, disbursementRows: disbRows, managementFeePercent: feePercent, managementFeeBase: feeBase });

  function updateRental(i: number, patch: Partial<RentalRow>) {
    setRentalRows(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateDisb(i: number, patch: Partial<DisbursementRow>) {
    setDisbRows(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function buildPayload(): InsertStatement {
    return {
      propertyId, companyName, companyAddress, companyEmail,
      statementDate, periodFrom, periodTo, propertyAddress, statementTo, statementToAddress, deliveryMethod,
      rentalRows: JSON.stringify(rentalRows), disbursementRows: JSON.stringify(disbRows),
      managementFeePercent: feePercent, managementFeeBase: feeBase, footerNote,
    };
  }
  function validate(): string | null {
    if (!propertyAddress.trim()) return "Property address is required.";
    if (!periodFrom.trim() || !periodTo.trim()) return "Statement period dates are required.";
    return null;
  }

  async function persist(): Promise<Statement> {
    const payload = buildPayload();
    const res = isEditing
      ? await apiRequest("PUT", `/api/statements/${editingId}`, payload)
      : await apiRequest("POST", "/api/statements", payload);
    return res.json();
  }

  const save = useMutation({
    mutationFn: persist,
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/statements"] });
      toast({ title: isEditing ? "Statement updated" : "Statement saved" });
      navigate(`/edit/${saved.id}`);
    },
    onError: () => toast({ title: "Could not save", variant: "destructive" }),
  });
  const savePrint = useMutation({
    mutationFn: persist,
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/statements"] });
      navigate(`/print/${saved.id}`);
    },
    onError: () => toast({ title: "Could not save", variant: "destructive" }),
  });

  function handleSave() {
    const err = validate(); if (err) return toast({ title: "Check the form", description: err, variant: "destructive" });
    save.mutate();
  }
  function handleSavePrint() {
    const err = validate(); if (err) return toast({ title: "Check the form", description: err, variant: "destructive" });
    savePrint.mutate();
  }

  const labelCls = "text-xs font-medium text-muted-foreground";
  const card = "rounded-xl border border-card-border bg-card p-5 sm:p-6";

  return (
    <div className="min-h-screen bg-background pb-32">
      <AppHeader title={isEditing ? "Edit statement" : "Produce statement"} subtitle={propertyAddress || undefined}
        back={{ href: propertyId ? `/property/${propertyId}` : "/" }} />

      <main className="mx-auto max-w-5xl px-6 py-7 space-y-6">
        {/* Statement details */}
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Statement details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className={labelCls}>Property address</Label>
              <Input data-testid="input-property-address" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Statement to</Label>
              <Input data-testid="input-statement-to" value={statementTo} onChange={(e) => setStatementTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Landlord address (optional)</Label>
              <Input data-testid="input-statement-to-address" value={statementToAddress} onChange={(e) => setStatementToAddress(e.target.value)} placeholder="Shown as 'Address:' line" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Delivery method</Label>
              <Input data-testid="input-delivery" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Period from</Label>
              <Input data-testid="input-period-from" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} placeholder="01.04.2026" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Period to</Label>
              <Input data-testid="input-period-to" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} placeholder="30.04.2026" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Statement date</Label>
              <Input data-testid="input-statement-date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            </div>
          </div>
        </section>

        {/* Rental Income */}
        <section className={card}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-foreground">Rental Income</h2>
            <Button variant="outline" size="sm" data-testid="button-add-rental" onClick={() => setRentalRows(r => [...r, { ...emptyRental }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add row
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Rent is pre-filled from each tenant. For a defaulter, change <span className="font-medium">Rent Received</span> to what they actually paid — the shortfall carries to Arrears C/F and forward to next month.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2 font-medium w-[16%]">Rental period</th>
                  <th className="py-2 px-2 font-medium w-[8%]">Flat</th>
                  <th className="py-2 px-2 font-medium w-[20%]">Tenant name</th>
                  <th className="py-2 px-2 font-medium">Rent Due</th>
                  <th className="py-2 px-2 font-medium">Rent Received</th>
                  <th className="py-2 px-2 font-medium">Arrears B/F</th>
                  <th className="py-2 px-2 font-medium text-right">Arrears C/F</th>
                  <th className="py-2 pl-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rentalRows.map((row, i) => {
                  const cf = balanceCf(row);
                  const isDefault = (row.rentPaid || 0) < (row.rentDemanded || 0) || cf > 0.005;
                  return (
                    <tr key={i} className="border-b border-border/60" data-testid={`row-rental-${i}`}>
                      <td className="py-2 pr-2"><Input className="h-9 text-sm" value={row.rentalPeriod} placeholder="01/03 - 31/03" data-testid={`input-rental-period-${i}`} onChange={(e) => updateRental(i, { rentalPeriod: e.target.value })} /></td>
                      <td className="py-2 px-2"><Input className="h-9 text-sm" value={row.flat} data-testid={`input-flat-${i}`} onChange={(e) => updateRental(i, { flat: e.target.value })} /></td>
                      <td className="py-2 px-2"><Input className="h-9 text-sm" value={row.tenantName} placeholder="Tenant name" data-testid={`input-tenant-${i}`} onChange={(e) => updateRental(i, { tenantName: e.target.value })} /></td>
                      <td className="py-2 px-2"><NumberCell value={row.rentDemanded} onChange={(n) => updateRental(i, { rentDemanded: n })} testId={`input-due-${i}`} /></td>
                      <td className="py-2 px-2"><NumberCell value={row.rentPaid} onChange={(n) => updateRental(i, { rentPaid: n })} testId={`input-received-${i}`} /></td>
                      <td className="py-2 px-2"><NumberCell value={row.balanceBf} onChange={(n) => updateRental(i, { balanceBf: n })} testId={`input-bf-${i}`} /></td>
                      <td className={`py-2 px-2 text-right tabular-nums font-medium ${isDefault ? "text-destructive" : ""}`} data-testid={`text-cf-${i}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {isDefault && <AlertTriangle className="h-3.5 w-3.5" />}
                          {gbpOrDash(cf)}
                        </span>
                      </td>
                      <td className="py-2 pl-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" data-testid={`button-remove-rental-${i}`}
                          onClick={() => setRentalRows(r => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-4 pt-3 border-t border-border text-sm">
            <span className="text-muted-foreground mr-3">Total Income</span>
            <span className="font-bold text-foreground tabular-nums" data-testid="text-total-income">{gbp(totals.totalIncome)}</span>
          </div>
        </section>

        {/* Disbursements */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Disbursements</h2>
            <Button variant="outline" size="sm" data-testid="button-add-disb" onClick={() => setDisbRows(r => [...r, { ...emptyDisb }])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add invoice / expense
            </Button>
          </div>
          {disbRows.length === 0 && <p className="text-sm text-muted-foreground py-2">No disbursements. Click “Add invoice / expense” to add one.</p>}
          {disbRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-2 font-medium w-[18%]">Supplier / service</th>
                    <th className="py-2 px-2 font-medium w-[12%]">Invoice #</th>
                    <th className="py-2 px-2 font-medium w-[22%]">Description</th>
                    <th className="py-2 px-2 font-medium">Invoice amount</th>
                    <th className="py-2 px-2 font-medium w-[14%]">Invoice date</th>
                    <th className="py-2 px-2 font-medium">Balance</th>
                    <th className="py-2 pl-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {disbRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60" data-testid={`row-disb-${i}`}>
                      <td className="py-2 pr-2"><Input className="h-9 text-sm" value={row.supplier} placeholder="Pre Clean" data-testid={`input-supplier-${i}`} onChange={(e) => updateDisb(i, { supplier: e.target.value })} /></td>
                      <td className="py-2 px-2"><Input className="h-9 text-sm" value={row.invoiceNumber} data-testid={`input-invoice-no-${i}`} onChange={(e) => updateDisb(i, { invoiceNumber: e.target.value })} /></td>
                      <td className="py-2 px-2"><Input className="h-9 text-sm" value={row.description} placeholder="Cleaning" data-testid={`input-description-${i}`} onChange={(e) => updateDisb(i, { description: e.target.value })} /></td>
                      <td className="py-2 px-2"><NumberCell value={row.invoiceAmount} onChange={(n) => updateDisb(i, { invoiceAmount: n })} testId={`input-amount-${i}`} /></td>
                      <td className="py-2 px-2"><Input className="h-9 text-sm" value={row.invoiceDate} placeholder="01/05/2026" data-testid={`input-invoice-date-${i}`} onChange={(e) => updateDisb(i, { invoiceDate: e.target.value })} /></td>
                      <td className="py-2 px-2"><NumberCell value={row.balance} onChange={(n) => updateDisb(i, { balance: n })} testId={`input-disb-balance-${i}`} /></td>
                      <td className="py-2 pl-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" data-testid={`button-remove-disb-${i}`}
                          onClick={() => setDisbRows(r => r.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end mt-4 pt-3 border-t border-border text-sm">
            <span className="text-muted-foreground mr-3">Total Disbursements</span>
            <span className="font-bold text-foreground tabular-nums" data-testid="text-total-disbursements">{gbp(totals.totalDisbursements)}</span>
          </div>
        </section>

        {/* Fee + summary */}
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Management fee & summary</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className={labelCls}>Management fee (%)</Label>
                <Input type="number" step="0.5" min="0" max="100" className="tabular-nums" data-testid="input-fee-percent"
                  value={feePercent} onChange={(e) => setFeePercent(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Charge fee on</Label>
                <Select value={feeBase} onValueChange={(v) => setFeeBase(v as FeeBase)}>
                  <SelectTrigger data-testid="select-fee-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total_income">Rent Collected (Total Income)</SelectItem>
                    <SelectItem value="sub_total">Sub Total (after disbursements)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Fee base: {gbp(feeBase === "sub_total" ? totals.subTotal : totals.totalIncome)} × {feePercent}%</p>
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Footer note</Label>
                <Input data-testid="input-footer" value={footerNote} onChange={(e) => setFooterNote(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-secondary/60 p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Income</span><span className="font-medium tabular-nums">{gbp(totals.totalIncome)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Disbursements</span><span className="font-medium tabular-nums">−{gbp(totals.totalDisbursements)}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Sub Total</span><span className="font-medium tabular-nums">{gbp(totals.subTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Management Fee @{feePercent}%</span><span className="font-medium tabular-nums">−{gbp(totals.managementFee)}</span></div>
              <div className="flex justify-between border-t-2 border-primary/40 pt-2 mt-1">
                <span className="font-semibold text-foreground">Income Profit Transferable</span>
                <span className="font-bold text-primary tabular-nums" data-testid="text-profit">{gbp(totals.profitTransferable)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Issuer */}
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Issuing company (header & footer)</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label className={labelCls}>Company name</Label><Input data-testid="input-company-name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={labelCls}>Company address</Label><Input data-testid="input-company-address" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={labelCls}>Company email</Label><Input data-testid="input-company-email" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} /></div>
          </div>
        </section>
      </main>

      {/* Sticky bar */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t border-border z-30">
        <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-sm hidden sm:block">
            <span className="text-muted-foreground mr-2">Transferable</span>
            <span className="font-bold text-primary tabular-nums">{gbp(totals.profitTransferable)}</span>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" data-testid="button-save" onClick={handleSave} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button className="bg-primary text-primary-foreground" data-testid="button-save-print" onClick={handleSavePrint} disabled={savePrint.isPending}>
              <Printer className="h-4 w-4 mr-1.5" /> Save & generate PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
