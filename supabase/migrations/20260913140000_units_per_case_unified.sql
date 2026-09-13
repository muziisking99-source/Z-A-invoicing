-- Unified products: units_per_case; invoice qty can be units or cases; manual price.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS units_per_case integer NOT NULL DEFAULT 1;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_units_per_case_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_units_per_case_check
  CHECK (units_per_case >= 1);

UPDATE public.products
SET units_per_case = 1
WHERE units_per_case IS NULL OR units_per_case < 1;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS qty_basis text NOT NULL DEFAULT 'unit';

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS units_per_case integer NOT NULL DEFAULT 1;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_qty_basis_check;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_qty_basis_check
  CHECK (qty_basis IN ('unit', 'case'));

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_price_basis_check;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_price_basis_check
  CHECK (price_basis IN ('unit', 'case', 'manual'));

DROP FUNCTION IF EXISTS public.create_invoice(text, jsonb, numeric);

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_customer_name text,
  p_items jsonb,
  p_delivery_cost numeric DEFAULT 0
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_qty_basis text;
  v_price_basis text;
  v_pack integer;
  v_units integer;
  v_charge numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2);
  v_agg record;
  v_snap_unit numeric(12,2);
  v_snap_case numeric(12,2);
BEGIN
  IF coalesce(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  v_delivery := coalesce(p_delivery_cost, 0);
  IF v_delivery < 0 THEN
    RAISE EXCEPTION 'Delivery cost cannot be negative';
  END IF;

  FOR v_agg IN
    SELECT
      (elem->>'product_id')::uuid AS product_id,
      sum(
        CASE
          WHEN lower(coalesce(nullif(trim(elem->>'qty_basis'), ''), 'unit')) = 'case'
            THEN (elem->>'quantity')::integer
              * greatest(
                coalesce(
                  (
                    SELECT p.units_per_case
                    FROM public.products p
                    WHERE p.id = (elem->>'product_id')::uuid
                  ),
                  1
                ),
                1
              )
          ELSE (elem->>'quantity')::integer
        END
      ) AS units
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1
  LOOP
    IF v_agg.product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required on every line';
    END IF;
    IF v_agg.units IS NULL OR v_agg.units <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_agg.product_id
    FOR UPDATE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_agg.units > v_product.quantity_on_hand THEN
      RAISE EXCEPTION 'Not enough stock for %: only % available',
        v_product.name, v_product.quantity_on_hand;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    v_qty_basis := lower(coalesce(nullif(trim(v_item->>'qty_basis'), ''), 'unit'));
    IF v_qty_basis NOT IN ('unit', 'case') THEN
      RAISE EXCEPTION 'Quantity basis must be unit or case';
    END IF;

    v_price_basis := lower(coalesce(nullif(trim(v_item->>'price_basis'), ''), 'unit'));
    IF v_price_basis NOT IN ('unit', 'case', 'manual') THEN
      RAISE EXCEPTION 'Price basis must be unit, case, or manual';
    END IF;

    v_pack := greatest(coalesce(v_product.units_per_case, 1), 1);

    IF v_price_basis = 'case' THEN
      IF coalesce(v_product.case_price, 0) <= 0 THEN
        RAISE EXCEPTION 'Case price is not set for %', v_product.name;
      END IF;
      v_charge := v_product.case_price;
    ELSIF v_price_basis = 'manual' THEN
      IF NOT (v_item ? 'unit_price') OR nullif(trim(v_item->>'unit_price'), '') IS NULL THEN
        RAISE EXCEPTION 'Manual price is required for %', v_product.name;
      END IF;
      v_charge := (v_item->>'unit_price')::numeric;
      IF v_charge IS NULL OR v_charge < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative for %', v_product.name;
      END IF;
    ELSE
      v_charge := coalesce(v_product.selling_price, 0);
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_charge);
  END LOOP;

  INSERT INTO public.invoices (customer_name, total, delivery_cost)
  VALUES (trim(p_customer_name), v_subtotal + v_delivery, v_delivery)
  RETURNING * INTO v_invoice;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    v_qty_basis := lower(coalesce(nullif(trim(v_item->>'qty_basis'), ''), 'unit'));
    v_price_basis := lower(coalesce(nullif(trim(v_item->>'price_basis'), ''), 'unit'));
    v_pack := greatest(coalesce(v_product.units_per_case, 1), 1);

    IF v_price_basis = 'case' THEN
      v_charge := v_product.case_price;
      v_snap_unit := coalesce(v_product.selling_price, 0);
      v_snap_case := v_charge;
    ELSIF v_price_basis = 'manual' THEN
      v_charge := (v_item->>'unit_price')::numeric;
      v_snap_unit := v_charge;
      v_snap_case := coalesce(v_product.case_price, 0);
    ELSE
      v_charge := coalesce(v_product.selling_price, 0);
      v_snap_unit := v_charge;
      v_snap_case := coalesce(v_product.case_price, 0);
    END IF;

    IF v_qty_basis = 'case' THEN
      v_units := v_qty * v_pack;
    ELSE
      v_units := v_qty;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, quantity,
      unit_price, case_price, price_basis, qty_basis, units_per_case, line_total
    )
    VALUES (
      v_invoice.id,
      v_product.id,
      v_product.name,
      v_qty,
      v_snap_unit,
      v_snap_case,
      v_price_basis,
      v_qty_basis,
      v_pack,
      v_qty * v_charge
    );

    UPDATE public.products
    SET quantity_on_hand = quantity_on_hand - v_units
    WHERE id = v_product.id;
  END LOOP;

  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice(text, jsonb, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agg record;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  FOR v_agg IN
    SELECT
      product_id,
      sum(
        CASE
          WHEN qty_basis = 'case'
            THEN quantity * greatest(coalesce(units_per_case, 1), 1)
          ELSE quantity
        END
      )::integer AS units
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
      AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET quantity_on_hand = quantity_on_hand + v_agg.units
    WHERE id = v_agg.product_id;
  END LOOP;

  DELETE FROM public.invoices WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice(uuid) TO authenticated;
