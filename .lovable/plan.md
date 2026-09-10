# Premium Safety Journal redesign

## Goal
Transform the blog index and every post into a polished Swiss-academic publication while preserving all existing article content, disclaimers, safety claims, and application features.

## Visual direction
- Use a warm paper-and-ink foundation with restrained Uganda-inspired red and gold accents.
- Adopt a precise editorial grid, strong sans-serif headlines, comfortable serif long-form copy, and small monospaced labels for figures and tables.
- Keep motion subtle: reading progress, active section states, restrained reveals, and smooth scrolling with reduced-motion support.
- Avoid oversized first-screen typography, decorative clutter, excessive pills, nested cards, and generic news-site styling.

## Blog index
- Redesign the journal home into a professional magazine layout with a clear featured story, refined story grid, useful category and reading-time metadata, and consistent image treatment.
- Improve mobile hierarchy and tap targets while retaining direct links to every existing article.
- Add complete, route-specific search and social metadata.

## Article experience
- Rebuild the article layout around a disciplined reading measure with a sticky desktop contents rail and a compact mobile contents control.
- Give each section a stable, human-readable URL anchor derived from its heading, plus a visible copy-link affordance on headings.
- Preserve article progress, author details, disclaimers, feature inserts, calls to action, and related reading, while restyling them into the selected editorial system.
- Add real previous/next article links and improve related-post navigation so readers can move deeply through the journal.

## Premium tables and content blocks
- Restyle comparison tables with captions, strong headers, refined rules, clear row hierarchy, and accessible semantics.
- On phones, keep each row understandable without tiny text or page-wide overflow; provide a deliberate horizontal table viewport only when necessary.
- Unify callouts, checklists, figures, feature showcases, author information, share controls, and important notes.

## Deep linking and sharing
- Replace unstable numbered section IDs with readable anchors such as `#why-this-matters-in-uganda`.
- Use app-aware links for internal destinations and article-to-article navigation.
- Make Copy Link preserve the current section URL and make WhatsApp/LinkedIn share the actual encoded article URL and title.
- Complete article metadata with unique title, description, Open Graph, Twitter card, canonical URL, and article structured data without duplicated branding.

## Technical details
- Extend the existing semantic design tokens rather than placing raw colors throughout article components.
- Load the selected editorial fonts through the document head and expose them as theme typography tokens.
- Refactor shared journal elements into focused reusable pieces so the index and article pages remain visually consistent.
- Preserve the existing `/blog/:slug` public URLs and all current article data.

## Verification
- Check representative long and short articles on desktop and phone sizes.
- Verify section links, copied URLs, share targets, previous/next links, related articles, and all feature links.
- Confirm tables remain readable, pages have no horizontal overflow, metadata is unique, and keyboard/screen-reader navigation remains usable.
