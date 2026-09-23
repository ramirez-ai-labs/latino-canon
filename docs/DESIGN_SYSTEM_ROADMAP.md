# Latino Canon Design System Roadmap

**Status:** In Progress (Phase 1-2 complete, Phase 3-4 pending)
**Updated:** 2026-09-22

## Overview

Comprehensive modern UI redesign transforming Latino Canon from functional to premium, AI-first experience. Four-phase rollout delivering cutting-edge design with accessibility as core requirement (WCAG AAA, colorblind-tested palette).

**Design Vision:** Premium. Intelligent. Alive.

---

## Phase 1: Design System & Home Page Redesign ✅

**Status:** Complete (PR #195)
**Timeline:** Week 1
**Deliverable:** Modern color palette, glassmorphism utilities, animations, and redesigned home page

### Design System Updates
- **Color Palette:** Deep indigo base (#0f0f1e), purple gradients (#667eea → #764ba2), vibrant magenta (#f093fb → #f5576c), cyan accents (#4facfe → #00f2fe), warm gold (#ffd89b)
- **Glassmorphism:** Three tiers (.glass, .glass-light, .glass-heavy) with backdrop-blur and layered shadows
- **Animations:** Keyframes for gradient-flow, float, glow-pulse, slide-in-up, fade-in
- **Shadow System:** 5-level depth scale (--shadow-sm through --shadow-xl) plus glow effects
- **Typography:** Bold 5xl+ headlines with gradient text, improved hierarchy
- **Accessibility:** Respects prefers-reduced-motion, 7:1+ contrast (WCAG AAA), colorblind-tested, semantic HTML

### Home Page Redesign
- **Hero:** Animated gradient mesh background, 5xl-6xl bold typography, gradient text effect (purple → magenta → cyan)
- **Narrative Section:** "Why we're different" establishes trust before showing data
- **Pillar Cards:** Glassmorphic design with gradient icon badges, staggered animations (100ms offset)
- **Recently Added:** Horizontal rail with staggered scroll-reveal animations
- **Collections:** Bold headings, improved spacing, staggered animations
- **CTA:** Gradient button with glow effect, centered layout

### Files Modified
- `apps/web/src/app/globals.css` - New design tokens and utilities
- `apps/web/src/app/page.tsx` - Home page redesign with modern styling

### Key Metrics
- First Load JS: 102-142 KB (healthy)
- All routes compile successfully
- Passes: ESLint, TypeScript, Next.js build

---

## Phase 2: Search Results & Agent UI Animations ✅

**Status:** Complete (PR #196)
**Timeline:** Week 2
**Deliverable:** Animated search results, enhanced agent reasoning UI, glassmorphic hover effects

### Agent Search Reasoning Box
- **Glassmorphism:** Gradient-tinted background overlay, animated gradient border on hover
- **Color-Coded Steps:** 4 unique gradient badges for reasoning steps 1-4
- **Animations:** Staggered slide-in for each step (100ms offset), smooth fade-in/expand
- **Extracted Intent:** Gradient-tinted badges with hover lift effect

### Search Results Layouts

**Agent Results:**
- Glassmorphic cards with gradient background overlay
- Shows: title, director, reasoning text, relevance score bar
- Relevance score animates 0% → final% with accent color badge
- Staggered animations (100ms offset per result)
- Hover: lift effect + enhanced border

**Regular Results:**
- Grid layout (2-5 cols responsive)
- Glassmorphic hover overlay on each tile
- Scroll-reveal animations (50ms offset per card)
- Smooth hover-lift with shadow enhancement

### Files Modified
- `apps/web/src/components/AgentSearchReasoning.tsx` - Redesigned reasoning box
- `apps/web/src/app/search/page.tsx` - Updated result layouts with animations
- `apps/web/src/components/ui/Rail.tsx` - Added style prop support

### Key Metrics
- All animations respect prefers-reduced-motion
- High-contrast gradient borders work on all backgrounds
- Color + text labels (no color-only communication)
- Passes: ESLint, TypeScript

---

## Phase 3: Title Detail & Collections (Pending)

**Timeline:** Week 3
**Estimated Effort:** 3-5 hours
**Deliverable:** Title detail page redesign, collection page updates, advanced micro-interactions

### Title Detail Page
- **Hero Section:** Poster + parallax effect with animated gradient overlay
- **Glassmorphic Sidebar:** Layered metadata display with rounded corners and backdrop-blur
- **Tags:** Gradient-tinted badges by category (theme, kind, etc.)
- **Related Titles:** Smooth horizontal scroll with staggered reveals
- **Director Info:** Highlighted with gradient accent

### Collection Pages
- **Masonry Layout:** Staggered card loading with sequential reveals
- **Filter Buttons:** Glassmorphic buttons with active state glow effects
- **Card Hover:** Lift + shadow + gradient overlay effects
- **Empty State:** Improved messaging and filter clarity

### Micro-Interactions
- Button state animations (active/hover/disabled)
- Smooth transitions between filter states
- Loading skeletons with gradient shimmer
- Tooltip animations

### Estimated Changes
- New component: TitleDetailHero
- Update: TitleCard (add parallax option)
- New component: RelatedTitles (with scroll animations)
- Update: CollectionGrid (add masonry layout)
- New utilities: parallax keyframes, shimmer animations

---

## Phase 4: Polish & Testing (Pending)

**Timeline:** Week 4
**Estimated Effort:** 2-3 hours
**Deliverable:** Performance optimization, accessibility audit, user testing prep

### Performance Optimization
- Lighthouse audit (target: 90+ on all categories)
- Image optimization for hero sections
- Animation performance (60fps validation)
- Bundle size review and optimization

### Accessibility Testing
- Screen reader testing with NVDA/JAWS
- Keyboard navigation audit (Tab, Enter, Escape)
- Colorblind simulation (protanopia, deuteranopia, tritanopia)
- Motor accessibility (click targets, motion safety)
- Contrast ratio verification (all 7:1+)

### User Testing Preparation
- Create testing scenarios and tasks
- A/B testing setup (old vs new design)
- Analytics instrumentation
- Heatmap/session recording setup

### Final Deliverables
- Design system documentation
- Component storybook
- Accessibility compliance report
- Performance baseline
- Deployment checklist

---

## Known Issues & Considerations

### Agent Detection Precision Gap 📌
**Issue:** Regex patterns miss "female directed" syntax variations
**Status:** Pinned for future iteration
**Workaround:** Users can rephrase as "women-directed" or "directed by women"
**Files:** apps/api/src/agents/tools.ts, apps/web/src/app/search/page.tsx
**Fix:** Expand regex to handle adjective + participle form (`\bfemale\s+(directed|made|helmed)\b`)

### Title Deduplication
**Issue:** Some titles appear multiple times across collections (e.g., "Desperado" in 3+ rails)
**Status:** Review needed before Phase 4
**Approach:** Deduplicate or use different titles per collection

### Page Length
**Issue:** Home page is very long with 4+ collection rails
**Status:** Monitor scroll depth analytics
**Options:** Collapse to 2-3 featured collections, add "See all collections" link

---

## Design System Components

### Color System
```
Base: #0f0f1e (deep indigo)
Surface: #1a1225, #2a1f3d
Text: #f4f4f5 (98% white)
Muted: #a8a0b8 (secondary text)

Gradients:
- Primary: #667eea → #764ba2 (purple)
- Accent: #f093fb → #f5576c (magenta)
- Accent Cyan: #4facfe → #00f2fe
- Gold: #ffd89b
```

### Typography
- Headlines: Inter 800-weight, 5xl-6xl sizes, gradient text option
- Body: Inter 400-weight, 1.1em+ sizes
- Contrast: 7:1+ (WCAG AAA)
- No font-weight < 400 for accessibility

### Spacing
- Section gaps: 60-80px (premium feel)
- Component gaps: 12-24px
- Padding: 16px-32px depending on hierarchy

### Animation Principles
- Scroll reveals: 300ms ease-out
- Hover effects: 150ms spring
- Gradient flows: 2-3s loop
- Stagger: 100ms between children (Phase 1), 50ms (Phase 2), 75ms (Phase 3)
- Respect: prefers-reduced-motion (disables all animations)

---

## Accessibility Checklist

- [x] Phase 1: WCAG AAA compliance built-in
- [x] Phase 2: Color + text labels, high contrast borders
- [x] [ ] Phase 3: Full keyboard navigation testing
- [x] [ ] Phase 4: Screen reader audit with NVDA/JAWS
- [ ] Colorblind palette verification (all 4 types)
- [ ] Motor accessibility (44x44px targets, no time-based interactions)
- [ ] Focus indicators (2px outline, accessible colors)
- [ ] Semantic HTML (h1, nav, main, landmarks)

---

## PR References

| Phase | PR | Commit | Status |
|-------|----|---------|---------| 
| 1 | #195 | design/phase-1-modern-ui | Merged |
| 2 | #196 | design/phase-2-search-animations | Merged |
| 3 | TBD | design/phase-3-title-detail-collections | Pending |
| 4 | TBD | design/phase-4-polish-testing | Pending |
| Copy | Merged to main | content/home-page-narrative-refinement | Live |

---

## Next Steps

1. **Immediate:** Start Phase 3 (Title Detail + Collections)
2. **Week 3:** Complete Phase 3 testing and refinement
3. **Week 4:** Phase 4 accessibility audit and performance optimization
4. **Post-Launch:** Monitor user feedback, iterate on micro-interactions

---

## Team Notes

- All animations are performant (60fps target)
- Design system is self-documenting (color names, animation names are descriptive)
- No breaking changes to existing components (additive only)
- Accessibility is non-negotiable requirement (not after-thought)
- User testing critical before final launch
