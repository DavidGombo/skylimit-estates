import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Tenant } from "@shared/schema";
import { gbp, penceToPounds, poundsToPence } from "@/lib/statement";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, FileOutput, Users } from "lucide-react";

export default function PropertyDetail() {
  const [, params] = useRoute("/property/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ? Number(params.id) : null;

  const { data: property } = useQuery<Property>({ queryKey: ["/api/properties", id], enabled: id != null });
  const { data: tenants } = useQuery<Tenant[]>({ queryKey: ["/api/properties", id, "tenants"], enabled: id != null });

  // property form state
  const [form, setForm] = useState<Partial<Property>>({});
  useEffect(() => { if (property) setForm(property); }, [property]);

  const saveProp = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/properties/${id}`, {
        propertyAddress: form.propertyAddress ?? "",
        statementTo: form.statementTo ?? "",
        statementToAddress: form.statementToAddress ?? "",
        deliveryMethod: form.deliveryMethod ?? "By Email",
        companyName: form.companyName ?? "Skylimit Estates Limited",
        companyAddress: form.companyAddress ?? "",
        companyEmail: form.companyEmail ?? "",
        managementFeePercent: form.managementFeePercent ?? 10,
        managementFeeBase: form.managementFeeBase ?? "total_income",
        footerNote: form.footerNote ?? "We thank you for your custom!",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property saved" });
    },
  });

  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/properties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: "Property deleted" });
      navigate("/");
    },
  });

  const labelCls = "text-xs font-medium text-muted-foreground";
  const card = "rounded-xl border border-card-border bg-card p-5 sm:p-6";

  if (!property) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background pb-12">
      <AppHeader
        title={property.propertyAddress}
        subtitle={`To ${property.statementTo || "—"}`}
        back={{ href: "/" }}
        right={
          <Button data-testid="button-produce" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" onClick={() => navigate(`/new/${id}`)}>
            <FileOutput className="h-4 w-4 mr-1.5" /> Produce Statement
          </Button>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-7 space-y-6">
        {/* Tenants */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Tenants</h2>
            </div>
          </div>
          <TenantTable propertyId={id!} tenants={tenants ?? []} />
        </section>

        {/* Property details */}
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Property & landlord details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={labelCls}>Property address</Label>
              <Input data-testid="input-prop-address" value={form.propertyAddress ?? ""} onChange={(e) => setForm(f => ({ ...f, propertyAddress: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Statement to (landlord)</Label>
              <Input data-testid="input-prop-to" value={form.statementTo ?? ""} onChange={(e) => setForm(f => ({ ...f, statementTo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Landlord address (optional)</Label>
              <Input data-testid="input-prop-landlord-address" value={form.statementToAddress ?? ""} onChange={(e) => setForm(f => ({ ...f, statementToAddress: e.target.value }))} placeholder="Shown as 'Address:' under Statement to" />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Delivery method</Label>
              <Input data-testid="input-prop-delivery" value={form.deliveryMethod ?? ""} onChange={(e) => setForm(f => ({ ...f, deliveryMethod: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={labelCls}>Management fee (%)</Label>
                <Input type="number" step="0.5" data-testid="input-prop-fee" value={form.managementFeePercent ?? 0} onChange={(e) => setForm(f => ({ ...f, managementFeePercent: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Fee charged on</Label>
                <Select value={form.managementFeeBase ?? "total_income"} onValueChange={(v) => setForm(f => ({ ...f, managementFeeBase: v }))}>
                  <SelectTrigger data-testid="select-prop-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="total_income">Rent Collected (Total Income)</SelectItem>
                    <SelectItem value="sub_total">Sub Total (after disbursements)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-5">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-delete-property" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete property
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this property?</AlertDialogTitle>
                  <AlertDialogDescription>This removes {property.propertyAddress} and its tenants. Saved statements are kept. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete-property" onClick={() => del.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button data-testid="button-save-property" className="bg-primary text-primary-foreground" onClick={() => saveProp.mutate()} disabled={saveProp.isPending}>
              <Save className="h-4 w-4 mr-1.5" /> {saveProp.isPending ? "Saving…" : "Save details"}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function TenantTable({ propertyId, tenants }: { propertyId: number; tenants: Tenant[] }) {
  const { toast } = useToast();
  // local editable copies
  const [rows, setRows] = useState<Tenant[]>([]);
  useEffect(() => { setRows(tenants); }, [tenants]);

  const addTenant = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/properties/${propertyId}/tenants`, {
        propertyId, flat: "", tenantName: "", monthlyRent: 0, active: 1,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] }),
  });

  const updateTenant = useMutation({
    mutationFn: ({ tid, patch }: { tid: number; patch: Partial<Tenant> }) =>
      apiRequest("PUT", `/api/tenants/${tid}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] }),
  });

  const deleteTenant = useMutation({
    mutationFn: (tid: number) => apiRequest("DELETE", `/api/tenants/${tid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "tenants"] });
      toast({ title: "Tenant removed" });
    },
  });

  function setLocal(tid: number, patch: Partial<Tenant>) {
    setRows(rs => rs.map(r => (r.id === tid ? { ...r, ...patch } : r)));
  }
  function commit(tid: number) {
    const row = rows.find(r => r.id === tid);
    if (!row) return;
    updateTenant.mutate({ tid, patch: { flat: row.flat, tenantName: row.tenantName, monthlyRent: row.monthlyRent, active: row.active } });
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 pr-2 font-medium w-[14%]">Flat</th>
              <th className="py-2 px-2 font-medium w-[44%]">Tenant name</th>
              <th className="py-2 px-2 font-medium">Monthly rent</th>
              <th className="py-2 pl-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No tenants yet. Add one below.</td></tr>
            )}
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border/60" data-testid={`row-tenant-${t.id}`}>
                <td className="py-2 pr-2"><Input className="h-9 text-sm" value={t.flat} placeholder="1" data-testid={`input-tenant-flat-${t.id}`} onChange={(e) => setLocal(t.id, { flat: e.target.value })} onBlur={() => commit(t.id)} /></td>
                <td className="py-2 px-2"><Input className="h-9 text-sm" value={t.tenantName} placeholder="Tenant name" data-testid={`input-tenant-name-${t.id}`} onChange={(e) => setLocal(t.id, { tenantName: e.target.value })} onBlur={() => commit(t.id)} /></td>
                <td className="py-2 px-2">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
                    <Input className="h-9 pl-5 text-sm text-right tabular-nums" type="number" step="0.01" data-testid={`input-tenant-rent-${t.id}`}
                      value={t.monthlyRent === 0 ? "" : penceToPounds(t.monthlyRent)} placeholder="0.00"
                      onChange={(e) => setLocal(t.id, { monthlyRent: e.target.value === "" ? 0 : poundsToPence(parseFloat(e.target.value) || 0) })}
                      onBlur={() => commit(t.id)} />
                  </div>
                </td>
                <td className="py-2 pl-2">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" data-testid={`button-remove-tenant-${t.id}`} onClick={() => deleteTenant.mutate(t.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" className="mt-3" data-testid="button-add-tenant" onClick={() => addTenant.mutate()} disabled={addTenant.isPending}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add tenant
      </Button>
      <p className="text-xs text-muted-foreground mt-2">Changes save automatically when you click away from a field.</p>
    </div>
  );
}
