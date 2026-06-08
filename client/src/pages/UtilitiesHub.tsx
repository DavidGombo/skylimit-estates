import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Utility, Property, Room } from "@shared/schema";
import { UTILITY_LABELS } from "@shared/schema";
import { AppShell } from "@/components/AppShell";
import { HubStat } from "@/components/HubStat";
import { HubToolbar } from "@/components/HubToolbar";
import { gbp, penceToPounds, poundsToPence } from "@/lib/statement";
import { fmtDate, daysUntil } from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, ChevronDown, Gauge, Receipt, Plug } from "lucide-react";

type UtilityRow = Utility & { propertyAddress: string; roomName: string };

const labelCls = "text-xs font-medium text-muted-foreground";
const CT_BANDS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const RESP_LABELS: Record<string, string> = { landlord: "Landlord pays", tenant: "Tenant pays", included: "Included in rent" };

interface UtilFields {
  utilityType: string; provider: string; accountRef: string; council_tax_band: string;
  annualPounds: string; responsibleParty: string; renewalDate: string; notes: string; roomId: number | null;
}
function blankFields(): UtilFields {
  return { utilityType: "council_tax", provider: "", accountRef: "", council_tax_band: "", annualPounds: "", responsibleParty: "landlord", renewalDate: "", notes: "", roomId: null };
}
function buildBody(f: UtilFields) {
  return {
    utilityType: f.utilityType, provider: f.provider, accountRef: f.accountRef,
    council_tax_band: f.utilityType === "council_tax" ? f.council_tax_band : "",
    annualAmount: f.annualPounds === "" ? 0 : poundsToPence(parseFloat(f.annualPounds) || 0),
    responsibleParty: f.responsibleParty, renewalDate: f.renewalDate, notes: f.notes, roomId: f.roomId,
  };
}

function UtilFormFields({ f, set, rooms, showRoom }: { f: UtilFields; set: (patch: Partial<UtilFields>) => void; rooms: Room[]; showRoom: boolean }) {
  const isCT = f.utilityType === "council_tax";
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className={labelCls}>Utility type</Label>
        <Select value={f.utilityType} onValueChange={(v) => set({ utilityType: v })}>
          <SelectTrigger data-testid="select-utility-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(UTILITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>{isCT ? "Council" : "Provider / supplier"}</Label>
        <Input value={f.provider} data-testid="input-utility-provider" placeholder={isCT ? "e.g. Hackney Council" : "e.g. British Gas"} onChange={(e) => set({ provider: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Account / reference</Label>
        <Input value={f.accountRef} data-testid="input-utility-ref" onChange={(e) => set({ accountRef: e.target.value })} />
      </div>
      {isCT && (
        <div className="space-y-1.5">
          <Label className={labelCls}>Council tax band</Label>
          <Select value={f.council_tax_band || "none"} onValueChange={(v) => set({ council_tax_band: v === "none" ? "" : v })}>
            <SelectTrigger data-testid="select-utility-band"><SelectValue placeholder="Select band" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {CT_BANDS.map((b) => <SelectItem key={b} value={b}>Band {b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className={labelCls}>Annual amount (£/yr)</Label>
        <Input type="number" step="0.01" value={f.annualPounds} data-testid="input-utility-amount" placeholder="0.00" onChange={(e) => set({ annualPounds: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Responsible party</Label>
        <Select value={f.responsibleParty} onValueChange={(v) => set({ responsibleParty: v })}>
          <SelectTrigger data-testid="select-utility-resp"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="landlord">Landlord pays</SelectItem>
            <SelectItem value="tenant">Tenant pays</SelectItem>
            <SelectItem value="included">Included in rent</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Renewal date</Label>
        <Input type="date" value={f.renewalDate} data-testid="input-utility-renewal" onChange={(e) => set({ renewalDate: e.target.value })} />
      </div>
      {showRoom && (
        <div className="space-y-1.5">
          <Label className={labelCls}>Room</Label>
          <Select value={f.roomId == null ? "none" : String(f.roomId)} onValueChange={(v) => set({ roomId: v === "none" ? null : Number(v) })}>
            <SelectTrigger data-testid="select-utility-room"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Whole property</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name || `Room ${r.id}`}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5 sm:col-span-2">
        <Label className={labelCls}>Notes</Label>
        <Textarea value={f.notes} rows={2} data-testid="input-utility-notes" onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

function AddUtilityDialog({ properties }: { properties: Property[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [f, setF] = useState<UtilFields>(blankFields());
  const set = (patch: Partial<UtilFields>) => setF((p) => ({ ...p, ...patch }));

  const property = properties.find((p) => p.id === propertyId);
  const isMultiRoom = property?.isMultiRoom === 1;
  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/properties", propertyId, "rooms"],
    enabled: propertyId != null && isMultiRoom,
  });

  const create = useMutation({
    mutationFn: () => {
      if (propertyId == null) throw new Error("no property");
      return apiRequest("POST", `/api/properties/${propertyId}/utilities`, buildBody(f));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/utilities"] });
      toast({ title: "Utility added" });
      setOpen(false); setPropertyId(null); setF(blankFields());
    },
    onError: () => toast({ title: "Could not add utility", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPropertyId(null); setF(blankFields()); } }}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground" data-testid="button-add-utility"><Plus className="h-4 w-4 mr-1.5" /> Add utility</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a utility or council tax record</DialogTitle>
          <DialogDescription>Choose the property, then enter the account or council tax details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelCls}>Property</Label>
              <Select value={propertyId == null ? "" : String(propertyId)} onValueChange={(v) => { setPropertyId(Number(v)); set({ roomId: null }); }}>
                <SelectTrigger data-testid="select-utility-property"><SelectValue placeholder="Select a property" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.propertyAddress}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {propertyId != null && <UtilFormFields f={f} set={set} rooms={rooms ?? []} showRoom={isMultiRoom} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="bg-primary text-primary-foreground" data-testid="button-save-utility" disabled={propertyId == null || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Saving…" : "Add utility"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UtilRow({ util, properties }: { util: UtilityRow; properties: Property[] }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<UtilFields>({
    utilityType: util.utilityType, provider: util.provider, accountRef: util.accountRef,
    council_tax_band: util.council_tax_band, annualPounds: util.annualAmount ? String(penceToPounds(util.annualAmount)) : "",
    responsibleParty: util.responsibleParty, renewalDate: util.renewalDate, notes: util.notes, roomId: util.roomId,
  });
  const set = (patch: Partial<UtilFields>) => setF((p) => ({ ...p, ...patch }));
  const isCT = util.utilityType === "council_tax";
  const property = properties.find((p) => p.id === util.propertyId);
  const isMultiRoom = property?.isMultiRoom === 1;
  const { data: rooms } = useQuery<Room[]>({
    queryKey: ["/api/properties", util.propertyId, "rooms"],
    enabled: open && isMultiRoom,
  });

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/utilities/${util.id}`, buildBody(f)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/utilities"] }); toast({ title: "Saved" }); },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/utilities/${util.id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/utilities"] }); toast({ title: "Utility removed" }); },
  });

  const d = util.renewalDate ? daysUntil(util.renewalDate) : null;
  const renewalSoon = d !== null && d <= 30;

  return (
    <div data-testid={`utility-row-${util.id}`}>
      <div className="w-full flex items-center gap-3 p-4 first:rounded-t-xl">
        <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
          {isCT ? <Receipt className="h-4 w-4 text-primary" /> : <Gauge className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">{UTILITY_LABELS[util.utilityType] || util.utilityType}</span>
            {isCT && util.council_tax_band && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">Band {util.council_tax_band}</span>}
            {util.roomName && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-secondary text-muted-foreground" data-testid={`utility-room-${util.id}`}>{util.roomName}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {util.propertyAddress}
            {isCT ? (
              <>{util.provider ? ` · ${util.provider}` : ""}{util.annualAmount ? ` · ${gbp(penceToPounds(util.annualAmount))}/yr` : ""}</>
            ) : (
              <>{util.provider ? ` · ${util.provider}` : ""}{util.accountRef ? ` · ${util.accountRef}` : ""} · {RESP_LABELS[util.responsibleParty] || util.responsibleParty}
                {util.renewalDate ? <> · renews {fmtDate(util.renewalDate)}{d !== null && <span className={renewalSoon ? "text-destructive font-medium" : ""}> ({d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`})</span>}</> : ""}</>
            )}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover-elevate shrink-0" data-testid={`button-expand-utility-${util.id}`}>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{open ? "Collapse" : "Edit details"}</TooltipContent>
        </Tooltip>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <UtilFormFields f={f} set={set} rooms={rooms ?? []} showRoom={isMultiRoom} />
          <div className="flex items-center justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" data-testid={`button-delete-utility-${util.id}`}>
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this utility?</AlertDialogTitle>
                  <AlertDialogDescription>This record will be removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button size="sm" className="bg-primary text-primary-foreground" data-testid={`button-save-utility-${util.id}`} onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="h-4 w-4 mr-1.5" /> {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UtilitiesHub() {
  const { data: utils, isLoading } = useQuery<UtilityRow[]>({ queryKey: ["/api/utilities"] });
  const { data: properties } = useQuery<Property[]>({ queryKey: ["/api/properties"] });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [propFilter, setPropFilter] = useState("all");

  const all = utils ?? [];
  const councilTaxTotal = all.filter((u) => u.utilityType === "council_tax").reduce((s, u) => s + (u.annualAmount || 0), 0);
  const accountCount = all.filter((u) => u.utilityType !== "council_tax").length;
  const renewalsDue = all.filter((u) => { const d = u.renewalDate ? daysUntil(u.renewalDate) : null; return d !== null && d <= 30; }).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((u) => typeFilter === "all" || u.utilityType === typeFilter)
      .filter((u) => propFilter === "all" || String(u.propertyId) === propFilter)
      .filter((u) => !q || [u.provider, u.accountRef, u.propertyAddress, UTILITY_LABELS[u.utilityType] || ""].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => {
        if (a.utilityType === "council_tax" && b.utilityType !== "council_tax") return -1;
        if (b.utilityType === "council_tax" && a.utilityType !== "council_tax") return 1;
        return a.propertyAddress.localeCompare(b.propertyAddress);
      });
  }, [all, search, typeFilter, propFilter]);

  const typeOptions = [{ value: "all", label: "All types" }, ...Object.entries(UTILITY_LABELS).map(([k, v]) => ({ value: k, label: v }))];
  const propOptions = [{ value: "all", label: "All properties" }, ...(properties ?? []).map((p) => ({ value: String(p.id), label: p.propertyAddress }))];

  return (
    <AppShell title="Utilities & Council Tax">
      <div className="flex justify-end mb-5">
        <AddUtilityDialog properties={properties ?? []} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <HubStat label="Total council tax /yr" count={gbp(penceToPounds(councilTaxTotal))} icon={Receipt} tone="neutral" />
        <HubStat label="Utility accounts" count={accountCount} icon={Plug} tone="neutral" />
        <HubStat label="Renewals due ≤30d" count={renewalsDue} icon={Gauge} tone={renewalsDue ? "warn" : "neutral"} />
      </div>

      <HubToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search provider, account or property…"
        selects={[
          { value: typeFilter, onChange: setTypeFilter, options: typeOptions, testId: "filter-utility-type" },
          { value: propFilter, onChange: setPropFilter, options: propOptions, testId: "filter-utility-property" },
        ]}
      />

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>}

      {!isLoading && all.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center" data-testid="utilities-empty">
          <Plug className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="font-medium text-foreground">No utilities recorded yet</p>
          <p className="text-sm text-muted-foreground">Add council tax bands, supplier accounts and renewal dates with “Add utility”.</p>
        </div>
      )}

      {!isLoading && all.length > 0 && filtered.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center" data-testid="utilities-no-match">
          <Plug className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No utilities match your filters.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card divide-y divide-border">
          {filtered.map((u) => <UtilRow key={u.id} util={u} properties={properties ?? []} />)}
        </div>
      )}
    </AppShell>
  );
}
