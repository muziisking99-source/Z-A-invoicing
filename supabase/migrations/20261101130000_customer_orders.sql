-- Customer order sheets: hold lines without stock deduction until convert.

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;
GRANT USAGE ON SEQUENCE public.order_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.order_number_seq TO service_role;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  total numeric(12,2) NOT NULL DEFAULT 0,
  delivery_cost numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'converted', 'cancelled')),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users manage orders" ON public.orders;
CREATE POLICY "Signed-in users manage orders" ON public.orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  case_price numeric(12,2) NOT NULL DEFAULT 0,
  price_basis text NOT NULL DEFAULT 'unit',
  qty_basis text NOT NULL DEFAULT 'unit',
  units_per_case integer NOT NULL DEFAULT 1,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Signed-in users manage order items" ON public.order_items;
CREATE POLICY "Signed-in users manage order items" ON public.order_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ORD-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_set_number ON public.orders;
CREATE TRIGGER orders_set_number BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

REVOKE EXECUTE ON FUNCTION public.set_order_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_order(
  p_customer_name text,
  p_items jsonb,
  p_delivery_cost numeric DEFAULT 0
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_qty_basis text;
  v_price_basis text;
  v_pack integer;
  v_charge numeric(12,2);
  v_line numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2);
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

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

    v_line := v_qty * v_charge;
    v_subtotal := v_subtotal + v_line;
  END LOOP;

  INSERT INTO public.orders (customer_name, total, delivery_cost, status)
  VALUES (trim(p_customer_name), v_subtotal + v_delivery, v_delivery, 'open')
  RETURNING * INTO v_order;

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

    v_line := v_qty * v_charge;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, quantity,
      unit_price, case_price, price_basis, qty_basis, units_per_case, line_total
    )
    VALUES (
      v_order.id,
      v_product.id,
      v_product.name,
      v_qty,
      v_snap_unit,
      v_snap_case,
      v_price_basis,
      v_qty_basis,
      v_pack,
      v_line
    );
  END LOOP;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order(text, jsonb, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_order(
  p_order_id uuid,
  p_customer_name text,
  p_items jsonb,
  p_delivery_cost numeric DEFAULT 0
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_qty_basis text;
  v_price_basis text;
  v_pack integer;
  v_charge numeric(12,2);
  v_line numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_delivery numeric(12,2);
  v_snap_unit numeric(12,2);
  v_snap_case numeric(12,2);
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order is required';
  END IF;
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

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Only open orders can be edited';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid;

    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

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

    v_line := v_qty * v_charge;
    v_subtotal := v_subtotal + v_line;
  END LOOP;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    customer_name = trim(p_customer_name),
    total = v_subtotal + v_delivery,
    delivery_cost = v_delivery,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

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

    v_line := v_qty * v_charge;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, quantity,
      unit_price, case_price, price_basis, qty_basis, units_per_case, line_total
    )
    VALUES (
      v_order.id,
      v_product.id,
      v_product.name,
      v_qty,
      v_snap_unit,
      v_snap_case,
      v_price_basis,
      v_qty_basis,
      v_pack,
      v_line
    );
  END LOOP;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order(uuid, text, jsonb, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order is required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Only open orders can be cancelled';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_order_to_invoice(p_order_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_items jsonb;
  v_invoice public.invoices;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'Order is required';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Only open orders can be converted';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', oi.product_id,
        'quantity', oi.quantity,
        'qty_basis', oi.qty_basis,
        'price_basis', oi.price_basis,
        'unit_price', CASE
          WHEN oi.price_basis = 'manual' THEN oi.unit_price
          ELSE NULL
        END
      )
      ORDER BY oi.created_at
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.product_id IS NOT NULL;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Order has no convertible line items';
  END IF;

  -- Strip null unit_price keys for non-manual lines
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'price_basis' = 'manual'
        THEN elem
      ELSE elem - 'unit_price'
    END
  )
  INTO v_items
  FROM jsonb_array_elements(v_items) AS elem;

  v_invoice := public.create_invoice(
    v_order.customer_name,
    v_items,
    v_order.delivery_cost
  );

  UPDATE public.orders
  SET
    status = 'converted',
    invoice_id = v_invoice.id,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN v_invoice;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convert_order_to_invoice(uuid) TO authenticated;
