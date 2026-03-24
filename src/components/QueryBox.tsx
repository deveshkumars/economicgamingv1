import { useRef, useState } from 'react'
import type { HealthResponse } from '../types'

const EXAMPLES = [
  "What happens if we sanction Fujian Jinhua?",
  "What is the supply chain impact of sanctioning Norinco's subsidiary in Malaysia?",
  "China is investing $30M in a port in Sri Lanka — how do we intersect?",
  "What are the downstream effects of sanctioning Russian oil exports?",
]

interface Props {
  query: string
  isRunning: boolean
  health: HealthResponse | null
  onQueryChange: (q: string) => void
  onAnalyze: () => void
  onClear: () => void
}

export default function QueryBox({ query, isRunning, health, onQueryChange, onAnalyze, onClear }: Props) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([])
  const [scanning, setScanning] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  function triggerAnimation(x?: number, y?: number) {
    const btn = btnRef.current
    const cx = x ?? (btn ? btn.offsetWidth / 2 : 50)
    const cy = y ?? (btn ? btn.offsetHeight / 2 : 16)
    const id = Date.now()
    setRipples((prev) => [...prev, { id, x: cx, y: cy }])
    setScanning(true)
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 750)
    setTimeout(() => setScanning(false), 900)
  }

  const handleAnalyzeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    triggerAnimation(e.clientX - rect.left, e.clientY - rect.top)
    onAnalyze()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      triggerAnimation()
      onAnalyze()
    }
  }

  return (
    <div className={`query-box${scanning ? ' query-box--scanning' : ''}`}>
      <div className="query-label">
        <span className="query-label-text">Intelligence Query</span>
        <span className="query-label-prompt">// press Enter to execute</span>
      </div>
      <textarea
        id="query"
        rows={2}
        placeholder="Ask a question... e.g., What happens if we sanction Fujian Jinhua?"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="btn-row">
        <button
          ref={btnRef}
          className="btn btn-primary"
          disabled={isRunning}
          onClick={handleAnalyzeClick}
        >
          {ripples.map((r) => (
            <span
              key={r.id}
              className="btn-ripple"
              style={{ left: r.x, top: r.y }}
            />
          ))}
          Analyze
        </button>
        <button className="btn btn-secondary" onClick={onClear}>
          Clear
        </button>
        {health && (
          <span>
            {health.status === 'ok' ? (
              <span className="status-badge ok">API Connected</span>
            ) : (
              <span className="status-badge error">{health.issues.join(', ')}</span>
            )}
          </span>
        )}
      </div>
      <div className="examples">
        <span className="examples-label">Scenarios:</span>
        {EXAMPLES.map((ex) => (
          <span key={ex} className="example-chip" onClick={() => onQueryChange(ex)}>
            {ex}
          </span>
        ))}
      </div>
    </div>
  )
}
