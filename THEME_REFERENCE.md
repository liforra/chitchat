# Chitchat Theme Reference

## Overview
- **Source** `Chitchat _ @punitive corkscrew.mhtml` captures a saved production snapshot of the Chitchat UI.
- **Architecture** The theme relies on CSS custom properties defined on `:root` (light) and overridden on `.dark` (dark mode).
- **Utilities** Tailwind-like utility classes map directly to those variables, so changing a token updates every surface consuming that token.

## Token Palette

### Light mode (`:root`)
```css
:root {
  --gradient: #7057ba;
  --radius: 0.5rem;

  --brightness: 0 0% 0%;
  --brightness-foreground: 0 0% 100%;

  --placeholder: 230 10% 84%;
  --placeholder-foreground: 264 3.9% 30%;

  --overlay: 234 10% 3.5%;
  --background: 234 10% 95%;
  --foreground: 235 10% 20%;

  --panel: 230 10% 85%;
  --panel-foreground: 235 10% 20%;
  --card: 235 20% 85%;
  --card-foreground: 235 8% 25%;
  --popover: 232 10% 89%;
  --popover-foreground: 264 3.9% 30%;

  --primary: 255 42% 50%;
  --primary-foreground: 249 100% 88%;
  --secondary: 264 10% 87%;
  --secondary-foreground: 264 5% 20%;
  --accent: 0 0% 96.1%;
  --accent-foreground: 0 0% 9%;

  --muted: 240 10% 82%;
  --muted-foreground: 235 5% 35%;
  --field: 240 10% 92%;
  --field-foreground: 235 10% 20%;
  --action: 240 10% 93%;
  --action-foreground: 235 10% 20%;

  --destructive: 0 62.8% 50%;
  --destructive-foreground: 264 3.9% 96.95%;

  --warning: 24 100% 61%;
  --warning-foreground: 38 92% 10%;
  --success: 116 46% 49%;
  --success-foreground: 116 46% 49%;

  --border: 220 8% 70%;
  --input: 264 19.5% 88.3%;
  --ring: 0 0% 3.9%;
}
```

### Dark mode (`.dark` modifier)
```css
.dark {
  --brightness: 255 100% 100%;
  --placeholder: 233 6% 26.5%;
  --placeholder-foreground: 264 3.9% 96.95%;

  --overlay: 234 10% 3.5%;
  --background: 234 10% 20%;
  --foreground: 235 10% 80%;

  --panel: 230 10% 12%;
  --panel-foreground: 235 10% 80%;
  --card: 235 10% 15%;
  --card-foreground: 235 8% 75%;
  --popover: 232 10% 16%;
  --popover-foreground: 264 3.9% 96.95%;

  --muted: 240 10% 10%;
  --muted-foreground: 235 5% 65%;
  --field: 240 10% 8%;
  --field-foreground: 235 10% 80%;
  --action: 240 10% 7%;
  --action-foreground: 235 10% 80%;

  --border: 220 8% 30%;
  --input: 264 19.5% 11.7%;

  --accent: 233 6% 24%;
  --accent-foreground: 264 3.9% 96.95%;

  --warning: 24 100% 39%;
  --warning-foreground: 38 92% 90%;
  --ring: 264 39% 39%;
}
```

## Utility Mappings
- **Surfaces** `.bg-background`, `.bg-panel`, `.bg-card`, `.bg-popover`, `.bg-overlay`, `.bg-muted`, `.bg-field`, `.bg-action`, `.bg-primary`, `.bg-secondary`, `.bg-accent`, `.bg-success`, `.bg-warning`, `.bg-destructive` → `background-color: hsl(var(--token))`.
- **Typography** `.text-foreground`, `.text-panel-foreground`, `.text-card-foreground`, `.text-popover-foreground`, `.text-primary-foreground`, `.text-secondary-foreground`, `.text-accent-foreground`, `.text-action-foreground`, `.text-muted-foreground`, `.text-field-foreground`, `.text-success-foreground`, `.text-warning-foreground`, `.text-destructive-foreground` → `color: hsl(var(--token))`.
- **Borders & Rings** `.border-border`, `.border-input`, `.border-primary`, `.border-secondary-foreground`, `.border-warning`, `.border-destructive` → `border-color: hsl(var(--token))`. `.ring-ring` & `.ring-offset-background` → ring colors.
- **Shape** Utilities referencing `var(--radius)` share the global rounding defined on `:root`.

## Override Strategy (Appending Styles)
- **Prefer token overrides** Append a stylesheet redefining the same custom properties. Every utility that consumes them updates automatically.
- **Control scope** Override on `:root` for global changes, `.dark` for dark-only tweaks, or a wrapper (e.g., `.chat-app`) for localized themes.
- **Cascade order** Load your override stylesheet after the shipped CSS or append a later `<style>` block—no `!important` required.
- **Component-specific tweaks** Create small helper classes that still use tokens to keep future palette swaps painless.

### Example: swap the primary palette
```css
/* Append after the original bundle */
:root {
  --primary: 210 100% 45%;
  --primary-foreground: 210 100% 96%;
}
.dark {
  --primary: 210 80% 60%;
  --primary-foreground: 210 100% 12%;
}
```

### Example: scoped widget theme
```css
.widget-theme {
  --background: 222 45% 16%;
  --foreground: 222 20% 88%;
  --card: 222 35% 22%;
  --card-foreground: 222 15% 92%;
  --accent: 35 90% 55%;
  --accent-foreground: 35 100% 12%;
}
```
Apply in markup:
```html
<div class="widget-theme bg-background text-foreground">
  ...
</div>
```

### Example: utility-style override
```css
.badge-critical {
  background-color: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  border-radius: var(--radius);
}
```

## Key Takeaways
- **Prefer tokens** Redefine CSS variables instead of touching every component.
- **Scope wisely** Use `:root`, `.dark`, or wrappers for targeted themes.
- **Load last** Append overrides later in the cascade to win conflicts cleanly.
