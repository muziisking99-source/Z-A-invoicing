import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money, shortDate } from "@/lib/format";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import {
  chargedLinePrice,
  type PriceBasis,
  type QtyBasis,
} from "@/lib/products";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "Orders · Sweet for You Salvage" },
      {
        name: "description",
        content: "Customer order sheets. Convert to an invoice when ready to deduct stock.",
      },
      { property: "og:title", content: "Orders · Sweet for You Salvage" },
      {
        property: "og:description",
        content: "Open and converted customer order sheets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

type OrderStatus = "open" | "converted" | "cancelled";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  total: number;
  delivery_cost: number;
  status: OrderStatus;
  invoice_id: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  case_price: number;
  price_basis: PriceBasis;
  qty_basis: QtyBasis;
  units_per_case: number;
  line_total: number;
};

type StatusFilter = "all" | "open" | "converted" | "cancelled";

const primaryBtn =
  "btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";
const ghostBtn =
  "btn-press w-full rounded-lg border border-line bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-secondary sm:w-auto";
const dangerBtn =
  "btn-press w-full rounded-lg border border-destructive/30 bg-paper px-5 py-3 text-base font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60 sm:w-auto";

function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    staleTime: 30_000,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, total, delivery_cost, status, invoice_id, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        total: Number(row.total),
        delivery_cost: Number(row.delivery_cost ?? 0),
        status: (row.status === "converted"
          ? "converted"
          : row.status === "cancelled"
            ? "cancelled"
            : "open") as OrderStatus,
      }));
    },
  });
}

function useOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ["order-items", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<OrderItem[]> => {
      const { data, error } = await supabase
        .from("order_items")
        .select(
          "id, product_name, quantity, unit_price, case_price, price_basis, qty_basis, units_per_case, line_total",
        )
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        unit_price: Number(row.unit_price),
        case_price: Number(row.case_price ?? 0),
        price_basis: (row.price_basis === "case"
          ? "case"
          : row.price_basis === "manual"
            ? "manual"
            : "unit") as PriceBasis,
        qty_basis: (row.qty_basis === "case" ? "case" : "unit") as QtyBasis,
        units_per_case: Math.max(1, Number(row.units_per_case ?? 1) || 1),
        line_total: Number(row.line_total),
      }));
    },
  });
}

function statusLabel(status: OrderStatus) {
  if (status === "converted") return "Converted";
  if (status === "cancelled") return "Cancelled";
  return "Open";
}

function statusTone(status: OrderStatus) {
  if (status === "converted") return "bg-emerald-500/10 text-emerald-800";
  if (status === "cancelled") return "bg-zinc-500/10 text-zinc-700";
  return "bg-sky-500/10 text-sky-900";
}

function OrdersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading } = useOrders();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [selected, setSelected] = useState<Order | null>(null);
  const [converting, setConverting] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const { data: items = [], isLoading: itemsLoading } = useOrderItems(selected?.id ?? null);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((order) => order.status === filter);
  }, [orders, filter]);

  const cancelOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_order", { p_order_id: id });
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Order cancelled");
      setCancelling(null);
      if (selected?.id === id) setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const convertOrder = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("convert_order_to_invoice", {
        p_order_id: id,
      });
      if (error) throw error;
      return data as {
        id: string;
        invoice_number: string;
        customer_name: string;
        created_at: string;
        total: number;
        delivery_cost: number;
      };
    },
    onSuccess: async (invoice, orderId) => {
      toast.success(`Converted to ${invoice.invoice_number}`);
      setConverting(null);
      if (selected?.id === orderId) setSelected(null);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-sales"] });

      try {
        const { data: lineRows, error } = await supabase
          .from("invoice_items")
          .select(
            "product_name, quantity, unit_price, case_price, price_basis, qty_basis, units_per_case, line_total",
          )
          .eq("invoice_id", invoice.id)
          .order("created_at", { ascending: true });
        if (error) throw error;
        await downloadInvoicePdf({
          invoice_number: invoice.invoice_number,
          customer_name: invoice.customer_name,
          created_at: invoice.created_at,
          total: Number(invoice.total),
          delivery_cost: Number(invoice.delivery_cost ?? 0),
          items: (lineRows ?? []).map((item) => ({
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: Number(item.unit_price),
            case_price: Number(item.case_price ?? 0),
            price_basis: (item.price_basis === "case"
              ? "case"
              : item.price_basis === "manual"
                ? "manual"
                : "unit") as PriceBasis,
            qty_basis: (item.qty_basis === "case" ? "case" : "unit") as QtyBasis,
            units_per_case: Math.max(1, Number(item.units_per_case ?? 1) || 1),
            line_total: Number(item.line_total),
          })),
        });
      } catch {
        toast.message("Invoice created — open History to download the PDF.");
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader eyebrow="Orders" title="Order sheets">
        <Link
          to="/new-order"
          className="btn-press rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground sm:px-5 sm:py-3 sm:text-base"
        >
          New order
        </Link>
      </PageHeader>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            { key: "open", label: "Open" },
            { key: "converted", label: "Converted" },
            { key: "cancelled", label: "Cancelled" },
            { key: "all", label: "All" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            className={cn(
              "btn-press rounded-lg px-3 py-2 text-sm font-medium",
              filter === option.key
                ? "bg-primary text-primary-foreground"
                : "border border-line bg-paper text-ink hover:bg-secondary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <section className="mt-3 space-y-2.5 md:hidden">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="panel rounded-xl p-4">
              <div className="skeleton-bar h-5 w-1/2" />
              <div className="skeleton-bar mt-3 h-4 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="panel rounded-xl px-4 py-10 text-center text-soft">
            {orders.length === 0
              ? "No order sheets yet. Create one for a customer."
              : "No orders match this filter."}
          </div>
        ) : (
          filtered.map((order) => (
            <div key={order.id} className="panel rounded-xl p-4">
              <button
                type="button"
                onClick={() => setSelected(order)}
                className="btn-press w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-semibold text-accent-ink">
                        {order.order_number}
                      </p>
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          statusTone(order.status),
                        )}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-lg font-medium text-ink">
                      {order.customer_name}
                    </p>
                    <p className="mt-1 text-sm text-soft">{shortDate(order.created_at)}</p>
                  </div>
                  <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
                    {money(order.total)}
                  </p>
                </div>
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(order)}
                  className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                >
                  View
                </button>
                {order.status === "open" ? (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/new-order", search: { edit: order.id } })
                      }
                      className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConverting(order)}
                      className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                    >
                      Convert
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelling(order)}
                      className="btn-press rounded-lg border border-destructive/30 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-soft opacity-60"
                  >
                    {statusLabel(order.status)}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="panel mt-3 hidden overflow-hidden rounded-xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-base">
            <thead>
              <tr className="sticky top-0 z-[1] border-b border-line bg-secondary text-xs font-semibold uppercase tracking-wide text-soft sm:text-sm">
                <th className="px-4 py-2.5 sm:px-5">Order #</th>
                <th className="px-4 py-2.5 sm:px-5">Customer</th>
                <th className="px-4 py-2.5 sm:px-5">Date</th>
                <th className="px-4 py-2.5 text-right sm:px-5">Total</th>
                <th className="px-4 py-2.5 sm:px-5">Status</th>
                <th className="px-4 py-2.5 sm:px-5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-line/80 last:border-0">
                    <td className="px-4 py-3 sm:px-5" colSpan={6}>
                      <div className="skeleton-bar h-5 w-full max-w-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-soft sm:px-5">
                    {orders.length === 0
                      ? "No order sheets yet. Create one for a customer."
                      : "No orders match this filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((order, index) => (
                  <tr
                    key={order.id}
                    className="row-enter border-b border-line/80 transition-colors duration-150 last:border-0 hover:bg-secondary/80"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <td className="px-4 py-3 font-mono text-[15px] font-semibold text-accent-ink sm:px-5">
                      <button
                        type="button"
                        onClick={() => setSelected(order)}
                        className="btn-press text-left hover:underline"
                      >
                        {order.order_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 sm:px-5">{order.customer_name}</td>
                    <td className="px-4 py-3 text-soft sm:px-5">
                      {shortDate(order.created_at)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono text-[15px] font-semibold sm:px-5">
                      {money(order.total)}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                          statusTone(order.status),
                        )}
                      >
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(order)}
                          className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                        >
                          View
                        </button>
                        {order.status === "open" ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                navigate({ to: "/new-order", search: { edit: order.id } })
                              }
                              className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setConverting(order)}
                              className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                            >
                              Convert
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelling(order)}
                              className="btn-press rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5"
                            >
                              Cancel
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="panel max-w-xl rounded-xl border-line sm:rounded-xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  {selected.order_number}
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {selected.customer_name} · {shortDate(selected.created_at)}
                </DialogDescription>
              </DialogHeader>
              <span
                className={cn(
                  "inline-flex w-fit rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                  statusTone(selected.status),
                )}
              >
                {statusLabel(selected.status)}
              </span>

              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[24rem] text-left text-sm sm:text-base">
                  <thead>
                    <tr className="border-b border-line bg-secondary text-xs font-semibold uppercase tracking-wide text-soft sm:text-sm">
                      <th className="px-3 py-2.5 sm:px-4 sm:py-3">Product</th>
                      <th className="px-3 py-2.5 text-right sm:px-4 sm:py-3">Qty</th>
                      <th className="px-3 py-2.5 text-right sm:px-4 sm:py-3">Price</th>
                      <th className="px-3 py-2.5 text-right sm:px-4 sm:py-3">Line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8">
                          <div className="skeleton-bar mx-auto h-5 w-2/3" />
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-soft">
                          No line items
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id} className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-2.5 font-medium sm:px-4 sm:py-3">
                            {item.product_name}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-mono sm:px-4 sm:py-3">
                            {item.quantity}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-mono font-semibold text-accent-ink sm:px-4 sm:py-3">
                            {money(chargedLinePrice(item))}
                          </td>
                          <td className="tabular px-3 py-2.5 text-right font-mono font-semibold sm:px-4 sm:py-3">
                            {money(item.line_total)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                    Total
                  </p>
                  <p className="tabular font-display text-2xl font-bold text-accent-ink sm:text-3xl">
                    {money(selected.total)}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  {selected.status === "open" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null);
                          navigate({ to: "/new-order", search: { edit: selected.id } });
                        }}
                        className={ghostBtn}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConverting(selected)}
                        className={primaryBtn}
                      >
                        Convert to invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelling(selected)}
                        className={dangerBtn}
                      >
                        Cancel order
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!converting} onOpenChange={(open) => !open && setConverting(null)}>
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {converting ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  Convert to invoice
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {converting.order_number} for {converting.customer_name} will create an invoice
                  and deduct stock. Total {money(converting.total)}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button type="button" className={ghostBtn} onClick={() => setConverting(null)}>
                  Back
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={convertOrder.isPending}
                  onClick={() => convertOrder.mutate(converting.id)}
                >
                  {convertOrder.isPending ? "Converting…" : "Convert"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {cancelling ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  Cancel order
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {cancelling.order_number} for {cancelling.customer_name} will be marked cancelled.
                  Stock is unchanged.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button type="button" className={ghostBtn} onClick={() => setCancelling(null)}>
                  Back
                </button>
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={cancelOrder.isPending}
                  onClick={() => cancelOrder.mutate(cancelling.id)}
                >
                  {cancelOrder.isPending ? "Cancelling…" : "Cancel order"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
