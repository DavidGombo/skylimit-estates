import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Utility, Room } from "@shared/schema";
import { UTILITY_LABELS } from "@shared/schema";
import { gbp, penceToPounds, poundsToPence } from "@/lib/statement";
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
import { Plus, Trash2, Save, ChevronDown, Gauge, Receipt } from "lucide-react";

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

export function UtilitiesSection({
  propertyId, rooms = [], isMultiRoom = false,
}: { propertyId: number; rooms?: Room[]; isMultiRoom?: boolean }) {
  const [adding, setAdding] = useState(false);
  const { data: utils } = useQuery<Utility[]>({ queryKey: ["/api/properties", propertyId, "utilities"] });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" data-testid="button-add-utility" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add utility
        </Button>
      </div>

      {adding && <UtilForm propertyId={propertyId} rooms={rooms} isMultiRoom={isMultiRoom} onDone={() => setAdding(false)} />}

      {(!utils || utils.length === 0) && !adding && (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate" data-testid="button-add-utility-empty">
          <Gauge className="h-5 w-5" />
          <span className="text-sm font-medium">No utilities recorded</span>
          <span className="text-xs">Add council tax band, supplier accounts and renewal dates</span>
        </button>
      )}

      <div className="space-y-2.5 mt-1">
        {utils?.map((u) => <UtilCard key={u.id} propertyId={propertyId} util={u} rooms={rooms} isMultiRoom={isMultiRoom} />)}
      </div>
    </div>
  );
}

function RoomSelect({ value, onChange, rooms }: { value: number | null; onChange: (v: number | null) => void; rooms: Room[] }) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>Room</Label>
      <Select value={value == null ? "none" : String(value)} onValueChange={(v) => onChange(v === "none" ? null : Number(v))}>
        <SelectTrigger data-testid="select-utility-room"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Whole property</SelectItem>
          {rooms.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name || `Room ${r.id}`}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function UtilFormFields({ f, set, rooms, isMultiRoom }: { f: UtilFields; set: (patch: Partial<UtilFields>) => void; rooms: Room[]; isMultiRoom: boolean }) {
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
      {isMultiRoom && <RoomSelect value={f.roomId} onChange={(v) => set({ roomId: v })} rooms={rooms} />}
      <div className="space-y-1.5 sm:col-span-2">
        <Label className={labelCls}>Notes</Label>
        <Textarea value={f.notes} rows={2} data-testid="input-utility-notes" onChange={(e) => set({ notes: e.target.value })} />
      </div>
    </div>
  );
}

function buildBody(f: UtilFields) {
  return {
    utilityType: f.utilityType, provider: f.provider, accountRef: f.accountRef,
    council_tax_band: f.utilityType === "council_tax" ? f.council_tax_band : "",
    annualAmount: f.annualPounds === "" ? 0 : poundsToPence(parseFloat(f.annualPounds) || 0),
    responsibleParty: f.responsibleParty, renewalDate: f.renewalDate, notes: f.notes, roomId: f.roomId,
  };
}

function UtilForm({ propertyId, rooms, isMultiRoom, onDone }: { propertyId: number; rooms: Room[]; isMultiRoom: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [f, setF] = useState<UtilFields>(blankFields());
  const set = (patch: Partial<UtilFields>) => setF((p) => ({ ...p, ...patch }));

  const create = useMutation({
    mutationFn: () => apiRequest("POST", `/api/properties/${propertyId}/utilities`, buildBody(f)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "utilities"] });
      toast({ title: "Utility added" });
      onDone();
    },
    onError: () => toast({ title: "Could not add utility", variant: "destructive" }),
  });

  return (
    <div className="rounded-lg border border-card-border bg-secondary/40 p-4 mb-4 space-y-3" data-testid="add-utility-form">
      <UtilFormFields f={f} set={set} rooms={rooms} isMultiRoom={isMultiRoom} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-save-utility" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Add utility"}
        </Button>
      </div>
    </div>
  );
}

function UtilCard({ propertyId, util, rooms, isMultiRoom }: { propertyId: number; util: Utility; rooms: Room[]; isMultiRoom: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<UtilFields>({
    utilityType: util.utilityType, provider: util.provider, accountRef: util.accountRef,
    council_tax_band: util.council_tax_band, annualPounds: util.annualAmount ? String(penceToPounds(util.annualAmount)) : "",
    responsibleParty: util.responsibleParty, renewalDate: util.renewalDate, notes: util.notes, roomId: util.roomId,
  });
  const set = (patch: Partial<UtilFields>) => setF((p) => ({ ...p, ...patch }));
  const isCT = util.utilityType === "council_tax";
  const roomName = util.roomId != null ? (rooms.find((r) => r.id === util.roomId)?.name || `Room ${util.roomId}`) : null;

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/utilities/${util.id}`, buildBody(f)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "utilities"] });
      toast({ title: "Saved" });
    },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/utilities/${util.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "utilities"] });
      toast({ title: "Utility removed" });
    },
  });

  return (
    <div className="rounded-lg border border-card-border bg-card" data-testid={`utility-card-${util.id}`}>
      <div className="flex items-center gap-3 p-4">
        <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
          {isCT ? <Receipt className="h-4 w-4 text-primary" /> : <Gauge className="h-4 w-4 text-primary" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{UTILITY_LABELS[util.utilityType] || util.utilityType}</span>
            {isCT && util.council_tax_band && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">Band {util.council_tax_band}</span>}
            {roomName && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-secondary text-muted-foreground" data-testid={`utility-room-${util.id}`}>{roomName}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isCT ? (
              <>{util.provider || "Council"}{util.annualAmount ? ` · ${gbp(penceToPounds(util.annualAmount))}/yr` : ""}</>
            ) : (
              <>{util.provider || "—"}{util.accountRef ? ` · ${util.accountRef}` : ""} · {RESP_LABELS[util.responsibleParty] || util.responsibleParty}{util.renewalDate ? ` · renews ${fmtDate(util.renewalDate)}` : ""}</>
            )}
          </p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="p-1.5 rounded hover-elevate" data-testid={`button-expand-utility-${util.id}`}>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <UtilFormFields f={f} set={set} rooms={rooms} isMultiRoom={isMultiRoom} />
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
