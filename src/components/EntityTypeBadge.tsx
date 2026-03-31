export type EntityType = 'company' | 'person' | 'sector' | 'vessel';

const ICONS: Record<EntityType, string> = {
  company: '🏢',
  person: '👤',
  vessel: '🚢',
  sector: '🏭',
};

export default function EntityTypeBadge({
  type,
  text,
  showIcon = true,
}: {
  type: EntityType;
  /** Overrides the displayed label (e.g. "Deep Analysis"). */
  text?: string;
  showIcon?: boolean;
}) {
  const label = (text ?? type).trim();
  return (
    <span className={`entity-type-badge ${type}`} aria-label={label}>
      {showIcon ? ICONS[type] : null}
      {showIcon ? ' ' : null}
      {label}
    </span>
  );
}

