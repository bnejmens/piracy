'use client'

// Échelle bipolaire identique en édition et en lecture de profil.
// Deux moitiés toujours visibles : gauche violet, droite ivoire.
// Le repère discret indique la position, sans transformer la portion
// de la barre opposée en « progression » trompeuse.
export default function PersonalityTraitScale({
  leftLabel, rightLabel, value = 5, onChange,
  leftColor = '#9064b9', rightColor = '#e4d4a9',
}) {
  const numeric = Number(value ?? 5)
  const v = Number.isFinite(numeric) ? Math.max(0, Math.min(10, numeric)) : 5
  const pct = (v / 10) * 100
  const tendency = v < 5 ? leftLabel : v > 5 ? rightLabel : 'Équilibré'
  const description = `${leftLabel} — ${rightLabel} : ${tendency}, ${v}/10`

  return (
    <div className="min-w-0 space-y-2 select-none">
      <div className="flex items-center justify-between gap-2 text-sm text-white/75">
        <span className="min-w-0">{leftLabel}</span>
        <span className="min-w-0 text-right">{rightLabel}</span>
      </div>
      <div
        className="relative h-4 overflow-hidden rounded-full border border-white/15 bg-black/30"
        role={onChange ? undefined : 'img'}
        aria-label={onChange ? undefined : description}
        title={description}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${leftColor} 0%, ${leftColor} 50%, ${rightColor} 50%, ${rightColor} 100%)` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#3d3048]/70 bg-[#b9a5c4] shadow-none"
          style={{ left: `${Math.max(2, Math.min(98, pct))}%` }}
        />
        {onChange && (
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={v}
            onChange={event => onChange(Number(event.target.value))}
            aria-label={`${leftLabel} à ${rightLabel}`}
            aria-valuetext={description}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        )}
      </div>
    </div>
  )
}
