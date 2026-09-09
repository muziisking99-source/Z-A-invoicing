-- Aggregate line quantities per product before stock checks so duplicate
-- product lines on one invoice cannot oversell.
CREATE OR REPLACE FUNCTION public.create_invoice(p_customer_name text, p_items jsonb)
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
  v_total numeric(12,2) := 0;
  v_agg record;
BEGIN
  IF coalesce(trim(p_customer_name), '') = '' THEN
    RAISE EXCEPTION 'Customer name is required';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
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
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;
    v_total := v_total + (v_qty * v_product.selling_price);
  END LOOP;

  INSERT INTO public.invoices (customer_name, total)
  VALUES (trim(p_customer_name), v_total)
  RETURNING * INTO v_invoice;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, product_name, quantity, unit_price, line_total
    )
    VALUES (
      v_invoice.id,
      v_product.id,
      v_product.name,
      v_qty,
      v_product.selling_price,
      v_qty * v_product.selling_price
    );

    UPDATE public.products
    SET quantity_on_hand = quantity_on_hand - v_qty
    WHERE id = v_product.id;
  END LOOP;

  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice(text, jsonb) TO authenticated;
