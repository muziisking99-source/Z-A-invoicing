import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
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

type OrderSearch = {
  edit?: string;
};

export const Route = createFileRoute("/new-order")({
  validateSearch: (search: Record<string, unknown>): OrderSearch => {
    const edit = search["edit"];
    if (typeof edit === "string" && edit.length > 0) return { edit };
    return {};
  },
  head: () => ({
    meta: [
      { title: "New Order · Sweet for You Salvage" },
      {
        name: "description",
        content: "Build a customer order sheet. Stock is deducted only when you convert it to an invoice.",
      },
      { property: "og:title", content: "New Order · Sweet for You Salvage" },
      {
        property: "og:description",
        content: "Create a customer order sheet before invoicing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewOrderPage,
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

type EditOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  delivery_cost: number;
  status: string;
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

function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId } = Route.useSearch();
  const { data: products = [], isSuccess: productsReady } = useProducts();
  const [customer, setCustomer] = useState("");
  const [delivery, setDelivery] = useState("");
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [warnMissingProduct, setWarnMissingProduct] = useState(false);

  const editQuery = useQuery({
    queryKey: ["order-edit", editId],
    enabled: !!editId,
    queryFn: async (): Promise<EditOrder> => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, delivery_cost, status")
        .eq("id", editId!)
        .maybeSingle();
      if (error) throw error;
      if (!order) throw new Error("Order not found");
      if (order.status !== "open") {
        throw new Error("Only open orders can be edited");
      }

      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select(
          "id, product_id, quantity, unit_price, case_price, price_basis, qty_basis, units_per_case",
        )
        .eq("order_id", editId!)
        .order("created_at", { ascending: true });
      if (itemsError) throw itemsError;

      return {
        id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        delivery_cost: Number(order.delivery_cost ?? 0),
        status: order.status,
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
    toast.error("A product on this order was removed. Pick it again before saving.");
    setWarnMissingProduct(false);
  }, [warnMissingProduct]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

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
    const available = product ? product.quantity_on_hand : 0;
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
  const hasShortfall = resolved.some((row) => row.shortfall);

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

      const payload = {
        p_customer_name: customer.trim(),
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
        ? await supabase.rpc("update_order", {
            p_order_id: editId,
            ...payload,
          })
        : await supabase.rpc("create_order", payload);
      if (error) throw error;
      return data as { order_number: string };
    },
    onSuccess: (order) => {
      toast.success(
        editId ? `Order ${order.order_number} updated` : `Order ${order.order_number} saved`,
      );
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order-items"] });
      queryClient.invalidateQueries({ queryKey: ["order-edit", editId] });
      navigate({ to: "/orders" });
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
    if (hasShortfall) {
      toast.message("Order saved with a soft stock warning — convert will check stock.");
    }
    save.mutate();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Orders"
        title={editing ? `Edit ${editing.order_number}` : "New order sheet"}
      />
      <p className="mt-1 text-sm text-soft">
        Stock is not deducted until you convert this order to an invoice.
      </p>

      {editId && !editQuery.isError && hydratedId !== editId ? (
        <div className="panel mt-3 rounded-xl px-4 py-10 text-center text-soft">
          Loading order…
        </div>
      ) : null}
      {editId && editQuery.isError ? (
        <div className="panel mt-3 rounded-xl px-4 py-10 text-center text-soft">
          {editQuery.error instanceof Error ? editQuery.error.message : "Could not load order"}
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
                      row.shortfall ? "border-amber-500/50" : "border-line"
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
                            Will need {row.unitsMoved.toLocaleString("en-ZA")} unit
                            {row.unitsMoved === 1 ? "" : "s"} when converted
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
                        </div>
                      </div>
                    </div>

                    {row.shortfall ? (
                      <p className="mt-3 text-sm font-medium text-amber-800">
                        Only {row.available} of {row.product!.name} on hand now (need{" "}
                        {row.demanded}). You can still save — convert will require stock.
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
              <span className="tabular font-display text-3xl font-bold tracking-tight text-accent-ink sm:text-4xl">
                {money(total)}
              </span>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={save.isPending}
              className="btn-press mt-5 w-full rounded-lg bg-primary py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:mt-6"
            >
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Save order"}
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
