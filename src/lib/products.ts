import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type QtyBasis = "unit" | "case";
export type PriceBasis = "unit" | "case" | "manual";

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  cost_price_per_case: number;
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

/** Whole cases and leftover units from a unit on-hand count. */
export function splitCasesOnHand(qtyUnits: number, pack: number) {
  const safePack = Math.max(1, Math.floor(Number(pack)) || 1);
  const units = Math.max(0, Math.floor(Number(qtyUnits) || 0));
  return {
    cases: Math.floor(units / safePack),
    remainder: units % safePack,
    pack: safePack,
  };
}

/** Cases represented by a unit on-hand count (may be fractional). */
export function casesOnHand(qtyUnits: number, pack: number) {
  const { cases, remainder, pack: safePack } = splitCasesOnHand(qtyUnits, pack);
  return cases + remainder / safePack;
}

/** e.g. "20 cases", "5 units", "20 cases + 5 units" — never fractional cases. */
export function formatCasesOnHand(qtyUnits: number, pack: number) {
  const { cases, remainder } = splitCasesOnHand(qtyUnits, pack);
  if (cases === 0 && remainder === 0) return "0";
  if (cases === 0) return `${remainder} unit${remainder === 1 ? "" : "s"}`;
  const casePart = `${cases.toLocaleString("en-ZA")} case${cases === 1 ? "" : "s"}`;
  if (remainder === 0) return casePart;
  return `${casePart} + ${remainder} unit${remainder === 1 ? "" : "s"}`;
}

/** Line total is always typed qty × selected charge. Pack only affects stock. */
export function lineAmount(qty: number, charge: number) {
  if (qty <= 0 || charge < 0) return 0;
  return qty * charge;
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
          "id, name, cost_price, cost_price_per_case, selling_price, case_price, units_per_case, quantity_on_hand, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        cost_price: Number(row.cost_price),
        cost_price_per_case: Number(row.cost_price_per_case ?? 0),
        selling_price: Number(row.selling_price),
        case_price: Number(row.case_price ?? 0),
        units_per_case: Math.max(1, Number(row.units_per_case ?? 1) || 1),
      })) as Product[];
    },
    staleTime: 30_000,
  });
}
