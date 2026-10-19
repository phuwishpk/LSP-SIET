'use client'

/**
 * Stored KMITL RAG AI conversations of the signed-in user (every role).
 *
 * Reopen one to read or continue it, rename it inline, or delete it. The list
 * is the server's: it follows the account, not the browser.
 */
import { useState } from 'react'
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { RagConversation } from '@/lib/api/community'
import { useAskHistory, useDeleteConversation, useRenameConversation } from '@/lib/hooks/use-community'
import { timeAgo } from '@/lib/utils/community-format'
import { cn } from '@/lib/utils'

interface AskHistoryPanelProps {
  activeId: string | null
  onOpen: (id: string) => void
  onNew: () => void
}

export function AskHistoryPanel({ activeId, onOpen, onNew }: AskHistoryPanelProps) {
  const { data, isLoading } = useAskHistory()
  const remove = useDeleteConversation()
  const rename = useRenameConversation()
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const items = data?.items ?? []

  const commitRename = () => {
    if (!editing) return
    const title = editing.title.trim()
    if (title) rename.mutate({ id: editing.id, title })
    setEditing(null)
  }

  const confirmDelete = (c: RagConversation) => {
    if (!window.confirm(`ลบบทสนทนา “${c.title}” ?`)) return
    remove.mutate(c.id, { onSuccess: () => activeId === c.id && onNew() })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" /> ประวัติการแชท
          </span>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onNew}>
            <Plus className="h-3.5 w-3.5" /> แชทใหม่
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && <p className="px-1 text-[11px] text-muted-foreground">กำลังโหลด…</p>}
        {!isLoading && items.length === 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">
            ยังไม่มีประวัติ คำถามที่ถามจะถูกเก็บไว้ที่นี่ให้กลับมาอ่านหรือถามต่อได้
          </p>
        )}
        <ul className="max-h-[40vh] space-y-0.5 overflow-y-auto" aria-label="รายการบทสนทนา">
          {items.map((c) => {
            const active = c.id === activeId
            const isEditing = editing?.id === c.id
            return (
              <li key={c.id} className="group">
                {isEditing ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      commitRename()
                    }}
                  >
                    <Input
                      autoFocus
                      value={editing.title}
                      onChange={(e) => setEditing({ id: c.id, title: e.target.value })}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      className="h-7 text-xs"
                      maxLength={200}
                      aria-label="ชื่อบทสนทนา"
                    />
                    <button type="submit" className="rounded p-1 hover:bg-accent" aria-label="บันทึกชื่อ">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setEditing(null)} className="rounded p-1 hover:bg-accent" aria-label="ยกเลิก">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </form>
                ) : (
                  <div
                    className={cn(
                      'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition',
                      active ? 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100' : 'hover:bg-accent'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="min-w-0 flex-1 text-left"
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {c.message_count} ข้อความ · {timeAgo(c.updated_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing({ id: c.id, title: c.title })}
                      className="rounded p-1 opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100"
                      aria-label={`เปลี่ยนชื่อ ${c.title}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDelete(c)}
                      className="rounded p-1 text-destructive opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100"
                      aria-label={`ลบ ${c.title}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
