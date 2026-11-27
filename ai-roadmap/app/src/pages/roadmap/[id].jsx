import { useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { toast } from 'react-toastify'
import { PinkOwlMascot } from '@shared/mascot'
import EditPanel from '@/components/EditPanel'
import NodePanel from '@/components/NodePanel'
import RoadmapGraph from '@/components/RoadmapGraph'
import ShareDialog from '@/components/ShareDialog'
import { Sparkles } from 'lucide-react'
import { ChevronLeft, Download, Share } from '@/components/icons'
import { seg, ws } from '@/lib/api'
import { changeSummary, changedIds } from '@/lib/roadmap-edit'
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
  const [editing, setEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [undoing, setUndoing] = useState(false)
  // Nodes the last AI edit added or changed, outlined on the map until the next action.
  const [changed, setChanged] = useState(() => new Set())

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
  const editCost = Number(costs.roadmap_edit ?? 3)
  let expandBlocked = null
  if (selected) {
    if (depthOf(nodes, selected) >= MAX_DEPTH) expandBlocked = 'หัวข้อนี้อยู่ชั้นลึกสุดแล้ว (ขยายได้ 2 ชั้นจากหัวข้อหลัก)'
    else if (nodes.length >= MAX_NODES) expandBlocked = `Roadmap นี้มีครบ ${MAX_NODES} หัวข้อแล้ว`
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
      setChanged(new Set(result.added.map(String)))
      toast.success(result.synced_post_id ? `เพิ่ม ${result.added.length} หัวข้อย่อยแล้ว และอัปเดตโพสต์ในฟีดให้แล้ว` : `เพิ่ม ${result.added.length} หัวข้อย่อยแล้ว`)
    } catch (err) {
      toast.error(err?.message || 'ขยายหัวข้อไม่สำเร็จ')
    } finally {
      refresh().catch(() => {})
      setExpanding(false)
    }
  }

  const select = (id) => {
    setSelectedId(id)
    setChanged(new Set())
  }

  const editWithAi = async (instruction) => {
    setEditBusy(true)
    try {
      const result = await ws(`community/roadmaps/mine/${seg(roadmap.id)}/edit`, {
        method: 'POST',
        json: { instruction },
      })
      setRoadmap(result)
      const ids = changedIds(result.changes)
      setChanged(ids)
      // Bring the first changed node into view: it may be far down a long roadmap.
      if (ids.size) {
        requestAnimationFrame(() => {
          const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          document.querySelector('.node-changed')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
        })
      }
      if (selectedId && !result.nodes.some((node) => String(node.id) === selectedId)) setSelectedId(null)
      const summary = changeSummary(result.changes)
      toast.success(
        `แก้ Roadmap แล้ว: ${summary}${result.summary ? ` (${result.summary})` : ''}${result.synced_post_id ? ' และอัปเดตโพสต์ในฟีดให้แล้ว' : ''}`,
      )
      return true
    } catch (err) {
      toast.error(err?.message || 'แก้ Roadmap ไม่สำเร็จ')
      return false
    } finally {
      refresh().catch(() => {})
      setEditBusy(false)
    }
  }

  const undoEdit = async () => {
    setUndoing(true)
    try {
      const result = await ws(`community/roadmaps/mine/${seg(roadmap.id)}/edit/undo`, { method: 'POST' })
      setRoadmap(result)
      setChanged(new Set())
      if (selectedId && !result.nodes.some((node) => String(node.id) === selectedId)) setSelectedId(null)
      toast.success('ย้อนกลับเป็นแบบก่อนแก้แล้ว')
    } catch (err) {
      toast.error(err?.message || 'ย้อนการแก้ไม่สำเร็จ')
    } finally {
      setUndoing(false)
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
      // The picture keeps the page's background, light or dark.
      const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#FFFFFF'
      const url = await toPng(graphRef.current, { backgroundColor: background, pixelRatio: 2 })
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
        <PinkOwlMascot mood="idle" size={120} />
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
      <main className="center-screen" role="status">
        <PinkOwlMascot mood="study" size={120} label="น้องฮูกกำลังเปิด Roadmap" />
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
          {/* Inside the app: back to the create form and "Roadmap ของฉัน". The navbar logo leaves the app. */}
          <Link className="home-back" href="/" aria-label="กลับหน้าหลัก Roadmap">
            <ChevronLeft />
            <span>
              หน้าหลัก<span className="home-back-long"> Roadmap</span>
            </span>
          </Link>
          <div className="viewer-title-text">
            <h1 className="h2">{roadmap.title}</h1>
            <div className="chips">
              <span className="chip">{nodes.length} หัวข้อ</span>
              {label && <span className={`chip ${roadmap.grounding?.library || roadmap.grounding?.web ? 'chip-green' : ''}`}>{label}</span>}
              {roadmap.origin === 'followed' && <span className="chip chip-violet">เดินตามจากฟีด</span>}
            </div>
          </div>
        </div>
        <div className="viewer-actions">
          <button
            type="button"
            className={`btn ${editing ? 'btn-outline-accent' : ''}`}
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
            aria-controls="edit-panel"
          >
            <Sparkles aria-hidden="true" />
            สั่งแก้ด้วย AI
          </button>
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

      {editing && (
        <div id="edit-panel">
          <EditPanel
            cost={editCost}
            exempt={exempt}
            balance={balance}
            busy={editBusy}
            canUndo={Boolean(roadmap.can_undo)}
            undoing={undoing}
            onSubmit={editWithAi}
            onUndo={undoEdit}
            onClose={() => setEditing(false)}
          />
        </div>
      )}

      <div className="viewer-body">
        <RoadmapGraph ref={graphRef} nodes={nodes} selectedId={selectedId} changedIds={changed} onSelect={select} />
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
