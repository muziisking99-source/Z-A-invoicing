import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";

const NAV = [
  { to: "/", label: "Stock", short: "Stock" },
  { to: "/new-invoice", label: "New Invoice", short: "Invoice" },
  { to: "/history", label: "History", short: "History" },
] as const;

export function GlowBackdrop() {
  return <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-canvas" />;
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "px-0" : "px-1 py-1"}`}>
      <span className="grid size-9 place-items-center rounded-lg bg-primary font-display text-xs font-bold tracking-wide text-primary-foreground sm:size-11 sm:text-sm">
        ZA
      </span>
      <div className="min-w-0">
        <p className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
          ZA Stock
        </p>
        {!compact ? (
          <p className="hidden text-sm text-soft sm:block">Stock & invoices</p>
        ) : null}
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
    <div className="min-h-[100dvh] bg-canvas text-ink selection:bg-primary/15">
      <GlowBackdrop />
      <div className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col gap-4 px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 sm:gap-6 sm:px-6 sm:py-6 lg:flex-row lg:gap-8 lg:px-8 lg:py-8">
        <aside className="shrink-0 lg:w-60">
          <div className="panel rounded-xl p-3 sm:p-4 lg:sticky lg:top-6">
            <div className="flex items-center justify-between gap-3 lg:block">
              <BrandMark compact />
              <div className="min-w-0 text-right lg:mt-5 lg:border-t lg:border-line lg:pt-4 lg:text-left">
                <p className="truncate text-xs text-soft sm:text-sm">{session.user.email}</p>
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/auth" });
                  }}
                  className="btn-press mt-0.5 text-xs font-semibold text-accent-ink hover:underline sm:mt-2 sm:text-sm"
                >
                  Sign out
                </button>
              </div>
            </div>
            <nav className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 lg:mt-5 lg:flex lg:flex-col lg:gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{
                    className: "bg-primary text-primary-foreground",
                  }}
                  inactiveProps={{
                    className: "text-ink hover:bg-secondary",
                  }}
                  className="btn-press flex items-center justify-center rounded-lg px-2 py-2.5 text-center text-sm font-medium sm:px-3 sm:py-3 sm:text-base lg:justify-start lg:px-4"
                >
                  <span className="lg:hidden">{item.short}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <main className="min-w-0 flex-1 animate-rise pb-8 sm:pb-12">{children}</main>
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
    <div className="flex flex-col gap-3 sm:gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-soft sm:text-sm">
          {eyebrow}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {title}
        </h1>
      </div>
      {children ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
