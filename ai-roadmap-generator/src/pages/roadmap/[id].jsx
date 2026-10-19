import { useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import NodePanel from '@/components/NodePanel'
import RoadmapGraph from '@/components/RoadmapGraph'
import ShareDialog from '@/components/ShareDialog'
import { ChevronLeft, Download, Share } from '@/components/icons'
import { seg, ws } from '@/lib/api'
import { communityUrl, sessionIdFromCode } from '@/lib/workspace'
import { useWorkspace } from '@/lib/workspace-context'

// A safety ceiling shared with the server, not a size the plan is expected to reach.
const MAX_NODES = 200
const MAX_DEPTH = 2

/** 0 for a main node, 1 for its sub-node, 2 for a detail of that. */
function depthOf(nodes, node) {
  const byId = new Map(nodes.map((item) => [String(item.id), item]))
  let depth = 0
  let current = node
  while (current?.parent != null && depth <= nodes.length) {
    current = byId.get(String(current.parent))
    depth += 1
  }
  return depth
}

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
  const { balance, exempt, costs, refresh } = useWorkspace()
  const graphRef = useRef(null)
  const [roadmap, setRoadmap] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [syncing, setSyncing] = useState(false)

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

  const expandCost = Number(costs.roadmap_expand ?? 2)
  let expandBlocked = null
  if (selected) {
    if (depthOf(nodes, selected) >= MAX_DEPTH) expandBlocked = 'ด่านนี้อยู่ชั้นลึกสุดแล้ว (ขยายได้ 2 ชั้นจากด่านหลัก)'
    else if (nodes.length >= MAX_NODES) expandBlocked = `Roadmap นี้มีครบ ${MAX_NODES} ด่านแล้ว`
    else if (!exempt && balance < expandCost) expandBlocked = `ขาดอีก ${expandCost - balance} แต้ม`
  }

  const expand = async () => {
    setExpanding(true)
    try {
      const result = await ws(`community/roadmaps/mine/${seg(roadmap.id)}/expand`, {
        method: 'POST',
        json: { node_id: selected.id },
      })
      setRoadmap(result)
      toast.success(`เพิ่ม ${result.added.length} ด่านย่อยแล้ว`)
    } catch (err) {
      toast.error(err?.message || 'ขยายด่านไม่สำเร็จ')
    } finally {
      refresh().catch(() => {})
      setExpanding(false)
    }
  }

  const syncPost = async () => {
    setSyncing(true)
    try {
      await ws(`community/posts/${roadmap.shared_post_id}/roadmap/sync`, { method: 'POST' })
      setRoadmap((current) => ({ ...current, post_outdated: false }))
      toast.success('อัปเดตโพสต์ในฟีดแล้ว')
    } catch (err) {
      toast.error(err?.message || 'อัปเดตโพสต์ไม่สำเร็จ')
    } finally {
      setSyncing(false)
    }
  }

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
          <ChevronLeft />
          กลับหน้าหลัก Roadmap
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
        <div className="viewer-title">
          {/* Inside the app: back to the create form and "Roadmap ของฉัน". The pill in the top bar leaves the app. */}
          <Link className="home-back" href="/" aria-label="กลับหน้าหลัก Roadmap">
            <ChevronLeft />
            <span>
              หน้าหลัก<span className="home-back-long"> Roadmap</span>
            </span>
          </Link>
          <div className="viewer-title-text">
            <h1 className="h2">{roadmap.title}</h1>
            <div className="chips">
              <span className="chip">{nodes.length} ด่าน</span>
              {label && <span className={`chip ${roadmap.grounding?.library || roadmap.grounding?.web ? 'chip-green' : ''}`}>{label}</span>}
              {roadmap.origin === 'followed' && <span className="chip chip-violet">เดินตามจากฟีด</span>}
            </div>
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
            <>
              {roadmap.post_outdated && (
                <button type="button" className="btn btn-primary" onClick={syncPost} disabled={syncing}>
                  <Share />
                  {syncing ? 'กำลังอัปเดต…' : 'อัปเดตโพสต์ในฟีด'}
                </button>
              )}
              <a className="btn btn-outline-accent" href={communityUrl(`?post=${roadmap.shared_post_id}`)}>
                ดูโพสต์ในฟีด
              </a>
            </>
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
        <NodePanel
          roadmap={roadmap}
          node={selected}
          mainIndex={mainIndex}
          childCount={childCount}
          expand={{ cost: expandCost, exempt, busy: expanding, disabledReason: expandBlocked, onExpand: expand }}
        />
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
