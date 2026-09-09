import { useEffect, useId, useRef, useState } from "react";
import { money } from "@/lib/format";
import type { Product } from "@/lib/products";
import { cn } from "@/lib/utils";

type ProductPickerProps = {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  "aria-label"?: string;
};

export function ProductPicker({
  products,
  value,
  onChange,
  "aria-label": ariaLabel = "Product",
}: ProductPickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-lg border bg-paper px-3.5 py-3 text-left text-base transition-colors duration-150",
          open
            ? "border-primary ring-2 ring-ring/25"
            : "border-line hover:border-primary/40",
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? (
            <>
              <span className="font-medium text-ink">{selected.name}</span>
              <span className="text-soft">
                {" "}
                · {selected.quantity_on_hand} on hand
              </span>
            </>
          ) : (
            <span className="text-soft">Select product…</span>
          )}
        </span>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className={cn(
            "size-4 shrink-0 text-soft transition-transform duration-150",
            open && "rotate-180",
          )}
        >
          <path
            d="M5 7.5 10 12.5 15 7.5"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-y-auto overflow-x-hidden rounded-lg border border-line bg-paper py-1 shadow-[0_12px_32px_-12px_rgb(24_24_27_/_0.28)]"
          style={{ maxHeight: "15rem" }}
        >
          {products.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-soft">No products in stock yet</li>
          ) : (
            products.map((product) => {
              const active = product.id === value;
              return (
                <li key={product.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(product.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-3.5 py-2.5 text-left transition-colors duration-150",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-ink hover:bg-secondary",
                    )}
                  >
                    <span className="w-full truncate text-base font-medium">
                      {product.name}
                    </span>
                    <span
                      className={cn(
                        "text-sm tabular-nums",
                        active ? "text-primary-foreground/85" : "text-soft",
                      )}
                    >
                      {product.quantity_on_hand} on hand · {money(product.selling_price)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
