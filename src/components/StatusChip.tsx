import { Status, STATUS_LABEL } from '../lib/progress';
import type { Difficulty } from '../lib/data';

/** Not-started (and `compact`) render as a small coloured dot with an aria-label; started states show the text label. */
export default function StatusChip({ status, compact, title }: { status: Status; compact?: boolean; title?: string }) {
  if (compact || status === 'not-started') {
    return <span className={`status-dot s-${status}`} role="img" aria-label={STATUS_LABEL[status]} title={title || STATUS_LABEL[status]} />;
  }
  return <span className={`chip chip-dot s-${status}`} title={title || STATUS_LABEL[status]}>{STATUS_LABEL[status]}</span>;
}
export function DiffChip({ d }: { d: Difficulty }) {
  return <span className={`chip d-${d}`}>{d[0].toUpperCase() + d.slice(1)}</span>;
}
