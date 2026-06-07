import { useEffect, useState } from "react";
import { setAccessKey } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Lock } from "lucide-react";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

type State = "checking" | "open" | "locked" | "ready";

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("checking");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // On load: is an access key required at all?
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/check`)
      .then((r) => r.json())
      .then((d) => setState(d.required ? "locked" : "open"))
      .catch(() => setState("open")); // if check fails, don't hard-block
  }, []);

  async function tryUnlock(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${API_BASE}/api/auth/check`, { headers: { "x-access-key": key } });
      if (r.ok) {
        setAccessKey(key);
        setState("ready");
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Could not verify. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "checking") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground bg-background">Loading…</div>;
  }

  if (state === "locked") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar px-6">
        <form onSubmit={tryUnlock} className="w-full max-w-sm rounded-2xl bg-card border border-card-border p-8 shadow-lg">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Skylimit Estates</h1>
            <p className="text-sm text-muted-foreground">Property Manager</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> Access password</Label>
            <Input type="password" autoFocus data-testid="input-access-key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Enter password" />
          </div>
          {error && <p className="text-xs text-destructive mt-2" data-testid="text-access-error">{error}</p>}
          <Button type="submit" className="w-full mt-5 bg-primary text-primary-foreground" data-testid="button-unlock" disabled={submitting || !key}>
            {submitting ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </div>
    );
  }

  // open (no key needed) or ready (unlocked)
  return <>{children}</>;
}
