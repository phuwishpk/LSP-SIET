import { useMemo, useState } from 'react'
import { BookOpen, ChevronRight, FileText, Globe2, GraduationCap, Lock, Search, Sparkles } from 'lucide-react'
import { AUTO, NONE, PERSONAL } from '@/lib/knowledge'

/**
 * "แหล่งความรู้" of the create form, split by where a source comes from (as on
 * the KMITL RAG AI page). One choice per form - AI decides / my files / a whole
 * course / a whole notebook / no library - or several ticked files (FILES),
 * which may come from any tab.
 */

export const TABS = [
  { id: 'auto', label: 'อัตโนมัติ', icon: Sparkles },
  { id: 'mine', label: 'ไฟล์ของฉัน', icon: Lock },
  { id: 'course', label: 'รายวิชา', icon: GraduationCap },
  { id: 'staff', label: 'จากอาจารย์', icon: BookOpen },
  { id: 'none', label: 'ไม่ใช้คลัง', icon: Globe2 },
]

/** The choice a tab starts with (null = the user still has to pick in it). */
export function tabDefault(tab) {
  if (tab === 'auto') return AUTO
  if (tab === 'none') return NONE
  if (tab === 'mine') return PERSONAL
  return null
}

const SEARCH_FROM = 7
const matches = (text, q) => String(text || '').toLowerCase().includes(q.trim().toLowerCase())

function Row({ kind, checked, disabled, onChange, icon: Icon, label, meta, indent, name }) {
  return (
    <label className={`src-row ${checked ? 'src-row-on' : ''} ${indent ? 'src-row-indent' : ''} ${disabled ? 'src-row-off' : ''}`} title={label}>
      <input type={kind} name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <Icon aria-hidden="true" className="src-row-icon" />
      <span className="src-row-text">
        <span className="src-row-label">{label}</span>
        {meta && <span className="src-row-meta">{meta}</span>}
      </span>
    </label>
  )
}

function Group({ item, choice, pickedSet, onChoice, onTick, atLimit, disabled, icon, children, q }) {
  const [open, setOpen] = useState(false)
  const shown = q && !matches(item.label, q) ? children.filter((c) => matches(c.label, q)) : children
  const expanded = open || (Boolean(q) && !matches(item.label, q) && shown.length > 0)
  return (
    <div className="src-group">
      <div className="src-group-head">
        {children.length > 0 ? (
          <button
            type="button"
            className="src-toggle"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'ซ่อน' : 'แสดง'}เอกสารใน ${item.label}`}
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
          >
            <ChevronRight aria-hidden="true" className={expanded ? 'src-toggle-open' : ''} />
          </button>
        ) : (
          <span className="src-toggle-spacer" />
        )}
        <Row
          kind="radio"
          name="src-whole"
          checked={choice === item.value}
          disabled={disabled}
          onChange={() => onChoice(item.value)}
          icon={icon}
          label={item.label}
          meta={item.meta}
        />
      </div>
      {expanded &&
        shown.map((child) => {
          const on = pickedSet.has(child.value)
          return (
            <Row
              key={child.value}
              kind="checkbox"
              indent
              checked={on}
              disabled={disabled || child.ready === false || (!on && atLimit)}
              onChange={() => onTick(child.value)}
              icon={FileText}
              label={child.label}
              meta={child.ready === false ? 'ยังไม่พร้อมใช้' : undefined}
            />
          )
        })}
    </div>
  )
}

export default function SourceTabs({ tab, onTab, groups, choice, onChoice, picked, onTick, pickLimit, disabled }) {
  const [q, setQ] = useState('')
  const pickedSet = useMemo(() => new Set(picked), [picked])
  const atLimit = picked.length >= pickLimit

  const list = tab === 'course' ? groups.courses : tab === 'staff' ? groups.staff : []
  const shownList = q
    ? list.filter((item) => matches(item.label, q) || matches(item.meta, q) || (item.docs || item.sources || []).some((c) => matches(c.label, q)))
    : list

  return (
    <div className="src">
      <div className="src-tabs" role="tablist" aria-label="แหล่งความรู้">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`src-tab ${tab === id ? 'src-tab-on' : ''}`}
            onClick={() => {
              setQ('')
              onTab(id)
            }}
            disabled={disabled}
          >
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' &&
        (groups.mine.length === 0 ? (
          <p className="src-empty">ยังไม่มีไฟล์ในคลังของคุณ แนบไฟล์ใหม่ได้จากปุ่มด้านล่าง</p>
        ) : (
          <div className="src-list" role="group" aria-label="ไฟล์ของฉัน">
            <Row
              kind="radio"
              name="src-whole"
              checked={choice === PERSONAL}
              disabled={disabled}
              onChange={() => onChoice(PERSONAL)}
              icon={Lock}
              label="ไฟล์ทั้งหมดของฉัน"
              meta={`${groups.mine.length} ไฟล์ · หรือติ๊กเลือกเฉพาะบางไฟล์ด้านล่าง`}
            />
            {groups.mine.map((doc) => {
              const on = pickedSet.has(doc.value)
              return (
                <Row
                  key={doc.value}
                  kind="checkbox"
                  indent
                  checked={on}
                  disabled={disabled || (!on && atLimit)}
                  onChange={() => onTick(doc.value)}
                  icon={FileText}
                  label={doc.label}
                />
              )
            })}
          </div>
        ))}

      {(tab === 'course' || tab === 'staff') &&
        (list.length === 0 ? (
          <p className="src-empty">
            {tab === 'course' ? 'ยังไม่มีวิชาที่คุณเข้าร่วมหรือวิชาที่มีเอกสารให้ใช้' : 'ยังไม่มี notebook ที่อาจารย์หรือผู้ดูแลแชร์ไว้'}
          </p>
        ) : (
          <>
            {list.length >= SEARCH_FROM && (
              <label className="src-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder={tab === 'course' ? 'ค้นรหัสหรือชื่อวิชา…' : 'ค้นชื่อ notebook หรือเอกสาร…'}
                  aria-label={tab === 'course' ? 'ค้นรหัสหรือชื่อวิชา' : 'ค้นชื่อ notebook หรือเอกสาร'}
                  disabled={disabled}
                />
              </label>
            )}
            <div className="src-list" role="group" aria-label={tab === 'course' ? 'รายวิชา' : 'notebook จากอาจารย์'}>
              {shownList.length === 0 && <p className="src-empty">ไม่พบรายการที่ตรงกับ “{q}”</p>}
              {shownList.map((item) => (
                <Group
                  key={item.value}
                  item={
                    tab === 'course'
                      ? { ...item, meta: `${item.joined ? 'เข้าร่วมแล้ว' : 'ห้องเปิด'}${item.docs.length ? ` · ${item.docs.length} เอกสาร` : ''}` }
                      : { ...item, meta: `${item.meta ? `${item.meta} · ` : ''}${item.sources.length} เอกสาร` }
                  }
                  choice={choice}
                  pickedSet={pickedSet}
                  onChoice={onChoice}
                  onTick={onTick}
                  atLimit={atLimit}
                  disabled={disabled}
                  icon={tab === 'course' ? GraduationCap : BookOpen}
                  q={q}
                >
                  {tab === 'course' ? item.docs : item.sources}
                </Group>
              ))}
            </div>
          </>
        ))}
    </div>
  )
}

