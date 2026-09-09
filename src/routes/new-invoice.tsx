import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
import { downloadInvoicePdf, type InvoicePdfData } from "@/lib/invoice-pdf";
import { useProducts, type Product } from "@/lib/products";
import { ProductPicker } from "@/components/ProductPicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/new-invoice")({
  head: () => ({
    meta: [
      { title: "New Invoice · Sweet for You Salvage" },
      {
        name: "description",
        content:
          "Build an invoice from current stock: pick products, set quantities and see the running total.",
      },
      { property: "og:title", content: "New Invoice · Sweet for You Salvage" },
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
  "w-full rounded-lg border border-line bg-paper px-4 py-3 text-base outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25";
const labelClass = "text-sm font-medium text-soft";
const primaryBtn =
  "btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";
const ghostBtn =
  "btn-press w-full rounded-lg border border-line bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-secondary sm:w-auto";

function NewInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: products = [] } = useProducts();
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [savedPdf, setSavedPdf] = useState<InvoicePdfData | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const demandByProduct = useMemo(() => {
    const demand = new Map<string, number>();
    for (const line of lines) {
      if (!line.productId) continue;
      const qty = Number(line.quantity);
      const quantity = Number.isFinite(qty) ? Math.floor(qty) : 0;
      if (quantity <= 0) continue;
      demand.set(line.productId, (demand.get(line.productId) ?? 0) + quantity);
    }
    return demand;
  }, [lines]);

  const resolved = lines.map((line) => {
    const product = byId.get(line.productId) as Product | undefined;
    const qty = Number(line.quantity);
    const quantity = Number.isFinite(qty) ? Math.floor(qty) : 0;
    const unitPrice = product?.selling_price ?? 0;
    const demanded = product ? (demandByProduct.get(product.id) ?? 0) : 0;
    const shortfall = !!product && demanded > product.quantity_on_hand;
    return { line, product, quantity, unitPrice, amount: quantity * unitPrice, shortfall, demanded };
  });

  const total = resolved.reduce((sum, row) => sum + row.amount, 0);
  const filledLines = resolved.filter((row) => row.product && row.quantity > 0);

  const save = useMutation({
    mutationFn: async () => {
      const snapshot = {
        customer_name: customer.trim(),
        total,
        items: filledLines.map((row) => ({
          product_name: row.product!.name,
          quantity: row.quantity,
          unit_price: row.unitPrice,
          line_total: row.amount,
        })),
      };
      const { data, error } = await supabase.rpc("create_invoice", {
        p_customer_name: snapshot.customer_name,
        p_items: filledLines.map((row) => ({
          product_id: row.product!.id,
          quantity: row.quantity,
        })),
      });
      if (error) throw error;
      const invoice = data as {
        invoice_number: string;
        created_at: string;
        customer_name: string;
        total: number;
      };
      return {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name || snapshot.customer_name,
        created_at: invoice.created_at || new Date().toISOString(),
        total: Number(invoice.total ?? snapshot.total),
        items: snapshot.items,
      } satisfies InvoicePdfData;
    },
    onSuccess: (pdfData) => {
      toast.success(`Invoice ${pdfData.invoice_number} saved`);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSavedPdf(pdfData);
      setCustomer("");
      setLines([newLine()]);
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
        `Not enough stock for ${short.product!.name}: only ${short.product!.quantity_on_hand} available (need ${short.demanded})`,
      );
      return;
    }
    save.mutate();
  };

  const handleDownload = async () => {
    if (!savedPdf) return;
    setPdfBusy(true);
    try {
      await downloadInvoicePdf(savedPdf);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  const closeSavedDialog = (goHistory: boolean) => {
    setSavedPdf(null);
    if (goHistory) navigate({ to: "/history" });
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Invoicing" title="New invoice" />

      <section className="mt-3 grid gap-3 sm:gap-4 lg:grid-cols-12">
        <div className="panel rounded-xl p-4 sm:p-6 lg:col-span-7">
          <div>
            <label className={labelClass} htmlFor="customer">
              Customer name
            </label>
            <input
              id="customer"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Customer name"
              className={`mt-1.5 ${fieldClass}`}
            />
          </div>

          <div className="mt-5 sm:mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className={labelClass}>Line items</p>
              <span className="text-sm text-soft">{filledLines.length} added</span>
            </div>

            <div className="mt-3 space-y-3">
              {resolved.map((row, index) => (
                <div
                  key={row.line.key}
                  className={`rounded-xl border bg-paper p-3.5 shadow-[0_1px_0_rgb(24_24_27_/_0.03)] transition-colors duration-150 sm:p-4 ${
                    row.shortfall ? "border-destructive/50" : "border-line"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-soft">Item {index + 1}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length === 1
                            ? [newLine()]
                            : prev.filter((l) => l.key !== row.line.key),
                        )
                      }
                      className="btn-press text-sm font-semibold text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="w-full min-w-0">
                      <label className="mb-1.5 block text-sm font-medium text-soft">
                        Product
                      </label>
                      <ProductPicker
                        products={products}
                        value={row.line.productId}
                        onChange={(productId) =>
                          setLines((prev) =>
                            prev.map((l) =>
                              l.key === row.line.key ? { ...l, productId } : l,
                            ),
                          )
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="min-w-0">
                        <p className="mb-1.5 text-sm font-medium text-soft">Unit price</p>
                        <div className="flex h-12 items-center rounded-lg border border-line bg-secondary/70 px-3 text-sm font-medium tabular-nums text-ink sm:h-[50px] sm:text-base">
                          {row.product ? money(row.unitPrice) : "—"}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <label
                          className="mb-1.5 block text-sm font-medium text-soft"
                          htmlFor={`qty-${row.line.key}`}
                        >
                          Qty
                        </label>
                        <input
                          id={`qty-${row.line.key}`}
                          aria-label="Quantity"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={row.line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === row.line.key
                                  ? { ...l, quantity: e.target.value }
                                  : l,
                              ),
                            )
                          }
                          className="h-12 w-full rounded-lg border border-line bg-paper px-3 text-right text-base font-medium tabular-nums outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25 sm:h-[50px]"
                        />
                      </div>

                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <p className="mb-1.5 text-sm font-medium text-soft">Line total</p>
                        <div className="flex h-12 items-center justify-end rounded-lg border border-line bg-secondary/70 px-3 text-base font-semibold tabular-nums text-accent-ink sm:h-[50px]">
                          {money(row.amount)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {row.shortfall ? (
                    <p className="mt-3 text-sm font-medium text-destructive">
                      Only {row.product!.quantity_on_hand} of {row.product!.name} available
                      {row.demanded > row.quantity ? ` (lines total ${row.demanded})` : ""}
                    </p>
                  ) : null}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="btn-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-accent/40 px-4 py-3.5 text-base font-semibold text-accent-ink transition-colors duration-150 hover:border-primary/55 hover:bg-accent/70"
              >
                <span
                  aria-hidden
                  className="grid size-6 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                >
                  +
                </span>
                Add line item
              </button>
            </div>
          </div>
        </div>

        <div className="panel flex flex-col rounded-xl p-4 sm:p-6 lg:sticky lg:top-6 lg:col-span-5 lg:self-start">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">Totals</p>
          <dl className="tabular mt-4 space-y-3 text-base sm:mt-5">
            <div className="flex justify-between">
              <dt className="text-soft">Subtotal</dt>
              <dd className="font-mono font-medium">{money(total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">Lines</dt>
              <dd className="font-mono font-medium">{filledLines.length}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-end justify-between border-t border-line pt-4 sm:mt-5 sm:pt-5">
            <span className="text-base font-medium text-soft">Total</span>
            <span
              key={total}
              className="animate-pop tabular font-display text-3xl font-bold tracking-tight text-accent-ink sm:text-4xl"
            >
              {money(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={save.isPending}
            className="btn-press mt-5 w-full rounded-lg bg-primary py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:mt-6"
          >
            {save.isPending ? "Saving…" : "Save invoice"}
          </button>
        </div>
      </section>

      <Dialog open={!!savedPdf} onOpenChange={(open) => !open && closeSavedDialog(false)}>
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {savedPdf ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  Invoice saved
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {savedPdf.invoice_number} for {savedPdf.customer_name} ·{" "}
                  {money(savedPdf.total)}
                </DialogDescription>
              </DialogHeader>
              <p className="text-base text-ink">
                Download the PDF now, or open history to find it later.
              </p>
              <DialogFooter className="gap-2 sm:justify-end">
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => closeSavedDialog(true)}
                >
                  View history
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={pdfBusy}
                  onClick={handleDownload}
                >
                  {pdfBusy ? "Preparing…" : "Download PDF"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
