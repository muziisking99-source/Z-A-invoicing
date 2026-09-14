import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { money } from "@/lib/format";
import { formatCasesOnHand, type Product } from "@/lib/products";
import { cn } from "@/lib/utils";

type ProductPickerProps = {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  "aria-label"?: string;
};

function highlightMatches(name: string, tokens: string[]) {
  if (tokens.length === 0) {
    return <span>{name}</span>;
  }

  const lower = name.toLowerCase();
  const ranges: { start: number; end: number }[] = [];

  for (const token of tokens) {
    let from = 0;
    while (from < lower.length) {
      const at = lower.indexOf(token, from);
      if (at === -1) break;
      ranges.push({ start: at, end: at + token.length });
      from = at + token.length;
    }
  }

  if (ranges.length === 0) {
    return <span>{name}</span>;
  }

  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  merged.forEach((range, i) => {
    if (cursor < range.start) {
      parts.push(<span key={`t-${i}`}>{name.slice(cursor, range.start)}</span>);
    }
    parts.push(
      <span key={`m-${i}`} className="font-semibold">
        {name.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  });
  if (cursor < name.length) {
    parts.push(<span key="tail">{name.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

function ProductMeta({
  product,
  tone = "default",
}: {
  product: Product;
  tone?: "default" | "selected" | "active";
}) {
  const outOfStock = product.quantity_on_hand === 0;
  const chip = cn(
    "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
    tone === "selected"
      ? "bg-paper/80 text-accent-ink"
      : tone === "active"
        ? "bg-paper text-ink"
        : "bg-secondary text-ink",
  );
  const muted = tone === "selected" ? "text-accent-ink/80" : "text-soft";

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span className={cn(chip, "font-mono font-semibold text-accent-ink")}>
        Unit {money(product.selling_price)}
      </span>
      {product.case_price > 0 ? (
        <span className={cn(chip, "font-mono")}>Cases {money(product.case_price)}</span>
      ) : null}
      <span className={cn(chip, muted)}>{product.units_per_case} per case</span>
      {outOfStock ? (
        <span className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">
          Out of stock
        </span>
      ) : (
        <span className={cn(chip, muted)}>
          {formatCasesOnHand(product.quantity_on_hand, product.units_per_case)} on hand
        </span>
      )}
    </span>
  );
}

export function ProductPicker({
  products,
  value,
  onChange,
  "aria-label": ariaLabel = "Product",
}: ProductPickerProps) {
  const listId = useId();
  const optionIdPrefix = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Map<number, HTMLElement>>(new Map());

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [placement, setPlacement] = useState<"below" | "above">("below");
  const [listMaxHeight, setListMaxHeight] = useState(224);

  const selected = products.find((p) => p.id === value);

  const tokens = useMemo(
    () => query.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [query],
  );

  const filtered = useMemo(() => {
    const matched =
      tokens.length === 0
        ? [...products]
        : products.filter((p) => {
            const haystack = p.name.toLowerCase();
            return tokens.every((t) => haystack.includes(t));
          });

    matched.sort((a, b) => {
      const aOut = a.quantity_on_hand === 0 ? 1 : 0;
      const bOut = b.quantity_on_hand === 0 ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;

      if (tokens.length > 0) {
        const first = tokens[0]!;
        const aPrefix = a.name.toLowerCase().startsWith(first) ? 0 : 1;
        const bPrefix = b.name.toLowerCase().startsWith(first) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      }

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return matched;
  }, [products, tokens]);

  const measurePlacement = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferred = 320;
    const openAbove = spaceBelow < preferred && spaceAbove > spaceBelow;
    setPlacement(openAbove ? "above" : "below");
    const available = openAbove ? spaceAbove - 16 : spaceBelow - 16;
    const clamped = Math.max(192, Math.min(320, available));
    setListMaxHeight(clamped - 96);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const selectProduct = useCallback(
    (productId: string) => {
      onChange(productId);
      close();
      triggerRef.current?.focus();
    },
    [close, onChange],
  );

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    measurePlacement();
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, measurePlacement]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measurePlacement();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measurePlacement]);

  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current.get(activeIndex);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length === 0) return;
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      if (filtered.length > 0) setActiveIndex(filtered.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const product = filtered[activeIndex];
      if (product) selectProduct(product.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      close();
    }
  };

  const activeOptionId =
    open && filtered[activeIndex]
      ? `${optionIdPrefix}-opt-${activeIndex}`
      : undefined;

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex gap-2">
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex min-h-[48px] min-w-0 flex-1 items-center justify-between gap-3 rounded-lg border bg-paper px-3.5 py-2.5 text-left text-base transition-colors duration-150",
            open
              ? "border-primary ring-2 ring-ring/25"
              : "border-line hover:border-primary/40",
          )}
        >
          <span className="min-w-0 flex-1">
            {selected ? (
              <span className="flex flex-col">
                <span className="truncate font-semibold text-ink">{selected.name}</span>
                <ProductMeta product={selected} />
              </span>
            ) : (
              <span className="text-soft">Search products…</span>
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

        {selected ? (
          <button
            type="button"
            aria-label="Clear product"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="btn-press grid size-12 shrink-0 place-items-center rounded-lg border border-line bg-paper text-soft hover:bg-secondary hover:text-ink"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="none" className="size-4">
              <path
                d="M5 5l10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          className={cn(
            "animate-pop absolute left-0 z-50 w-full overflow-hidden rounded-lg border border-line bg-paper shadow-[0_12px_32px_-12px_rgb(24_24_27_/_0.28)]",
            placement === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <div className="border-b border-line p-2">
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded={open}
              aria-activedescendant={activeOptionId}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Type to search…"
              aria-label="Search products"
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-base outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
            />
          </div>

          <ul
            id={listId}
            role="listbox"
            className="overflow-y-auto overflow-x-hidden overscroll-contain py-1"
            style={{ maxHeight: `${Math.max(120, listMaxHeight)}px` }}
          >
            {filtered.length === 0 ? (
              <li className="px-3.5 py-3 text-sm text-soft">
                {products.length === 0 ? "No products in stock yet" : "No matches"}
              </li>
            ) : (
              filtered.map((product, index) => {
                const isSelected = product.id === value;
                const isActive = index === activeIndex;
                const outOfStock = product.quantity_on_hand === 0;
                const optionId = `${optionIdPrefix}-opt-${index}`;

                return (
                  <li
                    key={product.id}
                    id={optionId}
                    role="option"
                    aria-selected={isSelected}
                    ref={(node) => {
                      if (node) optionRefs.current.set(index, node);
                      else optionRefs.current.delete(index);
                    }}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectProduct(product.id)}
                      className={cn(
                        "relative flex min-h-[52px] w-full items-start gap-3 border-l-[3px] px-3.5 py-3 text-left transition-colors duration-150",
                        isSelected
                          ? "border-l-primary bg-accent text-accent-ink"
                          : isActive
                            ? "border-l-primary/40 bg-secondary text-ink"
                            : "border-l-transparent text-ink hover:bg-secondary/80",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block w-full truncate text-base",
                            outOfStock && !isSelected
                              ? "font-medium text-soft"
                              : "font-semibold",
                          )}
                        >
                          {highlightMatches(product.name, tokens)}
                        </span>
                        <ProductMeta
                          product={product}
                          tone={isSelected ? "selected" : isActive ? "active" : "default"}
                        />
                      </span>

                      {isSelected ? (
                        <svg
                          aria-hidden
                          viewBox="0 0 20 20"
                          fill="none"
                          className="mt-1 size-4 shrink-0 text-primary"
                        >
                          <path
                            d="M4.5 10.5 8 14l7.5-8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-line bg-secondary/60 px-3.5 py-2 text-xs text-soft sm:text-sm">
            {filtered.length} of {products.length} product
            {products.length === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
