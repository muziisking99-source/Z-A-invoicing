-- Delete an invoice and put its line quantities back into stock.
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
    SELECT product_id, sum(quantity)::integer AS qty
    FROM public.invoice_items
    WHERE invoice_id = p_invoice_id
      AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE public.products
    SET quantity_on_hand = quantity_on_hand + v_agg.qty
    WHERE id = v_agg.product_id;
  END LOOP;

  DELETE FROM public.invoices WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_invoice(uuid) TO authenticated;
