import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MaintenanceJob, Tenant, Room } from "@shared/schema";
import { MAINT_CATEGORY_LABELS, PRIORITY_STYLE, STATUS_STYLE, URGENCY_STYLE, maintCategoryMeta, parseAiAdvice } from "@/lib/maintenance";
import { penceToPounds, poundsToPence, gbp } from "@/lib/statement";
import { fmtDate } from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Sparkles, Loader2, ChevronDown, Wrench, AlertTriangle, FileOutput, Wrench as TradeIcon, PackageOpen, PoundSterling, ShieldAlert } from "lucide-react";

const labelCls = "text-xs font-medium text-muted-foreground";

export function MaintenanceSection({ propertyId, tenants = [], rooms = [], isMultiRoom = false }: { propertyId: number; tenants?: Tenant[]; rooms?: Room[]; isMultiRoom?: boolean }) {
  const [adding, setAdding] = useState(false);
  const { data: jobs } = useQuery<MaintenanceJob[]>({ queryKey: ["/api/properties", propertyId, "maintenance"] });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" data-testid="button-add-job" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Log maintenance
        </Button>
      </div>
      {adding && <AddJobForm propertyId={propertyId} tenants={tenants} rooms={rooms} isMultiRoom={isMultiRoom} onDone={() => setAdding(false)} />}
      {(!jobs || jobs.length === 0) && !adding && (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate" data-testid="button-add-job-empty">
          <Wrench className="h-5 w-5" />
          <span className="text-sm font-medium">No maintenance logged</span>
          <span className="text-xs">Log a repair or issue — get AI troubleshooting in seconds</span>
        </button>
      )}
      <div className="space-y-2.5 mt-1">
        {jobs?.map((j) => <JobCard key={j.id} propertyId={propertyId} job={j} rooms={rooms} />)}
      </div>
    </div>
  );
}

function AddJobForm({ propertyId, tenants, rooms, isMultiRoom, onDone }: { propertyId: number; tenants: Tenant[]; rooms: Room[]; isMultiRoom: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState("plumbing");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [tenantId, setTenantId] = useState("none");
  const [roomId, setRoomId] = useState("none");
  const [saving, setSaving] = useState(false);

  const create = useMutation({
    mutationFn: async (runAi: boolean) => {
      const res = await apiRequest("POST", `/api/properties/${propertyId}/maintenance`, {
        category, title, description, priority,
        tenantId: tenantId === "none" ? null : Number(tenantId),
        roomId: roomId === "none" ? null : Number(roomId),
      });
      const job = await res.json();
      if (runAi) await apiRequest("POST", `/api/maintenance/${job.id}/ai-troubleshoot`);
      return job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({ title: "Maintenance logged" });
      onDone();
    },
    onError: () => toast({ title: "Could not log job", variant: "destructive" }),
  });

  function submit(runAi: boolean) {
    if (!title.trim()) { toast({ title: "Add a short title", variant: "destructive" }); return; }
    setSaving(true);
    create.mutate(runAi, { onSettled: () => setSaving(false) });
  }

  return (
    <div className="rounded-lg border border-card-border bg-secondary/40 p-4 mb-4 space-y-3" data-testid="add-job-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={labelCls}>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger data-testid="select-job-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MAINT_CATEGORY_LABELS).map(([k, v]) => {
                const Icon = maintCategoryMeta(k).icon;
                return (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2"><Icon className={`h-3.5 w-3.5 ${maintCategoryMeta(k).iconColor}`} /> {v}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className={labelCls}>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger data-testid="select-job-priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Title</Label>
        <Input value={title} data-testid="input-job-title" onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Boiler not producing hot water" />
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Description</Label>
        <Textarea value={description} rows={3} data-testid="input-job-description" onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue — symptoms, when it started, any error codes…" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {tenants.length > 0 && (
          <div className="space-y-1.5">
            <Label className={labelCls}>Reported by tenant (optional)</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger data-testid="select-job-tenant"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None</SelectItem>
                {tenants.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.tenantName || `Flat ${t.flat}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {isMultiRoom && (
          <div className="space-y-1.5">
            <Label className={labelCls}>Room (optional)</Label>
            <Select value={roomId} onValueChange={setRoomId}>
              <SelectTrigger data-testid="select-job-room"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole property</SelectItem>
                {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name || `Room ${r.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button variant="outline" size="sm" data-testid="button-save-job" onClick={() => submit(false)} disabled={saving}>Save</Button>
        <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-save-job-ai" onClick={() => submit(true)} disabled={saving}>
          {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Working…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> Save & AI troubleshoot</>}
        </Button>
      </div>
    </div>
  );
}

function JobCard({ propertyId, job, rooms = [] }: { propertyId: number; job: MaintenanceJob; rooms?: Room[] }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ss = STATUS_STYLE[job.status] || STATUS_STYLE.open;
  const ps = PRIORITY_STYLE[job.priority] || PRIORITY_STYLE.medium;
  const meta = maintCategoryMeta(job.category);
  const CategoryIcon = meta.icon;
  const advice = parseAiAdvice(job.aiAdvice);
  const room = job.roomId != null ? rooms.find((r) => r.id === job.roomId) : undefined;
  const steps: string[] = (() => { try { return JSON.parse(job.aiSteps || "[]"); } catch { return []; } })();

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiRequest("PUT", `/api/maintenance/${job.id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
    },
  });
  const aiTroubleshoot = useMutation({
    mutationFn: () => apiRequest("POST", `/api/maintenance/${job.id}/ai-troubleshoot`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({ title: "AI troubleshooting ready" });
      setOpen(true);
    },
    onError: () => toast({ title: "AI troubleshooting failed", variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/maintenance/${job.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "maintenance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/maintenance"] });
      toast({ title: "Job deleted" });
    },
  });

  return (
    <div className="rounded-lg border border-card-border bg-card" data-testid={`job-card-${job.id}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ss.dot}`} />
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta.chip}`}>
          <CategoryIcon className={`h-4 w-4 ${meta.iconColor}`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{job.title || MAINT_CATEGORY_LABELS[job.category]}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ps.chip}`}>{ps.label}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`} data-testid={`job-status-${job.id}`}>{ss.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {MAINT_CATEGORY_LABELS[job.category]}{room && ` · ${room.name || `Room ${room.id}`}`}{job.reportedDate && ` · reported ${fmtDate(job.reportedDate)}`}{job.cost ? ` · ${gbp(penceToPounds(job.cost))}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover-elevate" data-testid={`button-expand-job-${job.id}`}>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          {job.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{job.description}</p>}

          {/* status / cost / contractor controls */}
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className={labelCls}>Status</Label>
              <Select value={job.status} onValueChange={(v) => update.mutate({ status: v, ...(v === "completed" ? { completedDate: new Date().toISOString().slice(0, 10) } : {}) })}>
                <SelectTrigger data-testid={`select-status-${job.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_STYLE).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Contractor</Label>
              <Input defaultValue={job.contractor} data-testid={`input-contractor-${job.id}`} onBlur={(e) => { if (e.target.value !== job.contractor) update.mutate({ contractor: e.target.value }); }} placeholder="Company / engineer" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Cost (£)</Label>
              <Input type="number" step="0.01" defaultValue={job.cost ? penceToPounds(job.cost) : ""} data-testid={`input-cost-${job.id}`} placeholder="0.00"
                onBlur={(e) => { const p = e.target.value === "" ? 0 : poundsToPence(parseFloat(e.target.value) || 0); if (p !== job.cost) update.mutate({ cost: p }); }} />
            </div>
          </div>

          {/* AI troubleshooting */}
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-foreground">AI troubleshooting</span>
                {job.aiUrgency && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${URGENCY_STYLE[job.aiUrgency]?.chip || ""}`}>{URGENCY_STYLE[job.aiUrgency]?.label || job.aiUrgency}</span>}
              </div>
              <Button size="sm" variant="outline" data-testid={`button-ai-troubleshoot-${job.id}`} disabled={aiTroubleshoot.isPending} onClick={() => aiTroubleshoot.mutate()}>
                {aiTroubleshoot.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Thinking…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> {job.aiStatus === "done" ? "Re-run" : "Troubleshoot"}</>}
              </Button>
            </div>
            {job.aiStatus === "done" ? (
              <div className="space-y-3">
                {job.aiDiagnosis && <p className="text-sm text-foreground" data-testid={`job-ai-diagnosis-${job.id}`}><span className="font-medium">Likely cause: </span>{job.aiDiagnosis}</p>}
                {advice.likelyCauses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Possible causes</p>
                    <ul className="space-y-1 text-sm list-disc ml-5">{advice.likelyCauses.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </div>
                )}
                {steps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Step-by-step</p>
                    <ol className="space-y-1.5">
                      {steps.map((s, i) => (
                        <li key={i} className="text-sm flex items-start gap-2">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
                  {advice.trade && (
                    <p className="text-sm flex items-center gap-1.5"><TradeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">Suggested trade:</span> {advice.trade}</p>
                  )}
                  {advice.estimatedCost && (
                    <p className="text-sm flex items-center gap-1.5"><PoundSterling className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="font-medium">Est. cost:</span> {advice.estimatedCost}</p>
                  )}
                </div>
                {advice.partsLikely.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><PackageOpen className="h-3.5 w-3.5" /> Parts likely needed</p>
                    <ul className="space-y-1 text-sm list-disc ml-5">{advice.partsLikely.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                {advice.preventMeasures.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Prevention</p>
                    <ul className="space-y-1 text-sm list-disc ml-5">{advice.preventMeasures.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  </div>
                )}
                {advice.advice && (
                  <p className="text-sm flex items-start gap-1.5 text-muted-foreground border-t border-border pt-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span>{advice.advice}</span>
                  </p>
                )}
                <div className="border-t border-border pt-2">
                  <Button variant="outline" size="sm" data-testid={`button-work-order-${job.id}`} onClick={() => navigate(`/work-order/${job.id}`)}>
                    <FileOutput className="h-3.5 w-3.5 mr-1.5" /> Export for contractor (PDF)
                  </Button>
                </div>
              </div>
            ) : job.aiStatus === "error" ? (
              <p className="text-xs text-destructive">AI troubleshooting failed. Try again.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Click “Troubleshoot” for an AI diagnosis and step-by-step guidance.</p>
            )}
          </div>

          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`button-delete-job-${job.id}`}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this job?</AlertDialogTitle>
                  <AlertDialogDescription>{job.title || "This maintenance job"} will be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}
