import { Status, STATUS_LABEL } from '../lib/progress';
import type { Difficulty } from '../lib/data';

export default function StatusChip({ status, compact, title }: { status: Status; compact?: boolean; title?: string }) {
  return <span className={`chip chip-dot s-${status}`} title={title || STATUS_LABEL[status]}>{compact ? null : STATUS_LABEL[status]}</span>;
}
export function DiffChip({ d }: { d: Difficulty }) {
  return <span className={`chip d-${d}`}>{d[0].toUpperCase() + d.slice(1)}</span>;
}
