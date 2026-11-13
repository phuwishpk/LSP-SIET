import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { layoutRoadmap } from '@/lib/roadmap-layout'

const pathOf = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')

/** Stop an arrow two pixels short so its head does not sink into the box. */
function shorten(points) {
  const [[x1, y1], [x2, y2]] = points.slice(-2)
  const length = Math.hypot(x2 - x1, y2 - y1) || 1
  return [...points.slice(0, -1), [x2 - ((x2 - x1) / length) * 3, y2 - ((y2 - y1) / length) * 3]]
}

/**
 * The roadmap drawn as lanes (one per learning stage) with main nodes down
 * the spine and sub-nodes branching right on dashed lines.
 */
const MAX_SCALE = 1.6

const RoadmapGraph = forwardRef(function RoadmapGraph({ nodes, selectedId, onSelect }, ref) {
  const layout = useMemo(() => layoutRoadmap(nodes), [nodes])

  // Grow the map to fill the space it has (never shrink below 1:1). The scale
  // sits on a wrapper, so the exported PNG (taken from `.graph`) stays 1:1.
  const scrollRef = useRef(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const fit = () => {
      const available = el.clientWidth - 24
      setScale(Math.min(MAX_SCALE, Math.max(1, available / layout.width)))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    return () => observer.disconnect()
  }, [layout.width])

  return (
    <div ref={scrollRef} className="graph-scroll">
      <div className="graph-fit" style={{ width: layout.width * scale, height: layout.height * scale }}>
      <div ref={ref} className="graph" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
        {layout.lanes.map((lane, index) => (
          <div
            key={`${lane.category}-${index}`}
            className={`lane ${index % 2 ? 'lane-alt' : ''}`}
            style={{ top: lane.top, height: lane.height }}
          >
            <span className="lane-label" style={{ color: lane.color }}>
              {lane.category}
            </span>
          </div>
        ))}

        <svg className="graph-lines" width={layout.width} height={layout.height} aria-hidden="true">
          <defs>
            <marker id="arrow-solid" orient="auto" markerWidth="6" markerHeight="6" refX="4" refY="3">
              <path className="arrow-solid" d="M0 0 L6 3 L0 6 Z" />
            </marker>
            <marker id="arrow-dashed" orient="auto" markerWidth="6" markerHeight="6" refX="4" refY="3">
              <path className="arrow-dashed" d="M0 0 L6 3 L0 6 Z" />
            </marker>
          </defs>
          {layout.lines.map((line, index) => (
            <path
              key={index}
              d={pathOf(line.arrow ? shorten(line.points) : line.points)}
              className={line.kind === 'solid' ? 'line-solid' : 'line-dashed'}
              markerEnd={line.arrow ? `url(#arrow-${line.kind})` : undefined}
            />
          ))}
        </svg>

        {layout.boxes.map((box) => (
          <button
            key={box.id}
            type="button"
            className={`node node-${box.kind} ${box.id === selectedId ? 'node-selected' : ''}`}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            onClick={() => onSelect?.(box.id)}
            aria-pressed={box.id === selectedId}
            title={box.node.label}
          >
            <span className="node-label">{box.node.label}</span>
          </button>
        ))}
      </div>
      </div>
    </div>
  )
})

export default RoadmapGraph
