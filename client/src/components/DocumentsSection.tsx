import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAccessKey } from "@/lib/queryClient";
import type { Document, Tenant } from "@shared/schema";
import { DOC_CATEGORIES, DOC_TYPE_MAP } from "@shared/schema";
import { gbp, poundsToPence } from "@/lib/statement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Trash2, Paperclip, Sparkles, Loader2, ShieldAlert, Search, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface TenancyExtract {
  tenantName: string;
  monthlyRent: number;
  tenancyStart: string;
  tenancyEnd: string;
  depositAmount: number;
  depositScheme: string;
  landlord?: string;
  propertyAddress?: string;
  summary: string;
}

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

function fileUrl(docId: number) {
  const key = getAccessKey();
  return `${API_BASE}/api/documents/${docId}/file${key ? `?key=${encodeURIComponent(key)}` : ""}`;
}
function fmtSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const catLabel = (v: string) => DOC_CATEGORIES.find((c) => c.value === v)?.label || v;
const typeLabel = (v: string) => DOC_TYPE_MAP[v]?.label || "Document";

export function DocumentsSection({ propertyId, tenants }: { propertyId: number; tenants: Tenant[] }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tenantId, setTenantId] = useState<string>("none");
  const [uploadDocType, setUploadDocType] = useState<string>("other");
  const [uploadHistoric, setUploadHistoric] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showHistoric, setShowHistoric] = useState(true);

  const { data: docs } = useQuery<Document[]>({ queryKey: ["/api/properties", propertyId, "documents"] });
  // Exclude rent statements — those live in the statement archive, not here.
  const allDocs = (docs ?? []).filter((d) => d.category !== "statement");

  const del = useMutation({
    mutationFn: (docId: number) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "documents"] });
      toast({ title: "Document removed" });
    },
  });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum size is 8MB.", variant: "destructive" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] ?? "";
      const linked = tenantId === "none" ? null : Number(tenantId);
      await apiRequest("POST", `/api/properties/${propertyId}/documents`, {
        tenantId: linked,
        docType: uploadDocType,
        tenancyStatus: uploadHistoric ? "historic" : "current",
        tenantNameSnapshot: linked ? (tenants.find((t) => t.id === linked)?.tenantName || "") : "",
        title: file.name,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        fileData: base64,
        fileSize: file.size,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "documents"] });
      toast({ title: "Document uploaded", description: file.name });
    } catch {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function tenantName(id: number | null) {
    if (id == null) return "Property-wide";
    return tenants.find((t) => t.id === id)?.tenantName || "Tenant";
  }

  // Apply filters
  const filtered = useMemo(() => {
    return allDocs.filter((d) => {
      if (!showHistoric && d.tenancyStatus === "historic") return false;
      if (filterTenant !== "all") {
        if (filterTenant === "none" && d.tenantId != null) return false;
        if (filterTenant !== "none" && String(d.tenantId) !== filterTenant) return false;
      }
      if (filterCategory !== "all" && d.category !== filterCategory) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        const hay = `${d.title} ${d.tenantNameSnapshot} ${typeLabel(d.docType)} ${catLabel(d.category)}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [allDocs, showHistoric, filterTenant, filterCategory, q]);

  const current = filtered.filter((d) => d.tenancyStatus !== "historic");
  const historic = filtered.filter((d) => d.tenancyStatus === "historic");

  // Group a list by category, ordered per DOC_CATEGORIES
  function grouped(list: Document[]) {
    const byCat = new Map<string, Document[]>();
    for (const d of list) {
      const arr = byCat.get(d.category) ?? [];
      arr.push(d); byCat.set(d.category, arr);
    }
    return DOC_CATEGORIES.map((c) => ({ cat: c.value, label: c.label, docs: byCat.get(c.value) ?? [] }))
      .filter((g) => g.docs.length > 0);
  }

  const catOptions = Array.from(new Set(allDocs.map((d) => d.category)));

  return (
    <div>
      {/* Upload controls */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4 flex-wrap">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Link to tenant</label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-52" data-testid="select-doc-tenant"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Property-wide (no tenant)</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.tenantName || `Flat ${t.flat}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Document type</label>
          <Select value={uploadDocType} onValueChange={setUploadDocType}>
            <SelectTrigger className="w-48" data-testid="select-doc-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DOC_TYPE_MAP).map(([v, m]) => (
                <SelectItem key={v} value={v}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground pb-2 cursor-pointer">
          <input type="checkbox" checked={uploadHistoric} onChange={(e) => setUploadHistoric(e.target.checked)} data-testid="check-doc-historic" />
          Historic
        </label>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" data-testid="input-file" onChange={onPick} />
        <Button data-testid="button-upload-doc" className="bg-primary text-primary-foreground" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> {uploading ? "Uploading…" : "Upload document"}
        </Button>
      </div>

      {/* Filters */}
      {allDocs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents" className="pl-8 h-9 w-52" data-testid="input-doc-search" />
          </div>
          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-44 h-9" data-testid="select-filter-tenant"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants / flats</SelectItem>
              <SelectItem value="none">Property-wide only</SelectItem>
              {tenants.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.tenantName || `Flat ${t.flat}`}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48 h-9" data-testid="select-filter-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {catOptions.map((c) => <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showHistoric} onChange={(e) => setShowHistoric(e.target.checked)} data-testid="check-show-historic" />
            Show historic
          </label>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} of {allDocs.length}</span>
        </div>
      )}

      {allDocs.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate"
          data-testid="button-upload-doc-empty"
        >
          <Paperclip className="h-5 w-5" />
          <span className="text-sm font-medium">No documents yet</span>
          <span className="text-xs">Upload a tenancy agreement, ID, letter or any property document (PDF or image, max 8MB)</span>
        </button>
      ) : (
        <div className="space-y-6">
          {/* CURRENT */}
          {current.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-3">Current tenancy documents</h3>
              <div className="space-y-4">
                {grouped(current).map((g) => (
                  <CategoryGroup key={g.cat} label={g.label} docs={g.docs} propertyId={propertyId} tenants={tenants} tenantName={tenantName} onDelete={(id) => del.mutate(id)} />
                ))}
              </div>
            </div>
          )}
          {/* HISTORIC */}
          {historic.length > 0 && (
            <HistoricSection docs={historic} propertyId={propertyId} tenants={tenants} tenantName={tenantName} onDelete={(id) => del.mutate(id)} grouped={grouped} />
          )}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No documents match these filters.</p>}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({ label, docs, propertyId, tenants, tenantName, onDelete }: {
  label: string; docs: Document[]; propertyId: number; tenants: Tenant[]; tenantName: (id: number | null) => string; onDelete: (id: number) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">{label} <span className="text-muted-foreground/60">({docs.length})</span></p>
      <div className="space-y-2">
        {docs.map((d) => (
          <DocRow key={d.id} propertyId={propertyId} doc={d} tenants={tenants} tenantLabel={tenantName(d.tenantId)} onDelete={() => onDelete(d.id)} />
        ))}
      </div>
    </div>
  );
}

function HistoricSection({ docs, propertyId, tenants, tenantName, onDelete, grouped }: {
  docs: Document[]; propertyId: number; tenants: Tenant[]; tenantName: (id: number | null) => string; onDelete: (id: number) => void; grouped: (l: Document[]) => { cat: string; label: string; docs: Document[] }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide mb-3" data-testid="toggle-historic">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Historic / previous occupants ({docs.length})
      </button>
      {open && (
        <div className="space-y-4 pl-1">
          {grouped(docs).map((g) => (
            <CategoryGroup key={g.cat} label={g.label} docs={g.docs} propertyId={propertyId} tenants={tenants} tenantName={tenantName} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocRow({ propertyId, doc, tenants, tenantLabel, onDelete }: { propertyId: number; doc: Document; tenants: Tenant[]; tenantLabel: string; onDelete: () => void }) {
  const { toast } = useToast();
  const [review, setReview] = useState<TenancyExtract | null>(null);
  const linkedTenant = doc.tenantId != null ? tenants.find((t) => t.id === doc.tenantId) : undefined;
  const isAst = doc.docType === "ast";
  const isSensitive = doc.sensitive === 1;
  // Name-differs: snapshot name present and clearly different from the linked tenant's name
  const nameDiffers = !!linkedTenant && !!doc.tenantNameSnapshot &&
    doc.tenantNameSnapshot.trim().toLowerCase() !== (linkedTenant.tenantName || "").trim().toLowerCase() &&
    /verify|differs/i.test(doc.title);

  const extract = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/documents/${doc.id}/ai-extract`)).json() as Promise<TenancyExtract>,
    onSuccess: (data) => setReview(data),
    onError: () => toast({ title: "AI extraction failed", description: "Please try again.", variant: "destructive" }),
  });

  const apply = useMutation({
    mutationFn: () => {
      if (!review || !linkedTenant) throw new Error("nothing to apply");
      const body: Record<string, unknown> = {};
      if (review.tenantName) body.tenantName = review.tenantName;
      if (review.monthlyRent > 0) body.monthlyRent = poundsToPence(review.monthlyRent);
      if (review.tenancyStart) body.tenancyStart = review.tenancyStart;
      if (review.tenancyEnd) body.tenancyEnd = review.tenancyEnd;
      if (review.depositAmount > 0) body.depositAmount = poundsToPence(review.depositAmount);
      if (review.depositScheme) body.depositScheme = review.depositScheme;
      return apiRequest("PUT", `/api/tenants/${linkedTenant.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({ title: "Tenant updated from agreement" });
      setReview(null);
    },
    onError: () => toast({ title: "Could not apply details", variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3" data-testid={`doc-${doc.id}`}>
      <div className={`h-9 w-9 rounded flex items-center justify-center shrink-0 ${isSensitive ? "bg-red-100" : "bg-primary/10"}`}>
        {isSensitive ? <ShieldAlert className="h-4 w-4 text-red-600" /> : <FileText className="h-4 w-4 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">{typeLabel(doc.docType)}</span>
          {doc.tenancyStatus === "historic" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">Historic</span>}
          {isSensitive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">ID · Sensitive</span>}
          {nameDiffers && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium inline-flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" /> Name differs</span>}
          <span className="text-[10px] text-muted-foreground">{tenantLabel} · {fmtSize(doc.fileSize)}</span>
        </div>
      </div>
      {isAst && linkedTenant && (
        <Button variant="outline" size="sm" data-testid={`button-ai-extract-${doc.id}`} disabled={extract.isPending} onClick={() => extract.mutate()}>
          {extract.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Reading…</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI auto-fill</>}
        </Button>
      )}
      <a href={fileUrl(doc.id)} target="_blank" rel="noreferrer" data-testid={`link-view-${doc.id}`}>
        <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" /> View</Button>
      </a>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-doc-${doc.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this document?</AlertDialogTitle>
            <AlertDialogDescription>{doc.title} will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={review != null} onOpenChange={(o) => { if (!o) setReview(null); }}>
        <DialogContent data-testid={`dialog-extract-${doc.id}`}>
          <DialogHeader>
            <DialogTitle>Review extracted details</DialogTitle>
            <DialogDescription>
              AI read this agreement. Review the fields below, then apply them to <span className="font-medium text-foreground">{linkedTenant?.tenantName || "the linked tenant"}</span>. Nothing is saved until you confirm.
            </DialogDescription>
          </DialogHeader>
          {review && (
            <div className="space-y-2 text-sm">
              {review.summary && <p className="text-muted-foreground border-b border-border pb-2">{review.summary}</p>}
              <ExtractRow label="Tenant name" value={review.tenantName} />
              <ExtractRow label="Monthly rent" value={review.monthlyRent > 0 ? gbp(review.monthlyRent) : ""} />
              <ExtractRow label="Tenancy start" value={review.tenancyStart} />
              <ExtractRow label="Tenancy end" value={review.tenancyEnd} />
              <ExtractRow label="Deposit" value={review.depositAmount > 0 ? gbp(review.depositAmount) : ""} />
              <ExtractRow label="Deposit scheme" value={review.depositScheme} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReview(null)} data-testid={`button-cancel-extract-${doc.id}`}>Cancel</Button>
            <Button className="bg-primary text-primary-foreground" data-testid={`button-apply-extract-${doc.id}`} disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? "Applying…" : "Apply to tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExtractRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${value ? "text-foreground" : "text-muted-foreground/60 italic"}`}>{value || "not found"}</span>
    </div>
  );
}
