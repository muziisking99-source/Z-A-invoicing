import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";

const NAV = [
  { to: "/dashboard", label: "Dashboard", short: "Dash" },
  { to: "/", label: "Stock", short: "Stock" },
  { to: "/new-invoice", label: "New Invoice", short: "Invoice" },
  { to: "/history", label: "History", short: "History" },
] as const;

export function GlowBackdrop() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-canvas" />;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "px-0" : "px-0.5"}`}>
      <img
        src="/brand/sfy-logo.jpg"
        alt=""
        className="size-10 shrink-0 rounded-full object-cover ring-1 ring-line sm:size-12"
      />
      <div className="min-w-0">
        <p className="font-display text-base font-semibold leading-snug tracking-tight text-ink sm:text-lg">
          <span className="lg:hidden">SFY Salvage</span>
          <span className="hidden lg:inline">Sweet for You Salvage</span>
        </p>
        {!compact ? <p className="text-sm text-soft">Stock & invoices</p> : null}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return (
      <div className="min-h-[100dvh] bg-canvas">
        <GlowBackdrop />
        <div className="flex min-h-[100dvh] items-center justify-center text-base text-soft">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-canvas text-ink selection:bg-primary/20">
      <GlowBackdrop />
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1600px] flex-col gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:gap-4 sm:px-4 sm:py-4 lg:flex-row lg:gap-5 lg:px-5 lg:py-5">
        <aside className="shrink-0 lg:w-64">
          <div className="panel rounded-xl p-3 sm:p-4 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-3 lg:block">
              <BrandMark compact />
              <div className="min-w-0 text-right lg:mt-4 lg:border-t lg:border-line lg:pt-3.5 lg:text-left">
                <p className="truncate text-sm text-soft">{session.user.email}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/auth" });
                  }}
                  className="btn-press mt-1 text-sm font-semibold text-accent-ink hover:underline"
                >
                  Sign out
                </button>
              </div>
            </div>
            <nav className="mt-3 grid grid-cols-4 gap-1.5 lg:mt-4 lg:flex lg:flex-col lg:gap-1.5">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" || item.to === "/dashboard" }}
                  activeProps={{
                    className: "bg-primary text-primary-foreground",
                  }}
                  inactiveProps={{
                    className: "text-ink hover:bg-secondary",
                  }}
                  className="btn-press flex items-center justify-center rounded-lg px-2 py-2.5 text-center text-sm font-semibold sm:px-3 sm:py-3 sm:text-base lg:justify-start lg:px-4 lg:py-3"
                >
                  <span className="lg:hidden">{item.short}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1 animate-rise pb-4 sm:pb-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-soft sm:text-xs">
          {eyebrow}
        </p>
        <h1 className="mt-0.5 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl md:text-3xl">
          {title}
        </h1>
      </div>
      {children ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {children}
        </div>
      ) : null}
    </div>
  );
}
