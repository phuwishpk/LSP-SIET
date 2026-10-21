# StudyTogether / SIET Space design system

This document records the target visual direction for the community homepage
shown in the supplied Figma screenshot. It applies to `open-notebook/frontend`;
the standalone My AI Quiz and AI Roadmap Generator apps are separate products
and out of scope. The screenshot is a light desktop reference, not a complete
specification for every route, viewport, or theme.

## Product and audience

StudyTogether is the social learning home for the KMITL learning workspace.
Students and teaching staff share course materials, ask questions, use AI study
tools, and participate in course discussions. The wider frontend also contains
research and notebook tools, plus teacher and admin consoles.

Design for Thai-speaking students and teachers first, while supporting English
content and mixed-language interfaces. Preserve role-based access and the
existing product workflows when applying this visual direction.

## Design principles

- **Warm and welcoming:** use a soft blush canvas and pink accents to make the
  learning community feel approachable without making the feed look playful
  or childish.
- **Content first:** keep course posts, questions, and attached materials easy
  to scan. Use restrained decoration and clear text hierarchy.
- **Quiet structure:** distinguish panels with white surfaces, fine pink-tinted
  borders, and rounded corners rather than heavy shadows or large color blocks.
- **AI is a tool, not the whole product:** give AI actions a clear, contained
  panel and consistent emphasis, while keeping community content primary.

## Color direction

The screenshot establishes a light palette. The values below are visual
reference approximations sampled from the image, not a claim that these values
are already implemented as CSS tokens.

| Role | Reference value | Usage |
| --- | --- | --- |
| Blush canvas | `#FDF7F8` | Main page background and softly tinted input or attachment surfaces |
| White surface | `#FFFFFF` | Header, navigation, feed cards, and AI panel |
| Soft pink selection | `#FBCFE8` | Selected navigation item, badges, and light emphasis |
| Pale pink border | `#FEF3F5` | Subtle card and input separation |
| Primary ink | Deep blue-gray, approximately `#263142` | Headings and important content |
| Secondary ink | Muted blue-gray | Metadata, helper text, and inactive navigation |
| Strong pink action | Saturated pink, as shown on primary action controls | Main calls to action and selected/high-priority actions |

Use semantic theme roles rather than repeating literal colors in components:
page/canvas, surface/card, foreground, muted foreground, border, primary,
primary foreground, and focus ring. Keep saturated pink for deliberate
emphasis; use pale pink for selection and soft backgrounds. The screenshot does
not define dark-theme colors, so derive those separately with equivalent
contrast and hierarchy rather than mechanically inverting these values.

## Layout and surfaces

- On wide screens, use a centered three-column community layout: course and
  feed navigation on the left, the community feed in the middle, and AI study
  tools on the right.
- Keep the top bar aligned with the content area. It contains the product mark
  and name, global search, points, notifications, and the account avatar.
- The left column groups primary community destinations separately from the
  user's enrolled courses.
- Make the center feed the visual focus. Its heading and feed filter precede a
  compact post composer and a vertical list of post cards.
- Keep the right AI panel visible beside the feed on wide screens. It groups
  AI actions, data/context options, a prompt field, and concise helper text.
- Use a consistent spacing rhythm based on 4, 8, 12, 16, and 24 px. Leave
  comfortable gaps between columns and cards while keeping feed content dense
  enough for regular study use.
- Use moderately rounded cards and controls (approximately 10–12 px at card
  corners). Prefer a fine border and, at most, a very subtle shadow.

## Typography and iconography

- Use the existing Inter and Thai font stack so Thai and Latin text remain
  legible together. Keep fallback fonts available for Thai glyph coverage.
- Establish a compact hierarchy: a prominent page title, clear post-author
  names and card headings, readable body copy, and smaller but legible metadata.
- Use sentence case and concise labels. Preserve Thai labels where the product
  currently presents Thai UI; do not translate or replace content solely to
  match the screenshot.
- Use the existing Lucide icon set for navigation and actions. Pair icons with
  labels where space allows; icon-only controls need an accessible name and a
  visible focus state.

## Component patterns

- **Header:** quiet white bar with a small dark brand mark, search field, a
  compact pink points badge, notification control, and circular user avatar.
- **Navigation:** white rounded panel with vertically stacked destinations.
  Mark the current destination with a full-width pale-pink rounded selection
  and a contrasting icon. Show enrolled courses in a separate panel below.
- **Composer:** compact white card with the current user's avatar and a
  lightly tinted, rounded prompt field.
- **Feed post:** white rounded card with author avatar, name, role/course
  metadata and optional category badge; followed by the post text and an
  attachment preview when present. Place like, comment, share, and save actions
  in a distinct footer row with counts where relevant.
- **Attachment preview:** pale blush inset with a document thumbnail, title,
  file metadata, and a clearly discoverable open/expand affordance.
- **AI tools:** white rounded panel with a title and utility action, followed
  by individual bordered action cards. Each card has a concise title,
  description, and supporting usage/credit detail. Keep context selection and
  the prompt composer visually separate from the tool list.
- **Badges and avatars:** use small, rounded badges for course or status
  metadata and circular initials/avatars for people. Keep color secondary to
  the text labels.

## Interaction, accessibility, and responsive behavior

- Use pink selection and action states consistently; include hover, pressed,
  disabled, and keyboard-focus states without relying on color alone.
- Ensure readable contrast for small Thai text, muted metadata, and text on
  pink controls. Do not use the screenshot's low-resolution text as a minimum
  type-size target.
- Maintain keyboard operation, visible focus, labelled icon-only actions, and
  semantic controls. Keep touch targets practical on mobile.
- On narrow screens, collapse the three columns into a single content flow.
  Move course navigation into an accessible drawer or equivalent compact
  navigation, and make AI tools reachable without obscuring the feed.
- Preserve current routes, role-based visibility, API-backed behavior, and
  light/dark theme support. Portaled menus and dialogs must inherit the active
  theme and remain usable.

## Implementation guidance

The Figma screenshot is the visual target for this direction; the existing
theme tokens in `src/app/globals.css` are the implementation source of truth.
The screenshot-derived pink palette differs from some existing frontend
scoped/shared theme values. Before applying this direction in UI code, reconcile
the semantic CSS tokens with this palette in one consistent theme rather than
adding isolated hard-coded colors. Keep shared components, Tailwind utilities,
Radix UI primitives, and existing route and workflow behavior.

## Source references

- `src/app/globals.css` — current theme tokens, font stack, and dark mode.
- `src/app/layout.tsx` — application font setup and providers.
- `src/app/(dashboard)/community/page.tsx` — community-feed composition.
- `src/components/community/CommunityHeader.tsx` — brand, search, and account
  actions.
- `src/components/community/CourseSidebar.tsx` — feed and course navigation.
