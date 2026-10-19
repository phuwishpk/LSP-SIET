import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-toastify'
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
      <h2 className="h2">Roadmap ของฉัน</h2>

      {error && (
        <p className="notice notice-warn">
          {error}{' '}
          <button type="button" className="link-button" onClick={load}>
            ลองใหม่
          </button>
        </p>
      )}
      {!error && items === null && <p className="muted">กำลังโหลด…</p>}
      {items?.length === 0 && <p className="muted">ยังไม่มี Roadmap ลองสร้างแผนแรกจากแบบฟอร์มได้เลย</p>}

      {(items || []).map((item) => (
        <article className="card" key={item.id}>
          <div>
            <h3 className="card-title">{item.title}</h3>
            <div className="chips">
              <span className="muted small">
                {item.node_count} ด่าน{whenLabel(item.created_at) && ` · ${whenLabel(item.created_at)}`}
              </span>
              {item.origin === 'followed' ? (
                <span className="chip chip-violet">เดินตามจากฟีด</span>
              ) : (
                <span className="chip">สร้างเอง</span>
              )}
              {item.shared_post_id && <span className="chip chip-green">แชร์แล้ว</span>}
            </div>
          </div>
          <div className="card-actions">
            <Link className="btn" href={`/roadmap/${sessionCode(item.id)}`}>
              เปิดดู
            </Link>
            {item.origin === 'followed' ? (
              item.source_post_id && (
                <a className="btn" href={communityUrl(`?post=${item.source_post_id}`)}>
                  ดูโพสต์ต้นทาง
                </a>
              )
            ) : item.shared_post_id ? (
              <a className="btn" href={communityUrl(`?post=${item.shared_post_id}`)}>
                ดูโพสต์ในฟีด
              </a>
            ) : (
              <button type="button" className="btn btn-outline-accent" onClick={() => setSharing(item)}>
                แชร์ลง Community
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={() => setDeleting(item)}>
              ลบ
            </button>
          </div>
        </article>
      ))}

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
