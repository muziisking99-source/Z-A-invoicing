import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  case_price: number;
  quantity_on_hand: number;
  created_at: string;
};

export type PriceBasis = "unit" | "case";

export function chargePrice(product: Pick<Product, "selling_price" | "case_price">, basis: PriceBasis) {
  return basis === "case" ? product.case_price : product.selling_price;
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, cost_price, selling_price, case_price, quantity_on_hand, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        cost_price: Number(row.cost_price),
        selling_price: Number(row.selling_price),
        case_price: Number(row.case_price ?? 0),
      })) as Product[];
    },
    staleTime: 30_000,
  });
}
