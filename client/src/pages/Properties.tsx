import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, ChevronRight, Home as HomeIcon } from "lucide-react";

export default function Properties() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [addr, setAddr] = useState("");
  const [to, setTo] = useState("");
  const [feePercent, setFeePercent] = useState(10);
  const [feeBase, setFeeBase] = useState("total_income");

  const { data: properties, isLoading } = useQuery<Property[]>({ queryKey: ["/api/properties"] });

  const create = useMutation({
    mutationFn: async (): Promise<Property> => {
      const res = await apiRequest("POST", "/api/properties", {
        propertyAddress: addr, statementTo: to, deliveryMethod: "By Email",
        companyName: "Skylimit Estates Limited", companyAddress: "45 Stamford Hill, London N16 5SR",
        companyEmail: "dg@skylimitestates.com", managementFeePercent: feePercent, managementFeeBase: feeBase,
        footerNote: "We thank you for your custom!",
      });
      return res.json();
    },
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      setOpen(false); setAddr(""); setTo(""); setFeePercent(10); setFeeBase("total_income");
      toast({ title: "Property added", description: "Now add its tenants." });
      navigate(`/property/${p.id}`);
    },
  });

  function submit() {
    if (!addr.trim()) { toast({ title: "Address required", variant: "destructive" }); return; }
    create.mutate();
  }

  const addBtn = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-property" className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1.5" /> Add Property</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a property</DialogTitle>
          <DialogDescription>Save a property once; reuse it for tenants, compliance, maintenance and statements.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Property address</Label>
            <Input data-testid="input-new-property-address" value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="15 Princes Avenue, Greenford, UB6 9BS" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Statement to (landlord)</Label>
            <Input data-testid="input-new-property-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Better Mansions Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Management fee (%)</Label>
              <Input type="number" step="0.5" data-testid="input-new-property-fee" value={feePercent} onChange={(e) => setFeePercent(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Fee on</Label>
              <Select value={feeBase} onValueChange={setFeeBase}>
                <SelectTrigger data-testid="select-new-property-base"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total_income">Rent Collected</SelectItem>
                  <SelectItem value="sub_total">Sub Total</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button data-testid="button-save-new-property" className="bg-primary text-primary-foreground" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Adding…" : "Add property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppShell title="Properties">
      <div className="flex justify-end mb-5">{addBtn}</div>

      {isLoading && <div className="grid sm:grid-cols-2 gap-3">{[1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>}

      {!isLoading && (!properties || properties.length === 0) && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <HomeIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No properties yet</p>
          <p className="text-sm text-muted-foreground mb-5">Add your first property to get started.</p>
          <Button data-testid="button-add-property-empty" className="bg-primary text-primary-foreground" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Add Property</Button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {properties?.map((p) => (
          <button key={p.id} data-testid={`card-property-${p.id}`} onClick={() => navigate(`/property/${p.id}`)}
            className="text-left rounded-xl border border-card-border bg-card p-5 hover-elevate flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate">{p.propertyAddress}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">To {p.statementTo || "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Fee {p.managementFeePercent}% on {p.managementFeeBase === "sub_total" ? "Sub Total" : "Rent Collected"}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </AppShell>
  );
}
