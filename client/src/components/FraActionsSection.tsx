import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { FraAction } from "@shared/schema";
import { fmtDate, daysUntil, FRA_PRIORITY_STYLE } from "@/lib/compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Flame } from "lucide-react";

const labelCls = "text-xs font-medium text-muted-foreground";

export function FraActionsSection({ propertyId }: { propertyId: number }) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [action, setAction] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  const { data: actions } = useQuery<FraAction[]>({ queryKey: ["/api/properties", propertyId, "fra-actions"] });

  const sorted = [...(actions ?? [])].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1; // open first
    const da = daysUntil(a.dueDate) ?? 99999, db = daysUntil(b.dueDate) ?? 99999;
    return da - db; // by due date asc
  });

  const add = useMutation({
    mutationFn: () => apiRequest("POST", `/api/properties/${propertyId}/fra-actions`, { action: action.trim(), priority, dueDate, status: "open" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "fra-actions"] });
      toast({ title: "Action added" });
      setAction(""); setPriority("medium"); setDueDate(""); setAdding(false);
    },
    onError: () => toast({ title: "Could not add action", variant: "destructive" }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold text-foreground">Fire-safety to-dos</h3>
        </div>
        <Button variant="outline" size="sm" data-testid="button-add-fra" onClick={() => setAdding((a) => !a)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add to-do
        </Button>
      </div>

      {adding && (
        <div className="rounded-lg border border-card-border bg-secondary/40 p-4 mb-4 space-y-3" data-testid="add-fra-form">
          <div className="space-y-1.5">
            <Label className={labelCls}>Action</Label>
            <Input value={action} data-testid="input-fra-action" placeholder="e.g. Install fire door to kitchen" onChange={(e) => setAction(e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelCls}>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger data-testid="select-fra-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Due date</Label>
              <Input type="date" value={dueDate} data-testid="input-fra-due" onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" className="bg-primary text-primary-foreground" data-testid="button-save-fra" onClick={() => { if (!action.trim()) { toast({ title: "Enter an action", variant: "destructive" }); return; } add.mutate(); }} disabled={add.isPending}>
              {add.isPending ? "Saving…" : "Add to-do"}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No fire-safety actions. These are created automatically when you AI-check a Fire Risk Assessment, or add one manually.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => <FraRow key={a.id} propertyId={propertyId} action={a} />)}
        </div>
      )}
    </div>
  );
}

function FraRow({ propertyId, action }: { propertyId: number; action: FraAction }) {
  const { toast } = useToast();
  const done = action.status === "done";
  const d = daysUntil(action.dueDate);
  const overdue = !done && d !== null && d < 0;
  const ps = FRA_PRIORITY_STYLE[action.priority] || FRA_PRIORITY_STYLE.medium;

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiRequest("PUT", `/api/fra-actions/${action.id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "fra-actions"] }),
  });
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/fra-actions/${action.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId, "fra-actions"] });
      toast({ title: "Action removed" });
    },
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border border-card-border bg-card p-3" data-testid={`fra-row-${action.id}`}>
      <Checkbox checked={done} data-testid={`check-fra-${action.id}`}
        onCheckedChange={(v) => update.mutate({ status: v ? "done" : "open" })} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : "text-foreground"}`}>{action.action || "Untitled action"}</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ps.chip}`}>{ps.label}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Due {fmtDate(action.dueDate)}
          {!done && d !== null && <span className={overdue ? "text-red-600 dark:text-red-400 font-medium" : ""}> · {d < 0 ? `${Math.abs(d)} days overdue` : `in ${d} days`}</span>}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" data-testid={`button-delete-fra-${action.id}`} onClick={() => del.mutate()}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
