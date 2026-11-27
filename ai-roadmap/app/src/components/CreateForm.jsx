import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import { Paperclip, X } from 'lucide-react'
import { PinkOwlMascot } from '@shared/mascot'
import { ws } from '@/lib/api'
import {
  AUTO,
  coveredValues,
  FILES,
  loadKnowledge,
  MAX_PICKED_FILES,
  scopeFields,
  sourceSummary,
  togglePick,
  uploadToMyLibrary,
} from '@/lib/knowledge'
import { clearLaunchContext, communityUrl, launchContext, sessionCode } from '@/lib/workspace'
import { useWorkspace } from '@/lib/workspace-context'
import SourceTabs, { tabDefault } from './SourceTabs'

// null = the AI decides how big the plan is; a number asks for exactly that many.
const NODE_COUNTS = [null, 8, 12, 15, 20]
const WEB_MODES = [
  { value: 'auto', label: 'อัตโนมัติ', hint: 'ใช้คลังความรู้ก่อน เสริมเนื้อหาจากเว็บเฉพาะหัวข้อที่คลังไม่มี และแนบลิงก์อ่านเพิ่มทุกหัวข้อ' },
  { value: 'always', label: 'เสริมเสมอ', hint: 'เสริมเนื้อหาจากเว็บทุกหัวข้อ แม้คลังความรู้จะครอบคลุมแล้ว' },
  { value: 'off', label: 'ไม่ใช้เว็บ', hint: 'ใช้เฉพาะคลังความรู้ หัวข้อที่คลังไม่มีจะมาจากความรู้ทั่วไปของ AI' },
]
// What the learner tells the AI about themselves (null = not given).
const LEVELS = [
  { value: null, label: 'ไม่ระบุ' },
  { value: 'beginner', label: 'เริ่มจากศูนย์', hint: 'เริ่มจากพื้นฐานที่สุด อธิบายศัพท์ใหม่ทุกคำ' },
  { value: 'intermediate', label: 'มีพื้นฐานบ้าง', hint: 'ข้ามเรื่องพื้นฐานไปเร็วๆ แล้วลงลึกขึ้น' },
  { value: 'advanced', label: 'ลงลึก', hint: 'ข้ามพื้นฐาน เน้นหัวข้อขั้นสูงและรายละเอียด' },
]
const DURATIONS = [
  { value: null, label: 'ไม่ระบุ' },
  { value: '1w', label: '1 สัปดาห์' },
  { value: '2w', label: '2 สัปดาห์' },
  { value: '1m', label: '1 เดือน' },
  { value: 'semester', label: '1 ภาคเรียน' },
]
const FOCUSES = [
  { value: null, label: 'สมดุล' },
  { value: 'theory', label: 'เข้าใจทฤษฎี', hint: 'เน้นเข้าใจแนวคิดและที่มา' },
  { value: 'practice', label: 'ฝึกลงมือ', hint: 'มีแบบฝึกหรืองานเล็กๆ ทุกขั้น' },
  { value: 'project', label: 'ทำโปรเจกต์', hint: 'สร้างโปรเจกต์หนึ่งชิ้นทีละขั้น ทุกหัวข้อหลักต่อยอดกัน' },
  { value: 'exam', label: 'เตรียมสอบ', hint: 'เน้นหัวข้อที่ออกสอบ แบบฝึก และการทบทวน' },
]
const FILE_TYPES = '.pdf,.docx,.pptx,.xlsx,.csv,.md,.txt'

/** A row of connected buttons that picks one value (null allowed). */
function Segments({ legend, options, value, onChange, hint }) {
  return (
    <fieldset className="field">
      <legend>{legend}</legend>
      <div className="segmented segmented-wrap" role="group">
        {options.map((option) => (
          <button
            key={option.value ?? 'none'}
            type="button"
            className={`segment ${option.value === value ? 'segment-on' : ''}`}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  )
}
const EMPTY_GROUPS = { mine: [], courses: [], staff: [] }

/** The "create a learning plan" form. */
export default function CreateForm() {
  const router = useRouter()
  const fileInput = useRef(null)
  const { balance, exempt, costs, refresh } = useWorkspace()
  const [topic, setTopic] = useState('')
  const [nodeCount, setNodeCount] = useState(null)
  const [tab, setTab] = useState('auto')
  const [choice, setChoice] = useState(AUTO)
  const [groups, setGroups] = useState(EMPTY_GROUPS)
  const [picked, setPicked] = useState([])
  const [web, setWeb] = useState('auto')
  const [level, setLevel] = useState(null)
  const [duration, setDuration] = useState(null)
  const [focus, setFocus] = useState(null)
  const [file, setFile] = useState(null)
  const [stage, setStage] = useState(null)
  const busy = stage !== null

  // Load the picker, then pre-select the room or document the user came from.
  useEffect(() => {
    let alive = true
    const context = launchContext()
    loadKnowledge({ courseId: context.course ?? undefined }).then((loaded) => {
      if (!alive) return
      setGroups(loaded)
      if (context.doc) {
        const value = `doc:${context.doc}`
        const course = loaded.courses.find((c) => c.docs.some((d) => d.value === value))
        if (course || loaded.mine.some((d) => d.value === value)) {
          setTab(course ? 'course' : 'mine')
          setChoice(FILES)
          setPicked([value])
          return
        }
      }
      if (context.course && loaded.courses.some((c) => c.id === context.course)) {
        setTab('course')
        setChoice(FILES)
        setPicked([`course:${context.course}`])
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const cost = Number(costs.roadmap_generate ?? 15)
  const missing = exempt ? 0 : Math.max(0, cost - balance)
  const noFilesYet = choice === FILES && picked.length === 0 && !file
  const canSubmit = topic.trim().length >= 3 && !busy && missing === 0 && choice !== null && !noFilesYet
  // An attached file is sent as one more document, inside the same limit.
  const filesFull = picked.filter((v) => v.startsWith('doc:') || v.startsWith('src:')).length + (file ? 1 : 0) >= MAX_PICKED_FILES
  const covered = coveredValues(picked, groups)
  const summary = file && choice === FILES
    ? `ใช้ไฟล์ที่แนบ${picked.length ? ` และอีก ${picked.length} ไฟล์ที่เลือก` : ''}`
    : sourceSummary(choice, picked, groups)

  const changeTab = (next) => {
    setTab(next)
    // Ticks stay across the tabs (several sources together); "อัตโนมัติ"/"ไม่ใช้คลัง" read none of them.
    if (next === 'auto' || next === 'none') {
      setPicked([])
      setFile(null)
      setChoice(tabDefault(next))
    } else if (choice !== FILES) {
      setChoice(tabDefault(next))
    }
  }

  const choose = (value) => {
    setPicked([])
    setFile(null)
    setChoice(value)
  }

  const tick = (value) => {
    const { picked: next, reason } = togglePick(picked, value, groups, { extraFiles: file ? 1 : 0 })
    if (reason) toast.info(reason)
    setPicked(next)
    if (next.length > 0) setChoice(FILES)
    else if (!file) setChoice(tabDefault(tab))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setStage('กำลังเตรียม…')
    try {
      const scope = scopeFields(choice, picked)
      if (file) {
        // The new file joins whatever was ticked (attaching one switches to FILES).
        const doc = await uploadToMyLibrary(file, { onStage: setStage })
        scope.document_ids = [...(scope.document_ids || []), doc.id]
      }
      setStage('AI กำลังอ่านแหล่งความรู้และวางแผน ใช้เวลาประมาณครึ่งนาทีถึงหนึ่งนาที')
      const result = await ws('community/study/roadmap', {
        method: 'POST',
        json: {
          description: topic.trim(),
          ...(nodeCount ? { node_count: nodeCount } : {}),
          ...(level ? { level } : {}),
          ...(duration ? { duration } : {}),
          ...(focus ? { focus } : {}),
          language: 'th',
          web,
          ...scope,
        },
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

  if (busy) {
    return (
      <section className="generating" role="status" aria-live="polite">
        <PinkOwlMascot mood="map" size={150} label="น้องฮูกกำลังวางแผนการเรียนให้" />
        <h2 className="h2">กำลังสร้างแผนการเรียน</h2>
        <p className="generating-topic">“{topic.trim()}”</p>
        <div className="progress-bar" aria-hidden="true" />
        <p className="muted">{stage}</p>
      </section>
    )
  }

  return (
    <form className="form" onSubmit={submit}>
      <header className="form-head">
        <PinkOwlMascot mood="map" size={72} />
        <div>
          <h1 className="h1">สร้างแผนการเรียน</h1>
          <p className="muted">บอกเป้าหมาย เลือกแหล่งความรู้ แล้วให้ AI วางลำดับหัวข้อให้</p>
        </div>
      </header>

      <section className="form-card">
        <div className="field">
          <label htmlFor="topic" className="field-title">
            <span className="step">1</span>เรื่องหรือเป้าหมายที่อยากเรียน
          </label>
          <textarea
            id="topic"
            rows={3}
            maxLength={2000}
            placeholder="เช่น อยากเรียนพื้นฐาน Python ให้ทันสอบย่อยครั้งที่ 1"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          />
          <p className="hint">{topic.trim().length < 3 ? 'พิมพ์อย่างน้อย 3 ตัวอักษร' : `${topic.length}/2000`}</p>
        </div>
      </section>

      <section className="form-card">
        <div className="field">
          <p className="field-title">
            <span className="step">2</span>แหล่งความรู้
          </p>
          <SourceTabs
            tab={tab}
            onTab={changeTab}
            groups={groups}
            picked={picked}
            covered={covered}
            onTick={tick}
            filesFull={filesFull}
          />
          {file && (
            <div className="attached">
              <Paperclip aria-hidden="true" />
              <span className="attached-name">{file.name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="เอาไฟล์ที่แนบออก"
                onClick={() => {
                  setFile(null)
                  if (picked.length === 0) setChoice(tabDefault(tab))
                }}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          )}
          <p className="summary" aria-live="polite">
            {summary}
            {picked.length > 0 && (
              <button type="button" className="link-button" onClick={() => choose(tabDefault(tab))}>
                ล้างที่เลือก
              </button>
            )}
          </p>
          <div className="attach-row">
            <input
              ref={fileInput}
              type="file"
              accept={FILE_TYPES}
              hidden
              onChange={(event) => {
                const chosen = event.target.files?.[0] || null
                setFile(chosen)
                // An attached file is read together with any files ticked in the list.
                if (chosen) {
                  setChoice(FILES)
                  if (tab === 'auto' || tab === 'none') setTab('mine')
                }
                event.target.value = ''
              }}
            />
            <button type="button" className="btn btn-tonal" onClick={() => fileInput.current?.click()}>
              <Paperclip aria-hidden="true" />
              แนบไฟล์ใหม่
            </button>
            <span className="hint">เก็บใน “ไฟล์ของฉัน” และใช้กับ RAG กับ Quiz ได้ด้วย</span>
          </div>
        </div>
      </section>

      <section className="form-card">
        <p className="field-title">
          <span className="step">3</span>ตัวเลือกเพิ่มเติม
        </p>
        <Segments
          legend="พื้นฐานของฉัน"
          options={LEVELS}
          value={level}
          onChange={setLevel}
          hint={LEVELS.find((o) => o.value === level)?.hint || 'AI ดูจากเป้าหมายแล้วเดาระดับให้เอง'}
        />
        <Segments
          legend="เวลาที่มี"
          options={DURATIONS}
          value={duration}
          onChange={setDuration}
          hint={duration ? 'AI จัดขนาดแผนให้ทันเวลา และบอกในแต่ละหัวข้อหลักว่าควรทำช่วงไหน' : 'ไม่จำกัดเวลา'}
        />
        <Segments
          legend="อยากเน้นแบบไหน"
          options={FOCUSES}
          value={focus}
          onChange={setFocus}
          hint={FOCUSES.find((o) => o.value === focus)?.hint || 'ผสมทั้งทฤษฎีและการลงมือทำ'}
        />
        <fieldset className="field">
          <legend>ข้อมูลจากเว็บ</legend>
          <div className="segmented" role="group">
            {WEB_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                className={`segment ${mode.value === web ? 'segment-on' : ''}`}
                aria-pressed={mode.value === web}
                onClick={() => setWeb(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="hint">{WEB_MODES.find((mode) => mode.value === web)?.hint}</p>
        </fieldset>

        <fieldset className="field">
          <legend>จำนวนหัวข้อ</legend>
          <div className="segmented" role="group">
            {NODE_COUNTS.map((count) => (
              <button
                key={count ?? 'auto'}
                type="button"
                className={`segment ${count === nodeCount ? 'segment-on' : ''}`}
                aria-pressed={count === nodeCount}
                onClick={() => setNodeCount(count)}
              >
                {count ?? 'ให้ AI เลือก'}
              </button>
            ))}
          </div>
          <p className="hint">
            {nodeCount ? `ขอแผนขนาด ${nodeCount} หัวข้อพอดี` : 'AI ดูจากเป้าหมายและแหล่งความรู้ แล้วตัดสินใจเองว่าควรมีกี่หัวข้อ'}
          </p>
        </fieldset>
      </section>

      <div className="submit-row">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!canSubmit}>
          {exempt ? 'สร้าง Roadmap' : `สร้าง Roadmap · ${cost} แต้ม`}
        </button>
        <span className="muted">{exempt ? 'ไม่ตัดแต้ม (อาจารย์/ผู้ดูแล)' : `แต้มคงเหลือ ${balance} แต้ม`}</span>
      </div>

      {missing > 0 && (
        <p className="notice notice-warn">
          ขาดอีก {missing} แต้ม · ได้แต้มเพิ่มจากการโพสต์สรุปหรือเมื่อมีคนกดถูกใจโพสต์ของคุณใน{' '}
          <a href={communityUrl()}>Community</a>
        </p>
      )}
    </form>
  )
}
