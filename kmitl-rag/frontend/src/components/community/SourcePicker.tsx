'use client'

/**
 * "ค้นคำตอบจาก" on KMITL RAG AI: sources split into tabs by where they come
 * from (every source / my files / courses / teacher & admin notebooks / other
 * users' notebooks for admins), each tab a radio list that can be narrowed to
 * one document. The choice itself lives in the page (see source-choice.ts).
 */

import { useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  ChevronRight,
  FileText,
  Globe2,
  GraduationCap,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { KnowledgeNotebook, LibraryDocument } from '@/lib/api/library'
import { cn } from '@/lib/utils'
import {
  emptyChoice,
  tabOf,
  type NotebookTab,
  type SourceChoice,
  type SourceTab,
} from '@siet/kmitl-rag/lib/utils/source-choice'

/** Above this many entries a tab gets a search box. */
const SEARCH_FROM = 7

const TABS: { tab: SourceTab; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { tab: 'auto', label: 'ทุกแหล่ง', icon: Globe2 },
  { tab: 'mine', label: 'ไฟล์ของฉัน', icon: Lock },
  { tab: 'course', label: 'รายวิชา', icon: GraduationCap },
  { tab: 'staff', label: 'จากอาจารย์/ผู้ดูแล', icon: BookOpen },
  { tab: 'users', label: 'ของผู้ใช้', icon: ShieldCheck, adminOnly: true },
]

const EMPTY_TEXT: Record<Exclude<SourceTab, 'auto'>, string> = {
  mine: 'คุณยังไม่ได้อัปโหลดไฟล์ที่พร้อมให้ AI อ่าน',
  course: 'ยังไม่มีคลังเอกสารของรายวิชาที่คุณเข้าถึงได้',
  staff: 'ยังไม่มี notebook ที่อาจารย์หรือผู้ดูแลแชร์ไว้',
  users: 'ยังไม่มี notebook ส่วนตัวของผู้ใช้ที่มีเอกสาร',
}

interface SourcePickerProps {
  value: SourceChoice
  onChange: (choice: SourceChoice) => void
  notebooks: readonly KnowledgeNotebook[]
  myDocs: readonly Pick<LibraryDocument, 'id' | 'title'>[]
  /** Admins also get the "ของผู้ใช้" tab. */
  seesEverything: boolean
  onAdd: () => void
}

export function SourcePicker({ value, onChange, notebooks, myDocs, seesEverything, onAdd }: SourcePickerProps) {
  // Coming back to a tab restores what was picked there.
  const lastByTab = useRef<Partial<Record<SourceTab, SourceChoice>>>({})
  lastByTab.current[value.tab] = value

  const tabs = TABS.filter((t) => !t.adminOnly || seesEverything)

  return (
    <div className="space-y-2.5">
      <div role="tablist" aria-label="แหล่งที่มาของคำตอบ" className="flex flex-wrap gap-1.5">
        {tabs.map(({ tab, label, icon: Icon }) => {
          const active = value.tab === tab
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => !active && onChange(lastByTab.current[tab] ?? emptyChoice(tab))}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                active
                  ? 'border-transparent bg-primary/15 text-primary dark:bg-primary/25'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {value.tab === 'mine' && <MyFilesPanel value={value} onChange={onChange} myDocs={myDocs} onAdd={onAdd} />}
      {(value.tab === 'course' || value.tab === 'staff' || value.tab === 'users') && (
        <NotebookPanel
          tab={value.tab}
          value={value}
          onChange={onChange}
          notebooks={notebooks.filter((nb) => tabOf(nb) === value.tab)}
          onAdd={onAdd}
        />
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- rows */

function RadioRow({
  checked,
  disabled,
  onSelect,
  icon: Icon,
  title,
  meta,
  indent,
}: {
  checked: boolean
  disabled?: boolean
  onSelect: () => void
  icon: LucideIcon
  title: string
  meta?: string
  indent?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        indent && 'pl-7',
        checked ? 'bg-primary/10 text-foreground' : 'hover:bg-accent',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
          checked ? 'border-primary' : 'border-muted-foreground/50'
        )}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      </span>
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {meta && <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>}
      </span>
    </button>
  )
}

function EmptyTab({ text, onAdd }: { text: string; onAdd: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed px-3 py-3 text-center">
      <p className="text-[11px] text-muted-foreground">{text}</p>
      <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" /> เพิ่มเนื้อหาให้ AI อ่าน
      </Button>
    </div>
  )
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-lg border bg-background pl-7 pr-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  )
}

const matches = (text: string, q: string) => text.toLowerCase().includes(q.trim().toLowerCase())

/* --------------------------------------------------------------- panels */

function MyFilesPanel({
  value,
  onChange,
  myDocs,
  onAdd,
}: {
  value: Extract<SourceChoice, { tab: 'mine' }>
  onChange: (c: SourceChoice) => void
  myDocs: SourcePickerProps['myDocs']
  onAdd: () => void
}) {
  const [q, setQ] = useState('')
  if (myDocs.length === 0) return <EmptyTab text={EMPTY_TEXT.mine} onAdd={onAdd} />
  const shown = q ? myDocs.filter((d) => matches(d.title, q)) : myDocs
  return (
    <div className="space-y-1.5">
      {myDocs.length >= SEARCH_FROM && <SearchBox value={q} onChange={setQ} placeholder="ค้นชื่อไฟล์…" />}
      <div role="radiogroup" aria-label="ไฟล์ของฉัน" className="max-h-64 space-y-0.5 overflow-y-auto">
        <RadioRow
          checked={value.docId == null}
          onSelect={() => onChange({ tab: 'mine', docId: null })}
          icon={Lock}
          title="ไฟล์ทั้งหมดของฉัน"
          meta={`${myDocs.length} ไฟล์ · คนอื่นไม่เห็น`}
        />
        {shown.map((d) => (
          <RadioRow
            key={d.id}
            checked={value.docId === d.id}
            onSelect={() => onChange({ tab: 'mine', docId: d.id })}
            icon={FileText}
            title={d.title}
            indent
          />
        ))}
      </div>
    </div>
  )
}

function NotebookPanel({
  tab,
  value,
  onChange,
  notebooks,
  onAdd,
}: {
  tab: NotebookTab
  value: SourceChoice
  onChange: (c: SourceChoice) => void
  notebooks: readonly KnowledgeNotebook[]
  onAdd: () => void
}) {
  const [q, setQ] = useState('')
  const picked = value.tab === tab ? value : null
  const pickedSource = picked && 'sourceId' in picked ? picked.sourceId : undefined
  const [open, setOpen] = useState<Set<string>>(() => {
    // the notebook holding a deep-linked document starts expanded
    const holder = notebooks.find((nb) => pickedSource && nb.sources.some((s) => s.id === pickedSource))
    return new Set(holder ? [holder.id] : [])
  })

  const shown = useMemo(
    () =>
      q
        ? notebooks.filter(
            (nb) => matches(nb.name, q) || matches(nb.owner_label, q) || nb.sources.some((s) => matches(s.title, q))
          )
        : notebooks,
    [notebooks, q]
  )

  if (notebooks.length === 0) return <EmptyTab text={EMPTY_TEXT[tab]} onAdd={onAdd} />

  const choose = (nb: KnowledgeNotebook, sourceId?: string): SourceChoice => {
    const narrow = sourceId ? { sourceId } : {}
    if (tab === 'course') return { tab, courseId: nb.course_id as number, ...narrow }
    return { tab, notebookId: nb.id, ...narrow }
  }
  const isWhole = (nb: KnowledgeNotebook) =>
    !!picked &&
    !pickedSource &&
    (picked.tab === 'course' ? picked.courseId === nb.course_id : 'notebookId' in picked && picked.notebookId === nb.id)
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-1.5">
      {notebooks.length >= SEARCH_FROM && (
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={tab === 'course' ? 'ค้นรหัสหรือชื่อวิชา…' : 'ค้นชื่อ notebook หรือเอกสาร…'}
        />
      )}
      <div
        role="radiogroup"
        aria-label={TABS.find((t) => t.tab === tab)?.label}
        className="max-h-72 space-y-0.5 overflow-y-auto"
      >
        {shown.length === 0 && <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">ไม่พบรายการที่ตรงกับ “{q}”</p>}
        {shown.map((nb) => {
          const expanded = open.has(nb.id) || (!!q && !matches(nb.name, q))
          return (
            <div key={nb.id}>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? 'ซ่อน' : 'แสดง'}เอกสารใน ${nb.name}`}
                  onClick={() => toggle(nb.id)}
                  className="flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
                </button>
                <RadioRow
                  checked={isWhole(nb)}
                  onSelect={() => onChange(choose(nb))}
                  icon={tab === 'course' ? GraduationCap : BookOpen}
                  title={`${nb.visibility === 'private' ? '🔒 ' : ''}${nb.name}`}
                  meta={`${nb.owner_label} · ${nb.source_count} เอกสาร${nb.archived ? ' · เก็บถาวร' : ''}`}
                />
              </div>
              {expanded && (
                <div className="space-y-0.5 pb-1">
                  {nb.sources
                    .filter((s) => !q || matches(nb.name, q) || matches(s.title, q))
                    .map((s) => (
                      <RadioRow
                        key={s.id}
                        checked={pickedSource === s.id}
                        disabled={s.chunks === 0}
                        onSelect={() => onChange(choose(nb, s.id))}
                        icon={FileText}
                        title={s.title}
                        meta={s.chunks === 0 ? 'ยังไม่พร้อมค้น' : undefined}
                        indent
                      />
                    ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
