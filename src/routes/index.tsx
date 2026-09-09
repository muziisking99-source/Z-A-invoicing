import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { money } from "@/lib/format";
import { useProducts, type Product } from "@/lib/products";
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
      { title: "Current Stock · Sweet for You Salvage" },
      {
        name: "description",
        content:
          "See every product with cost price, selling price and quantity on hand. Add products and top up stock.",
      },
      { property: "og:title", content: "Current Stock · Sweet for You Salvage" },
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

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-paper px-4 py-3 text-base outline-none transition duration-150 focus:border-primary focus:ring-2 focus:ring-ring/25";
const labelClass = "text-sm font-medium text-soft";
const primaryBtn =
  "btn-press w-full rounded-lg bg-primary px-5 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60 sm:w-auto";
const ghostBtn =
  "btn-press w-full rounded-lg border border-line bg-paper px-5 py-3 text-base font-medium text-ink hover:bg-secondary sm:w-auto";

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
        <div className="flex w-full items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2.5 sm:min-w-[14rem] sm:flex-1 sm:px-4 sm:py-3 lg:max-w-xs lg:flex-none">
          <input
            aria-label="Search products"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-base outline-none placeholder:text-soft/80"
          />
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" className={ghostBtn} onClick={() => setStockOpen(true)}>
            Add stock
          </button>
          <button type="button" className={primaryBtn} onClick={() => setAddOpen(true)}>
            Add product
          </button>
        </div>
      </PageHeader>

      <div className="panel mt-3 grid grid-cols-2 divide-x divide-line overflow-hidden rounded-xl">
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-soft sm:text-sm">Units on hand</p>
          <p className="tabular mt-1 font-mono text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {isLoading ? "—" : totals.units.toLocaleString("en-ZA")}
          </p>
        </div>
        <div className="px-3 py-3 sm:px-5 sm:py-4">
          <p className="text-xs font-medium text-soft sm:text-sm">Stock value</p>
          <p className="tabular mt-1 break-all font-mono text-xl font-semibold tracking-tight text-accent-ink sm:text-2xl">
            {isLoading ? "—" : money(totals.value)}
          </p>
        </div>
      </div>

      {/* Mobile cards */}
      <section className="mt-3 space-y-2.5 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel rounded-xl p-4">
              <div className="skeleton-bar h-5 w-2/3" />
              <div className="skeleton-bar mt-3 h-4 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="panel rounded-xl px-4 py-10 text-center text-soft">
            {products.length === 0
              ? "No products yet — add your first one."
              : "No products match that search."}
          </div>
        ) : (
          filtered.map((product) => (
            <article key={product.id} className="panel rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 text-lg font-semibold text-ink">{product.name}</h2>
                <p
                  className={`shrink-0 font-mono text-sm font-semibold ${
                    product.quantity_on_hand === 0 ? "text-destructive" : "text-ink"
                  }`}
                >
                  {product.quantity_on_hand} on hand
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-soft">Cost</dt>
                  <dd className="font-medium tabular-nums">{money(product.cost_price)}</dd>
                </div>
                <div>
                  <dt className="text-soft">On hand</dt>
                  <dd className="font-medium tabular-nums">{product.quantity_on_hand}</dd>
                </div>
                <div>
                  <dt className="text-soft">Unit price</dt>
                  <dd className="font-medium tabular-nums">{money(product.selling_price)}</dd>
                </div>
                <div>
                  <dt className="text-soft">Case price</dt>
                  <dd className="font-medium tabular-nums">
                    {product.case_price > 0 ? money(product.case_price) : "—"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-soft">Value (unit)</dt>
                  <dd className="font-semibold tabular-nums text-accent-ink">
                    {money(product.quantity_on_hand * product.selling_price)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(product)}
                  className="btn-press rounded-lg border border-line px-3 py-2.5 text-sm font-medium text-ink hover:bg-secondary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(product)}
                  className="btn-press rounded-lg border border-destructive/30 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/5"
                >
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
        <p className="px-1 text-sm text-soft">
          {filtered.length} of {products.length} products
        </p>
      </section>

      {/* Desktop table */}
      <section className="panel mt-3 hidden overflow-hidden rounded-xl md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-base">
            <thead>
              <tr className="sticky top-0 z-[1] border-b border-line bg-secondary text-left text-sm font-semibold uppercase tracking-wide text-soft">
                <th className="px-5 py-3.5">Name</th>
                <th className="px-5 py-3.5 text-right">Cost</th>
                <th className="px-5 py-3.5 text-right">Unit</th>
                <th className="px-5 py-3.5 text-right">Case</th>
                <th className="px-5 py-3.5 text-right">On hand</th>
                <th className="px-5 py-3.5 text-right">Value</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="tabular">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-line/80 last:border-0">
                    <td className="px-5 py-4" colSpan={7}>
                      <div className="skeleton-bar h-5 w-full max-w-xl" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-soft">
                    {products.length === 0
                      ? "No products yet — add your first one."
                      : "No products match that search."}
                  </td>
                </tr>
              ) : (
                filtered.map((product, index) => (
                  <tr
                    key={product.id}
                    className="row-enter border-b border-line/80 transition-colors duration-150 last:border-0 hover:bg-secondary/80"
                    style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                  >
                    <td className="px-5 py-4 text-lg font-medium text-ink">{product.name}</td>
                    <td className="px-5 py-4 text-right font-mono text-[15px] text-soft">
                      {money(product.cost_price)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[15px]">
                      {money(product.selling_price)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[15px]">
                      {product.case_price > 0 ? money(product.case_price) : "—"}
                    </td>
                    <td
                      className={`px-5 py-4 text-right font-mono text-[15px] font-semibold ${
                        product.quantity_on_hand === 0 ? "text-destructive" : ""
                      }`}
                    >
                      {product.quantity_on_hand}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-[15px] font-semibold text-ink">
                      {money(product.quantity_on_hand * product.selling_price)}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(product)}
                        className="btn-press rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-secondary"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(product)}
                        className="btn-press ml-2 rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5"
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
        <div className="tabular flex flex-wrap items-center justify-between gap-2 border-t border-line bg-secondary/60 px-5 py-3.5 text-sm text-soft">
          <span>
            {filtered.length} of {products.length} products
          </span>
          <span className="font-medium text-ink">Showing filtered stock list</span>
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
        <DialogContent className="panel rounded-xl">
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
  const [casePrice, setCasePrice] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("products").insert({
        name: name.trim(),
        cost_price: Number(cost || 0),
        selling_price: Number(sell || 0),
        case_price: Number(casePrice || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product added");
      setName("");
      setCost("");
      setSell("");
      setCasePrice("");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="panel rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Add product</DialogTitle>
          <DialogDescription>New products start with zero on hand.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Product name is required");
              return;
            }
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                Unit price
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
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} htmlFor="p-case">
                Case price
              </label>
              <input
                id="p-case"
                type="number"
                min="0"
                step="0.01"
                value={casePrice}
                onChange={(e) => setCasePrice(e.target.value)}
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
  const [casePrice, setCasePrice] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (product && product.id !== loadedId) {
    setLoadedId(product.id);
    setName(product.name);
    setCost(String(product.cost_price));
    setSell(String(product.selling_price));
    setCasePrice(String(product.case_price ?? 0));
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          cost_price: Number(cost || 0),
          selling_price: Number(sell || 0),
          case_price: Number(casePrice || 0),
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
      <DialogContent className="panel rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-display">Edit product</DialogTitle>
          <DialogDescription>Use “Add stock” to change quantity on hand.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error("Product name is required");
              return;
            }
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                Unit price
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
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} htmlFor="e-case">
                Case price
              </label>
              <input
                id="e-case"
                type="number"
                min="0"
                step="0.01"
                value={casePrice}
                onChange={(e) => setCasePrice(e.target.value)}
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
      <DialogContent className="panel rounded-xl">
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
