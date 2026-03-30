import type { HealthResponse } from '../types'

const KNOWN_MAP: Record<string, string> = {
  'alibaba': 'BABA', 'baba': 'BABA',
  'smic': '0981.HK',
  'tsmc': 'TSM', 'tsm': 'TSM', 'taiwan semiconductor': 'TSM',
  'china mobile': '0941.HK',
  'hikvision': '002415.SZ',
  'xiaomi': '1810.HK',
  'zte': '0763.HK',
  'baidu': 'BIDU', 'bidu': 'BIDU',
  'nio': 'NIO',
  'asml': 'ASML',
  'intel': 'INTC', 'intc': 'INTC',
  'micron': 'MU', 'mu': 'MU',
  // huawei intentionally omitted — private company, no public ticker
  'tencent holdings': 'TCEHY', 'tcehy': 'TCEHY',
  'tencent music': 'TME', 'tme': 'TME',
  'bilibili': 'BILI', 'bili': 'BILI',
  'pdd': 'PDD', 'pinduoduo': 'PDD',
  'kweb': 'KWEB',
  'full truck': 'YMM', 'ymm': 'YMM',
  'supermicro': 'SMCI', 'smci': 'SMCI',
  'nvidia': 'NVDA', 'nvda': 'NVDA',
  'qualcomm': 'QCOM', 'qcom': 'QCOM',
  'applied materials': 'AMAT', 'amat': 'AMAT',
  'seagate': 'STX', 'stx': 'STX',
  'gazprom': 'OGZPY', 'ogzpy': 'OGZPY',
  'sberbank': 'SBRCY', 'sbrcy': 'SBRCY',
}

export function extractTicker(input: string): string {
  const lower = input.toLowerCase().trim()
  for (const [name, ticker] of Object.entries(KNOWN_MAP)) {
    if (lower.includes(name)) return ticker
  }
  const match = input.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,2})?)\b/)
  return match ? match[1] : input.trim().toUpperCase()
}

const EXAMPLES = [
  { label: 'SMCI sanction impact', query: 'SMCI' },
  { label: 'Viktor Vekselberg profile', query: 'Viktor Vekselberg' },
  { label: 'Aircraft MRO sector', query: 'Aircraft MRO' },
  { label: 'Vessel: Lana', query: 'Lana' },
  { label: 'What if we sanction Huawei?', query: 'What if we sanction Huawei?' },
  { label: 'COSCO and military port access', query: 'What is the relationship between COSCO and Chinese military port access?' },
]

interface Props {
  query: string
  loading: boolean
  health: HealthResponse | null
  onQueryChange: (q: string) => void
  onAnalyze: (queryOverride?: string) => void
  /** Runs full orchestrator; receives current box text so clicks always use what you see. */
  onOrchestrate: (queryText: string) => void
  onClear: () => void
}

export default function QueryBox({ query, loading, health, onQueryChange, onAnalyze, onOrchestrate, onClear }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (!loading) onOrchestrate(query)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onAnalyze()
    }
  }

  return (
    <div className="query-box">
      <input
        type="text"
        placeholder="Search any company, person, sector, or vessel..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
      />
      <div className="query-hints">
        <span>Enter — Analyze</span>
        <span>Ctrl+Enter / ⌘+Enter — Deep Analysis</span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => onAnalyze()}>
          Analyze
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => onOrchestrate(query)}
          title="Full multi-agent pipeline (POST /api/analyze). Shortcut: Ctrl+Enter or ⌘+Enter in the search box."
          style={{ borderColor: '#58a6ff', color: '#58a6ff' }}
        >
          Deep Analysis
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClear}>
          Clear
        </button>
        {health && (
          health.status === 'ok'
            ? <span className="status-badge ok">API Connected</span>
            : <span className="status-badge error">{health.issues.join(', ')}</span>
        )}
      </div>
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <span
            key={ex.query}
            className="example-chip"
            onClick={() => { onQueryChange(ex.query); onAnalyze(ex.query) }}
          >
            {ex.label}
          </span>
        ))}
      </div>
    </div>
  )
}
