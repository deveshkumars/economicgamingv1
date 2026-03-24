import { useMemo } from 'react'

interface Props {
  data: Record<string, unknown>
}

export default function JsonViewer({ data }: Props) {
  // Regex-based syntax colorizer — input is controlled API data, only span tags injected
  const colorized = useMemo(() => {
    const raw = JSON.stringify(data, null, 2)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return raw
      .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
      .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
      .replace(/: (true|false)/g, ': <span class="json-bool">$1</span>')
      .replace(/: (null)/g, ': <span class="json-null">$1</span>')
      .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-num">$1</span>')
  }, [data])

  return (
    <div className="json-panel">
      {/* eslint-disable-next-line react/no-danger */}
      <pre dangerouslySetInnerHTML={{ __html: colorized }} />
    </div>
  )
}
