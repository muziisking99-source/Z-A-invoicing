import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money, shortDate } from "@/lib/format";
import { downloadDeliveryNotePdf, downloadInvoicePdf } from "@/lib/invoice-pdf";
import {
  amountOwing,
  paymentStatus,
  paymentStatusLabel,
  type PaymentStatus,
} from "@/lib/invoice-payments";
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

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Invoice History · Sweet for You Salvage" },
      {
        name: "description",
        content: "Browse past invoices, record payments, and download PDFs.",
      },
      { property: "og:title", content: "Invoice History · Sweet for You Salvage" },
      {
        property: "og:description",
        content: "Past invoices with outstanding balances and PDF download.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

type Invoice = {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  delivery_cost: number;
  amount_paid: number;
  created_at: string;
};

type InvoiceItem = {
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

type PaymentFilter = "all" | "outstanding" | "paid";

const primaryBtn =
  "btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";
const ghostBtn =
  "btn-press w-full rounded-lg border border-line bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-secondary sm:w-auto";
const dangerBtn =
  "btn-press w-full rounded-lg border border-destructive/30 bg-paper px-5 py-3 text-base font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-60 sm:w-auto";
const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-primary";
const labelClass = "text-sm font-medium text-soft";

function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    staleTime: 30_000,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, customer_name, total, delivery_cost, amount_paid, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        total: Number(row.total),
        delivery_cost: Number(row.delivery_cost ?? 0),
        amount_paid: Number(row.amount_paid ?? 0),
      })) as Invoice[];
    },
  });
}

function mapInvoiceItems(
  rows: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    case_price: number | null;
    price_basis: string;
    qty_basis: string;
    units_per_case: number | null;
    line_total: number;
  }[],
): InvoiceItem[] {
  return rows.map((row) => ({
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
}

async function fetchInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const { data, error } = await supabase
    .from("invoice_items")
    .select(
      "id, product_name, quantity, unit_price, case_price, price_basis, qty_basis, units_per_case, line_total",
    )
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return mapInvoiceItems(data ?? []);
}

function useInvoiceItems(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice-items", invoiceId],
    enabled: !!invoiceId,
    queryFn: () => fetchInvoiceItems(invoiceId!),
  });
}

function statusTone(status: PaymentStatus) {
  if (status === "paid") return "bg-emerald-500/10 text-emerald-800";
  if (status === "partial") return "bg-amber-500/10 text-amber-900";
  return "bg-rose-500/10 text-rose-800";
}

function PaymentBadge({ invoice }: { invoice: Invoice }) {
  const status = paymentStatus(invoice.total, invoice.amount_paid);
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        statusTone(status),
      )}
    >
      {paymentStatusLabel(status)}
    </span>
  );
}

function HistoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: invoices = [], isLoading } = useInvoices();
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [paidInput, setPaidInput] = useState("");
  const { data: items = [], isLoading: itemsLoading } = useInvoiceItems(selected?.id ?? null);

  const filtered = useMemo(() => {
    return invoices.filter((invoice) => {
      const status = paymentStatus(invoice.total, invoice.amount_paid);
      if (filter === "outstanding") return status !== "paid";
      if (filter === "paid") return status === "paid";
      return true;
    });
  }, [invoices, filter]);

  const outstandingTotal = useMemo(
    () => invoices.reduce((sum, inv) => sum + amountOwing(inv.total, inv.amount_paid), 0),
    [invoices],
  );

  const removeInvoice = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_invoice", { p_invoice_id: id });
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      toast.success("Invoice deleted — stock restored");
      setDeleting(null);
      if (selected?.id === id) setSelected(null);
      if (paying?.id === id) setPaying(null);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-items"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-sales"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const savePayment = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { data, error } = await supabase.rpc("record_invoice_payment", {
        p_invoice_id: id,
        p_amount_paid: amount,
      });
      if (error) throw error;
      return data as Invoice;
    },
    onSuccess: (data) => {
      toast.success("Payment updated");
      setPaying(null);
      setSelected((prev) =>
        prev && prev.id === data.id
          ? {
              ...prev,
              amount_paid: Number(data.amount_paid ?? 0),
              total: Number(data.total),
            }
          : prev,
      );
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-sales"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openEdit = (invoice: Invoice) => {
    setSelected(null);
    navigate({ to: "/new-invoice", search: { edit: invoice.id } });
  };

  const openPayment = (invoice: Invoice) => {
    setPaying(invoice);
    setPaidInput(String(invoice.amount_paid));
  };

  const pdfData = (invoice: Invoice, lineItems: InvoiceItem[]) => ({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    created_at: invoice.created_at,
    total: invoice.total,
    delivery_cost: invoice.delivery_cost,
    items: lineItems.map((item) => ({
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      case_price: item.case_price,
      price_basis: item.price_basis,
      qty_basis: item.qty_basis,
      units_per_case: item.units_per_case,
      line_total: item.line_total,
    })),
  });

  const handlePdf = async (invoice: Invoice, lineItems: InvoiceItem[]) => {
    try {
      await downloadInvoicePdf(pdfData(invoice, lineItems));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create PDF");
    }
  };

  const handleDeliveryNote = async (invoice: Invoice, lineItems?: InvoiceItem[]) => {
    try {
      const rows = lineItems ?? (await fetchInvoiceItems(invoice.id));
      if (rows.length === 0) {
        toast.error("This invoice has no line items");
        return;
      }
      await downloadDeliveryNotePdf(pdfData(invoice, rows));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create PDF");
    }
  };

  const submitPayment = () => {
    if (!paying) return;
    const amount = Number(paidInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid amount paid");
      return;
    }
    if (amount > paying.total) {
      toast.error("Amount paid cannot exceed the invoice total");
      return;
    }
    savePayment.mutate({ id: paying.id, amount });
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Invoicing" title="Invoice history">
        <div className="text-right">
          <p className="text-sm font-medium text-soft">
            {filtered.length} invoice{filtered.length === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-accent-ink">
            Owing {money(outstandingTotal)}
          </p>
        </div>
      </PageHeader>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            { key: "all", label: "All" },
            { key: "outstanding", label: "Outstanding" },
            { key: "paid", label: "Paid" },
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

      {/* Mobile cards */}
      <section className="mt-3 space-y-2.5 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel rounded-xl p-4">
              <div className="skeleton-bar h-5 w-1/2" />
              <div className="skeleton-bar mt-3 h-4 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="panel rounded-xl px-4 py-10 text-center text-soft">
            {invoices.length === 0
              ? "No invoices yet. Create one from New Invoice."
              : "No invoices match this filter."}
          </div>
        ) : (
          filtered.map((invoice) => {
            const owing = amountOwing(invoice.total, invoice.amount_paid);
            return (
              <div key={invoice.id} className="panel rounded-xl p-4">
                <button
                  type="button"
                  onClick={() => setSelected(invoice)}
                  className="btn-press w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-accent-ink">
                          {invoice.invoice_number}
                        </p>
                        <PaymentBadge invoice={invoice} />
                      </div>
                      <p className="mt-1 truncate text-lg font-medium text-ink">
                        {invoice.customer_name}
                      </p>
                      <p className="mt-1 text-sm text-soft">{shortDate(invoice.created_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-base font-semibold tabular-nums">
                        {money(invoice.total)}
                      </p>
                      <p className="mt-1 text-xs text-soft">
                        Owing {money(owing)}
                      </p>
                    </div>
                  </div>
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(invoice)}
                    className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(invoice)}
                    className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openPayment(invoice)}
                    className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                  >
                    Record payment
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeliveryNote(invoice)}
                    className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                  >
                    Delivery note
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(invoice)}
                    className="btn-press col-span-2 rounded-lg border border-destructive/30 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Desktop table */}
      <section className="panel mt-3 hidden overflow-hidden rounded-xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-base">
            <thead>
              <tr className="sticky top-0 z-[1] border-b border-line bg-secondary text-xs font-semibold uppercase tracking-wide text-soft sm:text-sm">
                <th className="px-4 py-2.5 sm:px-5">Invoice #</th>
                <th className="px-4 py-2.5 sm:px-5">Customer</th>
                <th className="px-4 py-2.5 sm:px-5">Date</th>
                <th className="px-4 py-2.5 text-right sm:px-5">Total</th>
                <th className="px-4 py-2.5 text-right sm:px-5">Owing</th>
                <th className="px-4 py-2.5 sm:px-5">Status</th>
                <th className="px-4 py-2.5 sm:px-5" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-line/80 last:border-0">
                    <td className="px-4 py-3 sm:px-5" colSpan={7}>
                      <div className="skeleton-bar h-5 w-full max-w-lg" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-soft sm:px-5">
                    {invoices.length === 0
                      ? "No invoices yet. Create one from New Invoice."
                      : "No invoices match this filter."}
                  </td>
                </tr>
              ) : (
                filtered.map((invoice, index) => (
                  <tr
                    key={invoice.id}
                    className="row-enter border-b border-line/80 transition-colors duration-150 last:border-0 hover:bg-secondary/80"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <td className="px-4 py-3 font-mono text-[15px] font-semibold text-accent-ink sm:px-5">
                      <button
                        type="button"
                        onClick={() => setSelected(invoice)}
                        className="btn-press text-left hover:underline"
                      >
                        {invoice.invoice_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-base sm:px-5 sm:text-lg">
                      {invoice.customer_name}
                    </td>
                    <td className="px-4 py-3 text-soft sm:px-5">
                      {shortDate(invoice.created_at)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono text-[15px] font-semibold sm:px-5">
                      {money(invoice.total)}
                    </td>
                    <td className="tabular px-4 py-3 text-right font-mono text-[15px] font-semibold sm:px-5">
                      {money(amountOwing(invoice.total, invoice.amount_paid))}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <PaymentBadge invoice={invoice} />
                    </td>
                    <td className="px-4 py-3 text-right sm:px-5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(invoice)}
                          className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(invoice)}
                          className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openPayment(invoice)}
                          className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                        >
                          Record payment
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeliveryNote(invoice)}
                          className="btn-press rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                        >
                          Delivery note
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(invoice)}
                          className="btn-press rounded-lg border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5"
                        >
                          Delete
                        </button>
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
                  {selected.invoice_number}
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {selected.customer_name} · {shortDate(selected.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-1">
                <PaymentBadge invoice={selected} />
              </div>

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
                  {selected.delivery_cost > 0 ? (
                    <dl className="mb-2 space-y-1 text-sm text-soft">
                      <div className="flex gap-3">
                        <dt>Subtotal</dt>
                        <dd className="font-mono tabular-nums text-ink">
                          {money(selected.total - selected.delivery_cost)}
                        </dd>
                      </div>
                      <div className="flex gap-3">
                        <dt>Delivery</dt>
                        <dd className="font-mono tabular-nums text-ink">
                          {money(selected.delivery_cost)}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                  <dl className="mb-2 space-y-1 text-sm text-soft">
                    <div className="flex gap-3">
                      <dt>Paid</dt>
                      <dd className="font-mono tabular-nums text-ink">
                        {money(selected.amount_paid)}
                      </dd>
                    </div>
                    <div className="flex gap-3">
                      <dt>Owing</dt>
                      <dd className="font-mono tabular-nums text-accent-ink">
                        {money(amountOwing(selected.total, selected.amount_paid))}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                    Total
                  </p>
                  <p className="tabular font-display text-2xl font-bold text-accent-ink sm:text-3xl">
                    {money(selected.total)}
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    onClick={() => openEdit(selected)}
                    className={ghostBtn}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => openPayment(selected)}
                    className={ghostBtn}
                  >
                    Record payment
                  </button>
                  <button
                    type="button"
                    disabled={itemsLoading || items.length === 0}
                    onClick={() => handleDeliveryNote(selected, items)}
                    className={ghostBtn}
                  >
                    Delivery note
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(selected)}
                    className={dangerBtn}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={itemsLoading || items.length === 0}
                    onClick={() => handlePdf(selected, items)}
                    className={primaryBtn}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!paying}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
      >
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {paying ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  Record payment
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {paying.invoice_number} · {paying.customer_name}
                </DialogDescription>
              </DialogHeader>

              <dl className="mt-2 space-y-1 text-sm text-soft">
                <div className="flex justify-between gap-3">
                  <dt>Invoice total</dt>
                  <dd className="font-mono tabular-nums text-ink">{money(paying.total)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Currently paid</dt>
                  <dd className="font-mono tabular-nums text-ink">
                    {money(paying.amount_paid)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Still owing</dt>
                  <dd className="font-mono tabular-nums text-accent-ink">
                    {money(amountOwing(paying.total, paying.amount_paid))}
                  </dd>
                </div>
              </dl>

              <div className="mt-4">
                <label className={labelClass} htmlFor="amount-paid">
                  Amount paid (total so far)
                </label>
                <input
                  id="amount-paid"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={paidInput}
                  onChange={(e) => setPaidInput(e.target.value)}
                  className={`${fieldClass} tabular font-mono`}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => setPaidInput(String(paying.total))}
                >
                  Mark paid in full
                </button>
                <button type="button" className={ghostBtn} onClick={() => setPaying(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={savePayment.isPending}
                  onClick={submitPayment}
                >
                  {savePayment.isPending ? "Saving…" : "Save payment"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="panel max-w-md rounded-xl border-line sm:rounded-xl">
          {deleting ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl sm:text-2xl">
                  Delete invoice
                </DialogTitle>
                <DialogDescription className="text-sm text-soft sm:text-base">
                  {deleting.invoice_number} for {deleting.customer_name} will be removed. Quantities
                  from its line items go back into stock.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button type="button" className={ghostBtn} onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={dangerBtn}
                  disabled={removeInvoice.isPending}
                  onClick={() => removeInvoice.mutate(deleting.id)}
                >
                  {removeInvoice.isPending ? "Deleting…" : "Delete invoice"}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
