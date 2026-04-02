import { useState } from 'react'
import { marked } from 'marked'
import type { WorkforceRunResponse, WorkforceStep } from '../api'

interface Props {
  data: WorkforceRunResponse
}

function MarkdownBlock({ text }: { text: string }) {
  const html = marked.parse(text, { async: false }) as string
  return (
    <div
      className="markdown-body"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function StepCard({ step, index }: { step: WorkforceStep; index: number }) {
  const [open, setOpen] = useState(false)
  const duration = step.startedAt && step.completedAt
    ? ((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1) + 's'
    : null

  return (
    <div className="workforce-step">
      <button
        type="button"
        className="workforce-step-header"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="workforce-step-index">Step {index + 1}</span>
        {duration && <span className="workforce-step-duration">{duration}</span>}
        <span className="workforce-step-toggle">{open ? 'Γû▓' : 'Γû╝'}</span>
      </button>
      {open && step.output && (
        <div className="workforce-step-body">
          <MarkdownBlock text={step.output} />
        </div>
      )}
      {open && step.error && (
        <div className="workforce-step-body" style={{ color: '#f85149' }}>
          {step.error}
        </div>
      )}
    </div>
  )
}

export default function WorkforceRiskView({ data }: Props) {
  const [stepsOpen, setStepsOpen] = useState(false)

  const duration = data.startedAt && data.completedAt
    ? ((new Date(data.completedAt).getTime() - new Date(data.startedAt).getTime()) / 1000).toFixed(0) + 's'
    : null

  const completedSteps = data.steps.filter((s) => s.completedAt)

  return (
    <div id="resultsPanel">
      {/* Header */}
      <div className="info-card" style={{ marginBottom: '24px', borderLeft: '3px solid #58a6ff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>{data.teamName}</h3>
          <span
            className="sanctions-badge"
            style={{
              background: data.status === 'complete' ? '#1a3a1a' : '#3a2a0a',
              color: data.status === 'complete' ? '#3fb950' : '#e3b341',
              border: `1px solid ${data.status === 'complete' ? '#3fb950' : '#e3b341'}`,
            }}
          >
            {data.status}
          </span>
          {duration && (
            <span style={{ fontSize: '12px', color: '#8b949e' }}>Completed in {duration}</span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>
          Query: <em style={{ color: '#c9d1d9' }}>{data.arguments?.UserInput}</em>
        </div>
      </div>

      {/* Final output */}
      {data.output && (
        <div className="info-card view-section" style={{ marginBottom: '24px' }}>
          <h3>Analysis Report</h3>
          <MarkdownBlock text={data.output} />
        </div>
      )}

      {/* Steps accordion */}
      {completedSteps.length > 0 && (
        <div className="info-card view-section">
          <button
            type="button"
            className="workforce-steps-toggle"
            onClick={() => setStepsOpen((v) => !v)}
          >
            <span>Research Steps ({completedSteps.length} completed)</span>
            <span>{stepsOpen ? 'Γû▓ Hide' : 'Γû╝ Show'}</span>
          </button>
          {stepsOpen && (
            <div style={{ marginTop: '12px' }}>
              {completedSteps.map((step, i) => (
                <StepCard key={step.id} step={step} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
