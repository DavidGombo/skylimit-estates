import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Building2, Users, ShieldCheck, Wrench, Plug, PoundSterling, Menu, X,
} from "lucide-react";
import { BrandMark } from "@/components/BrandLogo";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/properties", label: "Properties", icon: Building2, match: (p: string) => p.startsWith("/properties") || p.startsWith("/property") },
  { href: "/tenants", label: "Tenants", icon: Users, match: (p: string) => p.startsWith("/tenants") },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck, match: (p: string) => p.startsWith("/compliance") },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, match: (p: string) => p.startsWith("/maintenance") },
  { href: "/utilities", label: "Utilities", icon: Plug, match: (p: string) => p.startsWith("/utilities") },
  { href: "/finance", label: "Finance", icon: PoundSterling, match: (p: string) => p.startsWith("/finance") || p.startsWith("/new") || p.startsWith("/edit") || p.startsWith("/print") },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="h-8 w-8 shrink-0 text-accent" />
      <div className="leading-tight">
        <div className="font-bold text-sidebar-foreground text-[15px] tracking-[0.12em] uppercase">Skylimit</div>
        <div className="text-[10px] text-sidebar-foreground/60 tracking-[0.28em] uppercase">Estates</div>
      </div>
    </div>
  );
}

export function AppShell({ children, title }: { children: React.ReactNode; title?: string }) {
  const [loc] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = (
    <nav className="space-y-1 px-3">
      {NAV.map((item) => {
        const active = item.match(loc);
        return (
          <Link key={item.href} href={item.href}>
            <button
              onClick={() => setMobileOpen(false)}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-white/5 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon className={`h-[18px] w-[18px] ${active ? "text-accent" : ""}`} />
              {item.label}
            </button>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-sidebar border-r border-sidebar-border flex-col z-30">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <Logo />
        </div>
        <div className="flex-1 py-4 overflow-y-auto">{navItems}</div>
        <div className="px-5 py-4 border-t border-sidebar-border">
          <p className="text-[11px] text-sidebar-foreground/50">Skylimit Estates Limited</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-40 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 py-3">
        <Logo />
        <button onClick={() => setMobileOpen((o) => !o)} className="text-sidebar-foreground p-1.5" data-testid="button-mobile-nav">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)}>
          <div className="absolute top-[57px] left-0 right-0 bg-sidebar border-b border-sidebar-border py-3" onClick={(e) => e.stopPropagation()}>
            {navItems}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-60">
        {title && (
          <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 lg:top-0 z-20">
            <div className="px-6 py-4">
              <h1 className="text-lg font-bold text-foreground">{title}</h1>
            </div>
          </header>
        )}
        <main className="px-6 py-6 max-w-6xl">{children}</main>
      </div>
    </div>
  );
}
