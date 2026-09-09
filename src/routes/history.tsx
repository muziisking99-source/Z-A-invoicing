import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money, shortDate } from "@/lib/format";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Invoice History · ZA Stock" },
      {
        name: "description",
        content: "Browse past invoices, open line-item detail, and download PDFs.",
      },
      { property: "og:title", content: "Invoice History · ZA Stock" },
      {
        property: "og:description",
        content: "Past invoices with totals and PDF download.",
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
  created_at: string;
};

type InvoiceItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    staleTime: 30_000,
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, total, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        total: Number(row.total),
      })) as Invoice[];
    },
  });
}

function useInvoiceItems(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice-items", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoiceItem[]> => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, product_name, quantity, unit_price, line_total")
        .eq("invoice_id", invoiceId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        unit_price: Number(row.unit_price),
        line_total: Number(row.line_total),
      })) as InvoiceItem[];
    },
  });
}

function HistoryPage() {
  const { data: invoices = [], isLoading } = useInvoices();
  const [selected, setSelected] = useState<Invoice | null>(null);
  const { data: items = [], isLoading: itemsLoading } = useInvoiceItems(selected?.id ?? null);

  const openCount = useMemo(() => invoices.length, [invoices]);

  const handlePdf = async (invoice: Invoice, lineItems: InvoiceItem[]) => {
    try {
      await downloadInvoicePdf({
        invoice_number: invoice.invoice_number,
        customer_name: invoice.customer_name,
        created_at: invoice.created_at,
        total: invoice.total,
        items: lineItems,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create PDF");
    }
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Invoicing" title="Invoice history">
        <span className="text-sm font-medium text-soft">
          {openCount} invoice{openCount === 1 ? "" : "s"}
        </span>
      </PageHeader>

      {/* Mobile cards */}
      <section className="mt-4 space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel rounded-xl p-4">
              <div className="skeleton-bar h-5 w-1/2" />
              <div className="skeleton-bar mt-3 h-4 w-full" />
            </div>
          ))
        ) : invoices.length === 0 ? (
          <div className="panel rounded-xl px-4 py-10 text-center text-soft">
            No invoices yet. Create one from New Invoice.
          </div>
        ) : (
          invoices.map((invoice) => (
            <button
              key={invoice.id}
              type="button"
              onClick={() => setSelected(invoice)}
              className="panel btn-press w-full rounded-xl p-4 text-left transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold text-accent-ink">
                    {invoice.invoice_number}
                  </p>
                  <p className="mt-1 truncate text-lg font-medium text-ink">
                    {invoice.customer_name}
                  </p>
                  <p className="mt-1 text-sm text-soft">{shortDate(invoice.created_at)}</p>
                </div>
                <p className="shrink-0 font-mono text-base font-semibold tabular-nums">
                  {money(invoice.total)}
                </p>
              </div>
            </button>
          ))
        )}
      </section>

      {/* Desktop table */}
      <section className="panel mt-6 hidden overflow-hidden rounded-xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-base">
            <thead>
              <tr className="sticky top-0 z-[1] border-b border-line bg-secondary text-sm font-semibold uppercase tracking-wide text-soft">
                <th className="px-5 py-3.5">Invoice #</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-line/80 last:border-0">
                    <td className="px-5 py-4" colSpan={4}>
                      <div className="skeleton-bar h-5 w-full max-w-lg" />
                    </td>
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-14 text-center text-soft">
                    No invoices yet. Create one from New Invoice.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice, index) => (
                  <tr
                    key={invoice.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(invoice)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(invoice);
                      }
                    }}
                    className="row-enter cursor-pointer border-b border-line/80 transition-colors duration-150 last:border-0 hover:bg-secondary/80"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <td className="px-5 py-4 font-mono text-[15px] font-semibold text-accent-ink">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-5 py-4 text-lg">{invoice.customer_name}</td>
                    <td className="px-5 py-4 text-soft">{shortDate(invoice.created_at)}</td>
                    <td className="tabular px-5 py-4 text-right font-mono text-[15px] font-semibold">
                      {money(invoice.total)}
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

              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[20rem] text-left text-sm sm:text-base">
                  <thead>
                    <tr className="border-b border-line bg-secondary text-xs font-semibold uppercase tracking-wide text-soft sm:text-sm">
                      <th className="px-3 py-2.5 sm:px-4 sm:py-3">Product</th>
                      <th className="px-3 py-2.5 text-right sm:px-4 sm:py-3">Qty</th>
                      <th className="hidden px-3 py-2.5 text-right sm:table-cell sm:px-4 sm:py-3">
                        Unit
                      </th>
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
                          <td className="tabular hidden px-3 py-2.5 text-right font-mono text-soft sm:table-cell sm:px-4 sm:py-3">
                            {money(item.unit_price)}
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

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                    Total
                  </p>
                  <p className="tabular font-display text-2xl font-bold text-accent-ink sm:text-3xl">
                    {money(selected.total)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={itemsLoading || items.length === 0}
                  onClick={() => handlePdf(selected, items)}
                  className="btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto"
                >
                  Download PDF
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
