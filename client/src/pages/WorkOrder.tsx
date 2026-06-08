import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { MaintenanceJob, Property, Room } from "@shared/schema";
import { MAINT_CATEGORY_LABELS, PRIORITY_STYLE, URGENCY_STYLE, parseAiAdvice } from "@/lib/maintenance";
import { gbp, penceToPounds } from "@/lib/statement";
import { fmtDate } from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

function parseSteps(json: string): string[] {
  try { const a = JSON.parse(json || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch { return []; }
}

export default function WorkOrder() {
  const [, params] = useRoute("/work-order/:id");
  const [, navigate] = useLocation();
  const id = params?.id ? Number(params.id) : null;

  const { data: jobs, isLoading } = useQuery<MaintenanceJob[]>({ queryKey: ["/api/maintenance"], enabled: id != null });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });

  const job = (jobs ?? []).find((j) => j.id === id);
  const property = job ? (properties ?? []).find((p) => p.id === job.propertyId) : undefined;

  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/properties", job?.propertyId, "rooms"],
    enabled: job != null && job.roomId != null,
  });
  const room = job?.roomId != null ? (rooms ?? []).find((r) => r.id === job.roomId) : undefined;

  if (isLoading || !job) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading work order…</div>;
  }

  const steps = parseSteps(job.aiSteps);
  const advice = parseAiAdvice(job.aiAdvice);
  const ps = PRIORITY_STYLE[job.priority] || PRIORITY_STYLE.medium;
  const us = job.aiUrgency ? URGENCY_STYLE[job.aiUrgency] : null;
  const category = MAINT_CATEGORY_LABELS[job.category] || job.category;

  return (
    <div className="min-h-screen bg-neutral-200 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-20 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-white/10" data-testid="button-back-property" onClick={() => navigate(`/property/${job.propertyId}`)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to property
          </Button>
          <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" data-testid="button-print-work-order" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Download / Print PDF
          </Button>
        </div>
      </div>

      <div className="no-print mx-auto max-w-4xl px-6 pt-4 text-center text-sm text-neutral-600">
        Contractor work order. Click <span className="font-semibold">Download / Print PDF</span> and choose “Save as PDF” to send to a contractor.
      </div>

      {/* Printable A4 sheet */}
      <div className="mx-auto max-w-4xl p-6 print:p-0">
        <div id="sheet" className="bg-white shadow-lg print:shadow-none mx-auto" data-testid="work-order-sheet">
          {/* Branding header */}
          <div className="flex justify-between items-start border-b-2 border-navy pb-4 mb-5" style={{ borderColor: "hsl(222 47% 20%)" }}>
            <div>
              <div className="font-bold text-[18px] tracking-[0.1em] uppercase" style={{ color: "hsl(222 47% 20%)" }}>Skylimit Estates</div>
              <div className="text-[12px] text-neutral-600">Contractor Work Order</div>
            </div>
            <div className="text-right text-[12px] text-neutral-700">
              <div className="font-semibold">Work Order #{job.id}</div>
              <div>Issued {fmtDate(new Date().toISOString().slice(0, 10))}</div>
            </div>
          </div>

          {/* Property & job meta */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] mb-5">
            <div><span className="font-semibold">Property:</span> {property?.propertyAddress || "—"}</div>
            <div><span className="font-semibold">Category:</span> {category}</div>
            {room && <div><span className="font-semibold">Room:</span> {room.name || `Room ${room.id}`}</div>}
            <div><span className="font-semibold">Priority:</span> {ps.label}</div>
            <div><span className="font-semibold">Reported:</span> {job.reportedDate ? fmtDate(job.reportedDate) : "—"}</div>
            {us && <div><span className="font-semibold">Urgency:</span> {us.label}</div>}
            {job.contractor && <div><span className="font-semibold">Contractor:</span> {job.contractor}</div>}
            {advice.trade && <div><span className="font-semibold">Suggested trade:</span> {advice.trade}</div>}
          </div>

          {/* Job title + description */}
          <div className="mb-5">
            <h1 className="text-[18px] font-bold mb-1" style={{ color: "hsl(222 47% 20%)" }}>{job.title || category}</h1>
            {job.description && <p className="text-[13px] whitespace-pre-wrap text-neutral-800">{job.description}</p>}
          </div>

          {/* AI diagnosis */}
          {(job.aiStatus === "done" && (job.aiDiagnosis || steps.length > 0 || advice.advice)) && (
            <div className="mb-5 border border-neutral-300 rounded p-4 bg-neutral-50">
              <div className="text-[12px] font-bold uppercase tracking-wide mb-2" style={{ color: "hsl(42 60% 42%)" }}>AI assessment (guidance only)</div>
              {job.aiDiagnosis && (
                <p className="text-[13px] mb-2"><span className="font-semibold">Diagnosis: </span>{job.aiDiagnosis}</p>
              )}
              {advice.likelyCauses.length > 0 && (
                <div className="mb-2">
                  <div className="text-[12px] font-semibold">Likely causes</div>
                  <ul className="list-disc ml-5 text-[13px]">{advice.likelyCauses.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}
              {steps.length > 0 && (
                <div className="mb-2">
                  <div className="text-[12px] font-semibold">Recommended steps</div>
                  <ol className="list-decimal ml-5 text-[13px]">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                </div>
              )}
              {advice.partsLikely.length > 0 && (
                <div className="mb-2">
                  <div className="text-[12px] font-semibold">Parts likely needed</div>
                  <ul className="list-disc ml-5 text-[13px]">{advice.partsLikely.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
              {advice.estimatedCost && <p className="text-[13px] mb-1"><span className="font-semibold">Estimated cost: </span>{advice.estimatedCost}</p>}
              {advice.advice && <p className="text-[13px] mb-1"><span className="font-semibold">Safety advice: </span>{advice.advice}</p>}
              {advice.preventMeasures.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold">Prevention</div>
                  <ul className="list-disc ml-5 text-[13px]">{advice.preventMeasures.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </div>
          )}

          {/* Cost recorded */}
          {job.cost > 0 && <p className="text-[13px] mb-5"><span className="font-semibold">Recorded cost:</span> {gbp(penceToPounds(job.cost))}</p>}

          {/* Work done / signature area */}
          <div className="mt-8 border-t border-neutral-300 pt-4">
            <div className="text-[12px] font-bold uppercase tracking-wide mb-3" style={{ color: "hsl(222 47% 20%)" }}>Work completed / notes</div>
            <div className="h-24 border border-neutral-300 rounded mb-5" />
            <div className="grid grid-cols-2 gap-8 text-[13px]">
              <div>
                <div className="border-b border-neutral-500 h-8" />
                <div className="text-neutral-600 mt-1">Contractor signature</div>
              </div>
              <div>
                <div className="border-b border-neutral-500 h-8" />
                <div className="text-neutral-600 mt-1">Date</div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-3 border-t border-neutral-300 text-center text-[11px] text-neutral-600">
            Skylimit Estates Limited · 45 Stamford Hill, London N16 5SR · dg@skylimitestates.com
          </div>
        </div>
      </div>

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
