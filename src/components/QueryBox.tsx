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
  'micron': 'MU',
  'huawei': 'BABA',
  'tencent': 'TME', 'tme': 'TME',
  'bilibili': 'BILI', 'bili': 'BILI',
  'pdd': 'PDD', 'pinduoduo': 'PDD',
  'kweb': 'KWEB',
  'full truck': 'YMM', 'ymm': 'YMM',
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
  { label: 'Sanction Alibaba (BABA)', ticker: 'BABA' },
  { label: 'Sanction SMIC (0981.HK)', ticker: '0981.HK' },
  { label: 'What if we sanction TSMC? (TSM)', ticker: 'TSM' },
  { label: 'Sanction Baidu (BIDU)', ticker: 'BIDU' },
  { label: 'ZTE Corp (0763.HK)', ticker: '0763.HK' },
  { label: 'Intel chip restrictions (INTC)', ticker: 'INTC' },
]

interface Props {
  query: string
  loading: boolean
  health: HealthResponse | null
  onQueryChange: (q: string) => void
  onAnalyze: (tickerOverride?: string) => void
  onClear: () => void
}

export default function QueryBox({ query, loading, health, onQueryChange, onAnalyze, onClear }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onAnalyze()
    }
  }

  return (
    <div className="query-box">
      <input
        type="text"
        placeholder="What happens if we sanction...? (enter a company name or stock ticker)"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <div className="btn-row">
        <button className="btn btn-primary" disabled={loading} onClick={() => onAnalyze()}>
          Analyze Impact
        </button>
        <button className="btn btn-secondary" onClick={onClear}>
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
            key={ex.ticker}
            className="example-chip"
            onClick={() => { onQueryChange(ex.label); onAnalyze(ex.ticker) }}
          >
            {ex.label}
          </span>
        ))}
      </div>
    </div>
  )
}
