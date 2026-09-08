import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BankReconciliation, ReconLedgerRow, BankTxn, Tenant } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { gbp } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Landmark, Upload, CheckCircle2, XCircle, AlertTriangle, Trash2, FileText, Loader2, ChevronLeft } from "lucide-react";

function penceToGbp(p: number) { return gbp(p / 100); }
function parseJson<T>(s: string, fb: T): T { try { return JSON.parse(s) as T; } catch { return fb; } }

export default function Reconciliation() {
  const { toast } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: list, isLoading } = useQuery<BankReconciliation[]>({ queryKey: ["/api/reconciliations"] });

  // ---- Upload dialog ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [periodMonth, setPeriodMonth] = useState("");
  const [csvText, setCsvText] = useState("");
  const [file, setFile] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const base64 = res.includes(",") ? res.split(",")[1] : res;
      setFile({ base64, mime: f.type || "application/octet-stream", name: f.name });
      setCsvText("");
    };
    reader.readAsDataURL(f);
  }

  const upload = useMutation({
    mutationFn: async () => {
      const body: any = { label, periodMonth };
      if (csvText.trim()) { body.csvText = csvText; body.fileName = "pasted.csv"; }
      else if (file) { body.fileBase64 = file.base64; body.mimeType = file.mime; body.fileName = file.name; }
      else throw new Error("Add a CSV or choose a file first.");
      return (await apiRequest("POST", "/api/reconciliations", body)).json();
    },
    onSuccess: (rec: BankReconciliation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reconciliations"] });
      setUploadOpen(false); setLabel(""); setPeriodMonth(""); setCsvText(""); setFile(null);
      setOpenId(rec.id);
      toast({ title: "Statement reconciled", description: "Payments matched to tenants by NI number." });
    },
    onError: (e: any) => toast({ title: "Reconciliation failed", description: e?.message || "Could not read the statement.", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/reconciliations/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/reconciliations"] }); toast({ title: "Deleted" }); },
  });

  // ---- Detail view ----
  if (openId != null) return <ReconciliationDetail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <AppShell title="Bank Reconciliation">
      <div className="flex justify-end mb-5">
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground" data-testid="button-upload-statement"><Upload className="h-4 w-4 mr-1.5" /> Upload bank statement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload a bank statement</DialogTitle>
              <DialogDescription>Paste a CSV or choose a CSV/PDF/image file. Payments are matched to tenants by the National Insurance number in each Universal Credit reference.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Label</Label>
                  <Input data-testid="input-recon-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. July 2026 UC" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Month (optional)</Label>
                  <Input data-testid="input-recon-month" type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Paste CSV</Label>
                <Textarea data-testid="input-recon-csv" value={csvText} onChange={(e) => { setCsvText(e.target.value); setFile(null); }} rows={6} placeholder="Date,Description,Amount&#10;01/07/2026,UC PAYMENT AB123456C,922.48" className="font-mono text-[12px]" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" /><span className="text-[11px] text-muted-foreground">or</span><div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Upload a file (CSV, PDF or image)</Label>
                <input ref={fileRef} type="file" accept=".csv,.pdf,image/*,text/csv" onChange={onFile} data-testid="input-recon-file" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-secondary-foreground" />
                {file && <p className="text-[12px] text-muted-foreground">Selected: {file.name}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button className="bg-primary text-primary-foreground" data-testid="button-run-recon" onClick={() => upload.mutate()} disabled={upload.isPending || (!csvText.trim() && !file)}>
                {upload.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Reading…</> : <>Reconcile</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (list?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-14 text-center">
          <Landmark className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No statements reconciled yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a bank statement to see who has paid.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list?.map((r) => (
            <div key={r.id} data-testid={`recon-${r.id}`} className="rounded-xl border border-card-border bg-card p-4 flex items-center gap-3">
              <Landmark className="h-4 w-4 text-primary shrink-0" />
              <button className="flex-1 min-w-0 text-left" onClick={() => setOpenId(r.id)} data-testid={`open-recon-${r.id}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{r.label || r.fileName || "Reconciliation"}</span>
                  {r.periodMonth && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{r.periodMonth}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Credits in {penceToGbp(r.totalCredits)} · Matched {penceToGbp(r.matchedCredits)} · {new Date(r.createdAt).toLocaleDateString("en-GB")}
                </p>
              </button>
              <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)} data-testid={`view-recon-${r.id}`}>View</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`delete-recon-${r.id}`}><Trash2 className="h-4 w-4" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Delete this reconciliation?</AlertDialogTitle>
                    <AlertDialogDescription>This removes the matched ledger. Your tenant records are untouched.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate(r.id)}>Delete</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function statusBadge(status: string) {
  if (status === "paid") return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Paid</span>;
  if (status === "partial") return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> Part-paid</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700"><XCircle className="h-3.5 w-3.5" /> Not paid</span>;
}

function ReconciliationDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { toast } = useToast();
  const { data: rec, isLoading } = useQuery<BankReconciliation>({ queryKey: ["/api/reconciliations", id], queryFn: async () => (await apiRequest("GET", `/api/reconciliations/${id}`)).json() });
  const { data: tenants } = useQuery<Tenant[]>({ queryKey: ["/api/tenants-all"], queryFn: async () => (await apiRequest("GET", "/api/tenants-all")).json() });

  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [assignTenant, setAssignTenant] = useState<string>("");

  const assign = useMutation({
    mutationFn: async ({ txnIndex, tenantId }: { txnIndex: number; tenantId: number }) =>
      (await apiRequest("POST", `/api/reconciliations/${id}/assign`, { txnIndex, tenantId })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/reconciliations", id] }); setAssignFor(null); setAssignTenant(""); toast({ title: "Payment assigned" }); },
    onError: (e: any) => toast({ title: "Could not assign", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !rec) return <AppShell title="Bank Reconciliation"><div className="py-10 text-center text-muted-foreground text-sm">Loading…</div></AppShell>;

  const ledger = parseJson<ReconLedgerRow[]>(rec.ledger, []);
  const unmatched = parseJson<BankTxn[]>(rec.unmatched, []);
  const paid = ledger.filter((l) => l.status === "paid").length;
  const partial = ledger.filter((l) => l.status === "partial").length;
  const unpaid = ledger.filter((l) => l.status === "unpaid").length;

  return (
    <AppShell title="Bank Reconciliation">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="button-back-recon">
        <ChevronLeft className="h-4 w-4" /> All reconciliations
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Landmark className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{rec.label || rec.fileName || "Reconciliation"}</h2>
        {rec.periodMonth && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{rec.periodMonth}</span>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <HubStat label="Paid" count={paid} icon={CheckCircle2} tone="neutral" />
        <HubStat label="Part-paid" count={partial} icon={AlertTriangle} tone="neutral" />
        <HubStat label="Not paid" count={unpaid} icon={XCircle} tone="neutral" />
        <HubStat label="Matched / total in" count={`${penceToGbp(rec.matchedCredits)}`} icon={Landmark} tone="neutral" />
      </div>

      {/* Ledger */}
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Who has paid</p>
      <div className="rounded-xl border border-card-border bg-card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs">
            <tr>
              <th className="text-left font-medium px-3 py-2">Tenant / flat</th>
              <th className="text-left font-medium px-3 py-2">NI number</th>
              <th className="text-right font-medium px-3 py-2">Expected</th>
              <th className="text-right font-medium px-3 py-2">Received</th>
              <th className="text-right font-medium px-3 py-2">Shortfall</th>
              <th className="text-right font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row, i) => (
              <tr key={i} className="border-t border-border" data-testid={`ledger-row-${row.tenantId}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{row.tenantName || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{row.propertyAddress}{row.flat ? ` · Flat ${row.flat}` : ""}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-muted-foreground">{row.niNumber || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{gbp(row.expectedRent)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{gbp(row.amountReceived)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${row.shortfall > 0.005 ? "text-red-700" : row.shortfall < -0.005 ? "text-green-700" : ""}`}>
                  {row.shortfall > 0.005 ? gbp(row.shortfall) : row.shortfall < -0.005 ? `+${gbp(-row.shortfall)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right">{statusBadge(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Unmatched */}
      {unmatched.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Unmatched payments ({unmatched.length})</p>
          </div>
          <p className="text-xs text-muted-foreground mb-3">These credits couldn't be matched to a tenant's NI number. Assign each to the right tenant.</p>
          <div className="rounded-xl border border-card-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Date</th>
                  <th className="text-left font-medium px-3 py-2">Description / reference</th>
                  <th className="text-right font-medium px-3 py-2">Amount</th>
                  <th className="text-right font-medium px-3 py-2">Assign</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((t, i) => (
                  <tr key={i} className="border-t border-border" data-testid={`unmatched-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.date}</td>
                    <td className="px-3 py-2"><div className="truncate max-w-md">{t.description}</div>{t.reference && <div className="text-[11px] text-muted-foreground font-mono">{t.reference}</div>}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{gbp(t.amount)}</td>
                    <td className="px-3 py-2 text-right">
                      <Dialog open={assignFor === i} onOpenChange={(o) => { setAssignFor(o ? i : null); setAssignTenant(""); }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" data-testid={`assign-${i}`}>Assign</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Assign payment to a tenant</DialogTitle>
                            <DialogDescription>{t.date} · {gbp(t.amount)} — {t.description}</DialogDescription></DialogHeader>
                          <Select value={assignTenant} onValueChange={setAssignTenant}>
                            <SelectTrigger data-testid="select-assign-tenant"><SelectValue placeholder="Choose tenant" /></SelectTrigger>
                            <SelectContent>
                              {(tenants ?? []).map((tn) => (
                                <SelectItem key={tn.id} value={String(tn.id)}>{tn.tenantName} — Flat {tn.flat}{tn.niNumber ? ` (${tn.niNumber})` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setAssignFor(null)}>Cancel</Button>
                            <Button className="bg-primary text-primary-foreground" disabled={!assignTenant || assign.isPending} data-testid="confirm-assign"
                              onClick={() => assign.mutate({ txnIndex: i, tenantId: Number(assignTenant) })}>
                              {assign.isPending ? "Assigning…" : "Assign"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
