import { useCallback, useRef, useState } from 'react'
import GraphViewer, { type GraphViewerHandle } from './GraphViewer'
import UBOPanel from './UBOPanel'
import RiskReportPanel from './RiskReportPanel'
import { fetchSayariResolve, fetchSayariRelated, fetchEntityRiskReport, fetchSanctionsScreenBatch } from '../api'
import type { EntityGraphResponse, GraphNode, GraphEdge, SayariUBOOwner, EntityRiskReport } from '../types'

const LEGEND = [
  { label: 'Company', color: '#4A90D9' },
  { label: 'Person', color: '#7B68EE' },
  { label: 'Government', color: '#DC143C' },
  { label: 'Sanctioned', color: '#F85149' },
  { label: 'Vessel', color: '#2E8B57' },
  { label: 'Sector', color: '#3FB950' },
  { label: 'Theme/Offshore', color: '#F0883E' },
  { label: 'Sayari', color: '#E040FB' },
]

const SANCTIONED_COLOR = '#F85149'

const SAYARI_ENTITY_COLORS: Record<string, string> = {
  company: '#4A90D9',
  person: '#7B68EE',
  vessel: '#2E8B57',
  asset: '#F0883E',
}

function truncate(s: string, n = 28) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

/** Extract a clean entity name suitable for Sayari resolution. */
function fullName(node: GraphNode): string {
  let name = ''
  if (node.title) {
    name = node.title.split('\n')[0].trim()
  }
  if (!name) {
    name = node.label.replace(/…$/, '')
  }
  // Strip parenthetical suffixes like "(0763.HK)", "(ticker)", "(LEI…)"
  name = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return name
}

/** Extract ticker from node label/title if present (e.g. "Taiwan Semi (TSM)"). */
function extractTickerFromNode(node: GraphNode): string | undefined {
  const text = node.title || node.label
  const m = text.match(/\(([A-Z]{1,5}(?:\.[A-Z]{2})?)\)/)
  return m ? m[1] : undefined
}

interface Props {
  graphData: EntityGraphResponse | null
  graphLoading: boolean
  uboOwners?: SayariUBOOwner[]
  uboLoading?: boolean
  uboTargetName?: string
}

export default function EntityGraphSection({
  graphData,
  graphLoading,
  uboOwners = [],
  uboLoading = false,
  uboTargetName = '',
}: Props) {
  const graphRef = useRef<GraphViewerHandle>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [expandingNode, setExpandingNode] = useState<string | null>(null)
  const [addedCounts, setAddedCounts] = useState({ nodes: 0, edges: 0 })
  const [expandMessage, setExpandMessage] = useState<string | null>(null)

  // Selected node for action bar
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Risk report state
  const [riskReport, setRiskReport] = useState<EntityRiskReport | null>(null)
  const [riskReportLoading, setRiskReportLoading] = useState(false)
  const [riskReportEntityName, setRiskReportEntityName] = useState<string | null>(null)

  // Track which node IDs we know about (base + expanded) for dedup
  const knownIdsRef = useRef<Set<string>>(new Set())
  // Map of all nodes so click handler can find any node by id
  const allNodesMap = useRef<Map<string, GraphNode>>(new Map())

  const expandedRef = useRef(expandedNodes)
  expandedRef.current = expandedNodes
  const expandingRef = useRef(expandingNode)
  expandingRef.current = expandingNode

  const baseNodes = graphData?.nodes ?? []
  const baseEdges = graphData?.edges ?? []

  // Sync known IDs + node map when base data arrives
  const prevQueryRef = useRef(graphData?.meta?.query)
  if (graphData?.meta?.query !== prevQueryRef.current) {
    prevQueryRef.current = graphData?.meta?.query
    knownIdsRef.current = new Set(baseNodes.map((n) => n.id))
    const map = new Map<string, GraphNode>()
    for (const n of baseNodes) map.set(n.id, n)
    allNodesMap.current = map
    setExpandedNodes(new Set())
    setExpandingNode(null)
    setAddedCounts({ nodes: 0, edges: 0 })
    setExpandMessage(null)
    setSelectedNodeId(null)
    setRiskReport(null)
    setRiskReportLoading(false)
    setRiskReportEntityName(null)
  } else if (knownIdsRef.current.size === 0 && baseNodes.length > 0) {
    knownIdsRef.current = new Set(baseNodes.map((n) => n.id))
    for (const n of baseNodes) allNodesMap.current.set(n.id, n)
  }

  // Single click → select node (show action bar)
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
  }, [])

  // Sayari expand (called from action bar button)
  const handleSayariExpand = useCallback(async (nodeId: string) => {
    if (expandedRef.current.has(nodeId) || expandingRef.current) return

    const currentKnown = knownIdsRef.current
    if (!currentKnown.has(nodeId)) return

    const clickedNode = allNodesMap.current.get(nodeId)
    if (!clickedNode) return

    setExpandingNode(nodeId)
    setExpandMessage(null)
    try {
      const nameForResolve = fullName(clickedNode)
      let sayariEntityId = clickedNode.sayariId

      const groupToType: Record<string, string> = {
        company: 'company',
        person: 'person',
        vessel: 'vessel',
      }
      const sayariType = groupToType[clickedNode.group]

      if (!sayariEntityId) {
        let resolved = await fetchSayariResolve(nameForResolve, sayariType)
        if (resolved.entities.length === 0 && sayariType) {
          resolved = await fetchSayariResolve(nameForResolve)
        }
        if (resolved.entities.length === 0) {
          setExpandMessage(`No Sayari results for "${nameForResolve}"`)
          setExpandedNodes((prev) => new Set(prev).add(nodeId))
          setExpandingNode(null)
          return
        }
        sayariEntityId = resolved.entities[0].entity_id
      }

      const traversal = await fetchSayariRelated(sayariEntityId, 1, 10)

      const newNodes: GraphNode[] = []
      const newEdges: GraphEdge[] = []
      const entityNameById = new Map<string, string>()

      for (const ent of traversal.entities) {
        const nid = `sayari_${ent.entity_id}`
        if (!currentKnown.has(nid)) {
          const baseColor = ent.sanctioned
            ? SANCTIONED_COLOR
            : SAYARI_ENTITY_COLORS[ent.type] ?? '#E040FB'
          const tooltip = [
            ent.label,
            ent.type,
            ent.country,
            ent.sanctioned ? 'SANCTIONED (Sayari)' : null,
            ent.pep ? 'PEP' : null,
          ]
            .filter(Boolean)
            .join(' · ')
          const node: GraphNode = {
            id: nid,
            label: truncate(ent.label),
            title: tooltip,
            group: ent.type || 'sayari',
            color: baseColor,
            sayariId: ent.entity_id,
          }
          newNodes.push(node)
          currentKnown.add(nid)
          allNodesMap.current.set(nid, node)
          entityNameById.set(nid, ent.label)
        }
      }

      for (const rel of traversal.relationships) {
        const fromId = currentKnown.has(`sayari_${rel.source_id}`)
          ? `sayari_${rel.source_id}`
          : nodeId
        const toId = `sayari_${rel.target_id}`

        if (currentKnown.has(fromId) && currentKnown.has(toId) && fromId !== toId) {
          newEdges.push({
            from: fromId,
            to: toId,
            label: rel.relationship_type.replace(/_/g, ' '),
            arrows: 'to',
            dashes: false,
          })
        }
      }

      for (const nn of newNodes) {
        const hasEdge = newEdges.some((e) => e.to === nn.id || e.from === nn.id)
        if (!hasEdge) {
          newEdges.push({
            from: nodeId,
            to: nn.id,
            label: 'related',
            arrows: 'to',
            dashes: true,
          })
        }
      }

      if (newNodes.length > 0) {
        graphRef.current?.addData(newNodes, newEdges, nodeId)
        setAddedCounts((prev) => ({
          nodes: prev.nodes + newNodes.length,
          edges: prev.edges + newEdges.length,
        }))
        setExpandMessage(null)

        // Cross-reference new entities with OFAC/CSL sanctions data
        const namesToScreen = Array.from(entityNameById.values())
        if (namesToScreen.length > 0) {
          try {
            const screening = await fetchSanctionsScreenBatch(namesToScreen)
            const nodeUpdates: Array<{ id: string; color: string; title: string }> = []
            for (const [nid, name] of entityNameById.entries()) {
              const result = screening.results[name]
              if (result?.sanctioned) {
                const node = allNodesMap.current.get(nid)
                const newTitle = (node?.title || name) + `\nSANCTIONED (${result.lists?.join(', ') || 'OFAC/CSL'})`
                nodeUpdates.push({ id: nid, color: SANCTIONED_COLOR, title: newTitle })
                if (node) {
                  node.color = SANCTIONED_COLOR
                  node.title = newTitle
                  allNodesMap.current.set(nid, node)
                }
              }
            }
            if (nodeUpdates.length > 0) {
              graphRef.current?.updateNodes(nodeUpdates)
            }
          } catch (err) {
            console.warn('Sanctions screening failed (non-blocking):', err)
          }
        }
      } else {
        setExpandMessage(`No new connections found for "${nameForResolve}"`)
      }
      setExpandedNodes((prev) => new Set(prev).add(nodeId))
    } catch (err) {
      console.warn('Sayari expand failed:', err)
      setExpandMessage(`Expansion failed: ${(err as Error).message}`)
    } finally {
      setExpandingNode(null)
    }
  }, [])

  // Run risk report for a node
  const handleRunRiskReport = useCallback(async (nodeId: string) => {
    const node = allNodesMap.current.get(nodeId)
    if (!node) return

    const entityName = fullName(node)
    const ticker = extractTickerFromNode(node)
    const entityType = node.group || 'company'

    setRiskReportEntityName(entityName)
    setRiskReport(null)
    setRiskReportLoading(true)

    try {
      const report = await fetchEntityRiskReport(entityName, entityType, ticker)
      setRiskReport(report)
    } catch (err) {
      console.warn('Risk report failed:', err)
    } finally {
      setRiskReportLoading(false)
    }
  }, [])

  // Double click → run risk report directly
  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    handleRunRiskReport(nodeId)
  }, [handleRunRiskReport])

  const closeRiskReport = useCallback(() => {
    setRiskReport(null)
    setRiskReportLoading(false)
    setRiskReportEntityName(null)
  }, [])

  if (!graphData && !graphLoading) return null

  const hasNodes = baseNodes.length > 0

  let emptyText = ''
  if (graphLoading && !graphData) emptyText = 'Loading entity graph...'
  else if (graphData && !hasNodes) emptyText = 'No entity relationships found'

  const totalNodes = baseNodes.length + addedCounts.nodes
  const totalEdges = baseEdges.length + addedCounts.edges

  const selectedNode = selectedNodeId ? allNodesMap.current.get(selectedNodeId) : null
  const selectedNodeName = selectedNode ? fullName(selectedNode) : null
  const alreadyExpanded = selectedNodeId ? expandedNodes.has(selectedNodeId) : false

  return (
    <div className="graph-section">
      <div className="graph-section-header">Entity Relationship Graph</div>
      <div className="graph-legend">
        {LEGEND.map((item) => (
          <span key={item.label} className="legend-item">
            <span className="legend-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Selected node action bar */}
      {selectedNode && (
        <div className="graph-action-bar">
          <div className="graph-action-bar-name">
            <span
              className="legend-dot"
              style={{ background: selectedNode.color || '#8b949e', flexShrink: 0 }}
            />
            <span>{selectedNodeName}</span>
            <span style={{ fontSize: '10px', color: '#8b949e', textTransform: 'capitalize', marginLeft: 4 }}>
              ({selectedNode.group})
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              className="btn btn-secondary graph-action-btn"
              disabled={!!expandingNode || alreadyExpanded}
              onClick={() => handleSayariExpand(selectedNodeId!)}
              title="Fetch related entities from Sayari Graph"
            >
              {expandingNode === selectedNodeId ? (
                <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2, marginRight: 4 }} />Expanding…</>
              ) : alreadyExpanded ? (
                'Expanded'
              ) : (
                'Expand via Sayari'
              )}
            </button>
            <button
              className="btn btn-primary graph-action-btn"
              disabled={riskReportLoading}
              onClick={() => handleRunRiskReport(selectedNodeId!)}
              title="Generate a full risk report for this entity"
            >
              {riskReportLoading && riskReportEntityName === selectedNodeName ? (
                <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 2, marginRight: 4 }} />Analyzing…</>
              ) : (
                'Run Risk Report'
              )}
            </button>
          </div>
        </div>
      )}

      <div className="graph-container">
        {emptyText && <div className="graph-empty">{emptyText}</div>}
        {expandingNode && (
          <div className="graph-expanding">Expanding via Sayari...</div>
        )}
        {expandMessage && !expandingNode && (
          <div className="graph-expand-msg">{expandMessage}</div>
        )}
        {hasNodes && (
          <GraphViewer
            ref={graphRef}
            nodes={baseNodes}
            edges={baseEdges}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
          />
        )}
      </div>
      {hasNodes && (
        <div className="graph-stats">
          {totalNodes} entities · {totalEdges} relationships
          {expandedNodes.size > 0 && (
            <span className="graph-stats-sayari">
              {' '}· {expandedNodes.size} expanded via Sayari
            </span>
          )}
          <span className="graph-click-hint"> — click to select · double-click for risk report</span>
        </div>
      )}

      <UBOPanel
        targetName={uboTargetName}
        owners={uboOwners}
        loading={uboLoading}
      />

      {/* Risk Report slide-in panel */}
      {(riskReportLoading || riskReport) && (
        <RiskReportPanel
          report={riskReport}
          loading={riskReportLoading}
          entityName={riskReportEntityName}
          onClose={closeRiskReport}
        />
      )}
    </div>
  )
}
