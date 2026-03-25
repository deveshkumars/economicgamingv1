import { useEffect, useRef } from 'react'
import { Network, DataSet } from 'vis-network/standalone'
import type { GraphNode, GraphEdge } from '../types'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  onStabilized?: () => void
}

export default function GraphViewer({ nodes, edges, onStabilized }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !nodes.length) return

    const network = new Network(
      containerRef.current,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: new DataSet(nodes as any),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges: new DataSet(edges as any),
      },
      {
        physics: {
          solver: 'repulsion',
          repulsion: {
            nodeDistance: 180,
            centralGravity: 0.15,
            springLength: 200,
            springConstant: 0.04,
            damping: 0.09,
          },
          stabilization: { iterations: 300 },
        },
        nodes: {
          shape: 'dot',
          size: 18,
          font: { color: '#c9d1d9', size: 12, strokeWidth: 3, strokeColor: '#0d1117' },
          borderWidth: 2,
          color: { border: '#30363d', highlight: { border: '#58a6ff' }, hover: { border: '#58a6ff' } },
        },
        edges: {
          font: { color: '#8b949e', size: 10, align: 'middle', strokeWidth: 2, strokeColor: '#0d1117' },
          color: { color: '#58a6ff', highlight: '#ffffff', opacity: 0.6 },
          width: 2,
          smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        },
        interaction: { hover: true, tooltipDelay: 150 },
        layout: { randomSeed: 42 },
      }
    )

    network.once('stabilized', () => {
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } })
      onStabilized?.()
    })

    return () => network.destroy()
  }, [nodes, edges, onStabilized])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
