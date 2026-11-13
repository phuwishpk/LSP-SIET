# Frontend Architecture

เอกสารนี้ทำแผนผังจากไฟล์จริงใน `open-notebook/frontend/src/` โดยเน้นให้ตามจาก URL ไปยัง `page.tsx`, คอมโพเนนต์ของหน้า และ shared components ได้

## 1. Routing & Pages Mapping

### ข้อควรรู้เกี่ยวกับ Route

- โปรเจกต์ใช้ Next.js App Router: ไฟล์ `page.tsx` สร้างหน้าเว็บ, `route.ts` สร้าง HTTP handler
- Route Group `(auth)` และ `(dashboard)` ไม่ปรากฏเป็น URL segment
- โฟลเดอร์ `[id]`, `[sourceId]`, `[sessionId]` คือ dynamic parameter
- `src/proxy.ts` redirect `/` ไป `/login` และยกเว้น `/api`, static assets, favicon
- ทุก Route ภายใน `(dashboard)` ถูกครอบด้วย `src/app/(dashboard)/layout.tsx` ซึ่งตรวจสถานะ Auth และ Role

### Route และไฟล์ของหน้า

```text
src/app/
├── page.tsx                                      # / -> redirect('/login')
├── (auth)/                                       # URL ไม่มี prefix (auth)
│   ├── login/page.tsx                            # /login
│   ├── register/page.tsx                         # /register
│   └── auth/google/
│       ├── callback/page.tsx                     # /auth/google/callback
│       └── mock/page.tsx                         # /auth/google/mock (OAuth mock)
└── (dashboard)/                                  # ผ่าน Dashboard Auth/Role layout
    ├── layout.tsx                                # Auth, Role, modal provider, command palette
    ├── page.tsx                                  # / (Workspace landing)
    ├── dashboard/page.tsx                        # /dashboard (re-export Workspace)
    ├── admin/page.tsx                            # /admin
    ├── advanced/
    │   ├── page.tsx                              # /advanced
    │   └── components/
    │       ├── RebuildEmbeddings.tsx
    │       └── SystemInfo.tsx
    ├── community/
    │   ├── page.tsx                              # /community
    │   └── ask/page.tsx                          # /community/ask
    ├── features/
    │   ├── page.tsx                              # /features
    │   └── components/
    │       ├── QuizRunner.tsx
    │       └── RoadmapGraph.tsx
    ├── notebooks/
    │   ├── page.tsx                              # /notebooks
    │   ├── [id]/page.tsx                         # /notebooks/[id]
    │   └── components/
    │       ├── ChatColumn.test.tsx
    │       ├── ChatColumn.tsx
    │       ├── NoteEditorDialog.tsx
    │       ├── NotebookCard.tsx
    │       ├── NotebookDeleteDialog.tsx
    │       ├── NotebookHeader.tsx
    │       ├── NotebookList.tsx
    │       ├── NotebookRow.tsx
    │       ├── NotesColumn.tsx
    │       ├── RecentlyViewed.tsx
    │       └── SourcesColumn.tsx
    ├── podcasts/page.tsx                         # /podcasts
    ├── search/page.tsx                           # /search
    ├── settings/
    │   ├── page.tsx                              # /settings
    │   ├── api-keys/page.tsx                     # /settings/api-keys
    │   └── components/SettingsForm.tsx
    ├── sources/
    │   ├── page.tsx                              # /sources
    │   └── [id]/page.tsx                         # /sources/[id]
    ├── teacher/page.tsx                          # /teacher
    └── transformations/
        ├── page.tsx                              # /transformations
        └── components/
            ├── DefaultPromptEditor.tsx
            ├── TransformationCard.tsx
            ├── TransformationEditorDialog.tsx
            ├── TransformationPlayground.tsx
            └── TransformationsList.tsx
```

> **ข้อสังเกต Route `/`:** พบ `src/app/page.tsx` และ `src/app/(dashboard)/page.tsx` ซึ่งต่างก็ map ไป `/` ตามกฎ Route Groups ของ Next.js ขณะเดียวกัน `src/proxy.ts` redirect `/` ไป `/login` จึงมีทั้งการประกาศ Route ซ้ำและ redirect ที่ต้องคำนึงถึงเมื่อตรวจสอบ/แก้ Routing

### หน้าใช้คอมโพเนนต์และไฟล์ใดบ้าง

`↳` ระบุไฟล์ที่หน้า import ไปใช้ ไม่ใช่ไฟล์ที่อยู่ในโฟลเดอร์ `app/` เว้นแต่ระบุเป็น `./components/...` ซึ่งเป็นคอมโพเนนต์เฉพาะหน้านั้นจริง

```text
/  [Workspace จาก src/app/(dashboard)/page.tsx]
├── src/components/ui/card.tsx, button.tsx
├── src/lib/hooks/use-auth.ts
└── src/lib/cross-app.ts

/dashboard  [src/app/(dashboard)/dashboard/page.tsx -> re-export ../page]
└── ใช้ Workspace หน้าเดียวกับ /

/login  [src/app/(auth)/login/page.tsx]
├── src/components/auth/LoginForm.tsx
└── src/components/common/ErrorBoundary.tsx

/register  [src/app/(auth)/register/page.tsx]
├── src/components/auth/RegisterForm.tsx
└── src/components/common/ErrorBoundary.tsx

/auth/google/callback  [src/app/(auth)/auth/google/callback/page.tsx]
├── src/components/ui/{card,button}.tsx
├── src/components/common/LoadingSpinner.tsx
└── src/lib/{api/auth.ts,config.ts,stores/auth-store.ts}

/auth/google/mock  [src/app/(auth)/auth/google/mock/page.tsx]
├── src/components/ui/{card,button,input,label}.tsx
├── src/components/common/LoadingSpinner.tsx
└── src/lib/{api/auth.ts,config.ts,stores/auth-store.ts}

/admin  [src/app/(dashboard)/admin/page.tsx]
├── src/components/admin/{HealthPanel,ModerationPanel,RoomsPanel,
│   PointsLogPanel,ImportPanel,CreateUserDialog}.tsx
├── src/components/layout/AppShell.tsx
└── src/components/ui/{tabs,card,button,badge,input,label,skeleton,
    avatar,dialog,scroll-area}.tsx

/advanced  [src/app/(dashboard)/advanced/page.tsx]
├── ./components/RebuildEmbeddings.tsx
├── ./components/SystemInfo.tsx
└── src/components/layout/AppShell.tsx

/community  [src/app/(dashboard)/community/page.tsx]
├── src/components/community/{CommunityHeader,CourseSidebar,CreatorBox,
│   PostCard,AiQuickWidget,Leaderboard,ShareMyWorkDialog,LibraryPanel}.tsx
├── src/components/common/LoadingSpinner.tsx
├── src/components/ui/{button,card,skeleton,sheet}.tsx
└── src/lib/{hooks/use-auth.ts,hooks/use-community.ts,api/community.ts,api/library.ts}

/community/ask  [src/app/(dashboard)/community/ask/page.tsx]
├── src/components/community/CommunityHeader.tsx
├── src/components/common/LoadingSpinner.tsx
├── src/components/ui/{button,badge,card,textarea}.tsx
└── src/lib/{hooks/use-community.ts,hooks/use-library.ts,
    api/community.ts,api/library.ts,utils/community-format.ts}

/features  [src/app/(dashboard)/features/page.tsx]
├── ./components/QuizRunner.tsx
├── ./components/RoadmapGraph.tsx
├── src/components/layout/AppShell.tsx
├── src/components/community/ShareToFeedButton.tsx
├── src/components/ui/{button,card,tabs,input,label,textarea,badge}.tsx
└── src/lib/hooks/use-features.ts

/notebooks  [src/app/(dashboard)/notebooks/page.tsx]
├── ./components/NotebookList.tsx
├── ./components/RecentlyViewed.tsx
├── src/components/notebooks/CreateNotebookDialog.tsx
├── src/components/layout/AppShell.tsx
└── src/lib/{hooks/use-notebooks.ts,stores/notebook-view-store.ts}

/notebooks/[id]  [src/app/(dashboard)/notebooks/[id]/page.tsx]
├── ../components/{NotebookHeader,SourcesColumn,NotesColumn,ChatColumn}.tsx
├── src/components/layout/AppShell.tsx
├── src/components/common/LoadingSpinner.tsx
└── src/lib/{hooks/use-notebooks.ts,hooks/use-sources.ts,hooks/use-notes.ts,
    stores/notebook-columns-store.ts}

/podcasts  [src/app/(dashboard)/podcasts/page.tsx]
├── src/components/podcasts/EpisodesTab.tsx
├── src/components/podcasts/TemplatesTab.tsx
├── src/components/layout/AppShell.tsx
└── src/lib/hooks/use-podcasts.ts

/search  [src/app/(dashboard)/search/page.tsx]
├── src/components/search/{SessionSidebar,AskChatView}.tsx
├── src/components/ui/{tabs,input,button,radio-group,label,checkbox,
│   card,badge,collapsible}.tsx
└── src/lib/{hooks/use-search.ts,hooks/useGlobalChat.ts,hooks/use-models.ts,
    hooks/use-modal-manager.ts}

/settings  [src/app/(dashboard)/settings/page.tsx]
├── ./components/SettingsForm.tsx
├── src/components/layout/AppShell.tsx
└── src/lib/hooks/use-settings.ts

/settings/api-keys  [src/app/(dashboard)/settings/api-keys/page.tsx]
├── src/components/settings/{MigrationBanner,ModelTestResultDialog,
│   EmbeddingModelChangeDialog}.tsx
├── src/components/layout/AppShell.tsx
└── src/lib/{hooks/use-models.ts,api/credentials.ts,types/models.ts}

/sources  [src/app/(dashboard)/sources/page.tsx]
├── src/components/layout/AppShell.tsx
├── src/components/common/{LoadingSpinner,EmptyState,ConfirmDialog}.tsx
├── src/components/ui/{badge,button}.tsx
└── src/lib/{api/sources.ts,types/api.ts}

/sources/[id]  [src/app/(dashboard)/sources/[id]/page.tsx]
├── src/components/source/{SourceDetailContent,ChatPanel}.tsx
└── src/lib/{hooks/useSourceChat.ts,hooks/use-navigation.ts}

/teacher  [src/app/(dashboard)/teacher/page.tsx]
├── src/components/layout/AppShell.tsx
├── src/components/ui/{badge,button,card,input,label,skeleton,tabs}.tsx
└── src/lib/{hooks/use-auth.ts,hooks/use-library.ts,api/community.ts}

/transformations  [src/app/(dashboard)/transformations/page.tsx]
├── ./components/{DefaultPromptEditor,TransformationsList,
│   TransformationPlayground}.tsx
├── ./components/TransformationsList.tsx -> ./TransformationCard.tsx
│   และ ./TransformationEditorDialog.tsx
├── src/components/layout/AppShell.tsx
└── src/lib/{hooks/use-transformations.ts,types/transformations.ts}
```

### ลำดับคอมโพเนนต์ย่อยในหน้า Notebook

ไฟล์ใน `src/app/(dashboard)/notebooks/components/` เป็นคอมโพเนนต์เฉพาะส่วน Notebook และต่อกันเป็นลำดับดังนี้:

```text
/notebooks
└── NotebookList.tsx
    ├── NotebookCard.tsx
    │   └── NotebookDeleteDialog.tsx
    ├── NotebookRow.tsx
    │   └── NotebookDeleteDialog.tsx
    └── RecentlyViewed.tsx

/notebooks/[id]
├── NotebookHeader.tsx
│   └── NotebookDeleteDialog.tsx
├── SourcesColumn.tsx
│   ├── src/components/sources/AddSourceDialog.tsx
│   ├── src/components/sources/AddExistingSourceDialog.tsx
│   └── src/components/sources/SourceCard.tsx
├── NotesColumn.tsx
│   └── NoteEditorDialog.tsx
└── ChatColumn.tsx
    └── src/components/source/ChatPanel.tsx
```

### Route Handlers (ไม่ใช่หน้าเว็บ)

| HTTP | URL | ไฟล์ | หน้าที่ |
|---|---|---|---|
| `GET` | `/config` | `src/app/config/route.ts` | ส่ง Runtime Config เช่น API URL และ URL แอป Quiz/Roadmap |
| `POST` | `/api/search/ask` | `src/app/api/search/ask/route.ts` | Proxy AI Ask แบบ Streaming |
| `POST` | `/api/sources/[sourceId]/chat/sessions/[sessionId]/messages` | `src/app/api/sources/[sourceId]/chat/sessions/[sessionId]/messages/route.ts` | Proxy Source Chat แบบ Streaming |
| — | — | `src/app/api/_sse-proxy.ts` | Shared SSE proxy helper |

### Auth และ Role Gate

- `src/app/(dashboard)/layout.tsx` ใช้ `useAuth()` ตรวจ session และ redirect ผู้ใช้ที่ยังไม่ login ไป `/login`
- `src/lib/roles.ts` เป็นแหล่งกำหนดสิทธิ์ Route: `student` ถูก redirect จากหน้า Staff ไป `/community`; `teacher` และ `admin` เข้าหน้า Staff ได้
- `/admin`, `/advanced`, `/settings` เป็น Admin-only; Staff route prefix อื่นได้แก่ `/teacher`, `/notebooks`, `/sources`, `/search`, `/podcasts`, `/transformations`

## 2. Frontend Project Tree Structure

โครงสร้างหลักของ `src/` และบทบาทของแต่ละส่วน:

```text
src/
├── app/                         # Route, page, layout และ Next.js route handlers
│   ├── (auth)/                  # Login/Register/Google OAuth
│   ├── (dashboard)/             # Workspace และ Feature pages (ดู Page Ownership Tree)
│   ├── api/                     # API endpoints/proxy ของ Next.js
│   ├── config/                  # Runtime config endpoint
│   ├── favicon.ico              # Browser favicon
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root metadata และ providers ชั้นบนสุด
│   └── page.tsx                 # Root redirect
├── components/                  # Shared UI และ domain components
│   ├── admin/                   # Admin panels/dialogs
│   ├── auth/                    # Login/Register forms
│   ├── common/                  # Cross-page components/utilities
│   ├── community/               # Community feed, AI widgets, sharing
│   ├── errors/                  # Connection error overlays
│   ├── layout/                  # App shell/sidebar/setup banner
│   ├── notebooks/               # Notebook dialogs/layout pieces
│   ├── podcasts/                # Podcast tabs/cards/forms
│   ├── providers/               # React context providers
│   ├── search/                  # Search/Ask chat components
│   ├── settings/                # Model/settings dialogs
│   ├── source/                  # Source detail/chat
│   ├── sources/                 # Add-source flow/list pieces
│   └── ui/                      # Reusable UI primitives
├── lib/                         # API access, hooks, state, types, utilities
│   ├── api/                     # API clients grouped by domain
│   ├── hooks/                   # Query, auth and interaction hooks
│   ├── locales/                 # i18n messages by locale
│   ├── stores/                  # Zustand stores
│   ├── types/                   # Shared TS/API models
│   ├── utils/                   # Domain-specific utility modules
│   └── *.ts                     # Config, roles, i18n, shared utilities
├── proxy.ts                     # Redirects root URL to login
└── test/                        # Test setup and declarations
```

### `lib/` แยกตามหน้าที่

```text
src/lib/
├── api/                         # Backend API clients
├── hooks/                       # Hooks ที่ประกอบ UI กับ API/query state
├── locales/                     # Locale registry และคำแปล
├── stores/                      # Global/local shared client state (Zustand)
├── types/                       # Shared domain and API types
├── utils/                       # Formatting/error/context helpers
├── config.ts                    # API/runtime configuration
├── cross-app.ts                 # Cross-app links/token handoff
├── external-apps.ts             # URL/config ของแอปภายนอก
├── i18n.ts, i18n-events.ts      # Internationalization setup/events
├── roles.ts                     # Role และ route-access policy
├── theme-script.ts              # Pre-hydration theme setup
└── utils.ts                     # Shared helpers เช่น class merge (`cn`)
```

## 3. Core Shared Components

### UI Primitives — `src/components/ui/`

UI พื้นฐานแบบ composable ใช้ Radix UI, Tailwind และ utility `cn()`:

```text
ui/
├── button.tsx                   # ปุ่ม; variants และ sizes
├── card.tsx                     # Card shell/sections
├── dialog.tsx                   # Dialog primitives
├── alert-dialog.tsx             # Dialog สำหรับยืนยัน/แจ้งเตือน
├── sheet.tsx                    # Side sheet / mobile panel
├── input.tsx, textarea.tsx      # Text input
├── label.tsx, form-section.tsx  # Form labels/sections
├── checkbox.tsx, checkbox-list.tsx, radio-group.tsx
├── select.tsx, dropdown-menu.tsx
├── tabs.tsx, accordion.tsx, collapsible.tsx
├── popover.tsx, tooltip.tsx, command.tsx
├── alert.tsx, badge.tsx, progress.tsx, skeleton.tsx, sonner.tsx
├── avatar.tsx, separator.tsx, scroll-area.tsx
├── markdown-editor.tsx, markdown-renderer.tsx
├── markdown-renderer.test.tsx  # UI test
└── wizard-container.tsx
```

### Shared Layout, Common UI และ Providers

```text
src/components/
├── layout/
│   ├── AppShell.tsx             # AppSidebar + content; SetupBanner สำหรับ Admin
│   ├── AppSidebar.tsx           # Navigation sidebar ของแอป
│   └── SetupBanner.tsx          # แจ้งการตั้งค่า AI/backend ที่ยังไม่ครบ
├── common/
│   ├── CommandPalette.tsx       # Command menu สำหรับ Staff
│   ├── ConfirmDialog.tsx        # Dialog ยืนยัน action
│   ├── ConnectionGuard.tsx      # ตรวจ/จัดการสถานะการเชื่อมต่อ
│   ├── ContextIndicator.tsx, ContextToggle.tsx
│   ├── EmptyState.tsx, LoadingSpinner.tsx
│   ├── ErrorBoundary.tsx
│   ├── InlineEdit.tsx
│   ├── LanguageLoadingOverlay.tsx, LanguageToggle.tsx
│   ├── ModelSelector.tsx, ReferencesList.tsx, ThemeToggle.tsx
│   └── ConfirmDialog.test.tsx
├── errors/ConnectionErrorOverlay.tsx
└── providers/
    ├── I18nProvider.tsx
    ├── ModalProvider.tsx
    ├── QueryProvider.tsx
    └── ThemeProvider.tsx
```

### Domain Component Folders

| โฟลเดอร์ | กลุ่มหน้าที่ใช้ |
|---|---|
| `src/components/auth/` | `/login`, `/register` |
| `src/components/admin/` | `/admin` |
| `src/components/community/` | `/community`, `/community/ask`, `/features` |
| `src/components/notebooks/` | `/notebooks` และ dialog สำหรับ Notebook |
| `src/components/podcasts/` | `/podcasts` |
| `src/components/search/` | `/search` |
| `src/components/settings/` | `/settings/api-keys` |
| `src/components/source/` | `/sources/[id]` |
| `src/components/sources/` | ขั้นตอนเพิ่ม/แนบ Source และ Source cards |

ไฟล์ที่อยู่ใต้ `src/app/(dashboard)/<feature>/components/` เป็นคอมโพเนนต์เฉพาะ Feature นั้น ส่วน `src/components/<domain>/` ใช้ร่วมข้ามหน้าได้
