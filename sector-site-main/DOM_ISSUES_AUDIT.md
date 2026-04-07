# DOM-related issues audit (`sector-site-main`)

This file tracks the original DOM audit and current resolution status.

## Intentionally unchanged (per product direction)

The following sections were intentionally left as-is:

1. Non-semantic clickable containers.
2. `href="#"` action links.
3. Global document querying by tag/text content.
5. Document-level click capture for widget behavior.

## Fixed

### 4) Manual DOM mutation that can conflict with React reconciliation
- **Status:** Fixed.
- Removed the manual child-node removal loop in `components/residents-layout.tsx` cleanup; cleanup now only removes the custom attribute used for Mixcloud triggering.

### 6) Full-page navigation via `window.location.*`
- **Status:** Fixed.
- Replaced `window.location.href`, `window.location.assign`, and `window.history.back()` navigations with Next.js router navigation (`router.push` / `router.back`) in:
  - `app/login/page.tsx`
  - `app/profile/page.tsx`
  - `app/residents/page.tsx`
  - `app/residents/[slug]/page.tsx`
  - `components/search-results.tsx`
  - `components/search-modal.tsx`
  - `components/mixcloud-shows.tsx`
  - `components/residents-layout.tsx`
  - `components/profile-layout.tsx`

### 7) Empty `alt` attributes on slideshow images
- **Status:** Fixed.
- Added descriptive `alt` text for each slide image in `components/sector-slideshow.tsx`.

### 8) Global console override inside component lifecycle
- **Status:** Fixed.
- Removed global `console.error` monkey-patching from `components/mixcloud-footer-widget.tsx`.
