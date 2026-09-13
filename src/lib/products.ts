import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QtyBasis = "unit" | "case";
export type PriceBasis = "unit" | "case" | "manual";

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  case_price: number;
  units_per_case: number;
  quantity_on_hand: number;
  created_at: string;
};

export function unitsForLine(qty: number, qtyBasis: QtyBasis, pack: number) {
  const safePack = Math.max(1, Math.floor(pack) || 1);
  const safeQty = Number.isFinite(qty) ? Math.floor(qty) : 0;
  if (safeQty <= 0) return 0;
  return qtyBasis === "case" ? safeQty * safePack : safeQty;
}

/** Charged amount for a historical invoice line. */
export function chargedLinePrice(item: {
  unit_price: number;
  case_price: number;
  price_basis: PriceBasis;
}) {
  if (item.price_basis === "case") return item.case_price;
  return item.unit_price;
}

export function priceBasisLabel(basis: PriceBasis) {
  if (basis === "case") return "Case";
  if (basis === "manual") return "Manual";
  return "Unit";
}

export function qtyBasisLabel(basis: QtyBasis) {
  return basis === "case" ? "Cases" : "Units";
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, cost_price, selling_price, case_price, units_per_case, quantity_on_hand, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        cost_price: Number(row.cost_price),
        selling_price: Number(row.selling_price),
        case_price: Number(row.case_price ?? 0),
        units_per_case: Math.max(1, Number(row.units_per_case ?? 1) || 1),
      })) as Product[];
    },
    staleTime: 30_000,
  });
}
