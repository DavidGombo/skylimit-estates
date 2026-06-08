import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Room, Tenant, Certificate } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, DoorOpen } from "lucide-react";

const labelCls = "text-xs font-medium text-muted-foreground";

export function RoomsSection({
  propertyId, rooms, tenants = [], certs = [],
}: { propertyId: number; rooms: Room[]; tenants?: Tenant[]; certs?: Certificate[] }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const add = useMutation({
    mutationFn: () => apiRequest("POST", `/api/properties/${propertyId}/rooms`, { name: newName.trim() || "Room", description: "" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rooms"] });
      toast({ title: "Room added" });
      setNewName(""); setAdding(false);
    },
    onError: () => toast({ title: "Could not add room", variant: "destructive" }),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button variant="outline" size="sm" data-testid="button-add-room" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add room
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-card-border bg-secondary/40 p-4 mb-4 flex flex-col sm:flex-row sm:items-end gap-3" data-testid="add-room-form">
          <div className="space-y-1.5 flex-1">
            <Label className={labelCls}>Room name</Label>
            <Input value={newName} data-testid="input-room-name" placeholder="e.g. Room 1, Loft, Flat A" onChange={(e) => setNewName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-save-room" onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Add room"}
            </Button>
          </div>
        </div>
      )}

      {rooms.length === 0 && !adding && (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full rounded-lg border-2 border-dashed border-border py-8 flex flex-col items-center gap-1.5 text-muted-foreground hover-elevate" data-testid="button-add-room-empty">
          <DoorOpen className="h-5 w-5" />
          <span className="text-sm font-medium">No rooms yet</span>
          <span className="text-xs">Add the individual lettable rooms in this HMO</span>
        </button>
      )}

      <div className="space-y-2.5 mt-1">
        {rooms.map((r) => (
          <RoomRow key={r.id} propertyId={propertyId} room={r}
            tenantCount={tenants.filter((t) => t.roomId === r.id).length}
            certCount={certs.filter((c) => c.roomId === r.id).length} />
        ))}
      </div>
    </div>
  );
}

function RoomRow({ propertyId, room, tenantCount, certCount }: { propertyId: number; room: Room; tenantCount: number; certCount: number }) {
  const { toast } = useToast();
  const [name, setName] = useState(room.name);

  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/rooms/${room.id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rooms"] });
      toast({ title: "Room saved" });
    },
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/rooms/${room.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "rooms"] });
      toast({ title: "Room removed" });
    },
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3" data-testid={`room-row-${room.id}`}>
      <div className="h-9 w-9 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <DoorOpen className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <Input value={name} data-testid={`input-room-${room.id}`} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
        <p className="text-xs text-muted-foreground mt-1" data-testid={`room-counts-${room.id}`}>
          {tenantCount} tenant{tenantCount === 1 ? "" : "s"} · {certCount} cert{certCount === 1 ? "" : "s"}
        </p>
      </div>
      <Button size="sm" variant="outline" data-testid={`button-save-room-${room.id}`} onClick={() => save.mutate()} disabled={save.isPending || name === room.name}>
        <Save className="h-3.5 w-3.5 mr-1" /> Save
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-room-${room.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this room?</AlertDialogTitle>
            <AlertDialogDescription>{room.name || "This room"} will be removed. Tenants and certificates attached to it will revert to the whole property.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
