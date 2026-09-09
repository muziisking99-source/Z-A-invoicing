import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GlowBackdrop } from "@/components/AppShell";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · ZA Stock" },
      {
        name: "description",
        content: "Sign in to ZA Stock to manage product stock and create customer invoices.",
      },
      { property: "og:title", content: "Sign in · ZA Stock" },
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
    <div className="min-h-[100dvh] bg-canvas text-ink">
      <GlowBackdrop />
      <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 sm:px-5">
        <div className="panel animate-rise rounded-xl p-5 sm:p-7 md:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-lg bg-primary font-display text-sm font-bold tracking-wide text-primary-foreground">
              ZA
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">ZA Stock</p>
              <p className="text-sm text-soft">Stock & invoices</p>
            </div>
          </div>
          <p className="mt-7 text-sm font-medium uppercase tracking-[0.12em] text-soft">
            Internal access
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Sign in</h1>

          <form onSubmit={signIn} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium text-soft">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-3 text-base outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium text-soft">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-3 text-base outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="btn-press w-full rounded-lg bg-primary py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-sm leading-relaxed text-soft">
            Accounts are created by an administrator. There is no public sign-up.
          </p>
        </div>
      </div>
    </div>
  );
}
