# Dashboard page override

Extends `../MASTER.md`. Keep Sweet for You Salvage pink/zinc — do not switch to blue/amber or teal palettes.

## Purpose

Operational P/L and sales snapshot from invoices + stock costs.

## Layout

- KPI strip: 4 metrics in a responsive grid (2×2 mobile, 4-col desktop) — flat panels, not nested cards
- Charts: 2-column on `lg`, stacked on mobile
- Charts use rose `#E11D48` fill/stroke and zinc grid lines only
- Top products: ranked list + bar chart sharing the same data

## Metrics

- Revenue = sum of invoice totals
- COGS = sum of (qty × current product `cost_price`) for lines with a product
- Gross profit = Revenue − COGS
- Margin % = Profit / Revenue when Revenue > 0

## Interaction

- Range filter: All time · 30 days · 90 days
- Loading: skeleton bars, no spinner emojis
- Empty state: short copy + link to New Invoice
