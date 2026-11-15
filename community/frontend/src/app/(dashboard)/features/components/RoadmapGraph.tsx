'use client'

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { RoadmapNodePayload, RoadmapEdgePayload } from '@/lib/api/features'

interface RoadmapGraphProps {
  nodes: RoadmapNodePayload[]
  edges: RoadmapEdgePayload[]
}

const CATEGORY_COLORS: Record<string, string> = {
  planning: 'bg-blue-500',
  design: 'bg-purple-500',
  development: 'bg-green-500',
  testing: 'bg-yellow-500',
  deployment: 'bg-orange-500',
  launch: 'bg-pink-500',
  general: 'bg-slate-500',
}

function getCategoryColor(category: string | undefined) {
  if (!category) return CATEGORY_COLORS.general
  const key = category.toLowerCase()
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.general
}

/**
 * Lightweight DAG visualiser rendered without React Flow / dagre so the
 * feature stays self-contained. Nodes are placed in waves based on their
 * longest-path distance from a root node.
 */
export function RoadmapGraph({ nodes, edges }: RoadmapGraphProps) {
  const { layers, indegree } = useMemo(() => {
    const indegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    nodes.forEach((node) => {
      indegree.set(node.id, 0)
      adjacency.set(node.id, [])
    })
    edges.forEach((edge) => {
      if (!adjacency.has(edge.source) || !indegree.has(edge.target)) return
      adjacency.get(edge.source)!.push(edge.target)
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    })

    const layers: string[][] = []
    const visited = new Set<string>()
    const frontier = nodes
      .filter((node) => (indegree.get(node.id) ?? 0) === 0)
      .map((node) => node.id)

    if (frontier.length === 0 && nodes.length > 0) {
      // Cycle or fully connected – fall back to provided order
      layers.push(nodes.map((node) => node.id))
      return { layers, indegree }
    }

    layers.push(frontier)
    frontier.forEach((id) => visited.add(id))

    while (visited.size < nodes.length) {
      const nextLayer: string[] = []
      const lastLayer = layers[layers.length - 1]
      for (const id of lastLayer) {
        for (const child of adjacency.get(id) ?? []) {
          if (visited.has(child)) continue
          // Only add once every parent has been assigned
          const parents = edges
            .filter((edge) => edge.target === child)
            .map((edge) => edge.source)
          if (parents.every((parent) => visited.has(parent))) {
            nextLayer.push(child)
            visited.add(child)
          }
        }
      }
      if (nextLayer.length === 0) break
      layers.push(nextLayer)
    }

    return { layers, indegree }
  }, [nodes, edges])

  const nodeMap = useMemo(() => {
    const map = new Map<string, RoadmapNodePayload>()
    nodes.forEach((node) => map.set(node.id, node))
    return map
  }, [nodes])

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No roadmap nodes were generated.
      </p>
    )
  }

  return (
    <div className="space-y-4 overflow-x-auto">
      {layers.map((layer, layerIndex) => (
        <div key={layerIndex} className="flex flex-wrap gap-3 justify-center">
          {layer.map((nodeId) => {
            const node = nodeMap.get(nodeId)
            if (!node) return null
            return (
              <Card
                key={nodeId}
                className="w-64 shrink-0 relative"
                data-source={nodeId}
                data-target={edges
                  .filter((edge) => edge.source === nodeId)
                  .map((edge) => edge.target)
                  .join(',')}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      className={`${getCategoryColor(node.category)} text-white`}
                    >
                      {node.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      #{node.order}
                    </span>
                  </div>
                  <p className="font-semibold">{node.label}</p>
                  {node.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {node.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ))}
      {edges.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {edges.length} connections · {nodes.length} nodes
        </p>
      )}
    </div>
  )
}
