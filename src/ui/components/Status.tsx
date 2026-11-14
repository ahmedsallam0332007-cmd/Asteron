import type { Provenance, Status } from '../../engine/types'

const META: Record<Status, { icon: string; label: string; cls: string }> = {
  normal: { icon: '●', label: 'Normal', cls: 'text-st-normal border-st-normal/40 bg-st-normal/10' },
  watch: { icon: '◆', label: 'Watch', cls: 'text-st-watch border-st-watch/40 bg-st-watch/10' },
  concern: { icon: '▲', label: 'Concern', cls: 'text-st-concern border-st-concern/40 bg-st-concern/10' },
  urgent: { icon: '✖', label: 'Urgent', cls: 'text-st-urgent border-st-urgent/40 bg-st-urgent/10' },
  unknown: { icon: '?', label: 'Unknown', cls: 'text-st-unknown border-dashed border-st-unknown/60 bg-st-unknown/10' },
}

/** Status is never colour-only: icon + label + colour. */
export function StatusBadge({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'lg' }) {
  const m = META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${m.cls} ${size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs'}`}
      data-status={status}
    >
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </span>
  )
}

const PROV: Record<Provenance['kind'], { label: string; cls: string; title: string }> = {
  simulated: { label: 'SIM', cls: 'text-dust border-line', title: 'Simulated by the Asteron generator' },
  manual: { label: 'MANUAL', cls: 'text-signal border-signal/40', title: 'Entered by the crew in the check-in' },
  judge: { label: 'JUDGE', cls: 'text-mauve border-mauve/40', title: 'Typed by a judge in the Judge Lab' },
}
export function ProvenanceBadge({ p }: { p?: Provenance }) {
  if (!p) return null
  const m = PROV[p.kind]
  return (
    <span title={m.title} className={`font-mono text-[10px] tracking-wider rounded border px-1.5 py-px ${m.cls}`}>
      {m.label}
    </span>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-hull/55 backdrop-blur-xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] ${className}`}>{children}</section>
}
