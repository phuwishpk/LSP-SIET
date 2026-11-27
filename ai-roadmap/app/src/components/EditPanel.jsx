import { useEffect, useRef, useState } from 'react'
import { PinkOwlMascot } from '@shared/mascot'
import { EDIT_EXAMPLES, EDIT_MAX, editBlockedReason } from '@/lib/roadmap-edit'
import { Close } from './icons'

/**
 * "สั่งแก้ด้วย AI": the learner types what to change and the AI edits this
 * roadmap in place. `onSubmit(text)` resolves true when the edit was saved.
 */
export default function EditPanel({ cost, exempt, balance, busy, canUndo, undoing, lockedReason, onSubmit, onUndo, onClose }) {
  const [text, setText] = useState('')
  const boxRef = useRef(null)
  useEffect(() => {
    boxRef.current?.focus()
  }, [])

  const blocked = lockedReason || editBlockedReason({ text, cost, balance, exempt })
  const submit = async (event) => {
    event.preventDefault()
    if (blocked || busy) return
    if (await onSubmit(text.trim())) setText('')
  }

  return (
    <section className="edit-panel" aria-labelledby="edit-panel-title">
      <div className="edit-panel-head">
        <h2 id="edit-panel-title" className="h3">
          สั่งแก้ Roadmap ด้วย AI
        </h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="ปิดกล่องสั่งแก้" title="ปิด">
          <Close />
        </button>
      </div>

      {busy ? (
        <div className="edit-panel-busy" role="status" aria-live="polite">
          <PinkOwlMascot mood="study" size={64} label="น้องฮูกกำลังแก้ Roadmap" />
          <div>
            <p className="body">“{text.trim()}”</p>
            <p className="hint">AI กำลังแก้ Roadmap เฉพาะส่วนที่สั่ง ใช้เวลาประมาณครึ่งนาที</p>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <label className="sr-only" htmlFor="edit-instruction">
            อยากให้แก้อะไร
          </label>
          <textarea
            id="edit-instruction"
            ref={boxRef}
            className="edit-panel-box"
            rows={3}
            maxLength={EDIT_MAX}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="เช่น เพิ่มหัวข้อ Docker หลัง Backend, ตัดเรื่อง testing ออก, รวมสองหัวข้อแรกเป็นหัวข้อเดียว"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit(event)
            }}
          />
          <div className="edit-panel-examples" aria-label="ตัวอย่างคำสั่ง">
            {EDIT_EXAMPLES.map((example) => (
              <button key={example} type="button" className="chip chip-button" onClick={() => setText(example)}>
                {example}
              </button>
            ))}
          </div>
          <div className="edit-panel-foot">
            <span className="hint">
              {text.length}/{EDIT_MAX} · ส่วนที่ไม่ได้สั่งจะคงเดิม แหล่งอ้างอิงเดิมอยู่ครบ
            </span>
            <div className="edit-panel-actions">
              {canUndo && (
                <button type="button" className="btn" onClick={onUndo} disabled={undoing || Boolean(lockedReason)}>
                  {undoing ? 'กำลังย้อน…' : 'ย้อนการแก้ล่าสุด'}
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={Boolean(blocked)} title={blocked || undefined}>
                {exempt ? 'แก้ด้วย AI · ฟรี' : `แก้ด้วย AI · ${cost} แต้ม`}
              </button>
            </div>
          </div>
          {blocked && (text.trim() || lockedReason) && <p className="hint">{blocked}</p>}
        </form>
      )}
    </section>
  )
}
