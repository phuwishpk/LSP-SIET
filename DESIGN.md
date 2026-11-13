---
name: "SIET Pink — StudyTogether"
description: "Design system and UX guidance for KMITL's AI-assisted learning and community workspace."
colors:
  canvas-page: "#FAF7F9"
  canvas-pure: "#FFFFFF"
  surface-card: "#FFFFFF"
  surface-hover: "#FFF8FA"
  border-subtle: "#EAE6EA"
  border-medium: "#D6D0D6"
  primary: "#ED4988"
  primary-hover: "#D83A78"
  primary-pressed: "#C92F6B"
  primary-soft: "#FCE7F0"
  primary-light: "#F7B7D0"
  ink: "#202124"
  body: "#3C3C3C"
  muted: "#707070"
  disabled: "#AFAFAF"
  streak: "#FF9600"
  xp: "#FFC800"
  credit: "#8A57FF"
  ai-rag: "#1CB0F6"
  ai-quiz: "#ED4988"
  ai-roadmap: "#00C48C"
  success: "#2E8B57"
  error: "#E53935"
typography:
  display:
    fontFamily: "Nunito, Prompt, sans-serif"
  body:
    fontFamily: "Nunito, Prompt, Noto Sans Thai, sans-serif"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "9999px"
---

# Design System: SIET Pink — StudyTogether

## Overview

SIET Pink is the visual system for an AI-assisted learning and knowledge-sharing workspace for the School of Industrial Education and Technology (SIET), King Mongkut's Institute of Technology Ladkrabang (KMITL). The experience combines course and personal learning resources, AI study tools, gamified progress, and peer learning in a friendly, energetic interface. Thai is the primary language; retain English technical terms where they are familiar and useful.

The design uses SIET Pink as a focused brand accent, with quiet neutral surfaces and clear content hierarchy. Gamification should make progress visible without making points or streaks more important than learning. AI features should explain what they do, what information they use, and what the learner can do next.

### Target Audience

- **Students (primary):** Need to find relevant course and personal materials, understand difficult topics, make study resources, monitor progress, and learn with peers. The interface should support different subjects, levels of prior knowledge, and study goals rather than present the same undifferentiated experience to everyone.
- **Instructors:** Need to publish course resources and support student learning. Student-only mechanics such as AI charges and earning points must not be presented as instructor requirements.
- **Administrators:** Need to oversee the workspace and community. Administrative controls should be distinct from student learning actions.

### User-Centered Design Rationale

The platform responds to the limitations of a one-size-fits-all learning experience by organizing resources around courses and individual study, and by making source-grounded AI support, quiz creation, and study planning available as separate, understandable tasks. Recommendations should reflect the learner's selected course, materials, goal, and stated needs when those inputs are available; learners must retain control to change inputs, ignore a suggestion, or choose another path. This applies user-centered design by treating student behavior and needs as design inputs to validate, not assumptions about all students (สำนักงานเลขาธิการสภาการศึกษา, 2564; Hassenzahl, 2026).

Use a continuous design cycle: understand the learning context, make the next action clear, test representative tasks with students, and revise from observed issues. Validate the experience across different courses, familiarity with AI, and device sizes before treating a design hypothesis as proven.

### Design Principles

1. **Relevant before generic:** Put course, source, and learner-selected context before broad recommendations.
2. **Progressive disclosure:** Show the essential decision first; reveal details such as point rules, AI settings, or roadmap steps when the learner needs them.
3. **Visible system status:** Show loading, completion, errors, point costs, and progress in context.
4. **Learner agency:** Make AI suggestions editable or dismissible where the workflow allows; do not imply that generated content is definitive.
5. **Consistent and accessible:** Reuse component patterns, label actions clearly, support keyboard and touch, and never rely on color alone to communicate meaning.

## Colors

The palette pairs a soft pink-neutral canvas and white content surfaces with SIET Pink and restrained functional accents. The existing 60-30-10 balance is a composition guideline, not a measured screen-area requirement: keep the canvas and content surfaces dominant, use brand color for primary emphasis, and reserve vivid functional colors for specific statuses or features.

### Primary

- **SIET Pink** (`#ED4988`): Brand accent and primary action color. Use selectively for a page's main action, selected state, or important learning milestone. Pair filled SIET Pink with Main Ink (`#202124`), which provides 4.53:1 text contrast; white labels do not meet WCAG AA on this color.
- **Primary Hover** (`#D83A78`) and **Primary Pressed** (`#C92F6B`): Interaction states for primary controls; do not use color change as the only state cue. For filled controls with labels, use `#C92F6B` with white text on hover/press (5.12:1) rather than placing normal-size text on `#D83A78`, which does not meet 4.5:1 contrast with either white or Main Ink.
- **Soft Pink** (`#FCE7F0`) and **Light Pink** (`#F7B7D0`): Low-emphasis selected surfaces, course tags, and subtle borders.

### Secondary

- **RAG Blue** (`#1CB0F6`): Identity accent for KMITL RAG AI.
- **Roadmap Green** (`#00C48C`): Identity accent for AI Roadmap.
- **Streak Orange** (`#FF9600`): Streak indicator.
- **XP Gold** (`#FFC800`): XP and achievement emphasis.
- **Credit Violet** (`#8A57FF`): AI credits and point-wallet references.

### Neutral

- **Page Canvas** (`#FAF7F9`): Main dashboard background; provides separation from white cards.
- **Pure Canvas / Card Surface** (`#FFFFFF`): Quiz canvas and content cards.
- **Hover Surface** (`#FFF8FA`): Subtle card hover surface.
- **Subtle Border** (`#EAE6EA`) and **Medium Border** (`#D6D0D6`): Separation and input outlines.
- **Main Ink** (`#202124`), **Body Text** (`#3C3C3C`), **Muted Text** (`#707070`), and **Disabled** (`#AFAFAF`): Text hierarchy and unavailable controls.
- **Success** (`#2E8B57`) and **Error** (`#E53935`): Outcome states; pair with text or an icon.

### Named Rules

**The Accent-with-Meaning Rule.** Color must indicate brand, interaction, or status—not decoration alone. Do not rely on the 60-30-10 guide as proof of contrast or accessibility.

**The Primary Contrast Rule.** Use Main Ink on SIET Pink at rest. When an interaction state darkens the filled action, verify its foreground pair independently; do not assume the light-theme foreground remains accessible.

### Dark mode

Every screen follows the light / dark choice made in SIET Space (the
theme button in Community's profile menu), including the standalone AI
Roadmap and AI Quiz apps. Dark mode keeps the same roles on Community's
dark surfaces:

``` css
:root[data-theme='dark'] {
  color-scheme: dark;

  --color-primary: #F472B6;
  --color-primary-hover: #EC4899;
  --color-primary-pressed: #DB2777;
  --color-primary-soft: #4A2B3C;

  --color-ink: #F9EDF2;
  --color-body: #E8D9E0;
  --color-muted: #C4AEB9;
  --color-canvas: #09090B;
  --color-surface: #2B2026;
  --color-border: #4B3441;

  --color-info: #7CCDF7;
  --color-success: #74C48A;
  --color-error: #FF8A8A;
}
```

-   Text on the primary pink is dark plum (`#381126`), not white.
-   Pale fills (pink/rose/amber 50--200) become dark tints of the same
    hue. A light fill must never keep text that turns light in dark
    mode.

## Typography

**Display Font:** Nunito, with Prompt as fallback.

**Body Font:** Nunito, Prompt, Noto Sans Thai, sans-serif.

**Character:** Friendly and contemporary, while remaining legible for sustained reading in Thai and English. Use the same role hierarchy across dashboards, learning tools, and community content.

### Hierarchy

- **Display:** Reserved for a brief hero message or a prominent learning milestone; avoid oversized type in dense study workflows.
- **Headline:** Page title and major section heading; communicate the current task or learning context.
- **Title:** Card, feature, course, and roadmap-step titles; keep labels scannable.
- **Body:** Explanations, study content, posts, and AI responses. Use comfortable line spacing and break long instructions into chunks.
- **Label:** Navigation, metadata, chips, and compact stats. Keep labels readable and avoid encoding meaning only through icons.

As a baseline for new screens, use 16px body text, a clear size and weight difference between headings and body, and line-height around 1.5 for Thai reading. Treat these as implementation guidance, not extracted tokens; confirm them against the product's actual typography and responsive behavior.

### Named Rules

**The Reading-first Rule.** Readability takes precedence over decorative type, especially for AI explanations, course content, and roadmap instructions.

## Layout

### Information Architecture

Organize navigation around the learner's intent, using stable names and grouping related tasks:

1. **Workspace / Dashboard:** Resume learning, see a relevant daily prompt, and access key progress.
2. **Learning Resources:** Courses, notebooks, personal materials, and the knowledge library.
3. **AI Study Tools:** KMITL RAG AI, AI Quiz, and AI Roadmap.
4. **Community:** Course and community feeds, posts, comments, reactions, shared quizzes and roadmaps, and notifications.
5. **Profile and Points:** Personal progress and the point wallet. Keep point balance and any AI-use cost understandable and separate from learning content.

Use page title → section heading → card or task title → supporting description → metadata as the default visual hierarchy. The learner should be able to identify where they are, what the content represents, and the next action without scanning unrelated metrics.

### Complex Feature Hierarchy

- **Points / Gamification:** Present the current Streak, XP, or credit as a compact summary. On detail or confirmation views, explain what the value represents and, before a chargeable student AI action, show the cost and remaining balance. Keep earning, spending, and achievement states distinguishable with labels and icons as well as color. Do not make Streak loss the only or dominant motivation.
- **AI Roadmap:** Explain the learning goal first, then show ordered stages, the current step, a short reason or source context when available, and the next recommended action. Keep each step scannable; disclose detail progressively. Make it clear that an AI-generated plan is a suggestion that the learner can review and adjust.
- **AI output:** Distinguish generated content from source material and provide a clear route back to the selected source or context when available. Communicate loading, empty, and error states without presenting an incomplete result as successful.

### Grid and Responsive Behavior

Use a consistent spacing rhythm and align cards, headings, and controls to shared page gutters. As a starting grid recommendation, use 12 columns on wide desktop, 8 on tablet, and 4 on mobile; collapse or reorder content according to task priority rather than shrinking desktop layouts. Use the breakpoints and spacing scale already established in the implementation when available. Keep primary actions visible and touch targets generous on small screens.

The dashboard's Learning Hero Banner sits above the central learning or community content. Header Gamification Stats should remain secondary to the page's main task and collapse gracefully when space is limited.

### Information Architecture Rationale

Grouping by user intent reduces the need to remember where a feature lives. Breaking complex point and roadmap information into a summary followed by ordered detail reduces unnecessary cognitive load and supports recognition over recall (Yablonski, 2024). The hierarchy should be validated with student tasks, not treated as a substitute for usability testing.

## Elevation & Depth

The visual language is a hybrid of tonal layering and restrained shadows: the page canvas separates from white cards, while shadows clarify interactive elevation rather than decorate every surface. Quiz / Adventure Mode may use a pure white canvas, distinct from the dashboard's page background.

### Shadow Vocabulary

- **Tactile Pink** (`0 4px 0 var(--color-primary-pressed)`): Primary buttons where a tactile treatment supports the action.
- **Tactile White** (`0 3px 0 var(--color-border-medium)`): Secondary raised controls.
- **Card** (`0 4px 16px rgba(32, 33, 36, 0.04)`): Resting card elevation.
- **Card Hover** (`0 8px 24px rgba(237, 73, 136, 0.08)`): Hover feedback for interactive cards.
- **Header** (`0 1px 0 var(--color-border-subtle)`): Separation between the header and page content.

Use pressed and focus feedback in addition to elevation. Respect reduced-motion preferences and provide equivalent non-hover cues for touch and keyboard users.

## Shapes

Use rounded, approachable geometry with a consistent radius scale: `8px` small, `12px` medium, `16px` large, `20px` extra-large, and `9999px` pill. Cards use `16px` by default; the Learning Hero Banner uses `20px`; compact stats and course tags use a pill shape.

Borders should define fields and subtle content boundaries, not compete with text. Keep icon containers consistently rounded (including the AI tool-card squircle treatment) and ensure clipped content, focus indicators, and touch targets remain legible.

## Components

### Buttons

Use a tactile, clear action hierarchy. Primary actions use SIET Pink; secondary actions use outline or ghost styling.

- Use one visually dominant primary action per task area to reduce choice friction (Hick's Law).
- Target a 48–52px control height for key touch actions, including “ตรวจคำตอบ”, “เริ่มเรียนรู้ต่อ”, and “ถาม AI”; verify layout and platform-specific guidance on the shipped web UI.
- Provide visible hover, pressed, disabled, and keyboard focus states. The tactile lip may compress on press, but do not rely on motion or shadow alone to communicate activation.
- Keep icon-only controls labeled accessibly and provide a sufficiently large hit area.

### Learning Hero Banner

Place the daily learning prompt above the main learning or feed content. Use a soft pink-to-white treatment (`linear-gradient(135deg, #FFF0F5 0%, #FFFFFF 100%)`), a `20px` radius, a subtle pink border, and a short, relevant prompt. A primary action may include its associated XP reward; an optional mascot illustration must not obscure the action or content.

### Header Gamification Stats

Show Streak, XP, and credit as compact labeled pills near navigation, search, or profile when space permits. Pair each value with an icon and text (for example, “5 วัน”, “1,240 XP”, and “เครดิต: 25”). On narrow screens, prioritize the main task and allow stats to move to a secondary view rather than crowding navigation.

### Interactive AI Tool Cards

Use white cards on the page canvas with `16px` corners and the card shadow. Each card has a recognizable icon container and a short description of the outcome:

- **ถาม KMITL RAG AI:** RAG Blue (`#1CB0F6`); explain that responses are grounded in available learning sources.
- **สร้างแบบทดสอบ AI:** SIET Pink (`#ED4988`); an optional “ฮิต” badge is secondary to the feature name.
- **สร้างแผนการเรียน AI:** Roadmap Green (`#00C48C`); describe the learning-plan outcome, not only the AI capability.

Interactive cards may lift by `translateY(-2px)` on hover with a subtle pink border and hover shadow. Provide an equivalent focus indicator and avoid hover-only discovery.

### Subject and Course Tags

Use a pill badge instead of embedding course names in square brackets. The standard treatment is Soft Pink (`#FCE7F0`) with dark pink text (`#C92F6B`); keep the course name visible and do not use the badge color as the only indication of course identity.

### File Preview Thumbnails

Represent slides and PDFs with a document-style preview rather than an unexplained gray rectangle. Use a restrained pastel cover, a recognizable file-type icon or label, and a readable title. The preview supplements—not replaces—the accessible file name and action.

### Inputs, Feedback, and AI States

Use consistent field labels, borders, and focus treatment across AI forms and learning tools. Explain required input and point cost before a student submits a chargeable action. Provide clear loading, empty, success, and error states; pair status colors with text or icons and explain how to recover from an error.

## Do's and Don'ts

### Do

- **Do** use `#FAF7F9` for the main dashboard canvas and white cards for distinct content surfaces.
- **Do** use SIET Pink as a focused accent and reserve functional colors for their named features.
- **Do** keep AI tool names, course context, and next actions explicit.
- **Do** make Streak, XP, credit, and AI costs understandable in the context where they affect a learner's decision.
- **Do** check contrast for actual text/background pairs and target WCAG 2.1 AA; include keyboard operation, visible focus, and text alternatives in accessibility testing.
- **Do** use Material Design 3 and Apple Human Interface Guidelines as consistency and accessibility references, adapting their platform-appropriate principles to this web product (Google, 2024; Apple, 2024).
- **Do** test the Information Architecture and personalized learning flow with students before treating the proposed hierarchy as validated.

### Don't

- **Don't** place white cards on a white page without a border, tonal distinction, or other clear separation.
- **Don't** use vivid pink as a full-page background or apply color without a semantic purpose.
- **Don't** make Streak, XP, badges, or decorative illustrations compete with study content or the primary task.
- **Don't** communicate correct / incorrect, selected, or disabled states by color alone.
- **Don't** claim WCAG conformance or a specific contrast ratio without checking the rendered color pair and interaction state. In particular, verify text placed on the primary pink rather than assuming it passes.
- **Don't** present AI-generated answers or roadmaps as guaranteed, fixed, or equivalent to authoritative course material.

### Theory-to-Design Traceability

| Design decision | User need addressed | Rationale and reference |
|---|---|---|
| Course- and learner-relevant resources and AI tools | Students need help that reflects their subjects, materials, and learning goals | User-Centered Design: understand real behavior and needs, then validate the experience with students (สำนักงานเลขาธิการสภาการศึกษา, 2564; Hassenzahl, 2026). |
| Reusable navigation, color roles, typography, and interaction states | Students should not have to relearn common controls across features | Consistency and Accessibility guidance from Material Design 3 and Apple HIG (Google, 2024; Apple, 2024). |
| Summary-first point UI and ordered AI Roadmap stages | Complex progress and planning information should be easy to scan and act on | Information Architecture and visual hierarchy reduce navigation and interpretation effort (Yablonski, 2024). |
| Chunked learning content and one dominant primary action | Reduce avoidable cognitive load and decision friction | Cognitive Load Theory, Chunking, and Hick's Law; treat these as design hypotheses to evaluate. |
| Large, clearly labeled touch actions with responsive feedback | Make important actions easier to target and understand | Fitts's Law and Affordance; maintain keyboard access and platform-appropriate target sizing. |
| Streak, XP, badges, and community contribution signals | Support autonomy, competence, and relatedness in learning | Self-Determination Theory (Deci & Ryan); Octalysis Framework (Yu-kai Chou). Use progress as encouragement, not coercion. |
| Text paired with meaningful icons and document previews | Help learners scan and distinguish feature types | Dual-Coding Theory (Paivio); retain readable text labels and do not rely on imagery alone. |
| Neutral surfaces with limited accent color and clear elevation | Distinguish content and action without adding visual noise | Surface Elevation and the existing 60-30-10 composition guideline; verify contrast independently of palette proportions. |
