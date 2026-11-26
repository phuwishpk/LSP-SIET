import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
import { ChevronRight, ExternalLink, Search, Share2, Trash2 } from 'lucide-react'
import { PinkOwlMascot } from '@shared/mascot'
import { seg, ws } from '@/lib/api'
import { communityUrl, sessionCode } from '@/lib/workspace'
import Dialog from './Dialog'
import ShareDialog from './ShareDialog'

const DAY = 24 * 60 * 60 * 1000

function whenLabel(iso) {
  if (!iso) return ''
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const days = Math.floor((Date.now() - then.getTime()) / DAY)
  if (days <= 0) return 'วันนี้'
  if (days === 1) return 'เมื่อวาน'
  if (days < 30) return `${days} วันก่อน`
  return then.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "Roadmap ของฉัน": everything the user generated or followed. */
export default function MyRoadmaps() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [sharing, setSharing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase()
    return query ? (items || []).filter((item) => String(item.title || '').toLowerCase().includes(query)) : items || []
  }, [items, q])

  const load = useCallback(() => {
    ws('community/roadmaps/mine')
      .then((data) => {
        setItems(data.items || [])
        setError(null)
      })
      .catch((err) => {
        if (!err?.redirected) setError(err?.message || 'โหลดรายการไม่สำเร็จ')
      })
  }, [])

  useEffect(load, [load])

  const confirmDelete = async () => {
    setBusy(true)
    try {
      await ws(`community/roadmaps/mine/${seg(deleting.id)}`, { method: 'DELETE' })
      setItems((list) => list.filter((item) => item.id !== deleting.id))
      setDeleting(null)
      toast.success('ลบ Roadmap แล้ว')
    } catch (err) {
      toast.error(err?.message || 'ลบไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mine">
      <div className="mine-head">
        <h2 className="h2">Roadmap ของฉัน</h2>
        {items?.length > 0 && <span className="count-badge">{items.length}</span>}
      </div>

      {items?.length > 5 && (
        <label className="src-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="ค้นชื่อ Roadmap…" aria-label="ค้นชื่อ Roadmap" />
        </label>
      )}

      {error && (
        <p className="notice notice-warn">
          {error}{' '}
          <button type="button" className="link-button" onClick={load}>
            ลองใหม่
          </button>
        </p>
      )}
      {!error && items === null && (
        <div className="list-skeleton" aria-label="กำลังโหลด" role="status">
          <span />
          <span />
          <span />
        </div>
      )}
      {items?.length === 0 && (
        <div className="empty-state">
          <PinkOwlMascot mood="idle" size={96} />
          <p className="h3">ยังไม่มี Roadmap</p>
          <p className="muted">กรอกเป้าหมายในแบบฟอร์ม แล้วให้น้องฮูกช่วยวางแผนแรกให้</p>
        </div>
      )}
      {items?.length > 0 && shown.length === 0 && <p className="muted">ไม่พบ Roadmap ที่ตรงกับ “{q}”</p>}

      <ul className="roadmap-list">
        {shown.map((item) => {
          const when = whenLabel(item.created_at)
          const postId = item.origin === 'followed' ? item.source_post_id : item.shared_post_id
          return (
            <li className="roadmap-item" key={item.id}>
              <Link className="roadmap-item-main" href={`/roadmap/${sessionCode(item.id)}`}>
                <span className="roadmap-item-text">
                  <span className="roadmap-item-title">{item.title}</span>
                  <span className="roadmap-item-meta">
                    {item.node_count} หัวข้อ{when && ` · ${when}`}
                    {item.origin === 'followed' && <span className="chip chip-violet">เดินตามจากฟีด</span>}
                    {item.shared_post_id && <span className="chip chip-green">แชร์แล้ว</span>}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="roadmap-item-chevron" />
              </Link>
              <div className="roadmap-item-actions">
                {postId ? (
                  <a
                    className="icon-button"
                    href={communityUrl(`?post=${postId}`)}
                    aria-label={item.origin === 'followed' ? 'ดูโพสต์ต้นทาง' : 'ดูโพสต์ในฟีด'}
                    title={item.origin === 'followed' ? 'ดูโพสต์ต้นทาง' : 'ดูโพสต์ในฟีด'}
                  >
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : (
                  item.origin !== 'followed' && (
                    <button type="button" className="icon-button" onClick={() => setSharing(item)} aria-label="แชร์ลง Community" title="แชร์ลง Community">
                      <Share2 aria-hidden="true" />
                    </button>
                  )
                )}
                <button type="button" className="icon-button icon-button-danger" onClick={() => setDeleting(item)} aria-label={`ลบ ${item.title}`} title="ลบ">
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {sharing && (
        <ShareDialog
          roadmap={sharing}
          onClose={() => setSharing(null)}
          onShared={(postId) => {
            setItems((list) => list.map((item) => (item.id === sharing.id ? { ...item, shared_post_id: postId } : item)))
            setSharing(null)
          }}
        />
      )}

      {deleting && (
        <Dialog
          title="ลบ Roadmap นี้?"
          subtitle={deleting.title}
          onClose={() => !busy && setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDeleting(null)} disabled={busy}>
                ยกเลิก
              </button>
              <button type="button" className="btn btn-danger-solid" onClick={confirmDelete} disabled={busy}>
                {busy ? 'กำลังลบ…' : 'ลบถาวร'}
              </button>
            </>
          }
        >
          <p className="body">
            ลบแล้วกู้คืนไม่ได้
            {deleting.shared_post_id ? ' โพสต์ที่แชร์ไว้ในฟีดจะยังอยู่ เพราะโพสต์เก็บสำเนาของตัวเอง' : ''}
          </p>
        </Dialog>
      )}
    </section>
  )
}
