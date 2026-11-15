// KMITL: the SIET frontend packages (docs/ARCHITECTURE.md). Without them this
// list is empty and the host UI is unchanged.
import platform from '@/extension'
import kmitlRag from '@siet/kmitl-rag/extension'
import community from '@siet/community/extension'
import quiz from '@siet/quiz/extension'
import roadmap from '@siet/roadmap/extension'

import type { FrontendExtension } from './extensions'

export const installed: readonly FrontendExtension[] = [platform, kmitlRag, community, quiz, roadmap]
