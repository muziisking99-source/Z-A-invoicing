# Lovable Prompt: Stock & Invoicing App

Build me a simple internal web app for managing product stock and creating invoices, using Supabase as the backend. Two sections: **Current Stock** and **Invoicing**.

---

## 1. Current Stock

**`products` table:** name (text), cost_price (numeric), selling_price (numeric), quantity_on_hand (integer, default 0), created_at.

- **Add Product** — a simple form with only 3 fields: Product Name, Cost Price, Selling Price. No Excel import. New products start at quantity_on_hand = 0.
- **Add Stock** — a separate action (its own button/dialog): select an existing product, enter a quantity, and it adds to that product's quantity_on_hand (increments the existing amount, doesn't replace it).
- **Current Stock page** — table of all products showing Name, Cost Price, Selling Price, Qty on Hand. Include a search/filter by name. Support basic edit/delete of a product.

---

## 2. Invoicing

**`invoices` table:** invoice_number (auto-generated, sequential, e.g. INV-0001), customer_name (text), total (numeric), created_at.

**`invoice_items` table:** invoice_id (FK), product_id (FK), product_name (snapshot), quantity (integer), unit_price (snapshot of selling_price at invoice time), line_total (= quantity × unit_price).

**New Invoice screen:**
- One field: **Customer Name**. No other customer details.
- Add line items by selecting a product from a dropdown of current stock, then entering a quantity. Each line auto-calculates its amount (qty × selling price) immediately. Support multiple line items, with the ability to remove a line.
- A running **total** updates as items are added — just the sum of the line amounts. **No VAT/tax.**
- **Stock check:** if the quantity entered on any line exceeds that product's current quantity_on_hand, block submission and show an error naming the product and the quantity actually available.
- On successful submit: save the invoice and its line items, and **decrease quantity_on_hand on each product** by the invoiced quantity.

**Invoice History page:**
- Table of past invoices — Invoice #, Customer, Date, Total — newest first. Click one to open its detail (line items + total).
- Each invoice can be **downloaded as a PDF**: invoice number, date, customer name, a table of line items (product, qty, unit price, line total), and the grand total at the bottom.

---

## 3. General

- Keep it minimal: no warehouses, categories, multi-currency, or Excel import anywhere.
- Simple email/password login (Supabase Auth) to keep it private — no public sign-up needed.
- Mobile-friendly, responsive layout. Clean, functional UI — a table-based stock list and a straightforward invoice form.
