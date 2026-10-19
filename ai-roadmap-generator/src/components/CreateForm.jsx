import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import { ws } from '@/lib/api'
import { AUTO, loadKnowledgeOptions, PERSONAL, scopeFields, uploadToMyLibrary } from '@/lib/knowledge'
import { clearLaunchContext, communityUrl, launchContext, sessionCode } from '@/lib/workspace'
import { useWorkspace } from '@/lib/workspace-context'
import { Share } from './icons'

// null = the AI decides how big the plan is; a number asks for exactly that many.
const NODE_COUNTS = [null, 8, 12, 15, 20]
const WEB_MODES = [
  { value: 'auto', label: 'อัตโนมัติ', hint: 'ใช้คลังความรู้ก่อน แล้วค้นเว็บเฉพาะหัวข้อที่คลังไม่มี' },
  { value: 'always', label: 'ใช้เว็บเสริมเสมอ', hint: 'ค้นเว็บเสริมทุกด่านหลัก แม้คลังความรู้จะครอบคลุมแล้ว' },
  { value: 'off', label: 'ไม่ใช้เว็บ', hint: 'ใช้เฉพาะคลังความรู้ หัวข้อที่คลังไม่มีจะมาจากความรู้ทั่วไปของ AI' },
]
const FILE_TYPES = '.pdf,.docx,.pptx,.xlsx,.csv,.md,.txt'

/** The "create a learning plan" form. */
export default function CreateForm() {
  const router = useRouter()
  const fileInput = useRef(null)
  const { balance, exempt, costs, refresh } = useWorkspace()
  const [topic, setTopic] = useState('')
  const [nodeCount, setNodeCount] = useState(null)
  const [source, setSource] = useState(AUTO)
  const [groups, setGroups] = useState([])
  const [web, setWeb] = useState('auto')
  const [file, setFile] = useState(null)
  const [stage, setStage] = useState(null)
  const busy = stage !== null

  // Load the picker, then pre-select the room or document the user came from.
  useEffect(() => {
    let alive = true
    loadKnowledgeOptions().then(({ rooms, groups: loaded }) => {
      if (!alive) return
      const context = launchContext()
      const wanted = context.doc ? `doc:${context.doc}` : context.course ? `course:${context.course}` : null
      const known = loaded.some((group) => group.options.some((option) => option.value === wanted))
      if (wanted && !known && context.course) {
        // A course room the user has not joined can still be used as a source.
        const room = rooms.find((item) => item.id === context.course)
        if (room) loaded.unshift({ label: 'ห้องที่เปิดมา', options: [{ value: wanted, label: `คลังวิชา ${room.code} ${room.name}` }] })
      }
      setGroups(loaded)
      if (wanted && loaded.some((group) => group.options.some((option) => option.value === wanted))) setSource(wanted)
    })
    return () => {
      alive = false
    }
  }, [])

  const cost = Number(costs.roadmap_generate ?? 15)
  const missing = exempt ? 0 : Math.max(0, cost - balance)
  const canSubmit = topic.trim().length >= 3 && !busy && missing === 0

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setStage('กำลังเตรียม…')
    try {
      let scope = scopeFields(source)
      if (file) {
        const doc = await uploadToMyLibrary(file, { onStage: setStage })
        scope = { scope: 'document', document_ids: [doc.id] }
      }
      setStage('AI กำลังอ่านแหล่งความรู้และวางแผน ใช้เวลาประมาณครึ่งนาทีถึงหนึ่งนาที')
      const result = await ws('community/study/roadmap', {
        method: 'POST',
        json: { description: topic.trim(), ...(nodeCount ? { node_count: nodeCount } : {}), language: 'th', web, ...scope },
      })
      clearLaunchContext()
      refresh().catch(() => {})
      router.push(`/roadmap/${sessionCode(result.session_id)}`)
    } catch (error) {
      if (error?.status === 402) refresh().catch(() => {})
      toast.error(error?.message || 'สร้าง Roadmap ไม่สำเร็จ')
      setStage(null)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1 className="h1">สร้างแผนการเรียน</h1>

      <div className="field">
        <label htmlFor="topic">หัวข้อหรือเป้าหมายที่อยากเรียน</label>
        <textarea
          id="topic"
          rows={4}
          maxLength={2000}
          placeholder="เช่น อยากเรียนพื้นฐาน Python ให้ทันสอบย่อยครั้งที่ 1"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          disabled={busy}
        />
      </div>

      <div className="field">
        <label htmlFor="source">แหล่งความรู้</label>
        {file ? (
          <div className="attached">
            <span>
              ไฟล์ที่แนบ: <strong>{file.name}</strong>
            </span>
            <button type="button" className="link-button" onClick={() => setFile(null)} disabled={busy}>
              เอาไฟล์ออก
            </button>
          </div>
        ) : (
          <select id="source" value={source} onChange={(event) => setSource(event.target.value)} disabled={busy}>
            <option value={AUTO}>อัตโนมัติ (ทุกคลังที่ฉันเห็นได้)</option>
            <option value={PERSONAL}>ไฟล์ของฉันทั้งหมด</option>
            {groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
        <div className="attach-row">
          <input
            ref={fileInput}
            type="file"
            accept={FILE_TYPES}
            hidden
            onChange={(event) => {
              setFile(event.target.files?.[0] || null)
              event.target.value = ''
            }}
          />
          <button type="button" className="btn" onClick={() => fileInput.current?.click()} disabled={busy}>
            <Share />
            แนบไฟล์ใหม่
          </button>
          <span className="hint">ไฟล์ที่แนบจะถูกเก็บใน “ไฟล์ของฉัน” และใช้กับ RAG กับ Quiz ได้ด้วย</span>
        </div>
      </div>

      <fieldset className="field">
        <legend>การใช้ข้อมูลจากเว็บ</legend>
        <div className="segmented">
          {WEB_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              className={`segment ${mode.value === web ? 'segment-on' : ''}`}
              aria-pressed={mode.value === web}
              onClick={() => setWeb(mode.value)}
              disabled={busy}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <p className="hint">{WEB_MODES.find((mode) => mode.value === web)?.hint}</p>
      </fieldset>

      <fieldset className="field">
        <legend>จำนวนด่าน</legend>
        <div className="segmented">
          {NODE_COUNTS.map((count) => (
            <button
              key={count ?? 'auto'}
              type="button"
              className={`segment ${count === nodeCount ? 'segment-on' : ''}`}
              aria-pressed={count === nodeCount}
              onClick={() => setNodeCount(count)}
              disabled={busy}
            >
              {count ?? 'AI กำหนดเอง'}
            </button>
          ))}
        </div>
        <p className="hint">
          {nodeCount
            ? `ขอแผนขนาด ${nodeCount} ด่านพอดี`
            : 'AI ดูจากหัวข้อและแหล่งความรู้ แล้วตัดสินใจเองว่าควรมีกี่ด่าน'}
        </p>
      </fieldset>

      <div className="submit-row">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!canSubmit}>
          {busy ? 'กำลังสร้าง…' : exempt ? 'สร้าง Roadmap' : `สร้าง Roadmap · ${cost} แต้ม`}
        </button>
        <span className="muted">{exempt ? 'ไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)' : `แต้มคงเหลือ ${balance} แต้ม`}</span>
      </div>

      {missing > 0 && (
        <p className="notice notice-warn">
          ขาดอีก {missing} แต้ม · ได้แต้มเพิ่มจากการโพสต์สรุปหรือเมื่อมีคนกดถูกใจโพสต์ของคุณใน{' '}
          <a href={communityUrl()}>Community</a>
        </p>
      )}
      {busy && (
        <div className="progress" role="status">
          <div className="progress-bar" />
          <span className="muted">{stage}</span>
        </div>
      )}
    </form>
  )
}
