import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { DualMetricBars, HorizontalBarChart, LineAreaChart } from "@/components/charts";
import { money } from "@/lib/format";
import {
  buildDashboardStats,
  formatPct,
  type InvoiceItemRow,
  type InvoiceRow,
  type RangeKey,
} from "@/lib/dashboard-stats";
import { useProducts } from "@/lib/products";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · Sweet for You Salvage" },
      {
        name: "description",
        content: "Profit and loss, top sellers, and sales trends from your invoices.",
      },
      { property: "og:title", content: "Dashboard · Sweet for You Salvage" },
      {
        property: "og:description",
        content: "P/L, most sold items, and revenue charts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "all", label: "All time" },
];

function useSalesData() {
  return useQuery({
    queryKey: ["dashboard-sales"],
    staleTime: 30_000,
    queryFn: async () => {
      const [invoicesRes, itemsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, total, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("invoice_items")
          .select(
            "id, invoice_id, product_id, product_name, quantity, unit_price, line_total, created_at",
          ),
      ]);
      if (invoicesRes.error) throw invoicesRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const invoices: InvoiceRow[] = (invoicesRes.data ?? []).map((row) => ({
        id: row.id,
        total: Number(row.total),
        created_at: row.created_at,
      }));
      const items: InvoiceItemRow[] = (itemsRes.data ?? []).map((row) => ({
        id: row.id,
        invoice_id: row.invoice_id,
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        unit_price: Number(row.unit_price),
        line_total: Number(row.line_total),
        created_at: row.created_at,
      }));
      return { invoices, items };
    },
  });
}

function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("30");
  const { data: sales, isLoading: salesLoading } = useSalesData();
  const { data: products = [], isLoading: productsLoading } = useProducts();

  const stats = useMemo(() => {
    if (!sales) return null;
    return buildDashboardStats(sales.invoices, sales.items, products, range);
  }, [sales, products, range]);

  const loading = salesLoading || productsLoading;

  return (
    <AppShell>
      <PageHeader eyebrow="Overview" title="Dashboard">
        <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
          {RANGES.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRange(option.key)}
              className={cn(
                "btn-press rounded-lg px-3 py-2 text-sm font-medium sm:px-4 sm:py-2.5 sm:text-base",
                range === option.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-line bg-paper text-ink hover:bg-secondary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {loading || !stats ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel rounded-xl p-4">
              <div className="skeleton-bar h-4 w-1/2" />
              <div className="skeleton-bar mt-3 h-8 w-3/4" />
            </div>
          ))}
        </div>
      ) : stats.invoiceCount === 0 ? (
        <section className="panel mt-3 rounded-xl px-5 py-10 text-center">
          <p className="font-display text-xl font-semibold text-ink">No sales in this range</p>
          <p className="mt-2 text-soft">
            Create an invoice to start tracking revenue and profit.
          </p>
          <Link
            to="/new-invoice"
            className="btn-press mt-5 inline-flex rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground"
          >
            New invoice
          </Link>
        </section>
      ) : (
        <>
          <section className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <Kpi
              label="Revenue"
              value={money(stats.revenue)}
              hint={`${stats.invoiceCount} invoice${stats.invoiceCount === 1 ? "" : "s"}`}
            />
            <Kpi
              label="Gross profit"
              value={money(stats.profit)}
              hint={
                stats.marginPct == null
                  ? "No margin yet"
                  : `${formatPct(stats.marginPct)} margin`
              }
              tone={stats.profit >= 0 ? "good" : "bad"}
            />
            <Kpi
              label="Cost of goods"
              value={money(stats.cogs)}
              hint={`${stats.unitsSold.toLocaleString("en-ZA")} units sold`}
            />
            <Kpi
              label="Stock value"
              value={money(stats.stockValue)}
              hint={`${stats.stockUnits.toLocaleString("en-ZA")} on hand`}
            />
          </section>

          {stats.missingCostLines > 0 ? (
            <p className="mt-3 text-sm text-soft">
              {stats.missingCostLines} line
              {stats.missingCostLines === 1 ? "" : "s"} missing product cost — those lines use R0
              cost in P/L.
            </p>
          ) : null}

          <section className="mt-3 grid gap-3 lg:grid-cols-12 lg:gap-4">
            <div className="panel rounded-xl p-4 sm:p-5 lg:col-span-7">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                    Revenue trend
                  </p>
                  <p className="mt-1 text-base text-soft">Daily invoice totals</p>
                </div>
              </div>
              <div className="mt-4">
                <LineAreaChart
                  points={stats.revenueSeries.map((p) => ({
                    label: p.label,
                    value: p.revenue,
                  }))}
                />
              </div>
            </div>

            <div className="panel rounded-xl p-4 sm:p-5 lg:col-span-5">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                Most sold
              </p>
              {stats.mostSold ? (
                <div className="mt-3">
                  <p className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                    {stats.mostSold.name}
                  </p>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:text-base">
                    <div>
                      <dt className="text-soft">Units</dt>
                      <dd className="font-mono text-lg font-semibold tabular-nums">
                        {stats.mostSold.units.toLocaleString("en-ZA")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-soft">Revenue</dt>
                      <dd className="font-mono text-lg font-semibold tabular-nums text-accent-ink">
                        {money(stats.mostSold.revenue)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-soft">Profit</dt>
                      <dd
                        className={cn(
                          "font-mono text-lg font-semibold tabular-nums",
                          stats.mostSold.profit >= 0 ? "text-ink" : "text-destructive",
                        )}
                      >
                        {money(stats.mostSold.profit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-soft">Share of units</dt>
                      <dd className="font-mono text-lg font-semibold tabular-nums">
                        {stats.unitsSold > 0
                          ? formatPct((stats.mostSold.units / stats.unitsSold) * 100)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p className="mt-6 text-soft">No line items yet.</p>
              )}
            </div>
          </section>

          <section className="mt-3 grid gap-3 lg:grid-cols-2 lg:gap-4">
            <div className="panel rounded-xl p-4 sm:p-5">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                Top by units
              </p>
              <p className="mt-1 text-base text-soft">Highest quantity sold</p>
              <div className="mt-4">
                <HorizontalBarChart
                  points={stats.topByUnits.map((p) => ({
                    label: p.name,
                    value: p.units,
                  }))}
                />
              </div>
            </div>

            <div className="panel rounded-xl p-4 sm:p-5">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                Top by profit
              </p>
              <p className="mt-1 text-base text-soft">Revenue vs gross profit</p>
              <div className="mt-4">
                <DualMetricBars
                  rows={stats.topByProfit.map((p) => ({
                    label: p.name,
                    revenue: p.revenue,
                    profit: p.profit,
                  }))}
                />
              </div>
            </div>
          </section>

          <section className="panel mt-3 overflow-hidden rounded-xl">
            <div className="border-b border-line px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-soft">
                Product performance
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm sm:text-base">
                <thead>
                  <tr className="border-b border-line bg-secondary text-xs font-semibold uppercase tracking-wide text-soft sm:text-sm">
                    <th className="px-4 py-3 sm:px-5">Product</th>
                    <th className="px-4 py-3 text-right sm:px-5">Units</th>
                    <th className="px-4 py-3 text-right sm:px-5">Revenue</th>
                    <th className="px-4 py-3 text-right sm:px-5">COGS</th>
                    <th className="px-4 py-3 text-right sm:px-5">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topByRevenue.map((row) => (
                    <tr key={row.key} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3 font-medium sm:px-5">{row.name}</td>
                      <td className="tabular px-4 py-3 text-right font-mono sm:px-5">
                        {row.units.toLocaleString("en-ZA")}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-mono sm:px-5">
                        {money(row.revenue)}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-mono text-soft sm:px-5">
                        {money(row.cost)}
                      </td>
                      <td
                        className={cn(
                          "tabular px-4 py-3 text-right font-mono font-semibold sm:px-5",
                          row.profit >= 0 ? "text-accent-ink" : "text-destructive",
                        )}
                      >
                        {money(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <div className="panel rounded-xl p-3.5 sm:p-4">
      <p className="text-xs font-medium text-soft sm:text-sm">{label}</p>
      <p
        className={cn(
          "tabular mt-1 break-all font-mono text-xl font-semibold tracking-tight sm:text-2xl",
          tone === "good" && "text-accent-ink",
          tone === "bad" && "text-destructive",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-soft sm:text-sm">{hint}</p>
    </div>
  );
}
