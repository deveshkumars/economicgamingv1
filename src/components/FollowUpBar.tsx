import { useEffect, useRef, useState } from 'react'
import { fetchFollowUp } from '../api'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

interface Props {
  contextType: 'company' | 'orchestrator' | 'vessel' | 'person' | 'sector'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any>
  /** Pre-fill the input (e.g. from commodity drill-down). Set to '' to clear. */
  prefillQuestion?: string
}

export default function FollowUpBar({ contextType, context, prefillQuestion }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages, loading])

  // Reset conversation when the underlying data changes
  useEffect(() => {
    setMessages([])
    setInput('')
  }, [context])

  // Pre-fill from drill-down click
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion)
      inputRef.current?.focus()
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [prefillQuestion])

  async function handleSubmit() {
    const question = input.trim()
    if (!question || loading) return

    // Snapshot history before adding new user message
    const historySnapshot = messages.map((m) => ({ role: m.role, text: m.text }))

    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setInput('')
    setLoading(true)

    try {
      const { answer } = await fetchFollowUp(question, contextType, context, historySnapshot)
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Error: ${(e as Error).message}` },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const hasMessages = messages.length > 0

  return (
    <div style={{
      marginTop: 32,
      border: '1px solid #30363d',
      borderRadius: 8,
      background: '#0d1117',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #21262d',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#161b22',
      }}>
        <span style={{ fontSize: 13, color: '#58a6ff', fontWeight: 600 }}>Ask a follow-up</span>
        <span style={{ fontSize: 11, color: '#484f58' }}>
          — Analyst has full access to all data from this analysis
        </span>
      </div>

      {/* Message thread */}
      {hasMessages && (
        <div
          ref={threadRef}
          style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            maxHeight: 420,
            overflowY: 'auto',
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginTop: 3,
                padding: '2px 6px',
                borderRadius: 4,
                background: msg.role === 'user'
                  ? 'rgba(88,166,255,0.12)'
                  : 'rgba(63,185,80,0.12)',
                color: msg.role === 'user' ? '#58a6ff' : '#3fb950',
                border: `1px solid ${msg.role === 'user'
                  ? 'rgba(88,166,255,0.25)'
                  : 'rgba(63,185,80,0.25)'}`,
              }}>
                {msg.role === 'user' ? 'You' : 'Analyst'}
              </span>
              <span style={{
                fontSize: 13,
                color: msg.role === 'user' ? '#c9d1d9' : '#e6edf3',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </span>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{
                flexShrink: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em', padding: '2px 6px', borderRadius: 4,
                background: 'rgba(63,185,80,0.12)', color: '#3fb950',
                border: '1px solid rgba(63,185,80,0.25)',
              }}>
                Analyst
              </span>
              <span style={{ fontSize: 12, color: '#484f58', fontStyle: 'italic' }}>
                Thinking…
              </span>
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div style={{
        padding: '10px 16px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
        borderTop: hasMessages ? '1px solid #21262d' : 'none',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about this analysis… (Enter to send, Shift+Enter for newline)"
          disabled={loading}
          rows={3}
          style={{
            flex: 1,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#c9d1d9',
            fontSize: 13,
            padding: '10px 14px',
            resize: 'vertical',
            outline: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
            minHeight: 72,
            maxHeight: 200,
            overflowY: 'auto',
            transition: 'border-color 0.15s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#58a6ff' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || loading}
          style={{
            background: '#1f6feb',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            padding: '9px 18px',
            opacity: (!input.trim() || loading) ? 0.45 : 1,
            flexShrink: 0,
            transition: 'opacity 0.15s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
