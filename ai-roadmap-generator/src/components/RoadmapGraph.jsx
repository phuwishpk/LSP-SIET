import { forwardRef, useMemo } from 'react'
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
const RoadmapGraph = forwardRef(function RoadmapGraph({ nodes, selectedId, onSelect }, ref) {
  const layout = useMemo(() => layoutRoadmap(nodes), [nodes])

  return (
    <div className="graph-scroll">
      <div ref={ref} className="graph" style={{ width: layout.width, height: layout.height }}>
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
              <path d="M0 0 L6 3 L0 6 Z" fill="#8C96A8" />
            </marker>
            <marker id="arrow-dashed" orient="auto" markerWidth="6" markerHeight="6" refX="4" refY="3">
              <path d="M0 0 L6 3 L0 6 Z" fill="#7C8698" />
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
  )
})

export default RoadmapGraph
