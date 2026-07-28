import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { Statement, RentalRow, DisbursementRow, Property, EmailSettings } from "@shared/schema";
import { balanceCf, computeTotals, gbp, gbpOrDash } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Printer, Pencil, Download, Send, Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

function parseRows<T>(json: string): T[] {
  try { return JSON.parse(json) as T[]; } catch { return []; }
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
// Derive "Month Year" for the statement, preferring the period start date.
function periodMonthYear(s: Statement): string {
  const candidates = [s.periodFrom, s.periodTo].filter(Boolean);
  for (const c of candidates) {
    // DD/MM/YYYY or DD.MM.YYYY
    let m = c.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);
    if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[3]}`;
    // YYYY-MM-DD
    m = c.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    // "Month YYYY"
    m = c.match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) { const i = MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3))); if (i >= 0) return `${MONTHS[i]} ${m[2]}`; }
  }
  return "";
}
// Build the download filename: "Landlord Rent Statement <address> <Month Year>.pdf"
function pdfFileName(s: Statement): string {
  const my = periodMonthYear(s);
  const raw = `Landlord Rent Statement ${s.propertyAddress}${my ? " " + my : ""}`;
  // strip characters invalid in filenames
  return raw.replace(/[\/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() + ".pdf";
}

export default function StatementPrint() {
  const [, params] = useRoute("/print/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const id = params?.id ? Number(params.id) : null;

  const { data: s, isLoading } = useQuery<Statement>({
    queryKey: ["/api/statements", id],
    enabled: id != null,
  });

  // Property (for the landlord email) + email settings (for default wording) + config
  const { data: property } = useQuery<Property>({
    queryKey: ["/api/properties", s?.propertyId],
    enabled: s?.propertyId != null,
  });
  const { data: emailSettings } = useQuery<EmailSettings>({ queryKey: ["/api/email-settings"] });
  const { data: emailConfig } = useQuery<{ configured: boolean; missing: string[]; sender: string }>({
    queryKey: ["/api/email-config"],
  });

  // Saved landlord emails for this property
  const savedEmails: string[] = (() => {
    if (!property) return [];
    let list: string[] = [];
    try { list = JSON.parse(property.landlordEmails || "[]"); } catch { list = []; }
    if ((!list || list.length === 0) && property.landlordEmail) list = [property.landlordEmail];
    return list.filter(Boolean);
  })();

  // ---- Send-email dialog state ----
  const [emailOpen, setEmailOpen] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [ccEmail, setCcEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [customNote, setCustomNote] = useState("");
  const [sending, setSending] = useState(false);

  // Apply {property}/{month_year} placeholders in the wording
  function fillPlaceholders(t: string): string {
    if (!s) return t;
    return t
      .replace(/\{property\}/gi, s.propertyAddress || "")
      .replace(/\{month_year\}/gi, periodMonthYear(s) || "");
  }

  // Auto-open the send dialog when arriving from the Send Statements screen (?send=1)
  useEffect(() => {
    if (!s) return;
    const hash = window.location.hash || "";
    if (/[?&]send=1\b/.test(hash)) {
      setEmailOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // Prefill the dialog whenever it opens (or the source data changes)
  useEffect(() => {
    if (!emailOpen || !s) return;
    // Default recipients = all saved landlord emails (comma-separated), else primary
    setToEmail(savedEmails.length ? savedEmails.join(", ") : (property?.landlordEmail || ""));
    const subj = fillPlaceholders(emailSettings?.defaultSubject || "Rent Statement – {property}");
    const dflt = emailSettings?.defaultBody ||
      "Good afternoon,\n\nPlease find attached the rent statement for {property}.\n\nRent was paid to the Hadar account.\n\nThanks for your custom.\n\nKind regards";
    setSubject(subj);
    setBodyText(fillPlaceholders(dflt));
    setCustomNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailOpen]);

  // Build the statement PDF and return base64 (no data: prefix)
  async function buildPdfBase64(): Promise<string> {
    const el = document.getElementById("sheet");
    if (!el) throw new Error("Statement not ready");
    const html2pdf = (await import("html2pdf.js")).default;
    const dataUri = (await html2pdf().set({
      margin: 0,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from(el).outputPdf("datauristring")) as string;
    return dataUri.replace(/^data:.*;base64,/, "");
  }

  async function downloadPdf() {
    if (!s) return;
    const el = document.getElementById("sheet");
    if (!el) return;
    setDownloading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf().set({
        margin: 0,
        filename: pdfFileName(s),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(el).save();
    } catch (e) {
      toast({ title: "Could not generate PDF", description: "Try the Print option instead.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  // Compose final body = wording + optional custom addition
  function composedBody(): string {
    const note = customNote.trim();
    if (!note) return bodyText;
    // Insert the custom note after the greeting/first paragraph, before the sign-off feel:
    // simplest & clearest — append as its own paragraph before the closing lines.
    return `${bodyText}\n\n${note}`;
  }

  async function sendEmail() {
    if (!s) return;
    if (!toEmail.trim()) {
      toast({ title: "Add a recipient", description: "Enter the landlord's email address.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const pdfBase64 = await buildPdfBase64();
      await apiRequest("POST", `/api/statements/${s.id}/email`, {
        to: toEmail.split(/[,;]/).map((x) => x.trim()).filter(Boolean),
        cc: ccEmail.split(/[,;]/).map((x) => x.trim()).filter(Boolean),
        subject,
        body: composedBody(),
        pdfBase64,
        fileName: pdfFileName(s),
      });
      toast({ title: "Statement sent", description: `Emailed to ${toEmail}.` });
      setEmailOpen(false);
    } catch (e: any) {
      let msg = "Could not send the email.";
      try { const j = JSON.parse(e?.message?.split(": ").slice(1).join(": ") || "{}"); if (j.message) msg = j.message; } catch {}
      if (e?.message && msg === "Could not send the email.") msg = e.message;
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (isLoading || !s) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading statement…</div>;
  }

  const rentalRows = parseRows<RentalRow>(s.rentalRows);
  const disbRows = parseRows<DisbursementRow>(s.disbursementRows);
  const totals = computeTotals({
    rentalRows, disbursementRows: disbRows,
    managementFeePercent: s.managementFeePercent,
    managementFeeBase: s.managementFeeBase as "total_income" | "sub_total",
  });

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-20 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-white/10" data-testid="button-back-list" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> All statements
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" data-testid="button-edit-from-print" onClick={() => navigate(`/edit/${s.id}`)}>
              <Pencil className="h-4 w-4 mr-1.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-sidebar-foreground border-white/25 hover:bg-white/10" data-testid="button-print" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
            <Button size="sm" variant="outline" className="text-sidebar-foreground border-white/25 hover:bg-white/10" data-testid="button-download-pdf" onClick={downloadPdf} disabled={downloading}>
              <Download className="h-4 w-4 mr-1.5" /> {downloading ? "Preparing…" : "Download PDF"}
            </Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" data-testid="button-send-email" onClick={() => setEmailOpen(true)}>
              <Send className="h-4 w-4 mr-1.5" /> Send to landlord
            </Button>
          </div>
        </div>
      </div>

      <div className="no-print mx-auto max-w-4xl px-6 pt-4 text-center text-sm text-neutral-600">
        Review the statement below. Click <span className="font-semibold">Download PDF</span> to save it as <span className="font-semibold">{s ? pdfFileName(s) : ""}</span>.
      </div>

      {/* The printable A4 sheet */}
      <div className="mx-auto max-w-4xl p-6 print:p-0">
        <div id="sheet" className="bg-white shadow-lg print:shadow-none mx-auto" data-testid="statement-sheet">
          {/* Top line: company + date */}
          <div className="flex justify-between items-start mb-6">
            <div className="font-semibold text-[15px]">{s.companyName}</div>
            <div className="text-[13px]">Date: {s.statementDate}</div>
          </div>

          <h1 className="text-center font-bold text-[20px] mb-6">
            Landlord Statement from {s.periodFrom} - {s.periodTo}
          </h1>

          <div className="text-[13px] mb-5 leading-relaxed">
            <div><span className="font-semibold">Property Address:</span> {s.propertyAddress}</div>
            <div><span className="font-semibold">Statement to:</span> {s.statementTo}</div>
            {s.statementToAddress && <div><span className="font-semibold">Address:</span> {s.statementToAddress}</div>}
            <div className="font-semibold">{s.deliveryMethod}</div>
          </div>

          {/* Rental Schedule */}
          <table className="w-full border-collapse text-[12px] mb-1">
            <thead>
              <tr>
                <th colSpan={7} className="bg-neutral-200 border border-neutral-400 py-1 text-center font-bold text-[13px]">Rental Income</th>
              </tr>
              <tr className="font-bold text-center">
                <th className="border border-neutral-400 py-1 px-1">Rental Period</th>
                <th className="border border-neutral-400 py-1 px-1">Flat</th>
                <th className="border border-neutral-400 py-1 px-1">Tenant Name</th>
                <th className="border border-neutral-400 py-1 px-1">Rent Due</th>
                <th className="border border-neutral-400 py-1 px-1">Rent Received</th>
                <th className="border border-neutral-400 py-1 px-1">Arrears B/F</th>
                <th className="border border-neutral-400 py-1 px-1">Arrears C/F</th>
              </tr>
            </thead>
            <tbody>
              {rentalRows.map((r, i) => (
                <tr key={i} className="text-center">
                  <td className="border border-neutral-400 py-1 px-1">{r.rentalPeriod || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-1">{r.flat || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-1 text-left pl-2">{r.tenantName || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-1">{gbp(r.rentDemanded)}</td>
                  <td className="border border-neutral-400 py-1 px-1">{gbp(r.rentPaid)}</td>
                  <td className="border border-neutral-400 py-1 px-1">{gbpOrDash(r.balanceBf)}</td>
                  <td className="border border-neutral-400 py-1 px-1">{gbpOrDash(balanceCf(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mb-6">
            <div className="bg-neutral-200 border border-neutral-400 px-3 py-1 flex gap-8 text-[13px]">
              <span className="font-bold">Total Income:</span>
              <span className="font-bold tabular-nums">{gbp(totals.totalIncome)}</span>
            </div>
          </div>

          {/* Disbursements */}
          <table className="w-full border-collapse text-[12px] mb-1">
            <thead>
              <tr>
                <th colSpan={6} className="bg-neutral-200 border border-neutral-400 py-1 text-center font-bold text-[13px]">Disbursements</th>
              </tr>
              <tr className="font-bold text-left">
                <th className="border border-neutral-400 py-1 px-2">Supplier / Service</th>
                <th className="border border-neutral-400 py-1 px-2">Invoice #</th>
                <th className="border border-neutral-400 py-1 px-2">Description</th>
                <th className="border border-neutral-400 py-1 px-2 text-right">Invoice Amount</th>
                <th className="border border-neutral-400 py-1 px-2">Invoice Date</th>
                <th className="border border-neutral-400 py-1 px-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {disbRows.map((d, i) => (
                <tr key={i}>
                  <td className="border border-neutral-400 py-1 px-2">{d.supplier || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-2">{d.invoiceNumber || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-2">{d.description || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-2 text-right tabular-nums">{gbp(d.invoiceAmount)}</td>
                  <td className="border border-neutral-400 py-1 px-2">{d.invoiceDate || "\u00A0"}</td>
                  <td className="border border-neutral-400 py-1 px-2 text-right tabular-nums">{gbpOrDash(d.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mb-4">
            <div className="bg-neutral-200 border border-neutral-400 px-3 py-1 flex gap-8 text-[13px]">
              <span className="font-bold">Total Disbursements:</span>
              <span className="font-bold tabular-nums">{gbp(totals.totalDisbursements)}</span>
            </div>
          </div>

          {/* Summary block */}
          <div className="flex justify-end mb-6">
            <table className="text-[13px] border-collapse">
              <tbody>
                <tr>
                  <td className="py-0.5 pr-8 text-right text-neutral-700">Sub Total:</td>
                  <td className="py-0.5 text-right tabular-nums w-28">{gbp(totals.subTotal)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 pr-8 text-right text-neutral-700">Management Fee @{s.managementFeePercent}%</td>
                  <td className="py-0.5 text-right tabular-nums">{gbp(totals.managementFee)}</td>
                </tr>
                {totals.alreadyTransferred > 0 && (
                  <tr>
                    <td className="py-0.5 pr-8 text-right text-neutral-700">Less: Rent already transferred (paid early)</td>
                    <td className="py-0.5 text-right tabular-nums">{gbp(totals.alreadyTransferred)}</td>
                  </tr>
                )}
                <tr className="bg-neutral-200">
                  <td className="py-1 px-2 pr-8 text-right font-bold border border-neutral-400">Income Profit Transferable:</td>
                  <td className="py-1 px-2 text-right font-bold tabular-nums border border-neutral-400">{gbp(totals.profitTransferable)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="grid grid-cols-3 items-start text-[13px] pt-2">
            <div>{s.footerNote}</div>
            <div className="text-center leading-relaxed">
              <div className="font-semibold">{s.companyName}</div>
              <div>{s.companyAddress}</div>
              <div>Email: {s.companyEmail}</div>
            </div>
            <div></div>
          </div>
        </div>
      </div>

      {/* Send to landlord dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-lg no-print">
          <DialogHeader>
            <DialogTitle>Send statement to landlord</DialogTitle>
            <DialogDescription>
              {emailConfig?.configured
                ? <>The statement PDF will be attached and sent from {emailConfig.sender || "your Skylimit Outlook"}.</>
                : "Email sending isn't set up yet — see the note below."}
            </DialogDescription>
          </DialogHeader>

          {emailConfig && !emailConfig.configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                Email sending is not configured yet. Once the Microsoft credentials are added, this will send automatically.
                {emailConfig.missing?.length ? <> Missing: {emailConfig.missing.join(", ")}.</> : null}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">To</Label>
              <Input data-testid="input-email-to" type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="landlord@example.com" />
              {savedEmails.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-muted-foreground">Saved:</span>
                  {savedEmails.map((em) => {
                    const current = toEmail.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
                    const on = current.includes(em);
                    return (
                      <button
                        key={em}
                        type="button"
                        data-testid={`chip-email-${em}`}
                        onClick={() => {
                          const set = new Set(current);
                          if (on) set.delete(em); else set.add(em);
                          setToEmail(Array.from(set).join(", "));
                        }}
                        className={`text-[11px] rounded-full border px-2 py-0.5 transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-neutral-300 hover:bg-neutral-100"}`}
                      >
                        {em}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Separate multiple recipients with commas.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Cc (optional)</Label>
              <Input data-testid="input-email-cc" value={ccEmail} onChange={(e) => setCcEmail(e.target.value)} placeholder="Separate multiple with commas" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Subject</Label>
              <Input data-testid="input-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Message</Label>
              <Textarea data-testid="input-email-body" value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={8} className="text-[13px] leading-relaxed" />
              <p className="text-[11px] text-muted-foreground">This is your default wording — edit it here for this email, or change the saved default in Finance → Email settings.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Add a note (optional)</Label>
              <Textarea data-testid="input-email-custom" value={customNote} onChange={(e) => setCustomNote(e.target.value)} rows={3} placeholder="Anything specific to add for this landlord — appended to the message above." className="text-[13px]" />
            </div>
            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-[12px] text-neutral-600">
              Attachment: <span className="font-medium text-neutral-800">{pdfFileName(s)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)} data-testid="button-email-cancel">Cancel</Button>
            <Button onClick={sendEmail} disabled={sending || (emailConfig ? !emailConfig.configured : false)} data-testid="button-email-send" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
              {sending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-1.5" /> Send statement</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`
        #sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 16mm 14mm;
          box-sizing: border-box;
          color: #111;
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 0; }
          html, body { background: #fff !important; }
          #sheet { width: 100%; min-height: auto; box-shadow: none; margin: 0; }
        }
        @media (max-width: 820px) {
          #sheet { width: 100%; padding: 8mm; }
        }
      `}</style>
    </div>
  );
}
