import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Tenant, Room } from "@shared/schema";
import { penceToPounds, poundsToPence, gbp } from "@/lib/statement";
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
import { ChevronDown, Trash2, Save, User } from "lucide-react";

const labelCls = "text-xs font-medium text-muted-foreground";

export function TenantCard({ propertyId, tenant, rooms = [], isMultiRoom = false }: { propertyId: number; tenant: Tenant; rooms?: Room[]; isMultiRoom?: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<Tenant>(tenant);
  useEffect(() => { setT(tenant); }, [tenant]);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/tenants/${tenant.id}`, {
      flat: t.flat, tenantName: t.tenantName, monthlyRent: t.monthlyRent, active: t.active, roomId: t.roomId,
      email: t.email, phone: t.phone, tenancyStart: t.tenancyStart, tenancyEnd: t.tenancyEnd,
      depositAmount: t.depositAmount, depositScheme: t.depositScheme, idReference: t.idReference, notes: t.notes,
      niNumber: t.niNumber, rentPeriodStart: t.rentPeriodStart, rentPeriodEnd: t.rentPeriodEnd,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({ title: "Tenant saved" });
    },
  });

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/tenants/${tenant.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({ title: "Tenant removed" });
    },
  });

  const set = (patch: Partial<Tenant>) => setT((p) => ({ ...p, ...patch }));

  return (
    <div className="rounded-lg border border-card-border bg-card" data-testid={`tenant-card-${tenant.id}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover-elevate rounded-lg"
        data-testid={`button-expand-tenant-${tenant.id}`}
      >
        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Flat {t.flat || "—"}</span>
            {t.active === 0 && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Past</span>}
          </div>
          <p className="font-semibold text-foreground truncate">{t.tenantName || "Unnamed tenant"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold tabular-nums">{gbp(penceToPounds(t.monthlyRent))}</p>
          <p className="text-xs text-muted-foreground">per month</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className={labelCls}>Flat / unit</Label>
              <Input value={t.flat} data-testid={`input-flat-${tenant.id}`} onChange={(e) => set({ flat: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={labelCls}>Tenant name</Label>
              <Input value={t.tenantName} data-testid={`input-name-${tenant.id}`} onChange={(e) => set({ tenantName: e.target.value })} />
            </div>
            {isMultiRoom && (
              <div className="space-y-1.5">
                <Label className={labelCls}>Room</Label>
                <Select value={t.roomId == null ? "none" : String(t.roomId)} onValueChange={(v) => set({ roomId: v === "none" ? null : Number(v) })}>
                  <SelectTrigger data-testid={`select-room-${tenant.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole property</SelectItem>
                    {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name || `Room ${r.id}`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className={labelCls}>Email</Label>
              <Input type="email" value={t.email} data-testid={`input-email-${tenant.id}`} onChange={(e) => set({ email: e.target.value })} placeholder="tenant@email.com" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Phone</Label>
              <Input value={t.phone} data-testid={`input-phone-${tenant.id}`} onChange={(e) => set({ phone: e.target.value })} placeholder="07…" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Monthly rent (£)</Label>
              <Input type="number" step="0.01" value={t.monthlyRent === 0 ? "" : penceToPounds(t.monthlyRent)} placeholder="0.00"
                data-testid={`input-rent-${tenant.id}`}
                onChange={(e) => set({ monthlyRent: e.target.value === "" ? 0 : poundsToPence(parseFloat(e.target.value) || 0) })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Tenancy start</Label>
              <Input type="date" value={t.tenancyStart} data-testid={`input-start-${tenant.id}`} onChange={(e) => set({ tenancyStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Tenancy end</Label>
              <Input type="date" value={t.tenancyEnd} data-testid={`input-end-${tenant.id}`} onChange={(e) => set({ tenancyEnd: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Deposit (£)</Label>
              <Input type="number" step="0.01" value={t.depositAmount === 0 ? "" : penceToPounds(t.depositAmount)} placeholder="0.00"
                data-testid={`input-deposit-${tenant.id}`}
                onChange={(e) => set({ depositAmount: e.target.value === "" ? 0 : poundsToPence(parseFloat(e.target.value) || 0) })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Deposit scheme</Label>
              <Select value={t.depositScheme || "none"} onValueChange={(v) => set({ depositScheme: v === "none" ? "" : v })}>
                <SelectTrigger data-testid={`select-scheme-${tenant.id}`}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="DPS">DPS (Deposit Protection Service)</SelectItem>
                  <SelectItem value="MyDeposits">MyDeposits</SelectItem>
                  <SelectItem value="TDS">TDS (Tenancy Deposit Scheme)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>ID / Right-to-rent ref</Label>
              <Input value={t.idReference} data-testid={`input-id-${tenant.id}`} onChange={(e) => set({ idReference: e.target.value })} placeholder="Passport / share code" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>NI number</Label>
              <Input value={t.niNumber || ""} data-testid={`input-ni-${tenant.id}`} onChange={(e) => set({ niNumber: e.target.value.toUpperCase() })} placeholder="QQ 12 34 56 C" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Rent period start (base)</Label>
              <Input type="date" value={t.rentPeriodStart || ""} data-testid={`input-rpstart-${tenant.id}`} onChange={(e) => set({ rentPeriodStart: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Rent period end (base)</Label>
              <Input type="date" value={t.rentPeriodEnd || ""} data-testid={`input-rpend-${tenant.id}`} onChange={(e) => set({ rentPeriodEnd: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Status</Label>
              <Select value={String(t.active)} onValueChange={(v) => set({ active: Number(v) })}>
                <SelectTrigger data-testid={`select-status-${tenant.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Active</SelectItem>
                  <SelectItem value="0">Past / moved out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className={labelCls}>Notes</Label>
            <Textarea value={t.notes} data-testid={`input-notes-${tenant.id}`} rows={2} onChange={(e) => set({ notes: e.target.value })} placeholder="Any notes about this tenant or tenancy…" />
          </div>
          <div className="flex items-center justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`button-delete-tenant-${tenant.id}`}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Remove tenant
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this tenant?</AlertDialogTitle>
                  <AlertDialogDescription>This removes {t.tenantName || "the tenant"} and their record. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate()}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-save-tenant-${tenant.id}`} onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "Saving…" : "Save tenant"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
