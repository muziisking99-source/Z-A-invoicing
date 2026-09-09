import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Current Stock · Marrow Stock & Invoicing" },
      {
        name: "description",
        content:
          "See every product with cost price, selling price and quantity on hand. Add products and top up stock.",
      },
      { property: "og:title", content: "Current Stock · Marrow" },
      {
        property: "og:description",
        content: "Product stock levels, cost and selling prices in one ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StockPage,
});

export type Product = {
  id: string;
  name: string;
  cost_price: number;
  selling_price: number;
  quantity_on_hand: number;
  created_at: string;
};

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        cost_price: Number(row.cost_price),
        selling_price: Number(row.selling_price),
      })) as Product[];
    },
  });
}

const fieldClass =
  "mt-1 w-full rounded-2xl border border-line bg-paper/70 px-3 py-2 text-sm outline-none focus:border-primary/50";
const labelClass = "font-mono text-[10px] uppercase tracking-[0.15em] text-soft";
const primaryBtn =
  "rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-105 disabled:opacity-60";
const ghostBtn = "rounded-2xl border border-line px-4 py-2 text-sm font-medium text-soft";

function StockPage() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["products"] });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;
  }, [products, search]);

  const totals = useMemo(
    () => ({
      units: products.reduce((sum, p) => sum + p.quantity_on_hand, 0),
      value: products.reduce((sum, p) => sum + p.quantity_on_hand * p.selling_price, 0),
    }),
    [products],
  );

  const removeProduct = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      setDeleting(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <PageHeader eyebrow="Stock ledger" title="Products & inventory">
        <div className="flex items-center gap-2 rounded-2xl border border-paper/60 bg-paper/60 px-3 py-2 backdrop-blur-xl">
          <span className="font-mono text-xs text-soft">/</span>
          <input
            aria-label="Search products"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-36 bg-transparent text-sm outline-none placeholder:text-soft/70 sm:w-40"
          />
        </div>
        <button className={ghostBtn} onClick={() => setStockOpen(true)}>
          Add stock
        </button>
        <button className={primaryBtn} onClick={() => setAddOpen(true)}>
          Add product
        </button>
      </PageHeader>

      <section className="glass animate-rise mt-5 overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-paper/70 text-left font-mono text-[10px] uppercase tracking-[0.15em] text-soft">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">Sell</th>
                <th className="px-4 py-3 text-right font-medium">On hand</th>
                <th className="px-4 py-3 text-right font-medium">Value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="tabular font-mono text-[13px]">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-soft">
                    Loading products…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-soft">
                    {products.length === 0
                      ? "No products yet — add your first one."
                      : "No products match that search."}
                  </td>
                </tr>
              ) : (
                filtered.map((product) => (
                  <tr
                    key={product.id}
                    className="border-t border-line/80 transition hover:bg-primary/[0.07]"
                  >
                    <td className="px-4 py-3 font-body font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-right text-soft">{money(product.cost_price)}</td>
                    <td className="px-4 py-3 text-right">{money(product.selling_price)}</td>
                    <td
                      className={`px-4 py-3 text-right ${
                        product.quantity_on_hand === 0 ? "text-accent-ink" : ""
                      }`}
                    >
                      {product.quantity_on_hand}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink">
                      {money(product.quantity_on_hand * product.selling_price)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => setEditing(product)}
                        className="rounded-full border border-line px-2 py-0.5 text-[11px] text-soft transition hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleting(product)}
                        className="ml-2 rounded-full border border-primary/40 px-2 py-0.5 text-[11px] text-accent-ink"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="tabular flex items-center justify-between border-t border-line/80 bg-paper/50 px-4 py-3 font-mono text-[11px] text-soft">
          <span>
            {filtered.length} of {products.length} products · {totals.units} units
          </span>
          <span>Stock value · {money(totals.value)}</span>
        </div>
      </section>

      <AddProductDialog open={addOpen} onOpenChange={setAddOpen} onSaved={invalidate} />
      <AddStockDialog
        open={stockOpen}
        onOpenChange={setStockOpen}
        products={products}
        onSaved={invalidate}
      />
      <EditProductDialog product={editing} onClose={() => setEditing(null)} onSaved={invalidate} />

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="glass rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Delete product</DialogTitle>
            <DialogDescription>
              {deleting?.name} will be removed from stock. Past invoices keep their own record.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className={ghostBtn} onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className={primaryBtn}
              disabled={removeProduct.isPending}
              onClick={() => deleting && removeProduct.mutate(deleting.id)}
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AddProductDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        name: name.trim(),
        cost_price: Number(cost || 0),
        selling_price: Number(sell || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product added");
      setName("");
      setCost("");
      setSell("");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Add product</DialogTitle>
          <DialogDescription>New products start with zero on hand.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Product name is required");
            save.mutate();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="p-name">
              Product name
            </label>
            <input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="p-cost">
                Cost price
              </label>
              <input
                id="p-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={`${fieldClass} tabular font-mono`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="p-sell">
                Selling price
              </label>
              <input
                id="p-sell"
                type="number"
                min="0"
                step="0.01"
                value={sell}
                onChange={(e) => setSell(e.target.value)}
                className={`${fieldClass} tabular font-mono`}
              />
            </div>
          </div>
          <DialogFooter>
            <button type="submit" className={primaryBtn} disabled={save.isPending}>
              Save product
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [sell, setSell] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (product && product.id !== loadedId) {
    setLoadedId(product.id);
    setName(product.name);
    setCost(String(product.cost_price));
    setSell(String(product.selling_price));
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          cost_price: Number(cost || 0),
          selling_price: Number(sell || 0),
        })
        .eq("id", product!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product updated");
      onClose();
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Edit product</DialogTitle>
          <DialogDescription>Use “Add stock” to change quantity on hand.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error("Product name is required");
            save.mutate();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="e-name">
              Product name
            </label>
            <input
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="e-cost">
                Cost price
              </label>
              <input
                id="e-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={`${fieldClass} tabular font-mono`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="e-sell">
                Selling price
              </label>
              <input
                id="e-sell"
                type="number"
                min="0"
                step="0.01"
                value={sell}
                onChange={(e) => setSell(e.target.value)}
                className={`${fieldClass} tabular font-mono`}
              />
            </div>
          </div>
          <DialogFooter>
            <button type="submit" className={primaryBtn} disabled={save.isPending}>
              Save changes
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStockDialog({
  open,
  onOpenChange,
  products,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const product = products.find((p) => p.id === productId);
      if (!product) throw new Error("Select a product");
      const amount = Number(qty);
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("Enter a whole quantity above 0");
      const { error } = await supabase
        .from("products")
        .update({ quantity_on_hand: product.quantity_on_hand + amount })
        .eq("id", product.id);
      if (error) throw error;
      return `${amount} added to ${product.name}`;
    },
    onSuccess: (message) => {
      toast.success(message);
      setQty("");
      setProductId("");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-display">Add stock</DialogTitle>
          <DialogDescription>Adds to the quantity already on hand.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div>
            <label className={labelClass} htmlFor="s-product">
              Product
            </label>
            <select
              id="s-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={fieldClass}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.quantity_on_hand} on hand
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="s-qty">
              Quantity to add
            </label>
            <input
              id="s-qty"
              type="number"
              min="1"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={`${fieldClass} tabular font-mono`}
            />
          </div>
          <DialogFooter>
            <button type="submit" className={primaryBtn} disabled={save.isPending}>
              Add to stock
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
