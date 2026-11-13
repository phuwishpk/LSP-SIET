import { useState } from 'react'
import { categoryColor } from '@/lib/roadmap-layout'
import { External, Plus } from './icons'

function Sources({ sources }) {
  const library = (sources || []).filter((s) => s.kind === 'library' || s.kind === 'private')
  const web = (sources || []).filter((s) => s.kind === 'web' && s.url)
  if (!library.length && !web.length) return null
  return (
    <>
      {library.length > 0 && (
        <section className="panel-section">
          <h3 className="panel-label">จากคลังความรู้</h3>
          {library.map((source, index) => (
            <div className="source" key={`lib-${index}`}>
              {source.kind === 'private' ? 'ไฟล์ส่วนตัวของผู้สร้าง' : source.title}
              {source.origin && <span className="source-meta">{source.origin}</span>}
            </div>
          ))}
        </section>
      )}
      {web.length > 0 && (
        <section className="panel-section">
          <h3 className="panel-label">จากเว็บ</h3>
          {web.map((source, index) => (
            <a className="source source-link" key={`web-${index}`} href={source.url} target="_blank" rel="noopener noreferrer">
              <span>
                {source.title || source.url}
                <span className="source-meta">{hostOf(source.url)}</span>
              </span>
              <External />
            </a>
          ))}
          <p className="hint">ข้อมูลจากเว็บ ควรตรวจสอบก่อนนำไปใช้</p>
        </section>
      )}
    </>
  )
}

// Every node lists its own pages; the plan-wide list is a summary, so it starts short.
const PLAN_PAGES_PREVIEW = 8

/** What the whole plan was built from, shown before any node is selected. */
function PlanGrounding({ grounding }) {
  const [showAll, setShowAll] = useState(false)
  if (!grounding) return null
  const pages = (grounding.web_sources || []).map((page) => ({ kind: 'web', ...page }))
  const shown = showAll ? pages : pages.slice(0, PLAN_PAGES_PREVIEW)
  return (
    <>
      <section className="panel-section">
        <h3 className="panel-label">แหล่งความรู้ที่ใช้</h3>
        <div className="source">
          <span>
            {grounding.label}
            {grounding.scope_label && <span className="source-meta">{grounding.scope_label}</span>}
          </span>
        </div>
        {grounding.web_mode !== 'off' && grounding.web_available === false && (
          <p className="hint">โมเดลที่ตั้งค่าไว้ค้นเว็บไม่ได้ แผนนี้จึงไม่มีข้อมูลจากเว็บ</p>
        )}
        {grounding.web_empty && <p className="hint">ค้นเว็บแล้ว แต่ไม่พบหน้าที่ใช้อ้างอิงได้</p>}
      </section>
      <Sources sources={shown} />
      {pages.length > PLAN_PAGES_PREVIEW && (
        <button type="button" className="link-button" onClick={() => setShowAll((value) => !value)}>
          {showAll ? 'ย่อรายการ' : `ดูหน้าเว็บทั้งหมด ${pages.length} หน้า`}
        </button>
      )}
    </>
  )
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Details of the selected node. `expand` is optional: when present the panel
 * offers "ขยายหัวข้อนี้" ({ cost, exempt, disabledReason, busy, onExpand }).
 */
export default function NodePanel({ roadmap, node, mainIndex, childCount, expand }) {
  if (!node) {
    return (
      <aside className="panel">
        <section className="panel-section">
          <h2 className="h3">{roadmap?.title}</h2>
          {roadmap?.description && <p className="body">{roadmap.description}</p>}
        </section>
        <PlanGrounding grounding={roadmap?.grounding} />
        <p className="hint">กดที่หัวข้อในแผนเพื่อดูคำอธิบายและที่มา</p>
      </aside>
    )
  }

  const color = categoryColor(node.category)
  return (
    <aside className="panel">
      <section className="panel-section">
        <div className="chips">
          {node.category && (
            <span className="chip" style={{ color, borderColor: color }}>
              {node.category}
            </span>
          )}
          <span className="chip">{mainIndex ? `หัวข้อที่ ${mainIndex}` : 'หัวข้อย่อย'}</span>
        </div>
        <h2 className="h3">{node.label}</h2>
        {node.description ? <p className="body">{node.description}</p> : <p className="hint">หัวข้อนี้ยังไม่มีคำอธิบาย</p>}
      </section>

      <Sources sources={node.sources} />

      {childCount > 0 && <p className="hint">มีหัวข้อย่อย {childCount} หัวข้อแตกออกจากหัวข้อนี้</p>}

      {expand && (
        <section className="panel-footer">
          <button
            type="button"
            className="btn btn-outline-accent btn-block"
            disabled={Boolean(expand.disabledReason) || expand.busy}
            onClick={expand.onExpand}
          >
            <Plus />
            {expand.busy ? 'กำลังขยาย…' : expand.exempt ? 'ขยายหัวข้อนี้' : `ขยายหัวข้อนี้ · ${expand.cost} แต้ม`}
          </button>
          <p className="hint center">
            {expand.busy
              ? 'AI กำลังค้นแหล่งความรู้และแตกหัวข้อย่อย ใช้เวลาประมาณครึ่งนาที'
              : expand.disabledReason || 'AI แตกหัวข้อนี้เป็นหัวข้อย่อยเท่าที่เนื้อหาต้องใช้ โดยใช้แหล่งความรู้ชุดเดิม'}
          </p>
        </section>
      )}
    </aside>
  )
}
