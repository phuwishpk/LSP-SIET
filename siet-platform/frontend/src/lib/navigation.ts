import type { TFunction } from 'i18next'
import {
  Bot,
  Book,
  BrainCircuit,
  Database,
  FileText,
  GraduationCap,
  Map,
  MessageSquare,
  Search,
  Settings,
  Shuffle,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'

import { isAdmin, isStaff, type Role } from '@siet/platform/lib/roles'

/**
 * The workspace sidebar: SIET Space first, open-notebook's research tools for
 * staff only, AI features in place of podcasts, and one group per admin
 * console. It replaces open-notebook's sections rather than adding to them.
 */
export const getWorkspaceNavigation = (t: TFunction, role: Role) => [
  {
    title: t('navigation.community', 'SIET Space'),
    items: [
      { name: t('navigation.communityFeed', 'ชุมชน (Community)'), href: '/community', icon: Users },
    ],
  },
  ...(isStaff(role)
    ? [
        {
          title: t('navigation.collect'),
          items: [{ name: t('navigation.sources'), href: '/sources', icon: FileText }],
        },
      ]
    : []),
  ...(isStaff(role)
    ? [
        {
          title: t('navigation.process'),
          items: [
            { name: t('navigation.notebooks'), href: '/notebooks', icon: Book },
            { name: t('navigation.askAndSearch'), href: '/search', icon: Search },
          ],
        },
      ]
    : []),
  {
    title: t('navigation.create'),
    items: [
      { name: t('navigation.features', 'AI Features'), href: '/features', icon: Sparkles },
    ],
  },
  // The admin consoles, one group per area. What belongs to no single area
  // (accounts, points, AI cost, health) stays under "จัดการระบบ" in Manage.
  ...(isAdmin(role)
    ? [
        {
          title: t('navigation.manageCommunity', 'จัดการ Community'),
          items: [
            { name: t('navigation.adminCommunity', 'Community'), href: '/admin/community', icon: MessageSquare },
          ],
        },
        {
          title: t('navigation.manageAi', 'จัดการ AI'),
          items: [
            { name: t('navigation.adminRag', 'RAG AI'), href: '/admin/rag', icon: Database },
            { name: t('navigation.adminRoadmap', 'AI Roadmap'), href: '/admin/roadmap', icon: Map },
          ],
        },
        {
          title: t('navigation.manageQuiz', 'จัดการ Quiz'),
          items: [{ name: t('navigation.adminQuiz', 'Quiz'), href: '/admin/quiz', icon: BrainCircuit }],
        },
      ]
    : []),
  ...(isStaff(role) ? [{
    title: t('navigation.manage'),
    items: [
      { name: t('navigation.teacherConsole', 'จัดการการสอน'), href: '/teacher', icon: GraduationCap },
      ...(isAdmin(role) ? [{ name: t('navigation.models'), href: '/settings/api-keys', icon: Bot }] : []),
      { name: t('navigation.transformations'), href: '/transformations', icon: Shuffle },
      ...(isAdmin(role)
        ? [
            { name: t('navigation.adminConsole', 'จัดการระบบ'), href: '/admin', icon: ShieldCheck },
            { name: t('navigation.settings'), href: '/settings', icon: Settings },
            { name: t('navigation.advanced'), href: '/advanced', icon: Wrench },
          ]
        : []),
    ],
  }]
    : []),
]
