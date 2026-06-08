import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAccessKey } from "@/lib/queryClient";
import type { Certificate, Room } from "@shared/schema";
import {
  CERT_META, certLabel, statusOf, STATUS_STYLE, OUTCOME_STYLE, fmtDate, daysUntil, addMonths, EPC_BAND_STYLE,
} from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Upload, Trash2, Download, Sparkles, ShieldCheck, ChevronDown, Loader2, AlertTriangle, CheckCircle2,
} from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
const labelCls = "text-xs font-medium text-muted-foreground";

function certFileUrl(id: number) {
  const key = getAccessKey();
  return `${API_BASE}/api/certificates/${id}/file${key ? `?key=${encodeURIComponent(key)}` : ""}`;
}

export function ComplianceSection({ propertyId, rooms = [], isMultiRoom = false }: { propertyId: number; rooms?: Room[]; isMultiRoom?: boolean }) {
  const [adding, setAdding] = useState(false);

  const { data: certs } = useQuery<Certificate[]>({ queryKey: ["/api/properties", propertyId, "certificates"] });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" data-testid="button-add-cert" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add certificate
        </Button>
      </div>

      {adding && <AddCertForm propertyId={propertyId} rooms={rooms} isMultiRoom={isMultiRoom} onDone={() => setAdding(false)} />}

      {(!certs || certs.length === 0) && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate"
          data-testid="button-add-cert-empty"
        >
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-medium">No certificates yet</span>
          <span className="text-xs">Add a Gas Safety, EICR, EPC or other compliance certificate</span>
        </button>
      )}

      <div className="space-y-2.5 mt-1">
        {certs?.map((c) => <CertCard key={c.id} propertyId={propertyId} cert={c} rooms={rooms} isMultiRoom={isMultiRoom} />)}
      </div>
    </div>
  );
}

function AddCertForm({ propertyId, rooms, isMultiRoom, onDone }: { propertyId: number; rooms: Room[]; isMultiRoom: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certType, setCertType] = useState("gas_safety");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // auto-suggest expiry from issue date + validity
  function onIssue(v: string) {
    setIssueDate(v);
    const months = CERT_META[certType]?.validityMonths;
    if (v && months && !expiryDate) setExpiryDate(addMonths(v, months));
  }

  async function submit() {
    setSaving(true);
    try {
      let fileData = "", fileName = "", mimeType = "", fileSize = 0;
      if (file) {
        if (file.size > 8 * 1024 * 1024) { toast({ title: "File too large", description: "Max 8MB", variant: "destructive" }); setSaving(false); return; }
        const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file); });
        fileData = dataUrl.split(",")[1] ?? ""; fileName = file.name; mimeType = file.type || "application/pdf"; fileSize = file.size;
      }
      await apiRequest("POST", `/api/properties/${propertyId}/certificates`, {
        certType, title: certType === "other" ? title : "", issueDate, expiryDate, roomId,
        fileName, mimeType, fileData, fileSize,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
      toast({ title: "Certificate added" });
      onDone();
    } catch {
      toast({ title: "Could not add certificate", variant: "destructive" });
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-lg border border-card-border bg-secondary/40 p-4 mb-4 space-y-3" data-testid="add-cert-form">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className={labelCls}>Certificate type</Label>
          <Select value={certType} onValueChange={setCertType}>
            <SelectTrigger data-testid="select-cert-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CERT_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {certType === "other" && (
          <div className="space-y-1.5">
            <Label className={labelCls}>Custom label</Label>
            <Input value={title} data-testid="input-cert-title" onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Asbestos survey" />
          </div>
        )}
        {isMultiRoom && (
          <div className="space-y-1.5">
            <Label className={labelCls}>Room</Label>
            <Select value={roomId == null ? "none" : String(roomId)} onValueChange={(v) => setRoomId(v === "none" ? null : Number(v))}>
              <SelectTrigger data-testid="select-cert-room"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole property</SelectItem>
                {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name || `Room ${r.id}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className={labelCls}>Issue date</Label>
          <Input type="date" value={issueDate} data-testid="input-cert-issue" onChange={(e) => onIssue(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className={labelCls}>Expiry / next due</Label>
          <Input type="date" value={expiryDate} data-testid="input-cert-expiry" onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" data-testid="input-cert-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()} data-testid="button-pick-cert-file">
          <Upload className="h-3.5 w-3.5 mr-1" /> {file ? "Change file" : "Attach certificate (PDF/image)"}
        </Button>
        {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
        <span className="text-xs text-muted-foreground">Attach the file so the AI can read it.</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-save-cert" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Save certificate"}
        </Button>
      </div>
    </div>
  );
}

function CertCard({ propertyId, cert, rooms, isMultiRoom }: { propertyId: number; cert: Certificate; rooms: Room[]; isMultiRoom: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const status = statusOf(cert);
  const ss = STATUS_STYLE[status];
  const d = daysUntil(cert.expiryDate);
  const recs: string[] = (() => { try { return JSON.parse(cert.aiRecommendations || "[]"); } catch { return []; } })();
  const hasFile = !!cert.fileName;
  const roomName = cert.roomId != null ? (rooms.find((r) => r.id === cert.roomId)?.name || `Room ${cert.roomId}`) : null;

  const aiReview = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/certificates/${cert.id}/ai-review`)).json() as Promise<Certificate & { fraCreated?: number }>,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
      const fraCreated = result?.fraCreated ?? 0;
      if (cert.certType === "fire_risk" && fraCreated > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "fra-actions"] });
        toast({ title: `Created ${fraCreated} fire-safety to-do${fraCreated === 1 ? "" : "s"}` });
      } else {
        toast({ title: "AI review complete" });
      }
      setOpen(true);
    },
    onError: () => toast({ title: "AI review failed", description: "Please try again.", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/certificates/${cert.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
      toast({ title: "Certificate removed" });
    },
  });

  return (
    <div className="rounded-lg border border-card-border bg-card" data-testid={`cert-card-${cert.id}`}>
      <div className="flex items-center gap-3 p-4">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ss.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{certLabel(cert)}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ss.chip}`} data-testid={`cert-status-${cert.id}`}>{ss.label}</span>
            {cert.certType === "epc" && cert.epcRating && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${EPC_BAND_STYLE[cert.epcRating] || "bg-muted text-muted-foreground"}`} data-testid={`cert-epc-band-${cert.id}`}>
                EPC {cert.epcRating}{cert.epcScore ? ` · ${cert.epcScore}` : ""}
              </span>
            )}
            {cert.aiOutcome && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${OUTCOME_STYLE[cert.aiOutcome]?.chip || ""}`}>
                AI: {OUTCOME_STYLE[cert.aiOutcome]?.label || cert.aiOutcome}
              </span>
            )}
            {roomName && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-secondary text-muted-foreground" data-testid={`cert-room-${cert.id}`}>{roomName}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Expires {fmtDate(cert.expiryDate)}
            {d !== null && status !== "valid" && status !== "no_date" && (
              <span> · {d < 0 ? `${Math.abs(d)} days overdue` : `in ${d} days`}</span>
            )}
            {cert.provider && <span> · {cert.provider}</span>}
            {cert.certType === "hmo_licence" && cert.licenceNumber && <span> · Licence {cert.licenceNumber}</span>}
            {cert.certType === "hmo_licence" && cert.licenceCouncil && <span> · {cert.licenceCouncil}</span>}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover-elevate" data-testid={`button-expand-cert-${cert.id}`}>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <CertEditFields propertyId={propertyId} cert={cert} />

          {/* AI section */}
          <div className="rounded-lg bg-secondary/50 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium text-foreground">AI compliance check</span>
              </div>
              <Button size="sm" variant="outline" data-testid={`button-ai-review-${cert.id}`} disabled={!hasFile || aiReview.isPending} onClick={() => aiReview.mutate()}>
                {aiReview.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Reading…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> {cert.aiStatus === "done" ? "Re-check" : "Run AI check"}</>}
              </Button>
            </div>
            {!hasFile && <p className="text-xs text-muted-foreground">Attach the certificate file (below) to enable the AI check.</p>}
            {cert.aiStatus === "done" && (
              <div className="space-y-2">
                <p className="text-sm text-foreground" data-testid={`cert-ai-summary-${cert.id}`}>{cert.aiSummary}</p>
                {recs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations</p>
                    <ul className="space-y-1">
                      {recs.map((r, i) => (
                        <li key={i} className="text-sm flex items-start gap-1.5">
                          {cert.aiOutcome === "fail" ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />}
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {cert.aiStatus === "error" && <p className="text-xs text-destructive">{cert.aiSummary || "AI review failed."}</p>}
          </div>

          <div className="flex items-center justify-between">
            {hasFile ? (
              <a href={certFileUrl(cert.id)} target="_blank" rel="noreferrer" data-testid={`link-cert-file-${cert.id}`}>
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" /> View file</Button>
              </a>
            ) : <span className="text-xs text-muted-foreground">No file attached</span>}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`button-delete-cert-${cert.id}`}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this certificate?</AlertDialogTitle>
                  <AlertDialogDescription>{certLabel(cert)} and its file will be removed.</AlertDialogDescription>
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

function CertEditFields({ propertyId, cert }: { propertyId: number; cert: Certificate }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [issueDate, setIssue] = useState(cert.issueDate);
  const [expiryDate, setExpiry] = useState(cert.expiryDate);
  const [provider, setProvider] = useState(cert.provider);
  const [reference, setReference] = useState(cert.reference);
  const [epcRating, setEpcRating] = useState(cert.epcRating);
  const [epcScore, setEpcScore] = useState(cert.epcScore);
  const [licenceNumber, setLicenceNumber] = useState(cert.licenceNumber);
  const [licenceCouncil, setLicenceCouncil] = useState(cert.licenceCouncil);
  const [maxOccupants, setMaxOccupants] = useState(cert.maxOccupants);

  const save = useMutation({
    mutationFn: (extra: Record<string, unknown> = {}) =>
      apiRequest("PUT", `/api/certificates/${cert.id}`, {
        issueDate, expiryDate, provider, reference,
        epcRating, epcScore, licenceNumber, licenceCouncil, maxOccupants,
        ...extra,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "certificates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/certificates"] });
      toast({ title: "Saved" });
    },
  });

  async function attachFile(f: File) {
    if (f.size > 8 * 1024 * 1024) { toast({ title: "File too large", description: "Max 8MB", variant: "destructive" }); return; }
    const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
    save.mutate({ fileData: dataUrl.split(",")[1] ?? "", fileName: f.name, mimeType: f.type || "application/pdf", fileSize: f.size });
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className={labelCls}>Issue date</Label><Input type="date" value={issueDate} data-testid={`edit-issue-${cert.id}`} onChange={(e) => setIssue(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className={labelCls}>Expiry / next due</Label><Input type="date" value={expiryDate} data-testid={`edit-expiry-${cert.id}`} onChange={(e) => setExpiry(e.target.value)} /></div>
        <div className="space-y-1.5"><Label className={labelCls}>Provider / engineer</Label><Input value={provider} data-testid={`edit-provider-${cert.id}`} onChange={(e) => setProvider(e.target.value)} placeholder="Company or engineer" /></div>
        <div className="space-y-1.5"><Label className={labelCls}>Reference / serial</Label><Input value={reference} data-testid={`edit-reference-${cert.id}`} onChange={(e) => setReference(e.target.value)} /></div>
        {cert.certType === "epc" && (
          <>
            <div className="space-y-1.5">
              <Label className={labelCls}>EPC rating (A–G)</Label>
              <Select value={epcRating || "none"} onValueChange={(v) => setEpcRating(v === "none" ? "" : v)}>
                <SelectTrigger data-testid={`edit-epc-rating-${cert.id}`}><SelectValue placeholder="Select band" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {["A", "B", "C", "D", "E", "F", "G"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>EPC score (1–100)</Label>
              <Input type="number" value={epcScore === 0 ? "" : epcScore} data-testid={`edit-epc-score-${cert.id}`} placeholder="e.g. 72" onChange={(e) => setEpcScore(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} />
            </div>
          </>
        )}
        {cert.certType === "hmo_licence" && (
          <>
            <div className="space-y-1.5">
              <Label className={labelCls}>Licence number</Label>
              <Input value={licenceNumber} data-testid={`edit-licence-number-${cert.id}`} onChange={(e) => setLicenceNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Issuing council</Label>
              <Input value={licenceCouncil} data-testid={`edit-licence-council-${cert.id}`} placeholder="e.g. Hackney Council" onChange={(e) => setLicenceCouncil(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Max occupants</Label>
              <Input type="number" value={maxOccupants === 0 ? "" : maxOccupants} data-testid={`edit-max-occupants-${cert.id}`} placeholder="e.g. 5" onChange={(e) => setMaxOccupants(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)} />
            </div>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) attachFile(f); }} />
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid={`button-replace-file-${cert.id}`}>
          <Upload className="h-3.5 w-3.5 mr-1" /> {cert.fileName ? "Replace file" : "Attach file"}
        </Button>
        <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-save-cert-edit-${cert.id}`} onClick={() => save.mutate({})} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
