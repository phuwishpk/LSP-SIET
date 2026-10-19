# Open Notebook / SIET Space design context

This file is the design reference for `open-notebook/frontend` only. The
standalone My AI Quiz and AI Roadmap Generator apps are separate products and
are out of scope.

## Product

Open Notebook is the KMITL learning workspace. SIET Space is its community
home: students and teaching staff share course materials, ask questions, use
AI study tools, and participate in course and discussion rooms. The frontend
also includes research and notebook tools, plus teacher and admin consoles.

The main audiences are KMITL students, teachers, and administrators. Roles
change which actions and areas are available. Thai is prominent in community
flows, while the product also uses English. Preserve both languages and do not
assume that visible labels are English-only.

## Existing visual direction

The current UI is a practical, approachable learning workspace with familiar
community-feed patterns. Keep it clear and information-dense enough for
ongoing study and teaching tasks; prioritize readable content and findable
navigation over decorative effects.

- The community feed uses a centered, responsive three-column layout on wide
  screens: course navigation, feed content, and supporting tools.
- The header keeps search, points, notifications, and account actions readily
  available. On narrow screens, course navigation moves into a drawer.
- Existing typography is Inter, loaded through `next/font`.
- Components use Tailwind CSS, Radix UI primitives, shared UI components, and
  Lucide icons. Prefer these existing building blocks and semantic theme
  utilities over one-off styling.
- Light and dark themes are supported. Both modes, including portaled menus and
  dialogs, are part of the expected experience.

## Theme tokens

`src/app/globals.css` is the source of truth for the shared theme. Use semantic
utilities such as `bg-background`, `text-foreground`, `bg-muted`,
`text-muted-foreground`, `bg-primary`, `border-border`, and the card/sidebar
tokens instead of hard-coding colors in new UI.

The current light theme uses white surfaces, dark neutral text, and a blue
primary (`oklch(0.623 0.214 259.815)`). The dark theme uses deep neutral
surfaces and a brighter blue primary (`oklch(0.546 0.245 262.881)`). The
community brand mark currently uses an orange-to-rose gradient; treat that as
an existing accent, not a replacement for the shared primary color.

## Design constraints

- Preserve the existing route structure, role-based visibility, and API-backed
  workflows when changing presentation.
- Keep community navigation and key actions usable on small screens; do not
  rely on hover-only interactions.
- Maintain visible focus states, sensible keyboard operation, readable
  contrast in both themes, and appropriately labelled icon-only controls.
- Respect the existing component library and shared tokens. Introduce a new
  visual pattern only when it improves a real user task and remains consistent
  across related screens.
- Avoid broad restyling of the separate quiz and roadmap apps from this
  frontend's design work.

## Source references

- `src/app/globals.css` — theme tokens, base styles, and dark mode.
- `src/app/layout.tsx` — font, providers, and application metadata.
- `src/app/(dashboard)/community/page.tsx` — responsive community-feed
  composition.
- `src/components/community/CommunityHeader.tsx` — brand, search, and account
  actions.
- `src/components/community/CourseSidebar.tsx` — feed and room navigation.
- The repository `README.md` — product capabilities, audiences, and role
  boundaries.

This is an inventory of the shipped baseline, not a mandate to preserve every
current detail. For a redesign, establish an approved direction before
replacing the existing visual language.
