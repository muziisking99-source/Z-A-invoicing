import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";

const NAV = [
  { to: "/", label: "Stock" },
  { to: "/new-invoice", label: "New Invoice" },
  { to: "/history", label: "History" },
] as const;

export function GlowBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute -left-20 top-[-6rem] h-72 w-72 rounded-full bg-glow-pink/40 blur-3xl" />
      <div className="absolute right-[-4rem] top-1/3 h-80 w-80 rounded-full bg-glow-sky/40 blur-3xl" />
      <div className="absolute bottom-[-5rem] left-1/3 h-72 w-72 rounded-full bg-glow-violet/40 blur-3xl" />
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
      <div className="min-h-screen bg-canvas">
        <GlowBackdrop />
        <div className="flex min-h-screen items-center justify-center font-mono text-xs uppercase tracking-[0.2em] text-soft">
          Loading ledger…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-primary/20">
      <GlowBackdrop />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 px-4 py-5 lg:flex-row lg:px-6">
        <aside className="shrink-0 lg:w-52">
          <div className="glass rounded-3xl p-3 lg:sticky lg:top-5">
            <div className="flex items-center gap-2 px-2 py-2">
              <span className="grid size-8 place-items-center rounded-xl bg-primary/15 font-display text-sm font-bold text-accent-ink">
                M
              </span>
              <span className="font-display text-sm font-semibold tracking-tight">Marrow</span>
            </div>
            <nav className="mt-3 flex gap-1 lg:mt-3 lg:flex-col lg:space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{
                    className: "bg-primary/15 font-semibold text-accent-ink",
                  }}
                  inactiveProps={{ className: "text-soft hover:bg-paper/70" }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-medium transition lg:justify-start"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 rounded-2xl bg-paper/50 px-3 py-2">
              <p className="truncate font-mono text-[11px] text-soft">{session.user.email}</p>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
                className="mt-1 font-mono text-[11px] font-medium text-accent-ink hover:underline"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-10">{children}</main>
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-soft">{eyebrow}</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}
