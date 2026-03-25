import { useEffect, useRef } from 'react'
import type { ProgressEntry } from '../types'

interface Props {
  entries: ProgressEntry[]
  loading: boolean
}

export default function ProgressPanel({ entries, loading }: Props) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [entries])

  return (
    <div className="progress-panel">
      <h3>
        {loading && <span className="spinner" />}
        Analyzing Sanctions Impact
      </h3>
      <div className="progress-log" ref={logRef}>
        {entries.map((entry, i) => (
          <div key={i} className={entry.type}>
            [{entry.time}] {entry.msg}
          </div>
        ))}
      </div>
    </div>
  )
}
