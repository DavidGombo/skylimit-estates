import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Property, Statement, StatementEmail } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Mail, CheckCircle2, AlertTriangle, Search, Clock } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function periodMonthYear(s: Statement): string {
  for (const c of [s.periodFrom, s.periodTo].filter(Boolean)) {
    let m = c.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);
    if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[3]}`;
    m = c.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
    m = c.match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) { const i = MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3))); if (i >= 0) return `${MONTHS[i]} ${m[2]}`; }
  }
  return "";
}

function recipientsFor(prop: Property | undefined): string[] {
  if (!prop) return [];
  let list: string[] = [];
  try { list = JSON.parse(prop.landlordEmails || "[]"); } catch { list = []; }
  if ((!list || list.length === 0) && prop.landlordEmail) list = [prop.landlordEmail];
  return list.filter(Boolean);
}

export default function SendStatements() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  const { data: statements, isLoading } = useQuery<Statement[]>({ queryKey: ["/api/statements"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const { data: emailConfig } = useQuery<{ configured: boolean; missing: string[]; sender: string }>({ queryKey: ["/api/email-config"] });
  const { data: sentLog } = useQuery<StatementEmail[]>({ queryKey: ["/api/statement-emails"] });

  const propById = useMemo(() => {
    const m = new Map<number, Property>();
    (properties ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [properties]);

  // Most-recent successful send per statement id
  const lastSent = useMemo(() => {
    const m = new Map<number, StatementEmail>();
    (sentLog ?? []).forEach((e) => {
      if (e.status !== "sent" || e.statementId == null) return;
      if (!m.has(e.statementId)) m.set(e.statementId, e); // list is newest-first
    });
    return m;
  }, [sentLog]);

  const rows = useMemo(() => {
    let list = (statements ?? []).slice();
    if (q.trim()) {
      const t = q.toLowerCase();
      list = list.filter((s) =>
        s.propertyAddress.toLowerCase().includes(t) ||
        s.statementTo.toLowerCase().includes(t) ||
        periodMonthYear(s).toLowerCase().includes(t)
      );
    }
    return list;
  }, [statements, q]);

  const sentCount = lastSent.size;

  return (
    <AppShell title="Send Statements">
      {/* Config banner */}
      {emailConfig && !emailConfig.configured && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-900 mb-5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>Email sending isn't set up yet, so the Send buttons are disabled. {emailConfig.missing?.length ? <>Missing: {emailConfig.missing.join(", ")}.</> : null}</div>
        </div>
      )}
      {emailConfig?.configured && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-[13px] text-green-800 mb-5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div>Sending is active. Statements send from <span className="font-medium">{emailConfig.sender}</span> via your Skylimit Outlook.</div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <HubStat label="Statements" count={statements?.length ?? 0} icon={Mail} tone="neutral" />
        <HubStat label="Sent to landlords" count={sentCount} icon={Send} tone="neutral" />
        <HubStat label="Not yet sent" count={Math.max(0, (statements?.length ?? 0) - sentCount)} icon={Clock} tone="neutral" />
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input data-testid="input-send-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by property, landlord or month" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm py-10 text-center">Loading statements…</div>
      ) : rows.length === 0 ? (
        <div className="text-muted-foreground text-sm py-10 text-center border rounded-lg">No statements found. Produce a statement in Finance first.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const prop = s.propertyId != null ? propById.get(s.propertyId) : undefined;
            const emails = recipientsFor(prop);
            const my = periodMonthYear(s);
            const sent = lastSent.get(s.id);
            return (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card p-3" data-testid={`row-statement-${s.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14px] truncate">{s.propertyAddress}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {my || `${s.periodFrom} – ${s.periodTo}`} · To {s.statementTo || "—"}
                  </div>
                  <div className="text-[12px] mt-0.5">
                    {emails.length ? (
                      <span className="text-neutral-600">{emails.join(", ")}</span>
                    ) : (
                      <span className="text-amber-700">No landlord email saved — add one on the property</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {sent && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-green-700" data-testid={`sent-badge-${s.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Sent {new Date(sent.sentAt).toLocaleDateString("en-GB")}
                    </span>
                  )}
                  <Button
                    size="sm"
                    className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
                    data-testid={`button-send-${s.id}`}
                    disabled={emailConfig ? !emailConfig.configured : false}
                    onClick={() => navigate(`/print/${s.id}?send=1`)}
                  >
                    <Send className="h-4 w-4 mr-1.5" /> {sent ? "Resend" : "Send"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
