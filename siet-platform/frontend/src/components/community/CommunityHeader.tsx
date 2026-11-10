'use client'

import { useAuth } from '@/lib/hooks/use-auth'
import { NotificationsMenu } from './NotificationsMenu'
import { Navbar } from '@shared/components/Navbar'

interface CommunityHeaderProps {
  query: string
  onSearch: (q: string) => void
  onOpenPost: (postId: number) => void
  onHome: () => void
  onOpenCommunityRules?: () => void
  /**
   * Opens the navigation drawer. Only passed on pages that have a left column
   * to show; below `lg` that column is hidden, so without this the rooms,
   * library and AI tools are unreachable on a phone.
   */
  onOpenMenu?: () => void
}

export function CommunityHeader({
  query,
  onSearch,
  onOpenPost,
  onHome,
  onOpenCommunityRules,
  onOpenMenu,
}: CommunityHeaderProps) {
  const { logout } = useAuth()

  return (
    <Navbar
      searchDefaultValue={query}
      onSearch={onSearch}
      onHome={onHome}
      onOpenMenu={onOpenMenu}
      onOpenRules={onOpenCommunityRules ?? onHome}
      onLogout={() => void logout()}
      notificationsSlot={<NotificationsMenu onOpenPost={onOpenPost} />}
    />
  )
}
