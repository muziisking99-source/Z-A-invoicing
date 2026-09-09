export type RangeKey = "all" | "30" | "90";

export type InvoiceRow = {
  id: string;
  total: number;
  created_at: string;
};

export type InvoiceItemRow = {
  id: string;
  invoice_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  created_at: string;
};

export type ProductCost = {
  id: string;
  name: string;
  cost_price: number;
  quantity_on_hand: number;
  selling_price: number;
};

export type ProductStat = {
  key: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
};

export type DayPoint = {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  invoices: number;
};

export type DashboardStats = {
  invoiceCount: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number | null;
  stockValue: number;
  stockUnits: number;
  missingCostLines: number;
  topByUnits: ProductStat[];
  topByRevenue: ProductStat[];
  topByProfit: ProductStat[];
  mostSold: ProductStat | null;
  revenueSeries: DayPoint[];
};

function rangeStart(range: RangeKey, now: Date): Date | null {
  if (range === "all") return null;
  const days = range === "30" ? 30 : 90;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(key: string) {
  const parts = key.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  });
}

export function buildDashboardStats(
  invoices: InvoiceRow[],
  items: InvoiceItemRow[],
  products: ProductCost[],
  range: RangeKey,
  now = new Date(),
): DashboardStats {
  const start = rangeStart(range, now);
  const productMap = new Map(products.map((p) => [p.id, p]));

  const invoicesInRange = invoices.filter((inv) => {
    if (!start) return true;
    return new Date(inv.created_at) >= start;
  });
  const invoiceIds = new Set(invoicesInRange.map((i) => i.id));
  const itemsInRange = items.filter((item) => invoiceIds.has(item.invoice_id));

  const byProduct = new Map<string, ProductStat>();
  let unitsSold = 0;
  let revenue = 0;
  let cogs = 0;
  let missingCostLines = 0;

  for (const item of itemsInRange) {
    unitsSold += item.quantity;
    revenue += item.line_total;

    const product = item.product_id ? productMap.get(item.product_id) : undefined;
    const unitCost = product ? product.cost_price : null;
    if (unitCost == null) missingCostLines += 1;
    const lineCost = (unitCost ?? 0) * item.quantity;
    cogs += lineCost;

    const key = item.product_id ?? `name:${item.product_name}`;
    const existing = byProduct.get(key) ?? {
      key,
      name: item.product_name,
      units: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    existing.units += item.quantity;
    existing.revenue += item.line_total;
    existing.cost += lineCost;
    existing.profit = existing.revenue - existing.cost;
    byProduct.set(key, existing);
  }

  // Prefer invoice totals when present (keeps dashboard aligned with history)
  const invoiceRevenue = invoicesInRange.reduce((sum, inv) => sum + inv.total, 0);
  if (invoiceRevenue > 0) revenue = invoiceRevenue;

  const profit = revenue - cogs;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : null;

  const productStats = [...byProduct.values()];
  const topByUnits = [...productStats].sort((a, b) => b.units - a.units).slice(0, 6);
  const topByRevenue = [...productStats].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topByProfit = [...productStats].sort((a, b) => b.profit - a.profit).slice(0, 6);

  const dayMap = new Map<string, DayPoint>();
  for (const inv of invoicesInRange) {
    const key = dayKey(inv.created_at);
    const point = dayMap.get(key) ?? {
      key,
      label: dayLabel(key),
      revenue: 0,
      profit: 0,
      invoices: 0,
    };
    point.revenue += inv.total;
    point.invoices += 1;
    dayMap.set(key, point);
  }

  // Allocate item-level profit onto invoice days via invoice items
  const profitByInvoice = new Map<string, number>();
  for (const item of itemsInRange) {
    const product = item.product_id ? productMap.get(item.product_id) : undefined;
    const lineProfit = item.line_total - (product?.cost_price ?? 0) * item.quantity;
    profitByInvoice.set(
      item.invoice_id,
      (profitByInvoice.get(item.invoice_id) ?? 0) + lineProfit,
    );
  }
  for (const inv of invoicesInRange) {
    const key = dayKey(inv.created_at);
    const point = dayMap.get(key);
    if (point) point.profit += profitByInvoice.get(inv.id) ?? 0;
  }

  let revenueSeries = [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (range !== "all" && start) {
    const filled: DayPoint[] = [];
    const cursor = new Date(start);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;
      filled.push(
        dayMap.get(key) ?? {
          key,
          label: dayLabel(key),
          revenue: 0,
          profit: 0,
          invoices: 0,
        },
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    revenueSeries = filled;
  }

  const stockValue = products.reduce(
    (sum, p) => sum + p.quantity_on_hand * p.selling_price,
    0,
  );
  const stockUnits = products.reduce((sum, p) => sum + p.quantity_on_hand, 0);

  return {
    invoiceCount: invoicesInRange.length,
    unitsSold,
    revenue,
    cogs,
    profit,
    marginPct,
    stockValue,
    stockUnits,
    missingCostLines,
    topByUnits,
    topByRevenue,
    topByProfit,
    mostSold: topByUnits[0] ?? null,
    revenueSeries,
  };
}

export function formatPct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}
