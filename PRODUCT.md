# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students, instructors, and administrators at King Mongkut's Institute of Technology Ladkrabang (KMITL). Students use the workspace to study, review course material, ask questions, create learning materials, and share knowledge with peers. Instructors publish and manage course resources and support student learning. Administrators manage the workspace and its community.

The primary language is Thai, with English technical terminology where useful.

## Product Purpose

SIET Space is an AI-assisted learning workspace for the KMITL community. It brings course and personal study resources, notebook workflows, AI-assisted study tools, and peer learning together. Success means students can learn from relevant materials and each other, while instructors can provide useful course resources and administrators can support the learning community.

## Positioning

The product combines AI study tools grounded in available learning sources with a campus learning community where people share materials and study outputs. Its community point system recognizes student contributions and connects those contributions to the wider study experience.

## Operating Context

Students and instructors access the web application to sign in, work with notebooks and learning resources, ask AI questions, generate quizzes or roadmaps, and participate in course or community feeds. Students can share posts, summaries, quizzes, and roadmaps; instructors publish course materials; administrators oversee community operations. The workspace also includes a knowledge library and a point wallet tied to AI use and community contributions.

The current sign-in flow supports KMITL Google Workspace accounts, with local username/password accounts also available. A mock Google account picker is for development only.

## Capabilities and Constraints

- Community feeds support courses, posts, comments, reactions, shared quizzes and roadmaps, and notifications.
- AI capabilities include source-grounded question answering, quiz generation, and study roadmap generation.
- Notebook and knowledge-library workflows support course and personal learning materials.
- The point wallet charges for some student AI actions and rewards eligible community contributions; instructors and administrators are not charged and do not need to earn points.
- AI generation uses the configured language model provider.
- The product runs as a web application. Product-specific accessibility standards and other additional constraints have not been decided.

## Brand Commitments

- Product names in use: KMITL AI Workspace and SIET Space (StudyTogether).
- Use Thai as the primary language, retaining English technical terminology where it supports understanding.

## Evidence on Hand

- Existing implementation and product overview: [`README.md`](./README.md).
- System architecture, workflows, and role permissions: [`docs/SYSTEM-GUIDE.md`](./docs/SYSTEM-GUIDE.md).
- Community, authentication, and point-economy behavior: [`README.md`](./README.md), section “SIET Space – community feed, Google SSO and the point wallet”.
- Do not invent testimonials, customer claims, benchmarks, or external validation; none are established in the available product record.

## Product Principles

- Ground AI study assistance in relevant learning sources.
- Make individual study and peer learning parts of one connected workspace.
- Support the distinct learning and operational needs of students, instructors, and administrators.
- Recognize student contributions without charging instructors or administrators.

## Accessibility & Inclusion

No product-specific accessibility standard or user accommodation requirement has been established yet.
