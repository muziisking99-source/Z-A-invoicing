# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Sweet for You Salvage
**Generated:** 2026-09-09
**Category:** Internal stock & invoicing admin

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary / CTA | `#E11D48` | `--primary` |
| Accent text | `#BE123C` | `--accent-ink` |
| Accent wash | `#FFE4E6` | `--accent` |
| Background | `#FAFAFA` | `--canvas` |
| Panel | `#FFFFFF` | `--paper` |
| Text | `#18181B` | `--ink` |
| Muted text | `#52525B` | `--soft` |
| Border | `#E4E4E7` | `--line` |

**Notes:** Light zinc ledger, deep rose accent from brand, black/white high contrast. No bubblegum pink. No teal. No purple.

### Typography

- **UI font:** Outfit (`@fontsource/outfit`)
- **Numbers / mono:** JetBrains Mono (`@fontsource/jetbrains-mono`)
- No Inter. No Google Fonts CDN.

### Branding

- App chrome: **Sweet for You Salvage** with circular logo (`/brand/sfy-logo.jpg`)
- Short mark: **SFY**
- Invoice PDFs: company name + logo + pink accents
- Currency: **ZAR** via `en-ZA`

### Effects

- Flat panels: 1px border + light tinted shadow
- Motion: 150–200ms opacity/transform; hover = color/bg only (no scale)
- `:active` may use `scale(0.98)`
- Respect `prefers-reduced-motion`

### Anti-patterns

- Teal / purple glow themes
- Neon outer glows
- Card-in-card KPI grids
- Decorative infinite animations
- Emoji icons

### Pre-delivery checklist

- [ ] No emoji icons
- [ ] `cursor-pointer` on clickable elements
- [ ] Focus rings visible
- [ ] Light text contrast 4.5:1+
- [ ] Responsive 375 / 768 / 1024 / 1440
