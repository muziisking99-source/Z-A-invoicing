-- Delivery cost on invoices; included in invoice total.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS delivery_cost numeric(12,2) NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.create_invoice(text, jsonb);

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
  v_basis text;
  v_charge numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2);
  v_agg record;
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
      sum((elem->>'quantity')::integer) AS qty
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY 1
  LOOP
    IF v_agg.product_id IS NULL THEN
      RAISE EXCEPTION 'Product is required on every line';
    END IF;
    IF v_agg.qty IS NULL OR v_agg.qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_agg.product_id
    FOR UPDATE;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;
    IF v_agg.qty > v_product.quantity_on_hand THEN
      RAISE EXCEPTION 'Not enough stock for %: only % available',
        v_product.name, v_product.quantity_on_hand;
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    v_basis := lower(coalesce(nullif(trim(v_item->>'price_basis'), ''), 'unit'));
    IF v_basis NOT IN ('unit', 'case') THEN
      RAISE EXCEPTION 'Price basis must be unit or case';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    IF v_basis = 'case' THEN
      IF coalesce(v_product.case_price, 0) <= 0 THEN
        RAISE EXCEPTION 'Case price is not set for %', v_product.name;
      END IF;
      v_charge := v_product.case_price;
    ELSE
      v_charge := v_product.selling_price;
    END IF;

    v_subtotal := v_subtotal + (v_qty * v_charge);
  END LOOP;

  INSERT INTO public.invoices (customer_name, total, delivery_cost)
  VALUES (trim(p_customer_name), v_subtotal + v_delivery, v_delivery)
  RETURNING * INTO v_invoice;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    v_basis := lower(coalesce(nullif(trim(v_item->>'price_basis'), ''), 'unit'));

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    IF v_basis = 'case' THEN
      v_charge := v_product.case_price;
    ELSE
      v_charge := v_product.selling_price;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, quantity,
      unit_price, case_price, price_basis, line_total
    )
    VALUES (
      v_invoice.id,
      v_product.id,
      v_product.name,
      v_qty,
      v_product.selling_price,
      coalesce(v_product.case_price, 0),
      v_basis,
      v_qty * v_charge
    );

    UPDATE public.products
    SET quantity_on_hand = quantity_on_hand - v_qty
    WHERE id = v_product.id;
  END LOOP;

  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice(text, jsonb, numeric) TO authenticated;
