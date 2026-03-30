import { useState } from 'react'

interface Props {
  data: unknown
  label?: string
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'debug-num'
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'debug-key' : 'debug-str'
      } else if (/true|false/.test(match)) {
        cls = 'debug-bool'
      } else if (/null/.test(match)) {
        cls = 'debug-null'
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

export default function DebugPanel({ data, label = 'Raw API Response' }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const json = JSON.stringify(data, null, 2)

  function handleCopy() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div style={{ marginTop: '24px', borderTop: '1px solid #21262d', paddingTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          className="btn btn-secondary"
          style={{ fontSize: '12px', padding: '4px 12px' }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '▾' : '▸'} {label}
        </button>
        {open && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: '12px', padding: '4px 12px' }}
            onClick={handleCopy}
          >
            {copied ? '✓ Copied' : 'Copy JSON'}
          </button>
        )}
        {open && (
          <span style={{ fontSize: '11px', color: '#484f58' }}>
            {(new TextEncoder().encode(json).length / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {open && (
        <div style={{
          marginTop: '8px',
          background: '#0d1117',
          border: '1px solid #21262d',
          borderRadius: '6px',
          padding: '16px',
          overflowX: 'auto',
          maxHeight: '500px',
          overflowY: 'auto',
        }}>
          <pre
            style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', fontFamily: "'Cascadia Code', 'Fira Code', monospace" }}
            dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
          />
        </div>
      )}
    </div>
  )
}
