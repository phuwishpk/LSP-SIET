import { useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import NodePanel from '@/components/NodePanel'
import RoadmapGraph from '@/components/RoadmapGraph'
import ShareDialog from '@/components/ShareDialog'
import { Download, Share } from '@/components/icons'
import { seg, ws } from '@/lib/api'
import { communityUrl, sessionIdFromCode } from '@/lib/workspace'

function groundingLabel(grounding) {
  if (!grounding) return null
  if (grounding.label) return grounding.label
  if (grounding.library && grounding.web) return 'อ้างอิง: คลังความรู้ + เว็บ'
  if (grounding.library) return 'อ้างอิง: คลังความรู้'
  if (grounding.web) return 'อ้างอิง: เว็บ'
  return 'ไม่ได้อ้างอิงคลังความรู้'
}

export default function RoadmapPage() {
  const { query, isReady } = useRouter()
  const graphRef = useRef(null)
  const [roadmap, setRoadmap] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!isReady || !query.id) return
    setRoadmap(null)
    setError(null)
    ws(`community/roadmaps/mine/${seg(sessionIdFromCode(query.id))}`)
      .then(setRoadmap)
      .catch((err) => {
        if (!err?.redirected) setError(err?.message || 'เปิด Roadmap ไม่สำเร็จ')
      })
  }, [isReady, query.id])

  const nodes = roadmap?.nodes || []
  const selected = useMemo(() => nodes.find((node) => String(node.id) === selectedId) || null, [nodes, selectedId])
  const mainIndex = useMemo(() => {
    if (!selected || selected.parent != null) return 0
    const mains = nodes.filter((node) => node.parent == null).sort((a, b) => (a.order || 0) - (b.order || 0))
    return mains.findIndex((node) => String(node.id) === selectedId) + 1
  }, [nodes, selected, selectedId])
  const childCount = selected ? nodes.filter((node) => String(node.parent) === String(selected.id)).length : 0

  const download = async () => {
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(graphRef.current, { backgroundColor: '#0C0C0C', pixelRatio: 2 })
      const link = document.createElement('a')
      link.href = url
      link.download = `${roadmap.title || 'roadmap'}.png`
      link.click()
    } catch {
      toast.error('ดาวน์โหลดรูปไม่สำเร็จ')
    }
  }

  if (error) {
    return (
      <main className="center-screen">
        <h1 className="h2">เปิด Roadmap ไม่ได้</h1>
        <p className="muted">{error}</p>
        <Link className="btn btn-primary" href="/">
          กลับไปหน้า Roadmap ของฉัน
        </Link>
      </main>
    )
  }
  if (!roadmap) {
    return (
      <main className="center-screen">
        <p className="muted">กำลังโหลด Roadmap…</p>
      </main>
    )
  }

  const label = groundingLabel(roadmap.grounding)
  return (
    <main className="viewer">
      <Head>
        <title>{`${roadmap.title} · AI Roadmap`}</title>
      </Head>

      <div className="viewer-head">
        <div>
          <h1 className="h2">{roadmap.title}</h1>
          <div className="chips">
            <span className="chip">{nodes.length} ด่าน</span>
            {label && <span className={`chip ${roadmap.grounding?.library || roadmap.grounding?.web ? 'chip-green' : ''}`}>{label}</span>}
            {roadmap.origin === 'followed' && <span className="chip chip-violet">เดินตามจากฟีด</span>}
          </div>
        </div>
        <div className="viewer-actions">
          <button type="button" className="btn" onClick={download}>
            <Download />
            ดาวน์โหลด PNG
          </button>
          {roadmap.origin === 'followed' ? (
            roadmap.source_post_id && (
              <a className="btn" href={communityUrl(`?post=${roadmap.source_post_id}`)}>
                ดูโพสต์ต้นทาง
              </a>
            )
          ) : roadmap.shared_post_id ? (
            <a className="btn btn-outline-accent" href={communityUrl(`?post=${roadmap.shared_post_id}`)}>
              ดูโพสต์ในฟีด
            </a>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setSharing(true)}>
              <Share />
              แชร์ลง Community
            </button>
          )}
        </div>
      </div>

      <div className="viewer-body">
        <RoadmapGraph ref={graphRef} nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
        <NodePanel roadmap={roadmap} node={selected} mainIndex={mainIndex} childCount={childCount} />
      </div>

      {sharing && (
        <ShareDialog
          roadmap={{ ...roadmap, node_count: nodes.length }}
          onClose={() => setSharing(false)}
          onShared={(postId) => {
            setRoadmap((current) => ({ ...current, shared_post_id: postId }))
            setSharing(false)
          }}
        />
      )}
    </main>
  )
}
