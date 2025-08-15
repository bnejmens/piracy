'use client'
import { useMemo } from 'react'

/**
 * ColorPalette
 * - 60 couleurs par défaut (palette lisible sur fond clair/sombre)
 * - onPick(hex): callback au clic
 * - Props:
 *    - size (px, par défaut 22)
 *    - columns (nb colonnes, par défaut 10)
 *    - colors (override tableau hex)
 */
export default function ColorPalette({ onPick, size = 22, columns = 10, colors }) {
  const palette = useMemo(() => (
    colors?.length ? colors : [
      // Neutres (10)
      '#000000','#111827','#1f2937','#374151','#4b5563','#6b7280','#9ca3af','#d1d5db','#e5e7eb','#ffffff',
      // Ambres/Oranges (10)
      '#78350f','#92400e','#b45309','#d97706','#ea580c','#f97316','#fb923c','#fdba74','#fed7aa','#ffedd5',
      // Rouges/Roses (10)
      '#7f1d1d','#991b1b','#b91c1c','#dc2626','#ef4444','#f87171','#fca5a5','#fecaca','#e11d48','#f43f5e',
      // Violets (10)
      '#4c1d95','#5b21b6','#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe','#581c87','#9333ea',
      // Bleus/Cyans (10)
      '#0c4a6e','#075985','#0369a1','#0284c7','#0ea5e9','#22d3ee','#38bdf8','#60a5fa','#3b82f6','#1d4ed8',
      // Verts/Jaunes-verts (10)
      '#064e3b','#065f46','#047857','#059669','#10b981','#34d399','#22c55e','#84cc16','#a3e635','#bef264',
    ]
  ), [colors])

  return (
    <div className="inline-block rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-2 shadow-2xl">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {palette.map((hex) => (
          <button
            key={hex}
            type="button"
            title={hex}
            onClick={() => onPick?.(hex)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); onPick?.(hex)
              }
            }}
            className="rounded-md border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            style={{ width: size, height: size, background: hex }}
            aria-label={`Choisir la couleur ${hex}`}
          />
        ))}
      </div>
    </div>
  )
}
