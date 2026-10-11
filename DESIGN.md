---
name: Firefly
description: A calm visual system for mixed physical workforces.
colors:
  background: "#ffffff"
  surface: "#fefffc"
  surface-raised: "#f9faf7"
  surface-sunken: "#f3f5f2"
  surface-tint: "#eef1ed"
  foreground: "#171717"
  ink: "#2c2c2c"
  ink-secondary: "#444141"
  ink-muted: "#646464"
  line: "#dee2de"
  line-strong: "#cfd3cf"
  control-solid: "#1f1f29"
  accent: "#0081c0"
typography:
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(40px, 3.75vw, 54px)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-.02em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "-.01em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "-.15px"
  supporting:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  wordmark:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(130px, 17vw, 260px)"
    fontWeight: 400
    lineHeight: 0.85
    letterSpacing: "-.04em"
rounded:
  sm: "6px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  arrow-inset: "50.5px"
spacing:
  step-8: "8px"
  step-12: "12px"
  step-16: "16px"
  step-20: "20px"
  step-24: "24px"
  step-28: "28px"
  step-32: "32px"
  step-48: "48px"
components:
  button-primary:
    backgroundColor: "{colors.control-solid}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "7px 7px 7px 18px"
  button-text:
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    padding: "0"
  navigation:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 8px 4px 24px"
  hotspot:
    textColor: "{colors.foreground}"
    padding: "0 10px 0 6px"
  console-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
---
# Design System: Firefly

## Overview

**Creative North Star: "Quiet intelligence in a working yard"**

Firefly uses the user-approved General Intelligence Company reference as its visual authority: warm white and sage-tinted surfaces, restrained ink typography, glass navigation, and clear rectangular controls. The result should feel calm, precise, and physically grounded.

The shared system serves a persuasive landing page and an operational console. Their density and composition differ; typography, materials, controls, and the original procedural truck remain recognizably related. Pixelated imagery and pixel icons are excluded by the user.

Visual authority: [user-pinned reference](https://claude.ai/artifact/JqHZX2RGakx9sDDq9BZoU3), excluding its pixelated imagery and icons. The approved supplied Prisma hero composition remains a landing-specific exception. The north-star phrase summarizes that approved direction; it is documentation language, not an additional brand claim.

The implementation authority is `src/web/design-system.css`, with surface-specific values in `src/web/landing/landing.css` and `src/web/console.css`. Frontmatter records those current primitives for design tools; change the source CSS first and refresh both documents together. `PRODUCT.md` contains earlier, provisional identity notes; the explicit user-approved reference governs this replacement.

**Key Characteristics:**
- Warm light surfaces and restrained ink contrast.
- Inter at regular and medium weights for interface typography.
- Soft glass navigation and rectangular actions with a pill-shaped arrow inset.
- An original code-rendered industrial yard with an illustrative sensing accent.

## Colors

The palette combines near-white surfaces with subtle sage undertones and dark, low-chroma text.

### Primary

- **Sensing blue** (`accent`): inspection selection, the illustrative rear scan, route marks, and selected interactive highlights. It is a functional exception to the reference palette, not a large decorative field.
- **Control ink** (`control-solid`): the primary action's dark base.

### Neutral

- **White canvas** (`background`) and **warm white** (`surface`): base page and readable panels.
- **Raised paper** (`surface-raised`), **sunken sage** (`surface-sunken`), and **sage tint** (`surface-tint`): quiet separation between glass controls, console backdrop, and the yard container.
- **Foreground**, **ink**, **secondary ink**, and **muted ink**: hierarchy from essential copy to supporting labels.
- **Line** and **strong line**: list dividers and active-tab foundations.

**The Source Palette Rule.** Reuse the CSS palette for interface surfaces. Truck, yard, and operational status materials remain scene-local values; do not promote every material swatch to a global UI token.

## Typography

Inter with a sans-serif fallback is the interface family. Regular and medium weights carry hierarchy through size, spacing, and contrast. The frontmatter records the implemented headline, title, body, supporting, and label roles.

The large Firefly wordmark belongs to the pinned hero composition only. It uses tight tracking and a compressed line box; it is not a reusable editorial heading. The small navigation wordmark uses medium weight and restrained negative tracking.

Landing headlines adapt on mobile to `clamp(36px, 9.5vw, 44px)`. Supporting text is generally smaller and regular-weight. The console uses compact medium-weight section labels and readable, wrapping activity rows. Existing operational canvas labels and the small inline incident signal retain their local stronger weight; do not spread that exception through interface typography.

**The Quiet Hierarchy Rule.** Use regular and medium Inter as the default; establish emphasis with scale and placement before adding heavier weights.

## Layout

The common spatial grammar is an inset scene or panel, generous outer breathing room, and compact controls. Use the observed spacing steps in frontmatter; the console deliberately compresses the landing's density.

The landing uses a fixed yard with sticky chapter copy. Desktop scene inset is 12px with the large radius; at widths below 760px, the inset becomes 8px with the medium-large radius. Its floating navigation, footer controls, headline area, and truck must remain separately legible. Desktop copy is `min(420px, 39vw)`; mobile copy becomes `min(100%, 440px)`. The hero's oversized wordmark and asymmetrical introduction are a pinned composition exception. Chapter-specific camera framing belongs to the landing surface brief.

The console uses a 72px header row, 12px padding and gaps, and a yard plus activity layout. At 900px its side panel becomes 310px. At 700px and below, it stacks header, a 52svh yard, and activity panels with 8px padding and gaps. The yard camera fits the dock row and parking apron to portrait canvas dimensions.

## Elevation & Depth

Depth is a restrained hybrid of tonal layering and shallow ambient shadows. The floating glass navigation and inspection labels use the float shadow; console panels use the card shadow; the primary action uses the pill shadow. Exact shadow values live in the sidecar and shared CSS.

Navigation combines a translucent warm gradient, a light border, and 9px backdrop blur. Inspection labels use a translucent warm surface and 15px blur. Keep this glass treatment concentrated on overlaid controls; readable operational panels stay substantially opaque.

**The Quiet Depth Rule.** Keep shadows shallow and functional. Do not substitute luminous glow or dramatic card lifts for the established tonal hierarchy.

## Shapes

Controls are softened rectangles, panels use larger corners, and the arrow inset inside the primary action is a compact pill. Do not make every control a capsule. The inset scene receives the broadest corners; operational status chips use the small radius. Dividers are thin and quiet.

The truck is original procedural geometry: a long tractor-trailer with an aerodynamic hood, curved cab roof, tapered shoulders, dark glazing, and readable wheel and trailer structure. Peterbilt 579/Aurora imagery informed the approved silhouette direction; no licensed model is copied or redistributed. Front/roof and rear-trailer sensor forms are illustrative. The rear sensor faces the reversing direction toward the pallet. The yard uses smooth code-rendered industrial geometry because the user rejected pixel imagery.

## Components

### Buttons

The primary action is a dark rectangle with a light gradient overlay, a restrained border, and a pill-shaped arrow inset. It has a 48px minimum height; the inset measures 40px by 28px. Hover lightens the base and shifts the arrow 2px. Color and arrow-state transitions take 250ms. Text actions use inline labels and Lucide stroke arrows with a 44px minimum height.

Use Lucide-style stroke icons, with visible text or an accessible name for controls. Keyboard focus uses a 2px ink outline with 3px offset. Disabled controls reduce opacity and remove the pointer cursor.

### Navigation

The glass navigation is a compact floating rectangle with medium-weight labels. The console link sits on its own translucent inset. Hover uses sensing blue. On mobile, spacing and label sizes reduce while the navigation remains centered.

### Inspection labels and tabs

Hotspots combine a warm translucent label with a circular icon holder. The selected holder fills blue; the selected label uses a darker blue. Hotspot labels are projected from the truck's actual part locations and clamped horizontally to the viewport. Tabs use a bottom rule and selected ink underline; the text control remains an alternate way to inspect a part.

### Cards / Containers

Console panels are warm-white rounded containers with a shallow card shadow. Titles and lists use 24px horizontal padding on desktop, thin row dividers, and wrapping content. Empty states use muted regular text. Landing part descriptions are open text groups, not extra cards.

### Shared truck and yard

Both landing and console import the same Truck component and shared yard lighting/ground. Fine trim may be omitted for fleet rendering; silhouette and sensor placement remain consistent. The console uses a uniform scale of 0.61 to fit the controller's existing footprint. This is display adaptation, not a change to vehicle dimensions or controller routing.

The landing story's scan and camera illustrate an exception. The console's motion follows accepted controller routes or the last reported pose. Never imply the landing illustration is a live sensing feed or that the renderer makes operational decisions.

### Motion and accessibility

Use brief state transitions, with 250ms as the implemented control cadence. There is no entrance animation. Scroll-linked story cameras and the scan pulse belong to the explicit yard illustration. Reduced motion removes CSS transitions, snaps the story camera to the selected chapter, and makes the scan static. Preserve visible chapter controls and the skip link.

## Do's and Don'ts

### Do:
- **Do** reuse the shared CSS tokens and the same Truck component across both surfaces.
- **Do** preserve visible keyboard focus, readable labels, and reduced-motion behavior.
- **Do** identify simulation and illustration clearly; only operational events may imply operational outcomes.
- **Do** reserve blue sensing marks for the approved illustrative scan, route, and inspection treatments.

### Don't:
- **Don't** introduce pixelated artwork or pixel icons.
- **Don't** turn the pinned oversized Firefly wordmark into the default heading scale.
- **Don't** add entrance animation or decorative parallax to the interface.
- **Don't** claim the procedural vehicle reproduces an exact Aurora sensor configuration or demonstrates real autonomy, sensing accuracy, performance, or safety certification.
