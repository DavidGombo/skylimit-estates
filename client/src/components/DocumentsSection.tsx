import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAccessKey } from "@/lib/queryClient";
import type { Document, Tenant } from "@shared/schema";
import { gbp, poundsToPence } from "@/lib/statement";
import { Button } from "@/components/ui/button";
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
import { FileText, Upload, Download, Trash2, Paperclip, Sparkles, Loader2 } from "lucide-react";

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

export function DocumentsSection({ propertyId, tenants }: { propertyId: number; tenants: Tenant[] }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tenantId, setTenantId] = useState<string>("none");
  const [uploading, setUploading] = useState(false);

  const { data: docs } = useQuery<Document[]>({ queryKey: ["/api/properties", propertyId, "documents"] });
  const agreements = (docs ?? []).filter((d) => d.category === "agreement" || d.category === "other");

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
      await apiRequest("POST", `/api/properties/${propertyId}/documents`, {
        tenantId: tenantId === "none" ? null : Number(tenantId),
        category: "agreement",
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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Link to tenant (optional)</label>
          <Select value={tenantId} onValueChange={setTenantId}>
            <SelectTrigger className="w-56" data-testid="select-doc-tenant"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Property-wide (no tenant)</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.tenantName || `Flat ${t.flat}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" data-testid="input-file" onChange={onPick} />
        <Button data-testid="button-upload-doc" className="bg-primary text-primary-foreground" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> {uploading ? "Uploading…" : "Upload agreement / document"}
        </Button>
      </div>

      {agreements.length === 0 ? (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate"
          data-testid="button-upload-doc-empty"
        >
          <Paperclip className="h-5 w-5" />
          <span className="text-sm font-medium">No documents yet</span>
          <span className="text-xs">Upload a signed tenancy agreement or any property document (PDF or image, max 8MB)</span>
        </button>
      ) : (
        <div className="space-y-2">
          {agreements.map((d) => (
            <DocRow key={d.id} propertyId={propertyId} doc={d} tenants={tenants} tenantLabel={tenantName(d.tenantId)} onDelete={() => del.mutate(d.id)} />
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
      <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
        <p className="text-xs text-muted-foreground">{tenantLabel} · {fmtSize(doc.fileSize)}</p>
      </div>
      {linkedTenant && (
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
