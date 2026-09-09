# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** ZA Stock
**Generated:** 2026-09-09
**Category:** Internal stock & invoicing admin

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary / CTA | `#0F766E` | `--primary` / `--accent-ink` |
| Background | `#FAFAFA` | `--canvas` |
| Panel | `#FFFFFF` | `--paper` |
| Text | `#18181B` | `--ink` |
| Muted text | `#52525B` | `--soft` |
| Border | `#E4E4E7` | `--line` |
| Accent wash | `#CCFBF1` | `--accent` |

**Notes:** Light zinc ledger, single teal accent. No purple, no dual accents, no dark mode default.

### Typography

- **UI font:** Outfit (`@fontsource/outfit`)
- **Numbers / mono:** JetBrains Mono (`@fontsource/jetbrains-mono`)
- No Inter. No Google Fonts CDN.

### Branding

- App chrome: **ZA Stock** (mark `ZA`)
- Invoices and PDFs: **brand-free** (no product name)
- Currency: **ZAR** via `en-ZA`

### Effects

- Flat panels: 1px border + light tinted shadow
- Motion: 150–200ms opacity/transform; hover = color/bg only (no scale)
- `:active` may use `scale(0.98)`
- Respect `prefers-reduced-motion`

### Anti-patterns

- Pastel coral / purple glow blobs
- Neon outer glows
- Card-in-card KPI grids
- Decorative infinite animations
- Brand name on invoice PDF

### Pre-delivery checklist

- [ ] No emoji icons
- [ ] `cursor-pointer` on clickable elements
- [ ] Focus rings visible
- [ ] Light text contrast 4.5:1+
- [ ] Responsive 375 / 768 / 1024 / 1440
