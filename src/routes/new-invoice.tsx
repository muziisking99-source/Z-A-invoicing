import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
import { downloadInvoicePdf, type InvoicePdfData } from "@/lib/invoice-pdf";
import {
  lineAmount,
  qtyBasisLabel,
  unitsForLine,
  useProducts,
  type PriceBasis,
  type Product,
  type QtyBasis,
} from "@/lib/products";
import { ProductPicker } from "@/components/ProductPicker";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InvoiceSearch = {
  edit?: string;
};

export const Route = createFileRoute("/new-invoice")({
  validateSearch: (search: Record<string, unknown>): InvoiceSearch => {
    const edit = search["edit"];
    if (typeof edit === "string" && edit.length > 0) return { edit };
    return {};
  },
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

type Line = {
  key: string;
  productId: string;
  quantity: string;
  qtyBasis: QtyBasis;
  priceBasis: PriceBasis;
  manualPrice: string;
};

const newLine = (): Line => ({
  key: Math.random().toString(36).slice(2),
  productId: "",
  quantity: "1",
  qtyBasis: "unit",
  priceBasis: "unit",
  manualPrice: "",
});

const fieldClass =
  "w-full rounded-lg border border-line bg-paper px-4 py-3 text-base outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25";
const labelClass = "text-sm font-medium text-soft";
const primaryBtn =
  "btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";
const ghostBtn =
  "btn-press w-full rounded-lg border border-line bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-secondary sm:w-auto";

type EditItem = {
  id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  case_price: number;
  price_basis: PriceBasis;
  qty_basis: QtyBasis;
  units_per_case: number;
};

type EditInvoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  delivery_cost: number;
  created_at: string;
  items: EditItem[];
};

function lineFromSavedItem(item: EditItem, product: Product | undefined): Line {
  const stored = item.price_basis === "case" ? item.case_price : item.unit_price;
  let priceBasis = item.price_basis;
  let manualPrice = priceBasis === "manual" ? String(stored) : "";
  if (product && priceBasis !== "manual") {
    const live = priceBasis === "case" ? product.case_price : product.selling_price;
    if (priceBasis === "case" && live <= 0) {
      priceBasis = "manual";
      manualPrice = String(stored);
    } else if (Math.abs(live - stored) > 0.009) {
      priceBasis = "manual";
      manualPrice = String(stored);
    }
  }
  return {
    key: item.id,
    productId: product && item.product_id ? item.product_id : "",
    quantity: String(item.quantity),
    qtyBasis: item.qty_basis,
    priceBasis,
    manualPrice,
  };
}

function NewInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId } = Route.useSearch();
  const { data: products = [], isSuccess: productsReady } = useProducts();
  const [customer, setCustomer] = useState("");
  const [delivery, setDelivery] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [savedPdf, setSavedPdf] = useState<InvoicePdfData | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [warnMissingProduct, setWarnMissingProduct] = useState(false);

  const editQuery = useQuery({
    queryKey: ["invoice-edit", editId],
    enabled: !!editId,
    queryFn: async (): Promise<EditInvoice> => {
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, delivery_cost, created_at")
        .eq("id", editId!)
        .maybeSingle();
      if (error) throw error;
      if (!invoice) throw new Error("Invoice not found");

      const { data: items, error: itemsError } = await supabase
        .from("invoice_items")
        .select(
          "id, product_id, quantity, unit_price, case_price, price_basis, qty_basis, units_per_case",
        )
        .eq("invoice_id", editId!)
        .order("created_at", { ascending: true });
      if (itemsError) throw itemsError;

      return {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        delivery_cost: Number(invoice.delivery_cost ?? 0),
        created_at: invoice.created_at,
        items: (items ?? []).map((row) => ({
          id: row.id,
          product_id: row.product_id,
          quantity: row.quantity,
          unit_price: Number(row.unit_price),
          case_price: Number(row.case_price ?? 0),
          price_basis: (row.price_basis === "case"
            ? "case"
            : row.price_basis === "manual"
              ? "manual"
              : "unit") as PriceBasis,
          qty_basis: (row.qty_basis === "case" ? "case" : "unit") as QtyBasis,
          units_per_case: Math.max(1, Number(row.units_per_case ?? 1) || 1),
        })),
      };
    },
  });

  const editing = editQuery.data;
  if (editing && productsReady && hydratedId !== editing.id) {
    const byProduct = new Map(products.map((product) => [product.id, product]));
    const missing = editing.items.some(
      (item) => item.product_id && !byProduct.has(item.product_id),
    );
    setHydratedId(editing.id);
    setCustomer(editing.customer_name);
    setDelivery(editing.delivery_cost > 0 ? String(editing.delivery_cost) : "");
    setLines(
      editing.items.length > 0
        ? editing.items.map((item) =>
            lineFromSavedItem(item, item.product_id ? byProduct.get(item.product_id) : undefined),
          )
        : [newLine()],
    );
    setWarnMissingProduct(missing);
  }

  useEffect(() => {
    if (!warnMissingProduct) return;
    toast.error("A product on this invoice was removed. Pick it again before saving.");
    setWarnMissingProduct(false);
  }, [warnMissingProduct]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const stockCredit = useMemo(() => {
    const credit = new Map<string, number>();
    if (!editing || hydratedId !== editing.id) return credit;
    for (const item of editing.items) {
      if (!item.product_id) continue;
      const units = unitsForLine(item.quantity, item.qty_basis, item.units_per_case);
      credit.set(item.product_id, (credit.get(item.product_id) ?? 0) + units);
    }
    return credit;
  }, [editing, hydratedId]);

  const demandByProduct = useMemo(() => {
    const demand = new Map<string, number>();
    for (const line of lines) {
      if (!line.productId) continue;
      const product = byId.get(line.productId);
      if (!product) continue;
      const qty = Number(line.quantity);
      const quantity = Number.isFinite(qty) ? Math.floor(qty) : 0;
      const units = unitsForLine(quantity, line.qtyBasis, product.units_per_case);
      if (units <= 0) continue;
      demand.set(line.productId, (demand.get(line.productId) ?? 0) + units);
    }
    return demand;
  }, [lines, byId]);

  const resolved = lines.map((line) => {
    const product = byId.get(line.productId) as Product | undefined;
    const qty = Number(line.quantity);
    const quantity = Number.isFinite(qty) ? Math.floor(qty) : 0;
    const canUseCase = !!product && product.case_price > 0;
    const priceBasis: PriceBasis =
      line.priceBasis === "case" && !canUseCase
        ? "unit"
        : line.priceBasis === "manual"
          ? "manual"
          : line.priceBasis === "case"
            ? "case"
            : "unit";
    const parsedManual = Number(line.manualPrice);
    const charge =
      priceBasis === "manual"
        ? Number.isFinite(parsedManual) && parsedManual >= 0
          ? parsedManual
          : 0
        : priceBasis === "case"
          ? (product?.case_price ?? 0)
          : (product?.selling_price ?? 0);
    const unitsMoved = product
      ? unitsForLine(quantity, line.qtyBasis, product.units_per_case)
      : 0;
    const amount = product ? lineAmount(quantity, charge) : 0;
    const demanded = product ? (demandByProduct.get(product.id) ?? 0) : 0;
    const available = product
      ? product.quantity_on_hand + (stockCredit.get(product.id) ?? 0)
      : 0;
    const shortfall = !!product && demanded > available;
    return {
      line,
      product,
      quantity,
      priceBasis,
      canUseCase,
      charge,
      unitsMoved,
      amount,
      shortfall,
      demanded,
      available,
    };
  });

  const subtotal = resolved.reduce((sum, row) => sum + row.amount, 0);
  const deliveryCost = (() => {
    const n = Number(delivery);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const total = subtotal + deliveryCost;
  const filledLines = resolved.filter((row) => row.product && row.quantity > 0);

  const save = useMutation({
    mutationFn: async () => {
      if (deliveryCost < 0) throw new Error("Delivery cost cannot be negative");
      const caseWithoutPrice = filledLines.find(
        (row) => row.priceBasis === "case" && row.product!.case_price <= 0,
      );
      if (caseWithoutPrice) {
        throw new Error(`Case price is not set for ${caseWithoutPrice.product!.name}`);
      }
      const needsManual = filledLines.find(
        (row) => row.priceBasis === "manual" && row.line.manualPrice.trim() === "",
      );
      if (needsManual) {
        throw new Error(`Enter a manual price for ${needsManual.product!.name}`);
      }

      const snapshot = {
        customer_name: customer.trim(),
        total,
        delivery_cost: deliveryCost,
        items: filledLines.map((row) => ({
          product_name: row.product!.name,
          quantity: row.quantity,
          unit_price:
            row.priceBasis === "manual" ? row.charge : row.product!.selling_price,
          case_price: row.product!.case_price,
          price_basis: row.priceBasis,
          qty_basis: row.line.qtyBasis,
          units_per_case: row.product!.units_per_case,
          line_total: row.amount,
        })),
      };

      const payload = {
        p_customer_name: snapshot.customer_name,
        p_items: filledLines.map((row) => ({
          product_id: row.product!.id,
          quantity: row.quantity,
          qty_basis: row.line.qtyBasis,
          price_basis: row.priceBasis,
          ...(row.priceBasis === "manual" ? { unit_price: row.charge } : {}),
        })),
        p_delivery_cost: deliveryCost,
      };
      const { data, error } = editId
        ? await supabase.rpc("update_invoice", {
            p_invoice_id: editId,
            ...payload,
          })
        : await supabase.rpc("create_invoice", payload);
      if (error) throw error;
      const invoice = data as {
        invoice_number: string;
        created_at: string;
        customer_name: string;
        total: number;
        delivery_cost: number;
      };
      return {
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name || snapshot.customer_name,
        created_at: invoice.created_at || new Date().toISOString(),
        total: Number(invoice.total ?? snapshot.total),
        delivery_cost: Number(invoice.delivery_cost ?? deliveryCost),
        items: snapshot.items,
      } satisfies InvoicePdfData;
    },
    onSuccess: (pdfData) => {
      toast.success(
        editId ? `Invoice ${pdfData.invoice_number} updated` : `Invoice ${pdfData.invoice_number} saved`,
      );
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-items"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-edit", editId] });
      setSavedPdf(pdfData);
      if (!editId) {
        setCustomer("");
        setDelivery("");
        setLines([newLine()]);
      }
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
    const needsManual = filledLines.find(
      (row) => row.priceBasis === "manual" && row.line.manualPrice.trim() === "",
    );
    if (needsManual) {
      toast.error(`Enter a manual price for ${needsManual.product!.name}`);
      return;
    }
    const short = resolved.find((row) => row.shortfall);
    if (short) {
      toast.error(
        `Not enough stock for ${short.product!.name}: only ${short.available} available (need ${short.demanded})`,
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
      <PageHeader
        eyebrow="Invoicing"
        title={editing ? `Edit ${editing.invoice_number}` : "New invoice"}
      />

      {editId && !editQuery.isError && hydratedId !== editId ? (
        <div className="panel mt-3 rounded-xl px-4 py-10 text-center text-soft">
          Loading invoice…
        </div>
      ) : null}
      {editId && editQuery.isError ? (
        <div className="panel mt-3 rounded-xl px-4 py-10 text-center text-soft">
          {editQuery.error instanceof Error ? editQuery.error.message : "Could not load invoice"}
        </div>
      ) : null}

      {!editId || (editQuery.isSuccess && hydratedId === editId) ? (
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
                              l.key === row.line.key
                                ? {
                                    ...l,
                                    productId,
                                    qtyBasis: "unit",
                                    priceBasis: "unit",
                                    manualPrice: "",
                                  }
                                : l,
                            ),
                          )
                        }
                      />
                    </div>

                    <div>
                      <p className="mb-1.5 text-sm font-medium text-soft">Quantity as</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(["unit", "case"] as const).map((mode) => {
                          const active = row.line.qtyBasis === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              disabled={!row.product}
                              onClick={() =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === row.line.key ? { ...l, qtyBasis: mode } : l,
                                  ),
                                )
                              }
                              className={cn(
                                "btn-press rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-line bg-paper text-ink hover:bg-secondary",
                              )}
                            >
                              <span className="block">
                                {mode === "unit" ? "Units" : "Cases"}
                              </span>
                              <span
                                className={cn(
                                  "text-xs",
                                  active ? "text-primary-foreground/90" : "text-soft",
                                )}
                              >
                                {mode === "unit"
                                  ? "Single items"
                                  : row.product
                                    ? `${row.product.units_per_case} units each`
                                    : "Full cases"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {row.product && row.unitsMoved > 0 ? (
                        <p className="mt-1.5 text-sm text-soft">
                          Deducts {row.unitsMoved.toLocaleString("en-ZA")} unit
                          {row.unitsMoved === 1 ? "" : "s"} from stock
                          {row.line.qtyBasis === "case"
                            ? ` (${row.quantity} × ${row.product.units_per_case})`
                            : ""}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-1.5 text-sm font-medium text-soft">Price</p>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              basis: "unit" as const,
                              label: "Unit",
                              sub: row.product ? money(row.product.selling_price) : "—",
                              disabled: !row.product,
                            },
                            {
                              basis: "case" as const,
                              label: "Cases",
                              sub:
                                row.product && row.canUseCase
                                  ? money(row.product.case_price)
                                  : "—",
                              disabled: !row.product || !row.canUseCase,
                            },
                            {
                              basis: "manual" as const,
                              label: "Manual",
                              sub:
                                row.priceBasis === "manual" && row.line.manualPrice
                                  ? money(row.charge)
                                  : "Enter",
                              disabled: !row.product,
                            },
                          ] as const
                        ).map((opt) => {
                          const active = row.priceBasis === opt.basis;
                          return (
                            <button
                              key={opt.basis}
                              type="button"
                              disabled={opt.disabled}
                              title={
                                opt.basis === "case" && row.product && !row.canUseCase
                                  ? "Set a case price on this product first"
                                  : undefined
                              }
                              onClick={() =>
                                setLines((prev) =>
                                  prev.map((l) =>
                                    l.key === row.line.key
                                      ? {
                                          ...l,
                                          priceBasis: opt.basis,
                                          manualPrice:
                                            opt.basis === "manual"
                                              ? l.manualPrice ||
                                                String(row.product?.selling_price ?? "")
                                              : l.manualPrice,
                                        }
                                      : l,
                                  ),
                                )
                              }
                              className={cn(
                                "btn-press rounded-lg border px-2.5 py-2.5 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                                active
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-line bg-paper text-ink hover:bg-secondary",
                              )}
                            >
                              <span className="block">{opt.label}</span>
                              <span
                                className={cn(
                                  "font-mono text-xs tabular-nums",
                                  active ? "text-primary-foreground/90" : "text-soft",
                                )}
                              >
                                {opt.sub}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {row.product && row.priceBasis === "manual" ? (
                        <div className="mt-2">
                          <label
                            className="mb-1.5 block text-sm font-medium text-soft"
                            htmlFor={`price-${row.line.key}`}
                          >
                            Manual price
                          </label>
                          <input
                            id={`price-${row.line.key}`}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            autoFocus
                            value={row.line.manualPrice}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === row.line.key
                                    ? { ...l, manualPrice: e.target.value }
                                    : l,
                                ),
                              )
                            }
                            className="h-12 w-full rounded-lg border border-line bg-paper px-3 text-right text-base font-medium tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 sm:h-[50px]"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <label
                          className="mb-1.5 block text-sm font-medium text-soft"
                          htmlFor={`qty-${row.line.key}`}
                        >
                          Qty ({qtyBasisLabel(row.line.qtyBasis).toLowerCase()})
                        </label>
                        <input
                          id={`qty-${row.line.key}`}
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
                          className="h-12 w-full rounded-lg border border-line bg-paper px-3 text-right text-base font-medium tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 sm:h-[50px]"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1.5 text-sm font-medium text-soft">Line total</p>
                        <div className="flex h-12 items-center justify-end rounded-lg border border-line bg-secondary/70 px-3 text-base font-semibold tabular-nums text-accent-ink sm:h-[50px]">
                          {money(row.amount)}
                        </div>
                        {row.product && row.quantity > 0 && row.charge > 0 ? (
                          <p className="mt-1 text-right text-xs text-soft">
                            {row.line.qtyBasis === "case"
                              ? `${row.quantity} cases × ${money(row.charge)}`
                              : `${row.quantity} × ${money(row.charge)}`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {row.shortfall ? (
                    <p className="mt-3 text-sm font-medium text-destructive">
                      Only {row.available} of {row.product!.name} available
                      {row.demanded > row.unitsMoved
                        ? ` (lines need ${row.demanded} units)`
                        : ""}
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
              <dd className="font-mono font-medium">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-soft">Lines</dt>
              <dd className="font-mono font-medium">{filledLines.length}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <label className={labelClass} htmlFor="delivery">
              Delivery cost
            </label>
            <input
              id="delivery"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              className={`mt-1.5 ${fieldClass} tabular font-mono`}
            />
          </div>
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
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Save invoice"}
          </button>
        </div>
      </section>
      ) : null}

      <Dialog open={!!savedPdf} onOpenChange={(open) => !open && closeSavedDialog(false)}>
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {savedPdf ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  {editing ? "Invoice updated" : "Invoice saved"}
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
