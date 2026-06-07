import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getAccessKey } from "@/lib/queryClient";
import type { Document, Tenant } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Trash2, Paperclip } from "lucide-react";

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
            <div key={d.id} className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3" data-testid={`doc-${d.id}`}>
              <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                <p className="text-xs text-muted-foreground">{tenantName(d.tenantId)} · {fmtSize(d.fileSize)}</p>
              </div>
              <a href={fileUrl(d.id)} target="_blank" rel="noreferrer" data-testid={`link-view-${d.id}`}>
                <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1" /> View</Button>
              </a>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-doc-${d.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                    <AlertDialogDescription>{d.title} will be permanently removed.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate(d.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
