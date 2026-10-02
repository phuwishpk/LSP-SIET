import { useState } from 'react'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import { ws } from '@/lib/api'
import { communityUrl, sessionCode } from '@/lib/workspace'
import { useWorkspace } from '@/lib/workspace-context'

const NODE_COUNTS = [8, 12, 15, 20]

/** The "create a learning plan" form. */
export default function CreateForm() {
  const router = useRouter()
  const { balance, exempt, costs, refresh } = useWorkspace()
  const [topic, setTopic] = useState('')
  const [nodeCount, setNodeCount] = useState(12)
  const [busy, setBusy] = useState(false)

  const cost = Number(costs.roadmap_generate ?? 15)
  const missing = exempt ? 0 : Math.max(0, cost - balance)
  const canSubmit = topic.trim().length >= 3 && !busy && missing === 0

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const result = await ws('community/study/roadmap', {
        method: 'POST',
        json: { description: topic.trim(), node_count: nodeCount, language: 'th', scope: 'auto' },
      })
      refresh().catch(() => {})
      router.push(`/roadmap/${sessionCode(result.session_id)}`)
    } catch (error) {
      if (error?.status === 402) refresh().catch(() => {})
      toast.error(error?.message || 'สร้าง Roadmap ไม่สำเร็จ')
      setBusy(false)
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

      <fieldset className="field">
        <legend>จำนวนด่าน</legend>
        <div className="segmented">
          {NODE_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              className={`segment ${count === nodeCount ? 'segment-on' : ''}`}
              aria-pressed={count === nodeCount}
              onClick={() => setNodeCount(count)}
              disabled={busy}
            >
              {count}
            </button>
          ))}
        </div>
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
          <span className="muted">AI กำลังอ่านคลังความรู้และวางแผน ใช้เวลาประมาณครึ่งนาทีถึงหนึ่งนาที</span>
        </div>
      )}
    </form>
  )
}
