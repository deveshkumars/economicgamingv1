import { useEffect, useRef } from 'react'
import { Network } from 'vis-network/standalone'
import type { GraphData } from '../types'

interface Props {
  graphData: GraphData
}

export default function GraphViewer({ graphData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !graphData.nodes.length) return

    const network = new Network(
      containerRef.current,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: graphData.nodes as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges: graphData.edges as any,
      },
      {
        nodes: {
          shape: 'dot',
          size: 14,
          color: {
            background: '#0c1e3d',
            border: '#00d4ff',
            highlight: { background: '#00d4ff', border: '#33ddff' },
            hover:     { background: '#112a4d', border: '#33ddff' },
          },
          font: {
            color: '#e8f0fe',
            size: 12,
            face: "'JetBrains Mono', 'Fira Code', monospace",
            strokeWidth: 2,
            strokeColor: '#040810',
            vadjust: 5,
          },
          borderWidth: 1.5,
          borderWidthSelected: 2.5,
          widthConstraint: { maximum: 160 },
          shadow: {
            enabled: true,
            color: 'rgba(0, 212, 255, 0.25)',
            size: 12,
            x: 0,
            y: 0,
          },
        },
        edges: {
          color: {
            color: '#1a2540',
            highlight: '#00d4ff',
            hover: '#2e4070',
            opacity: 0.8,
          },
          font: {
            color: '#4a6080',
            size: 10,
            face: "'JetBrains Mono', monospace",
            strokeWidth: 0,
            align: 'middle',
          },
          width: 1,
          selectionWidth: 2,
          smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 },
          arrows: {
            to: { enabled: true, scaleFactor: 0.6, type: 'arrow' },
          },
        },
        physics: {
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -90,
            centralGravity: 0.008,
            springLength: 180,
            springConstant: 0.05,
            damping: 0.7,
          },
          minVelocity: 0.5,
          stabilization: { iterations: 250, fit: true },
        },
        interaction: {
          hover: true,
          tooltipDelay: 80,
          zoomView: true,
          navigationButtons: false,
          keyboard: { enabled: true },
        },
        layout: { improvedLayout: true },
      }
    )

    return () => network.destroy()
  }, [graphData])

  return <div id="graph-container" ref={containerRef} />
}
