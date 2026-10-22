/**
 * @siet/kmitl-rag as an open-notebook frontend extension
 * (open-notebook/frontend/src/lib/extensions.ts).
 */
import type { FrontendExtension } from '@/lib/extensions'

import { MessageReferences } from '@siet/kmitl-rag/components/common/MessageReferences'
import WorkspaceSearchPage from '@siet/kmitl-rag/components/search/WorkspaceSearchPage'
import { autoTitleNotebookSession } from '@siet/kmitl-rag/lib/api/global-chat'

const extension: FrontendExtension = {
  slots: {
    // /search: the Ask tab is a persistent chat across notebooks (global chat)
    'search.page': WorkspaceSearchPage,
    // every chat: sources, notes and URLs behind each AI answer
    'chat.message-footer': MessageReferences,
  },

  events: {
    // Generate a proper title once the model has replied. Any failure is
    // silent - the truncated placeholder title stays as a fallback.
    'notebook-chat.first-reply': ({ sessionId, refresh }: { sessionId: string; refresh: () => void }) => {
      autoTitleNotebookSession(sessionId).then(refresh).catch(() => {})
    },
  },
}

export default extension
