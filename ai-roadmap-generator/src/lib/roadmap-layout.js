/**
 * Turn a roadmap's nodes into boxes and connector lines.
 *
 * Main nodes (no parent) run top to bottom and are grouped into lanes by
 * category. A node's children branch out to the right: sub-nodes in a second
 * column, their details in a third. Pure function - no DOM.
 */

const MAIN = { x: 176, w: 232, h: 48 }
const SUB = { x: 488, w: 208, h: 40 }
const DETAIL = { x: 760, w: 208, h: 40 }
const GAP_MAIN = 28
const GAP_BRANCH = 10
const LANE_PAD = 22
const EDGE_PAD = 16

/** The five learning stages get fixed colours; anything else cycles. */
const STAGE_COLORS = {
  พื้นฐาน: '#6EA8FF',
  แนวคิดหลัก: '#46C7B2',
  ฝึกปฏิบัติ: '#E9B949',
  ประยุกต์: '#F0925A',
  'ทบทวน/ประเมิน': '#B79CFF',
}
const FALLBACK_COLORS = ['#6EA8FF', '#46C7B2', '#E9B949', '#F0925A', '#B79CFF', '#F28FB5']

export function categoryColor(category, index = 0) {
  const key = String(category || '').replace(/\s+/g, '')
  return STAGE_COLORS[key] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)

function stackHeight(count, itemHeight) {
  return count ? count * itemHeight + (count - 1) * GAP_BRANCH : 0
}

/** One parent to its children: a stub, a trunk when there are several, arrows in. */
function branchLines(fromX, fromY, trunkX, children, toX) {
  if (!children.length) return []
  if (children.length === 1 && Math.abs(children[0].cy - fromY) < 1) {
    return [{ kind: 'dashed', arrow: true, points: [[fromX, fromY], [toX, fromY]] }]
  }
  const ys = children.map((c) => c.cy)
  const lines = [
    { kind: 'dashed', arrow: false, points: [[fromX, fromY], [trunkX, fromY]] },
    { kind: 'dashed', arrow: false, points: [[trunkX, Math.min(...ys, fromY)], [trunkX, Math.max(...ys, fromY)]] },
  ]
  for (const child of children) {
    lines.push({ kind: 'dashed', arrow: true, points: [[trunkX, child.cy], [toX, child.cy]] })
  }
  return lines
}

/** A lane ends LANE_PAD below its last block (`cursor` sits GAP_MAIN past it). */
function closeLane(lane, cursor) {
  lane.height = cursor - GAP_MAIN + LANE_PAD - lane.top
}

export function layoutRoadmap(rawNodes) {
  const nodes = (rawNodes || []).map((node, index) => ({ ...node, id: String(node.id), order: node.order ?? index }))
  const ids = new Set(nodes.map((node) => node.id))
  const childrenOf = new Map()
  const mains = []
  for (const node of nodes) {
    const parent = node.parent != null && ids.has(String(node.parent)) ? String(node.parent) : null
    if (parent === null) mains.push(node)
    else childrenOf.set(parent, [...(childrenOf.get(parent) || []), node])
  }
  mains.sort(byOrder)
  for (const list of childrenOf.values()) list.sort(byOrder)

  const boxes = []
  const lines = []
  const lanes = []
  let hasSubs = false
  let hasDetails = false
  let cursor = LANE_PAD
  let lane = null
  let previousMain = null

  mains.forEach((main, mainIndex) => {
    const category = main.category || 'ทั่วไป'
    if (!lane || lane.category !== category) {
      if (lane) {
        closeLane(lane, cursor)
        cursor = lane.top + lane.height + LANE_PAD
      }
      lane = { category, color: categoryColor(category, lanes.length), top: cursor - LANE_PAD, height: 0 }
      lanes.push(lane)
    }

    const subs = childrenOf.get(main.id) || []
    const subBlocks = subs.map((sub) => {
      const details = childrenOf.get(sub.id) || []
      return { sub, details, height: Math.max(SUB.h, stackHeight(details.length, DETAIL.h)) }
    })
    const branchHeight = subBlocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, subBlocks.length - 1) * GAP_BRANCH
    const blockHeight = Math.max(MAIN.h, branchHeight)
    const blockTop = cursor

    const mainBox = {
      id: main.id, kind: 'main', node: main, index: mainIndex + 1, color: lane.color,
      x: MAIN.x, y: blockTop + (blockHeight - MAIN.h) / 2, w: MAIN.w, h: MAIN.h,
    }
    mainBox.cy = mainBox.y + MAIN.h / 2
    boxes.push(mainBox)
    if (previousMain) {
      lines.push({
        kind: 'solid', arrow: true,
        points: [[MAIN.x + MAIN.w / 2, previousMain.y + MAIN.h], [MAIN.x + MAIN.w / 2, mainBox.y]],
      })
    }
    previousMain = mainBox

    let subCursor = blockTop + (blockHeight - branchHeight) / 2
    const subBoxes = []
    for (const block of subBlocks) {
      hasSubs = true
      const subBox = {
        id: block.sub.id, kind: 'sub', node: block.sub, color: lane.color,
        x: SUB.x, y: subCursor + (block.height - SUB.h) / 2, w: SUB.w, h: SUB.h,
      }
      subBox.cy = subBox.y + SUB.h / 2
      boxes.push(subBox)
      subBoxes.push(subBox)

      let detailCursor = subCursor + (block.height - stackHeight(block.details.length, DETAIL.h)) / 2
      const detailBoxes = []
      for (const detail of block.details) {
        hasDetails = true
        const detailBox = {
          id: detail.id, kind: 'detail', node: detail, color: lane.color,
          x: DETAIL.x, y: detailCursor, w: DETAIL.w, h: DETAIL.h, cy: detailCursor + DETAIL.h / 2,
        }
        boxes.push(detailBox)
        detailBoxes.push(detailBox)
        detailCursor += DETAIL.h + GAP_BRANCH
      }
      lines.push(...branchLines(SUB.x + SUB.w, subBox.cy, (SUB.x + SUB.w + DETAIL.x) / 2, detailBoxes, DETAIL.x))
      subCursor += block.height + GAP_BRANCH
    }
    lines.push(...branchLines(MAIN.x + MAIN.w, mainBox.cy, (MAIN.x + MAIN.w + SUB.x) / 2, subBoxes, SUB.x))

    cursor = blockTop + blockHeight + GAP_MAIN
  })

  if (lane) closeLane(lane, cursor)
  const height = lane ? lane.top + lane.height : 0
  const right = hasDetails ? DETAIL.x + DETAIL.w : hasSubs ? SUB.x + SUB.w : MAIN.x + MAIN.w
  return { width: right + EDGE_PAD, height, lanes, boxes, lines }
}
