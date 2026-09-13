import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StockKind = "unit" | "case";
export type PriceBasis = StockKind;

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  case_price: number;
  stock_kind: StockKind;
  quantity_on_hand: number;
  created_at: string;
};

/** Charged amount for a historical invoice line (unit or case column). */
export function chargedLinePrice(item: {
  unit_price: number;
  case_price: number;
  price_basis: PriceBasis;
}) {
  return item.price_basis === "case" ? item.case_price : item.unit_price;
}

export function stockKindLabel(kind: StockKind) {
  return kind === "case" ? "Case" : "Unit";
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, cost_price, selling_price, case_price, stock_kind, quantity_on_hand, created_at",
        )
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        cost_price: Number(row.cost_price),
        selling_price: Number(row.selling_price),
        case_price: Number(row.case_price ?? 0),
        stock_kind: (row.stock_kind === "case" ? "case" : "unit") as StockKind,
      })) as Product[];
    },
    staleTime: 30_000,
  });
}
