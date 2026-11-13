import { content, sourceById } from '../../content'

/** The published spaceflight finding behind an indicator, with its source. */
export function AnchorNote({ indicatorId, compact = false }: { indicatorId: string; compact?: boolean }) {
  const a = content.anchors.find((x) => x.indicatorId === indicatorId)
  if (!a) return null
  const src = a.sourceIds.map((id) => sourceById(id)).filter(Boolean)
  return (
    <p className={`text-signal/90 ${compact ? 'text-[11px]' : 'text-xs'} leading-snug`} data-anchor={indicatorId}>
      <span className="font-mono tracking-wider">REAL DATA · </span>
      {a.text}{' '}
      {src.map((s) => (
        s!.url
          ? <a key={s!.id} href={s!.url} target="_blank" rel="noreferrer" className="underline decoration-dotted text-dust hover:text-star">{s!.publisher}{s!.year ? ` ${s!.year}` : ''}</a>
          : <span key={s!.id} className="text-dust">{s!.publisher}</span>
      ))}
    </p>
  )
}
