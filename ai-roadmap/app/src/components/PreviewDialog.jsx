import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { PinkOwlMascot } from '@shared/mascot'
import { openProtectedFile, ws } from '@/lib/api'
import { previewQuery } from '@/lib/knowledge'
import Dialog from './Dialog'

/**
 * "ดูเนื้อหา": the start of a file's text before the learner ticks it, with the
 * original file one click away and the tick in the footer.
 */
export default function PreviewDialog({ item, ticked, covered, onToggle, onClose }) {
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    ws(`community/knowledge/preview?${previewQuery(item.value)}`)
      .then((data) => alive && setPreview(data))
      .catch((err) => alive && !err?.redirected && setError(err?.message || 'เปิดดูเนื้อหาไม่สำเร็จ'))
    return () => {
      alive = false
    }
  }, [item.value])

  const openOriginal = () => openProtectedFile(preview.download_url).catch((err) => toast.error(err?.message || 'เปิดไฟล์ไม่สำเร็จ'))

  return (
    <Dialog
      title={preview?.title || item.label}
      subtitle={preview ? (preview.chars ? `${preview.chars.toLocaleString('th-TH')} ตัวอักษร` : 'ไม่มีข้อความที่อ่านได้') : undefined}
      onClose={onClose}
      footer={
        <>
          {preview?.download_url && (
            <button type="button" className="btn" onClick={openOriginal}>
              เปิดไฟล์ต้นฉบับ
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            ปิด
          </button>
          {covered ? (
            <span className="hint">รวมอยู่ในคลังที่ติ๊กไว้แล้ว</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onToggle()
                onClose()
              }}
            >
              {ticked ? 'เอาออกจากที่เลือก' : 'ติ๊กใช้ไฟล์นี้'}
            </button>
          )}
        </>
      }
    >
      {error ? (
        <p className="notice notice-warn">{error}</p>
      ) : !preview ? (
        <div className="preview-loading" role="status">
          <PinkOwlMascot mood="study" size={64} label="น้องฮูกกำลังเปิดไฟล์" />
          <span className="muted">กำลังเปิดดูเนื้อหา…</span>
        </div>
      ) : preview.text ? (
        <>
          <div className="preview-text" tabIndex={0}>
            {preview.text}
          </div>
          {preview.truncated && <p className="hint">แสดงเฉพาะช่วงต้นของไฟล์ เปิดไฟล์ต้นฉบับเพื่ออ่านทั้งหมด</p>}
        </>
      ) : (
        <p className="muted">ไฟล์นี้ไม่มีข้อความให้แสดง{preview.download_url ? ' เปิดไฟล์ต้นฉบับเพื่อดู' : ''}</p>
      )}
    </Dialog>
  )
}
