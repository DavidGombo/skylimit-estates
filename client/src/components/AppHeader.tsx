import { Link } from "wouter";
import { Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader({ title, subtitle, back, right }: {
  title: string;
  subtitle?: string;
  back?: { href: string; label?: string };
  right?: React.ReactNode;
}) {
  return (
    <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border sticky top-0 z-20">
      <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {back ? (
            <Link href={back.href}>
              <Button variant="ghost" size="icon" data-testid="button-back" className="text-sidebar-foreground hover:bg-white/10 shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          ) : (
            <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-accent" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-xs text-sidebar-foreground/70 truncate">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
