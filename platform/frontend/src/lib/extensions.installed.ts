// KMITL: the SIET frontend packages (docs/ARCHITECTURE.md). Without them this
// list is empty and open-notebook's UI is unchanged.
import platform from '@/extension'
import kmitlRag from '@siet/kmitl-rag/extension'
import community from '@siet/community/extension'

import type { FrontendExtension } from './extensions'

export const installed: readonly FrontendExtension[] = [platform, kmitlRag, community]
