import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
import { useProducts, type Product } from "./index";

export const Route = createFileRoute("/new-invoice")({
  head: () => ({
    meta: [
      { title: "New Invoice · Marrow Stock & Invoicing" },
      {
        name: "description",
        content:
          "Build an invoice from current stock: pick products, set quantities and see the running total.",
      },
      { property: "og:title", content: "New Invoice · Marrow" },
      {
        property: "og:description",
        content: "Create a customer invoice and reduce stock automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewInvoicePage,
});

type Line = { key: string; productId: string; quantity: string };

const newLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  productId: "",
  quantity: "1",
});

const fieldClass =
  "w-full rounded-2xl border border-line bg-paper/70 px-3 py-2 text-sm outline-none focus:border-primary/50";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.15em] text-soft";

function NewInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [] } = useProducts();
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const resolved = lines.map((line) => {
    const product = byId.get(line.productId) as Product | undefined;
    const qty = Number(line.quantity);
    const quantity = Number.isFinite(qty) ? Math.floor(qty) : 0;
    const unitPrice = product?.selling_price ?? 0;
    const shortfall = !!product && quantity > product.quantity_on_hand;
    return { line, product, quantity, unitPrice, amount: quantity * unitPrice, shortfall };
  });

  const total = resolved.reduce((sum, row) => sum + row.amount, 0);
  const filledLines = resolved.filter((row) => row.product && row.quantity > 0);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_invoice", {
        p_customer_name: customer.trim(),
        p_items: filledLines.map((row) => ({
          product_id: row.product!.id,
          quantity: row.quantity,
        })),
      });
      if (error) throw error;
      return data as { invoice_number: string };
    },
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoice_number} saved`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/history" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => {
    if (!customer.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (filledLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    const short = resolved.find((row) => row.shortfall);
    if (short) {
      toast.error(
        `Not enough stock for ${short.product!.name}: only ${short.product!.quantity_on_hand} available`,
      );
      return;
    }
    save.mutate();
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Invoicing" title="New invoice" />

      <section className="mt-5 grid gap-4 lg:grid-cols-12">
        <div className="glass animate-rise rounded-3xl p-4 lg:col-span-7">
          <div>
            <label className={labelClass} htmlFor="customer">
              Customer
            </label>
            <input
              id="customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer name"
              className={`mt-1 ${fieldClass}`}
            />
          </div>

          <p className={`${labelClass} mt-4 block`}>Line items</p>
          <div className="mt-2 space-y-2">
            {resolved.map((row) => (
              <div
                key={row.line.key}
                className={`rounded-2xl border bg-paper/60 p-3 ${
                  row.shortfall ? "border-primary/60" : "border-line"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Product"
                    value={row.line.productId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === row.line.key ? { ...l, productId: e.target.value } : l,
                        ),
                      )
                    }
                    className="min-w-[10rem] flex-1 rounded-xl border border-line bg-paper/80 px-2 py-1.5 text-sm outline-none focus:border-primary/50"
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.quantity_on_hand} on hand
                      </option>
                    ))}
                  </select>
                  <span className="tabular font-mono text-[13px] text-soft">
                    {money(row.unitPrice)}
                  </span>
                  <input
                    aria-label="Quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={row.line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === row.line.key ? { ...l, quantity: e.target.value } : l,
                        ),
                      )
                    }
                    className="tabular w-16 rounded-xl border border-line bg-paper/80 px-2 py-1.5 text-right font-mono text-[13px] outline-none focus:border-primary/50"
                  />
                  <span className="tabular w-20 text-right font-mono text-[13px] font-semibold">
                    {money(row.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) =>
                        prev.length === 1
                          ? [newLine()]
                          : prev.filter((l) => l.key !== row.line.key),
                      )
                    }
                    className="font-mono text-[11px] text-accent-ink hover:underline"
                  >
                    remove
                  </button>
                </div>
                {row.shortfall ? (
                  <p className="mt-2 font-mono text-[11px] text-accent-ink">
                    Only {row.product!.quantity_on_hand} of {row.product!.name} available
                  </p>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, newLine()])}
              className="w-full rounded-2xl border border-dashed border-line bg-paper/40 px-3 py-2 text-left text-sm text-soft transition hover:text-ink"
            >
              + Add line item
            </button>
          </div>
        </div>

        <div className="glass animate-rise flex flex-col rounded-3xl p-5 lg:col-span-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-soft">Totals</p>
          <dl className="tabular mt-4 space-y-2.5 font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-soft">Subtotal</dt>
              <dd>{money(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">Lines</dt>
              <dd>{filledLines.length}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
            <span className="text-sm font-medium text-soft">Total</span>
            <span
              key={total}
              className="animate-pop tabular font-display text-3xl font-bold tracking-tight text-accent-ink"
            >
              {money(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending}
            className="mt-5 w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-105 disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save invoice"}
          </button>
        </div>
      </section>
    </AppShell>
  );
}
