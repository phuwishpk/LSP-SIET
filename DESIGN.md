---
description: A playful, gamified learning design system for SIET
  KMITL-inspired educational experiences. It combines a clean white
  canvas, logo-inspired pink accents, bold friendly typography, rounded
  tactile buttons, original mascot illustrations, and an adventure-map
  learning journey. The palette is sampled approximately from the
  provided SIET logo and is not claimed to be the institution's official
  brand specification.
name: SIET Pink --- AI Learning Adventure
version: alpha
---

# SIET Pink --- Design System

## Overview

SIET Pink is a friendly, modern design system for **AI Learning
Adventure**, a learning platform concept for students in the School of
Industrial Education and Technology (SIET), KMITL. It borrows broad
interaction patterns from gamified learning products---clear progress,
short activities, rewarding feedback, friendly illustrations, and
playful buttons---while using its own pink-and-black visual identity and
original character artwork.

The provided SIET logo uses a vivid pink symbol alongside black
lettering on a light background. This system therefore uses **pink as
the primary action color**, black for clear headings, and white as the
main canvas. The colors below are approximate design choices based on
the supplied image, not verified official institutional color values.
Replace them with approved brand values if a formal SIET/KMITL brand
guide becomes available.

### Core principles

-   **Playful, not childish:** use expressive illustrations and rewards
    while keeping the interface clear and suitable for university
    students.
-   **One primary action:** use SIET pink for the most important action
    in each view.
-   **White space first:** keep pages bright and uncluttered; use pale
    pink for selected states and small areas, not as a full-page wash.
-   **Progress is visible:** show lesson paths, completion, XP, streaks,
    and next steps.
-   **Accessible by default:** do not communicate correctness, errors,
    or status through color alone.
-   **Original identity:** create original mascots and illustrations. Do
    not copy Duolingo's logo, characters, proprietary illustrations, or
    custom fonts.

## Colors

### Brand palette

  -----------------------------------------------------------------------
  Token                   Hex                     Intended use
  ----------------------- ----------------------- -----------------------
  `pink`                  `#ED4988`               Primary buttons, active
                                                  lesson nodes, key
                                                  highlights

  `pink-pressed`          `#C92F6B`               Pressed state and
                                                  button shadow lip

  `pink-soft`             `#FCE7F0`               Selected chips, gentle
                                                  highlight surfaces

  `pink-light`            `#F7B7D0`               Decorative details,
                                                  progress-track accents

  `ink`                   `#202124`               Main headings and
                                                  important text

  `body`                  `#3C3C3C`               Body text

  `muted`                 `#777777`               Supporting text and
                                                  metadata

  `soft`                  `#AFAFAF`               Disabled text and
                                                  low-priority details

  `canvas`                `#FFFFFF`               Main page background

  `border`                `#E5E5E5`               Card borders, dividers,
                                                  input outlines
  -----------------------------------------------------------------------

### Gamification and status colors

  Token      Hex         Intended use
  ---------- ----------- --------------------------------------
  `blue`     `#1CB0F6`   Secondary information and links
  `green`    `#58A66A`   Correct answers and completed states
  `red`      `#FF4B4B`   Errors and incorrect answers
  `orange`   `#FF9600`   Streaks and time-sensitive prompts
  `gold`     `#FFC800`   XP, stars, milestones, achievements
  `purple`   `#CE82FF`   Special rewards and bonus content

Keep the main action pink. Use other saturated colors only when they
communicate a distinct meaning, such as correct/incorrect answers,
rewards, or information. Always pair status colors with a label, icon,
or message.

## CSS variables

``` css
:root {
  color-scheme: light;

  --color-primary: #ED4988;
  --color-primary-hover: #D83A78;
  --color-primary-pressed: #C92F6B;
  --color-primary-soft: #FCE7F0;
  --color-primary-light: #F7B7D0;

  --color-ink: #202124;
  --color-body: #3C3C3C;
  --color-muted: #777777;
  --color-soft: #AFAFAF;
  --color-canvas: #FFFFFF;
  --color-surface: #FFFFFF;
  --color-border: #E5E5E5;

  --color-info: #1CB0F6;
  --color-success: #58A66A;
  --color-error: #FF4B4B;
  --color-streak: #FF9600;
  --color-xp: #FFC800;
  --color-reward: #CE82FF;

  --font-display: "Nunito", "Quicksand", sans-serif;
  --font-body: "Nunito", "Quicksand", sans-serif;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
  --space-24: 96px;

  --shadow-button: 0 4px 0 var(--color-primary-pressed);
  --shadow-card: 0 2px 0 rgba(32, 33, 36, 0.05);
}
```

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

Use **Nunito** as the preferred open-source font. Quicksand is an
acceptable alternative. These are substitutes for the friendly rounded
display style; they are not Duolingo's proprietary typefaces.

  ------------------------------------------------------------------------------
  Style      Font                Size        Weight   Line height Usage
  ---------- ---------- ------------- ------------- ------------- --------------
  Display XL Nunito          56--64px           800          1.05 Landing hero,
                                                                  major
                                                                  milestone

  Display L  Nunito          40--48px           800           1.1 Page title and
                                                                  major section

  Heading M  Nunito          28--32px           800           1.2 Lesson and
                                                                  dashboard
                                                                  headings

  Heading S  Nunito          20--24px           800           1.3 Cards and
                                                                  question
                                                                  titles

  Body L     Nunito          17--18px      500--600           1.5 Introductory
                                                                  copy

  Body M     Nunito          15--16px      500--700           1.5 Standard UI
                                                                  and lesson
                                                                  text

  Body S     Nunito          13--14px      600--700           1.4 Metadata,
                                                                  hints,
                                                                  captions

  Button     Nunito          14--15px           800           1.2 Primary and
                                                                  secondary
                                                                  actions
  ------------------------------------------------------------------------------

### Typography rules

-   Use bold display styles for short, encouraging headlines.
-   Keep body copy comfortable to read; avoid using all caps for long
    text.
-   Button labels may be uppercase with `letter-spacing: 0.6px`, but use
    sentence case where it improves clarity or accessibility.
-   Avoid using multiple font families on the same screen without a
    clear reason.
-   Keep line length moderate and ensure Thai text wraps naturally.

## Layout and spacing

Use a responsive content container with a maximum width around `1120px`
and horizontal padding of `16px` on mobile, `24px` on tablet, and `32px`
on desktop.

  Token          Value Common use
  ------------ ------- --------------------------------
  `space-1`        4px Icon-to-label micro spacing
  `space-2`        8px Tight inline spacing
  `space-3`       12px Input and chip spacing
  `space-4`       16px Default component padding
  `space-6`       24px Card gaps and grouped controls
  `space-8`       32px Section spacing
  `space-12`      48px Major content blocks
  `space-16`      64px Large section spacing
  `space-24`      96px Landing page section gutters

### Responsive behavior

-   **Mobile:** prioritize one-column layouts, full-width primary
    actions, and clear progress labels.
-   **Tablet:** use two-column layouts when the content benefits from
    comparison or illustration.
-   **Desktop:** use a centered content container; keep lesson
    activities at a readable width.
-   Adventure maps may scroll horizontally or vertically, but must
    include clear direction, labels, and an accessible way to reach each
    lesson.

## Shape, borders, and depth

-   Primary buttons: `16px` radius, with a flat 4px shadow lip in
    `pink-pressed`.
-   Cards: `16px` radius, white background, thin `#E5E5E5` border; avoid
    excessive shadow.
-   Inputs: `12px` radius and a visible 2px focus ring.
-   Chips and status badges: pill radius.
-   Lesson nodes: circles or rounded shapes with consistent hit areas.
-   Use shadows to communicate interaction, not to decorate every
    surface.

### Button interaction

``` css
.button-primary {
  min-height: 48px;
  padding: 13px 20px;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-primary);
  color: #FFFFFF;
  font: 800 15px/1.2 var(--font-body);
  letter-spacing: 0.6px;
  box-shadow: var(--shadow-button);
  cursor: pointer;
  transition: background-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

.button-primary:hover {
  background: var(--color-primary-hover);
}

.button-primary:active {
  transform: translateY(4px);
  box-shadow: none;
}

.button-primary:focus-visible {
  outline: 3px solid var(--color-info);
  outline-offset: 3px;
}
```

Respect `prefers-reduced-motion` and never rely on animation as the only
indicator of a state change.

## Components

### Primary button

-   Pink fill, white label, 16px radius.
-   Use for the single main action in a view, such as **เริ่มบทเรียน**,
    **ตรวจคำตอบ**, or **ไปต่อ**.
-   Show hover, pressed, disabled, and loading states.
-   Do not place two equally prominent primary buttons beside each
    other.

### Secondary button

-   White fill, pink or blue label, 2px border.
-   Use for actions such as **ดูคำใบ้**, **ย้อนกลับ**, or **ข้าม**.
-   Make the difference between primary and secondary actions clear.

### Text input

-   White background, dark text, 48px minimum height, 12px radius.
-   Default border: `#E5E5E5`.
-   Focus border: `#1CB0F6`, with a visible focus ring.
-   Include a persistent label; do not rely on placeholder text alone.

### Lesson card

-   White background, thin border, rounded corners.
-   Include subject or module, lesson title, completion state, and a
    clear next action.
-   Use pale pink for the selected or active card, not every card.

### Adventure map node

-   Represent a lesson, checkpoint, or milestone.
-   Use pink for the current node, green for completed nodes, and
    neutral gray for locked nodes.
-   Include a visible icon and text label; color alone must not
    communicate state.
-   Provide hover/focus feedback and a usable touch target.

### Progress bar

-   Neutral gray track with pink fill.
-   Include an accessible text value such as "ความคืบหน้า 3 จาก 8 บทเรียน".
-   Animate progress gently and respect reduced-motion settings.

### XP and streak badges

-   XP uses gold (`#FFC800`) with dark text.
-   Streak uses orange (`#FF9600`) with a flame icon and a text label.
-   Special rewards may use purple (`#CE82FF`).
-   Avoid presenting XP or streaks in ways that shame or punish
    learners.

### Quiz answer option

-   Use a large tappable card with clear spacing.
-   Default: white surface and neutral border.
-   Selected: pink border and pale-pink surface.
-   Correct: green plus a check icon and explanatory feedback.
-   Incorrect: red plus an error icon and a supportive explanation.
-   After answering, explain why the answer is correct rather than only
    showing "right" or "wrong".

### Fill the Gap

-   Make blanks easy to identify and large enough to tap.
-   Provide keyboard access and visible focus.
-   Show hints as optional support rather than a penalty.
-   Keep code snippets readable and use a monospaced font for code only.

### Mascot illustration

-   Create an original owl or technology-themed companion that fits
    SIET's learning context.
-   Use pink accents, dark outlines, and expressive poses.
-   Mascot actions may celebrate completion, offer a hint, or encourage
    a retry.
-   Do not reproduce Duo the owl or any other Duolingo character.

### Navigation

-   Use a white navigation surface, dark text, and pink active
    indicators.
-   Keep the current location obvious.
-   On mobile, use a compact navigation pattern and avoid crowding.

### Feedback and toast

-   Use concise, friendly language.
-   Success example: "เก่งมาก! ผ่านบทเรียนนี้แล้ว"
-   Retry example: "ยังไม่เป็นไร ลองดูคำใบ้แล้วตอบอีกครั้งนะ"
-   Error states should explain how to recover.

## AI Learning Adventure guidance

The system should support these learning features:

1.  **Adventure Map:** a visible route through topics, lessons,
    checkpoints, and milestones.
2.  **AI Quiz:** adaptive questions with answer explanations and
    optional hints.
3.  **Fill the Gap:** vocabulary, concept, and code-completion
    exercises.
4.  **Mascot reactions:** contextual expressions that reinforce learning
    without interrupting it.
5.  **Progress and rewards:** XP, completion badges, streaks, and clear
    next steps.
6.  **Review mode:** revisit missed questions and saved concepts.
7.  **Accessible learning:** keyboard navigation, readable contrast,
    labels, and reduced-motion support.

### Suggested screen hierarchy

-   Dashboard: welcome message, current progress, continue-learning CTA,
    and next lesson.
-   Adventure map: learning path with unlocked, current, completed, and
    locked nodes.
-   Quiz screen: progress indicator, question, answer options, hint, and
    feedback.
-   Results screen: score, concepts to review, earned XP, and a clear
    next action.
-   Profile/progress screen: completed lessons, badges, and learning
    history.

## Do and don't

### Do

-   Use pink for the main action and active learning states.
-   Keep white as the dominant surface.
-   Use dark text for readability.
-   Use original illustrations and a consistent mascot style.
-   Make progress and feedback understandable without color alone.
-   Keep component spacing, radius, and interaction states consistent.
-   Check the interface on mobile, tablet, and desktop.

### Don't

-   Don't use bright pink as the background for every card or entire
    page.
-   Don't use multiple competing primary-action colors.
-   Don't use pale pink for small body text on white; contrast may be
    too low.
-   Don't copy Duolingo's mascot, logo, proprietary illustrations, or
    claim this is an official Duolingo theme.
-   Don't use animation, sound, or streak loss as the only way to
    communicate important information.
-   Don't leave keyboard focus invisible.
-   Don't treat the proposed palette as verified official SIET/KMITL
    brand guidance.

## Implementation notes for Next.js

-   Store global tokens in `app/globals.css` or the project's existing
    global stylesheet.
-   If using Tailwind CSS, map semantic colors to the CSS variables
    rather than repeating hex values across components.
-   Keep reusable UI in components such as `Button`, `LessonCard`,
    `ProgressBar`, `QuizOption`, `Mascot`, and `AdventureNode`.
-   Avoid changing business logic while applying the visual redesign.
-   Test active, hover, focus, disabled, success, and error states.
-   Run the project build and fix lint/type errors after changes.
-   Prefer free fonts and locally stored or properly licensed assets;
    avoid dependencies that require a paid service unless explicitly
    approved.

## Known gaps

-   Exact official SIET/KMITL color values have not been verified from a
    brand guideline; the pink in this file is an approximation based on
    the supplied logo image.
-   The mascot is a concept direction only; original artwork and
    animation assets must be created separately.
-   This file defines the visual system and component behavior, not the
    complete application implementation.
