/**
 * Barra de progresso. value 0..1 = progresso real; null = tarefa em andamento sem medida (indeterminada).
 */
interface Props {
  value: number | null;
  label: string;
}

export function Progress({ value, label }: Props) {
  const determinate = value !== null;
  const pct = determinate ? Math.round(Math.max(0, Math.min(1, value)) * 100) : null;
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className="progress-head">
        <span>{label}</span>
        {pct !== null && <span className="progress-pct">{pct}%</span>}
      </div>
      <div className={`progress-track ${determinate ? '' : 'indeterminate'}`}>
        <div className="progress-fill" style={determinate ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
}
