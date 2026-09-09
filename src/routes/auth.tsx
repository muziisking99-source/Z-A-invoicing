import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlowBackdrop } from "@/components/AppShell";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Marrow Stock & Invoicing" },
      {
        name: "description",
        content: "Sign in to Marrow to manage product stock and create customer invoices.",
      },
      { property: "og:title", content: "Sign in · Marrow Stock & Invoicing" },
      {
        property: "og:description",
        content: "Private internal tool for stock levels and invoicing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [loading, session, navigate]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <GlowBackdrop />
      <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
        <div className="glass animate-rise rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/15 font-display text-sm font-bold text-accent-ink">
              M
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">Marrow</span>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.2em] text-soft">
            Internal access
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Sign in</h1>

          <form onSubmit={signIn} className="mt-5 space-y-3">
            <div>
              <label
                htmlFor="email"
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-soft"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-line bg-paper/70 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-soft"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-line bg-paper/70 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-105 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-soft">
            Accounts are created by an administrator. There is no public sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
