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
- **Hero:** Animated gradient mesh background, 5xl-6xl bold typography, gradient text effect
- **Narrative Section:** "Why we're different" establishes trust before showing data
- **Pillar Cards:** Glassmorphic design with gradient icon badges, staggered animations
- **Recently Added:** Horizontal rail with staggered scroll-reveal animations
- **Collections:** Bold headings, improved spacing, staggered animations
- **CTA:** Gradient button with glow effect, centered layout

### Files Modified
- `apps/web/src/app/globals.css` - New design tokens and utilities
- `apps/web/src/app/page.tsx` - Home page redesign with modern styling

---

## Phase 2: Search Results & Agent UI Animations ✅

**Status:** Complete (PR #196)
**Timeline:** Week 2
**Deliverable:** Animated search results, enhanced agent reasoning UI, glassmorphic hover effects

### Agent Search Reasoning Box
- **Glassmorphism:** Gradient-tinted background overlay, animated gradient border on hover
- **Color-Coded Steps:** 4 unique gradient badges for reasoning steps 1-4
- **Animations:** Staggered slide-in for each step, smooth fade-in/expand
- **Extracted Intent:** Gradient-tinted badges with hover lift effect

### Search Results Layouts
- **Agent Results:** Glassmorphic cards with relevance score bar animations
- **Regular Results:** Grid with glassmorphic hover overlays and scroll-reveals

### Files Modified
- `apps/web/src/components/AgentSearchReasoning.tsx` - Redesigned reasoning box
- `apps/web/src/app/search/page.tsx` - Updated result layouts with animations
- `apps/web/src/components/ui/Rail.tsx` - Added style prop support

---

## Phase 3: Title Detail & Collections (Pending)

**Timeline:** Week 3
**Deliverable:** Title detail page redesign, collection page updates, advanced micro-interactions

### Title Detail Page
- **Hero Section:** Poster + parallax effect with animated gradient overlay
- **Glassmorphic Sidebar:** Layered metadata display with rounded corners and backdrop-blur
- **Tags:** Gradient-tinted badges by category
- **Related Titles:** Smooth horizontal scroll with staggered reveals

### Collection Pages
- **Masonry Layout:** Staggered card loading with sequential reveals
- **Filter Buttons:** Glassmorphic buttons with active state glow effects
- **Card Hover:** Lift + shadow + gradient overlay effects

---

## Phase 4: Polish & Testing (Pending)

**Timeline:** Week 4
**Deliverable:** Performance optimization, accessibility audit, user testing prep

### Performance Optimization
- Lighthouse audit (target: 90+ all categories)
- Image optimization for hero sections
- Animation performance (60fps validation)

### Accessibility Testing
- Screen reader testing (NVDA/JAWS)
- Keyboard navigation audit
- Colorblind simulation testing
- Contrast ratio verification (all 7:1+)

### Final Deliverables
- Design system documentation
- Component storybook
- Accessibility compliance report
- Performance baseline

---

## Known Issues

### Agent Detection Precision Gap 📌
**Issue:** Regex patterns miss "female directed" syntax
**Status:** Pinned for future iteration
**Workaround:** Use "women-directed" or "directed by women"
**Files:** apps/api/src/agents/tools.ts, apps/web/src/app/search/page.tsx

### Title Deduplication
**Issue:** Some titles appear in multiple collections
**Status:** Review needed before Phase 4
**Approach:** Deduplicate or use different titles per collection

---

## Design System Components

### Color Palette
```
Base: #0f0f1e (deep indigo)
Surface: #1a1225, #2a1f3d
Text: #f4f4f5 (98% white)
Muted: #a8a0b8 (secondary text)

Gradients:
- Primary: #667eea → #764ba2 (purple)
- Accent: #f093fb → #f5576c (magenta)
- Cyan: #4facfe → #00f2fe
- Gold: #ffd89b
```

### Animation Principles
- Scroll reveals: 300ms ease-out
- Hover effects: 150ms spring
- Gradient flows: 2-3s loop
- Stagger: 50-100ms between children
- Respect: prefers-reduced-motion

### Accessibility Checklist
- [x] WCAG AAA compliance
- [x] Color + text labels (no color-only)
- [x] High contrast borders
- [ ] Screen reader testing
- [ ] Keyboard navigation audit
- [ ] Colorblind palette verification

---

## PR References

| Phase | PR | Status |
|-------|----|---------| 
| 1 | #195 | Merged |
| 2 | #196 | Merged |
| 3 | TBD | Pending |
| 4 | TBD | Pending |

---

## Next Steps

1. Start Phase 3 (Title Detail + Collections)
2. Complete Phase 3 testing and refinement
3. Phase 4 accessibility audit and performance optimization
4. Monitor user feedback post-launch
