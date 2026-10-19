import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { ws } from '@/lib/api'
import { useWorkspace } from '@/lib/workspace-context'
import Dialog from './Dialog'

/**
 * Post a roadmap to the Community feed: caption, room and tags.
 * `roadmap` = { id, title, node_count, settings? }. Calls onShared(postId).
 */
export default function ShareDialog({ roadmap, onClose, onShared }) {
  const { refresh } = useWorkspace()
  const [caption, setCaption] = useState(`แผนการเรียน "${roadmap.title}" ลองเดินตามกันดู`)
  const [rooms, setRooms] = useState([])
  const [roomId, setRoomId] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ws('community/courses')
      .then((list) => {
        if (!alive) return
        const joined = (list || []).filter((room) => room.joined)
        setRooms(joined)
        // Default to the room whose library the plan was generated from.
        const from = roadmap.settings?.course_id ?? roadmap.course_id
        if (from && joined.some((room) => room.id === from)) setRoomId(String(from))
      })
      .catch(() => setRooms([]))
    return () => {
      alive = false
    }
  }, [roadmap.settings?.course_id, roadmap.course_id])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    const form = new FormData()
    form.append('type', 'roadmap')
    form.append('embed_type', 'roadmap')
    form.append('embed_id', roadmap.id)
    form.append('title', roadmap.title)
    form.append('content', caption.trim())
    if (roomId) form.append('course_id', roomId)
    if (tags.trim()) form.append('tags', tags.trim())
    try {
      const result = await ws('community/posts', { method: 'POST', form })
      const bonus = Number(result?.creator_bonus) || 0
      toast.success(bonus > 0 ? `แชร์แล้ว · ได้ +${bonus} แต้ม` : 'แชร์แล้ว')
      refresh().catch(() => {})
      onShared(result?.post?.id)
    } catch (error) {
      // Already shared (another tab, or an earlier attempt): show that post.
      const existing = error?.status === 409 && Number(error.headers?.get('x-duplicate-of'))
      if (existing) {
        toast.info('Roadmap นี้แชร์ไปแล้ว')
        onShared(existing)
      } else {
        toast.error(error?.message || 'แชร์ไม่สำเร็จ')
        setBusy(false)
      }
    }
  }

  return (
    <Dialog title="แชร์ Roadmap ลง Community" subtitle={`${roadmap.title} · ${roadmap.node_count} ด่าน`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="share-caption">ข้อความ</label>
          <textarea
            id="share-caption"
            rows={3}
            maxLength={2000}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="share-room">โพสต์ในห้อง</label>
          <select id="share-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">ฟีดรวม (ไม่ระบุห้อง)</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.kind === 'club' ? room.name : `${room.code} ${room.name}`}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="share-tags">แท็ก</label>
          <input
            id="share-tags"
            type="text"
            maxLength={255}
            placeholder="คั่นด้วยเว้นวรรค เช่น python พื้นฐาน"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
        <p className="hint">
          เพื่อนจะเห็นด่านทั้งหมด ที่มาจากคลังวิชาและเว็บ ส่วนที่มาจากไฟล์ส่วนตัวจะแสดงเป็น “ไฟล์ส่วนตัวของผู้สร้าง” โดยไม่มีชื่อไฟล์
        </p>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'กำลังโพสต์…' : 'โพสต์ลงฟีด'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
