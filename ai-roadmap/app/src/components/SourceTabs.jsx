import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, Eye, FileText, Globe2, GraduationCap, Lock, Search, Sparkles } from 'lucide-react'
import { ws } from '@/lib/api'
import { ALL_MINE, AUTO, autoGroups, NONE } from '@/lib/knowledge'

/**
 * "แหล่งความรู้" of the create form, split by where a source comes from (as on
 * the KMITL RAG AI page). "อัตโนมัติ" and "ไม่ใช้คลัง" are one choice each; in
 * the other tabs everything is ticked: whole courses, whole notebooks, all my
 * files and single files, from any tab and together (FILES).
 */

export const TABS = [
  { id: 'auto', label: 'อัตโนมัติ', icon: Sparkles },
  { id: 'mine', label: 'ไฟล์ของฉัน', icon: Lock },
  { id: 'course', label: 'รายวิชา', icon: GraduationCap },
  { id: 'staff', label: 'จากอาจารย์', icon: BookOpen },
  { id: 'none', label: 'ไม่ใช้คลัง', icon: Globe2 },
]

/** The choice a tab starts with (null = the user still has to tick something). */
export function tabDefault(tab) {
  if (tab === 'auto') return AUTO
  if (tab === 'none') return NONE
  return null
}

const SEARCH_FROM = 7
const matches = (text, q) => String(text || '').toLowerCase().includes(q.trim().toLowerCase())

function Row({ kind, checked, disabled, onChange, icon: Icon, label, meta, indent, name, onPreview }) {
  const row = (
    <label className={`src-row ${checked ? 'src-row-on' : ''} ${indent ? 'src-row-indent' : ''} ${disabled ? 'src-row-off' : ''}`} title={label}>
      <input type={kind} name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <Icon aria-hidden="true" className="src-row-icon" />
      <span className="src-row-text">
        <span className="src-row-label">{label}</span>
        {meta && <span className="src-row-meta">{meta}</span>}
      </span>
    </label>
  )
  if (!onPreview) return row
  return (
    <div className="src-row-wrap">
      {row}
      <button type="button" className="icon-button src-peek" onClick={onPreview} aria-label={`ดูเนื้อหา ${label}`} title="ดูเนื้อหา">
        <Eye aria-hidden="true" />
      </button>
    </div>
  )
}

/** "อัตโนมัติ": the libraries the AI will search, by name (nothing to tick). */
function AutoList() {
  const [items, setItems] = useState(null)
  useEffect(() => {
    let alive = true
    ws('community/knowledge/auto')
      .then((data) => alive && setItems(data.items || []))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [])
  if (items === null) return <p className="src-empty">กำลังดูว่าคุณเข้าถึงคลังไหนได้บ้าง…</p>
  const groups = autoGroups(items)
  if (!groups.length) return <p className="src-empty">ยังไม่มีคลังความรู้ที่คุณเข้าถึงได้ AI จะใช้เว็บและความรู้ทั่วไปแทน</p>
  return (
    <div className="src-auto">
      <p className="src-auto-lead">AI จะค้นจาก {items.length} คลังนี้ และเลือกเฉพาะส่วนที่ตรงกับเป้าหมาย</p>
      {groups.map((group) => (
        <div key={group.kind} className="src-auto-group">
          <p className="panel-label">{group.title}</p>
          <div className="chips">
            {group.shown.map((item) => (
              <span key={item.id} className="chip" title={item.label}>
                {item.label}
              </span>
            ))}
            {group.more > 0 && <span className="chip">และอีก {group.more}</span>}
          </div>
        </div>
      ))}
      <p className="hint">อยากเปิดดูไฟล์ในคลังไหน ไปที่แท็บ ไฟล์ของฉัน / รายวิชา / จากอาจารย์ แล้วกดรูปตา</p>
    </div>
  )
}

function Group({ item, pickedSet, covered, onTick, onPreview, filesFull, disabled, icon, children, q }) {
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
          kind="checkbox"
          checked={pickedSet.has(item.value)}
          disabled={disabled}
          onChange={() => onTick(item.value)}
          icon={icon}
          label={item.label}
          meta={item.meta}
        />
      </div>
      {expanded &&
        shown.map((child) => {
          const inWhole = covered.has(child.value)
          const on = inWhole || pickedSet.has(child.value)
          return (
            <Row
              key={child.value}
              kind="checkbox"
              indent
              checked={on}
              disabled={disabled || inWhole || child.ready === false || (!on && filesFull)}
              onChange={() => onTick(child.value)}
              icon={FileText}
              label={child.label}
              meta={inWhole ? 'รวมอยู่แล้ว' : child.ready === false ? 'ยังไม่พร้อมใช้' : undefined}
              onPreview={child.ready === false ? undefined : () => onPreview(child)}
            />
          )
        })}
    </div>
  )
}

export default function SourceTabs({ tab, onTab, groups, picked, covered, onTick, onPreview, filesFull, disabled, parked }) {
  const [q, setQ] = useState('')
  const pickedSet = useMemo(() => new Set(picked), [picked])

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

      {parked}
      {tab === 'auto' && <AutoList />}
      {tab === 'none' && <p className="src-empty">ไม่ใช้คลังความรู้ AI วางแผนจากเว็บและความรู้ทั่วไป</p>}

      {tab === 'mine' &&
        (groups.mine.length === 0 ? (
          <p className="src-empty">ยังไม่มีไฟล์ในคลังของคุณ แนบไฟล์ใหม่ได้จากปุ่มด้านล่าง</p>
        ) : (
          <div className="src-list" role="group" aria-label="ไฟล์ของฉัน">
            <Row
              kind="checkbox"
              checked={pickedSet.has(ALL_MINE)}
              disabled={disabled}
              onChange={() => onTick(ALL_MINE)}
              icon={Lock}
              label="ไฟล์ทั้งหมดของฉัน"
              meta={`${groups.mine.length} ไฟล์ · หรือติ๊กเลือกเฉพาะบางไฟล์ด้านล่าง`}
            />
            {groups.mine.map((doc) => {
              const inWhole = covered.has(doc.value)
              const on = inWhole || pickedSet.has(doc.value)
              return (
                <Row
                  key={doc.value}
                  kind="checkbox"
                  indent
                  checked={on}
                  disabled={disabled || inWhole || (!on && filesFull)}
                  onChange={() => onTick(doc.value)}
                  icon={FileText}
                  label={doc.label}
                  meta={inWhole ? 'รวมอยู่แล้ว' : undefined}
                  onPreview={() => onPreview(doc)}
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
                  pickedSet={pickedSet}
                  covered={covered}
                  onTick={onTick}
                  onPreview={onPreview}
                  filesFull={filesFull}
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

