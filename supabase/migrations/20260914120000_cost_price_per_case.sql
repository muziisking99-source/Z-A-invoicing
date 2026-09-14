-- Cost price per case on products.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price_per_case numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.products
SET cost_price_per_case = round(cost_price * greatest(coalesce(units_per_case, 1), 1), 2)
WHERE cost_price_per_case = 0
  AND cost_price > 0;
