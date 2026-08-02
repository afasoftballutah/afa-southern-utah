# AFA Softball Design System
**“The Players’ Powerhouse”**

Complete brand, stylesheet, and starter UI for the AFA Softball website.  
Ready for Grok Build / any modern frontend framework.

**Important:** The logo used throughout is the exact original logo you provided. No invented logos.

---

## Brand Ethos

- **Patriotic Power + Modern Energy**
- **Player-First, Zero Drama**
- **Bold, Confident, Competitive**
- **Clean hierarchy, high contrast, mobile-first**
- **Eagle as living mascot** — fierce, fun, American pride
- **Sports-app premium feel** (not corporate bureaucracy)

---

## Assets

| File | Description |
|------|-------------|
| `assets/afa-logo.png` | **Exact original logo you provided** (do not invent or replace) |
| `assets/afa-logo.svg` | SVG version of the logo |
| `assets/eagle-mascot.png` | Blue eagle mascot from your tournament posters (transparent) |

---

## Design Tokens (`css/tokens.css`)

All colors, spacing, typography, radii, shadows, and transitions live here.

### Core Colors
```css
--afa-red:        #E31C25
--afa-navy:       #0A1628
--afa-flag-blue:  #002868
--afa-white:      #FFFFFF
--afa-soft-gray:  #F5F7FA
--afa-dark-card:  #1A2332
--afa-gold:       #FFD700
```

### Typography
- **Display / Headings:** Bebas Neue (or Oswald / Anton)
- **Body / UI:** Inter

---

## How to Use with Grok Build / Your Engine

1. Copy the entire `afa-design-system` folder into your project.
2. Link the CSS:
   ```html
   <link rel="stylesheet" href="/css/styles.css" />
   ```
3. Use the tokens via CSS variables (`var(--afa-red)` etc.).
4. Drop the logo and eagle into your headers / heroes.
5. Wire your existing data engine into the HTML structure (or convert to React/Vue/Svelte components).

The HTML in `index.html` is a complete, production-ready starter page.

---

## Component Classes Cheat Sheet

```html
<!-- Buttons -->
<a class="btn btn-primary">Find Tournaments</a>
<a class="btn btn-secondary">Register Now</a>
<a class="btn btn-outline">Get Player Rating</a>
<a class="btn btn-primary btn-sm">Register</a>

<!-- Cards -->
<div class="card card-event">…</div>

<!-- Rankings -->
<ul class="rankings-list">…</ul>

<!-- News -->
<div class="news-item">…</div>
```

---

## Dark Mode

Dark is the default. Toggle with:

```html
<html data-theme="dark">   <!-- default -->
<html data-theme="light">  <!-- light mode -->
```

Open `components.html` for a live demo of buttons, forms, tables, and the theme toggle.

---

You’re ready. Let’s go win the season. 🦅
