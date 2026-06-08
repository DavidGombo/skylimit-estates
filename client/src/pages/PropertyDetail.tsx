import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property, Tenant, Room, Certificate } from "@shared/schema";
import { gbp, penceToPounds, poundsToPence } from "@/lib/statement";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, FileOutput, Users, FolderOpen, ShieldCheck, DoorOpen, Plug, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { TenantCard } from "@/components/TenantCard";
import { DocumentsSection } from "@/components/DocumentsSection";
import { ComplianceSection } from "@/components/ComplianceSection";
import { MaintenanceSection } from "@/components/MaintenanceSection";
import { RoomsSection } from "@/components/RoomsSection";
import { FraActionsSection } from "@/components/FraActionsSection";
import { Wrench } from "lucide-react";

export default function PropertyDetail() {
  const [, params] = useRoute("/property/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = params?.id ? Number(params.id) : null;

  const { data: property } = useQuery<Property>({ queryKey: ["/api/properties", id], enabled: id != null });
  const { data: tenants } = useQuery<Tenant[]>({ queryKey: ["/api/properties", id, "tenants"], enabled: id != null });
  const { data: rooms } = useQuery<Room[]>({ queryKey: ["/api/properties", id, "rooms"], enabled: id != null });
  const { data: certs } = useQuery<Certificate[]>({ queryKey: ["/api/properties", id, "certificates"], enabled: id != null });

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
        isMultiRoom: form.isMultiRoom ?? 0,
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

  const addTenant = useMutation({
    mutationFn: () => apiRequest("POST", `/api/properties/${id}/tenants`, {
      propertyId: id, flat: "", tenantName: "", monthlyRent: 0, active: 1,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/properties", id, "tenants"] }),
  });

  const labelCls = "text-xs font-medium text-muted-foreground";
  const card = "rounded-xl border border-card-border bg-card p-5 sm:p-6";

  if (!property) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  const isMultiRoom = (form.isMultiRoom ?? property.isMultiRoom) === 1;
  const roomList = rooms ?? [];

  return (
    <div className="min-h-screen bg-background pb-12">
      <AppHeader
        title={property.propertyAddress}
        subtitle={`To ${property.statementTo || "—"}`}
        back={{ href: "/properties" }}
        right={
          <Button data-testid="button-produce" className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold" onClick={() => navigate(`/new/${id}`)}>
            <FileOutput className="h-4 w-4 mr-1.5" /> Produce Statement
          </Button>
        }
      />

      <main className="mx-auto max-w-5xl px-6 py-7 space-y-6">
        {/* Rooms (multi-room / HMO only) */}
        {isMultiRoom && (
          <section className={card}>
            <div className="flex items-center gap-2 mb-1">
              <DoorOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Rooms</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Individual lettable rooms in this HMO. Tenants, certificates, utilities and maintenance can be scoped to a room.</p>
            <RoomsSection propertyId={id!} rooms={roomList} tenants={tenants ?? []} certs={certs ?? []} />
          </section>
        )}

        {/* Tenants */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Tenants</h2>
            </div>
            <Button variant="outline" size="sm" data-testid="button-add-tenant" onClick={() => addTenant.mutate()} disabled={addTenant.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add tenant
            </Button>
          </div>
          {(tenants ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No tenants yet. Click “Add tenant” to create one.</p>
          ) : (
            <div className="space-y-2.5">
              {tenants!.map((t) => <TenantCard key={t.id} propertyId={id!} tenant={t} rooms={roomList} isMultiRoom={isMultiRoom} />)}
            </div>
          )}
          <div className="mt-5 rounded-lg bg-secondary/60 border border-border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Ready to produce a statement? Rent fills in automatically, and you can add <span className="font-medium text-foreground">invoices &amp; expenses</span> on the statement screen.
            </p>
            <Button data-testid="button-produce-inline" className="bg-primary text-primary-foreground shrink-0" onClick={() => navigate(`/new/${id}`)}>
              <FileOutput className="h-4 w-4 mr-1.5" /> Produce Statement
            </Button>
          </div>
        </section>

        {/* Documents / Tenancy agreements */}
        <section className={card}>
          <div className="flex items-center gap-2 mb-1">
            <FolderOpen className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Tenancy agreements & documents</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Store signed tenancy agreements and any property paperwork. Link a document to a specific tenant or keep it property-wide.</p>
          <DocumentsSection propertyId={id!} tenants={tenants ?? []} />
        </section>

        {/* Compliance */}
        <section className={card}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Compliance & safety certificates</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Track Gas Safety, EICR, EPC, HMO licence and other certificates with expiry dates. Attach the file and run the AI check for findings & recommendations.</p>
          <ComplianceSection propertyId={id!} rooms={roomList} isMultiRoom={isMultiRoom} />
          <div className="mt-6 pt-5 border-t border-border">
            <FraActionsSection propertyId={id!} />
          </div>
        </section>

        {/* Utilities & Council Tax — managed centrally in the Utilities hub */}
        <Link href="/utilities">
          <button type="button" data-testid="link-utilities-hub" className="w-full text-left rounded-xl border border-card-border bg-card p-5 sm:p-6 hover-elevate flex items-center gap-3">
            <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
              <Plug className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-semibold text-foreground">Utilities & council tax</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Council tax bands, supplier accounts and renewals are now managed centrally in the Utilities hub.</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        </Link>

        {/* Maintenance */}
        <section className={card}>
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Maintenance</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Log repairs and issues by type. Run AI troubleshooting for a diagnosis and step-by-step guidance.</p>
          <MaintenanceSection propertyId={id!} tenants={tenants ?? []} rooms={roomList} isMultiRoom={isMultiRoom} />
        </section>

        {/* Property details */}
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Property & landlord details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={labelCls}>Property address</Label>
              <Input data-testid="input-prop-address" value={form.propertyAddress ?? ""} onChange={(e) => setForm(f => ({ ...f, propertyAddress: e.target.value }))} />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-3">
              <div>
                <Label className="text-sm font-medium text-foreground">Multi-room (HMO)</Label>
                <p className="text-xs text-muted-foreground">Enable to manage individual rooms and scope tenants, certificates & utilities per room.</p>
              </div>
              <Switch checked={(form.isMultiRoom ?? 0) === 1} data-testid="switch-multiroom"
                onCheckedChange={(v) => setForm(f => ({ ...f, isMultiRoom: v ? 1 : 0 }))} />
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
