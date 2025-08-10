'use client'
import { useAudio } from './AudioProvider'

export default function SoundModal() {
  const { isOpen, setIsOpen, enabled, toggle, tracks, trackSrc, setTrack, volume, setVolume } = useAudio()
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      {/* panel */}
      <div className="absolute left-1/2 top-1/2 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-slate-900/80 text-white shadow-2xl ring-1 ring-white/10">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-semibold">Ambiance sonore</h2>
            <button onClick={() => setIsOpen(false)} className="rounded-md px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/20">Fermer</button>
          </div>

          {/* on/off + volume */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={toggle}
              className="rounded-md border border-white/20 px-3 py-1.5 bg-white/10 hover:bg-white/15"
            >
              {enabled ? '🔊 On' : '🔇 Off'}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm opacity-80">Volume</span>
              <input
                type="range"
                min="0" max="1" step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-40 accent-cyan-300"
              />
            </div>
          </div>

          {/* liste des pistes */}
          <div className="grid sm:grid-cols-2 gap-3">
            {tracks.map(t => (
              <button
                key={t.src}
                onClick={() => setTrack(t.src)}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  trackSrc === t.src
                    ? 'border-cyan-300/50 bg-white/10'
                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="text-sm opacity-80">Piste</div>
                <div className="font-medium">{t.label}</div>
                <div className="text-xs opacity-60 break-all">{t.src}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
