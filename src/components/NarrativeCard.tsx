interface Props {
  narrative: string | undefined
}

export default function NarrativeCard({ narrative }: Props) {
  if (!narrative) return null
  return (
    <div className="info-card" style={{ marginBottom: '24px', borderLeft: '3px solid #58a6ff' }}>
      <h3 style={{ marginBottom: '10px' }}>Analyst Assessment</h3>
      <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#c9d1d9', margin: 0 }}>
        {narrative}
      </p>
    </div>
  )
}
