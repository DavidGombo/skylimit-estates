import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient, getAccessKey } from "@/lib/queryClient";
import type { Property, Statement, RentalRow, DisbursementRow, EmailSettings } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { computeTotals, gbp } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText, FileOutput, Pencil, Printer, Trash2, Building2, Archive, Download, Mail, Send } from "lucide-react";

function parseRows<T>(j: string): T[] { try { return JSON.parse(j) as T[]; } catch { return []; } }

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
function docFileUrl(docId: number) {
  const key = getAccessKey();
  return `${API_BASE}/api/documents/${docId}/file${key ? `?key=${encodeURIComponent(key)}` : ""}`;
}

type ArchiveDoc = { id: number; propertyId: number; propertyAddress: string; title: string; fileName: string; createdAt: string };

export default function Statements() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [pickOpen, setPickOpen] = useState(false);

  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: statements, isLoading } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });
  const { data: archive } = useQuery<ArchiveDoc[]>({ queryKey: ["/api/statement-archive"] });
  const { data: emailSettings } = useQuery<EmailSettings>({ queryKey: ["/api/email-settings"] });

  // Email settings dialog
  const [emailSetOpen, setEmailSetOpen] = useState(false);
  const [esSubject, setEsSubject] = useState("");
  const [esBody, setEsBody] = useState("");
  const { data: emailConfig } = useQuery<{ configured: boolean; missing: string[]; sender: string }>({ queryKey: ["/api/email-config"] });
  const saveEmailSettings = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/email-settings", { defaultSubject: esSubject, defaultBody: esBody }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/email-settings"] }); setEmailSetOpen(false); toast({ title: "Email settings saved" }); },
    onError: () => toast({ title: "Could not save", variant: "destructive" }),
  });
  function openEmailSettings() {
    setEsSubject(emailSettings?.defaultSubject || "Rent Statement – {property}");
    setEsBody(emailSettings?.defaultBody || "Good afternoon,\n\nPlease find attached the rent statement for {property}.\n\nRent was paid to the Hadar account.\n\nThanks for your custom.\n\nKind regards");
    setEmailSetOpen(true);
  }

  const del = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/statements/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/statements"] }); toast({ title: "Statement deleted" }); },
  });

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
    <AppShell title="Statements">
      <div className="flex justify-end gap-2 mb-5">
        <Button variant="outline" data-testid="button-email-settings" onClick={openEmailSettings}>
          <Mail className="h-4 w-4 mr-1.5" /> Email settings
        </Button>
        <Button variant="outline" data-testid="button-goto-send" onClick={() => navigate("/send")}>
          <Send className="h-4 w-4 mr-1.5" /> Send statements
        </Button>
        {produceBtn}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <HubStat label="Statements produced" count={statements?.length ?? 0} icon={FileText} tone="neutral" />
        <HubStat label="Archived (from email)" count={archive?.length ?? 0} icon={Archive} tone="neutral" />
        <HubStat label="Properties" count={properties?.length ?? 0} icon={Building2} tone="neutral" />
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
                <p className="text-xs text-muted-foreground mt-1">
                  Income {gbp(t.totalIncome)}
                  {t.alreadyTransferred > 0 && <> · Paid early {gbp(t.alreadyTransferred)}</>}
                  {" "}· Transferable <span className="font-semibold text-primary">{gbp(t.profitTransferable)}</span> · {s.statementDate}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" data-testid={`button-edit-${s.id}`} onClick={() => navigate(`/edit/${s.id}`)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button variant="outline" size="sm" data-testid={`button-print-${s.id}`} onClick={() => navigate(`/print/${s.id}`)}><Printer className="h-3.5 w-3.5 mr-1" /> PDF</Button>
                <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" data-testid={`button-send-${s.id}`} onClick={() => navigate(`/print/${s.id}?send=1`)}><Send className="h-3.5 w-3.5 mr-1" /> Send</Button>
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-${s.id}`}><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Delete statement</TooltipContent>
                  </Tooltip>
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

      {/* Archived statements imported from email, grouped by property */}
      {(archive?.length ?? 0) > 0 && (() => {
        const byProp = new Map<string, ArchiveDoc[]>();
        for (const d of archive!) {
          const arr = byProp.get(d.propertyAddress) ?? [];
          arr.push(d); byProp.set(d.propertyAddress, arr);
        }
        const monthKey = (t: string) => (t.match(/(\d{4})-(\d{2})/)?.[0] ?? "");
        return (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Statement archive (imported from email)</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Original signed statements you previously sent, filed by property and month. Click any to view or download.</p>
            <div className="space-y-4">
              {Array.from(byProp.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([addr, docs]) => (docs && (
                <div key={addr} className="rounded-xl border border-card-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-foreground">{addr}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{docs.length}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {docs.slice().sort((a: ArchiveDoc, b: ArchiveDoc) => monthKey(b.title).localeCompare(monthKey(a.title))).map((d: ArchiveDoc) => (
                      <a key={d.id} href={docFileUrl(d.id)} target="_blank" rel="noreferrer" data-testid={`archive-doc-${d.id}`}
                        className="flex items-center gap-2.5 rounded-lg border border-card-border p-2.5 hover-elevate">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground flex-1 truncate">{d.title.replace(/^Rent Statement — /, "")}</span>
                        <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )))}
            </div>
          </div>
        );
      })()}

      {/* Email settings dialog */}
      <Dialog open={emailSetOpen} onOpenChange={setEmailSetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Statement email settings</DialogTitle>
            <DialogDescription>
              This default wording is used when you send a statement to a landlord. You can still edit it per email before sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3 text-[13px]" style={{ borderColor: emailConfig?.configured ? "#bbf7d0" : "#fcd34d", background: emailConfig?.configured ? "#f0fdf4" : "#fffbeb" }}>
              {emailConfig?.configured
                ? <>Sending is active. Statements send from <span className="font-medium">{emailConfig.sender}</span> via your Skylimit Outlook.</>
                : <>Sending is not set up yet. The default wording is still saved here, ready for when the Microsoft credentials are added.</>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Default subject</Label>
              <Input data-testid="input-es-subject" value={esSubject} onChange={(e) => setEsSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Default message</Label>
              <Textarea data-testid="input-es-body" value={esBody} onChange={(e) => setEsBody(e.target.value)} rows={9} className="text-[13px] leading-relaxed" />
              <p className="text-[11px] text-muted-foreground">Use <span className="font-mono">{"{property}"}</span> to insert the property address and <span className="font-mono">{"{month_year}"}</span> for the statement month.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailSetOpen(false)}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" data-testid="button-save-es" onClick={() => saveEmailSettings.mutate()} disabled={saveEmailSettings.isPending}>
              {saveEmailSettings.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
