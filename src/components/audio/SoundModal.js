
'use client'

import { useMemo, useState } from 'react'
import { useAudio } from './AudioProvider'

export default function SoundModal() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tous')
  const {
    isOpen,
    setIsOpen,
    playing,
    toggle,
    sounds,
    mix,
    toggleSound,
    setSoundVolume,
    volume,
    setVolume,
    error,
  } = useAudio()

  const categories = useMemo(() => {
    return [
      'Tous',
      ...new Set(sounds.map(sound => sound.category || 'Autres')),
    ]
  }, [sounds])

  const filteredSounds = useMemo(() => {
    const query = search.trim().toLowerCase()

    return sounds.filter(sound => {
      const matchesCategory =
        category === 'Tous' || sound.category === category

      const matchesSearch =
        !query ||
        sound.label.toLowerCase().includes(query) ||
        (sound.category || '').toLowerCase().includes(query)

      return matchesCategory && matchesSearch
    })
  }, [sounds, category, search])

  if (!isOpen) return null

  const activeCount = sounds.filter(
    sound => mix[sound.src]?.active
  ).length

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-3 sm:p-6">

      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      <section className="relative z-10 flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-amber-200/25 bg-[#21192c]/95 text-[#f9e9d0] shadow-2xl">

        <header className="flex items-start justify-between gap-3 border-b border-amber-200/15 p-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-amber-300/65">
              Le Monde Magique
            </p>

            <h2 className="mt-1 font-serif text-2xl text-amber-100">
              Ambiances sonores
            </h2>

            <p className="mt-1 text-xs text-white/50">
              Crée une atmosphère pour accompagner ton RP.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
          >
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/15 bg-white/5 p-3">
            <div>
              <p className="text-sm font-medium text-amber-100">
                {playing ? 'Ambiance en cours' : 'Ambiance arrêtée'}
              </p>

              <p className="text-xs text-white/50">
                {activeCount} son{activeCount > 1 ? 's' : ''} sélectionné{activeCount > 1 ? 's' : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={toggle}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                playing
                  ? 'border border-amber-200/25 bg-white/10 text-amber-100 hover:bg-white/15'
                  : 'bg-amber-300 text-[#24192a] hover:bg-amber-200'
              }`}
            >
              {playing ? 'Arrêter' : '▶ Écouter'}
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-300/25 bg-red-900/20 p-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <label htmlFor="ambient-master">
                Volume général
              </label>
              <span className="text-amber-200/70">
                {Math.round(volume * 100)} %
              </span>
            </div>

            <input
              id="ambient-master"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={e => setVolume(Number(e.target.value))}
              className="w-full accent-amber-300"
            />
          </div>

          <div>
            <h3 className="mb-3 font-serif text-lg text-amber-100">
              Mélanger les ambiances
            </h3>


            {/* Recherche */}
            <input
              type="search"
              placeholder="Rechercher un son..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mb-3 w-full rounded-lg border border-amber-200/20 bg-black/20 px-3 py-2.5 text-sm text-amber-50 outline-none placeholder:text-white/40 focus:border-amber-300/50"
            />

            {/* Catégories */}
            <div className="mb-4 flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    category === cat
                      ? 'border-amber-300 bg-amber-300 text-[#24192a]'
                      : 'border-white/15 bg-white/5 text-amber-100/70 hover:bg-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <p className="mb-3 text-xs text-white/45">
              {filteredSounds.length} son(s) affiché(s)
            </p>


            <div className="grid gap-3 sm:grid-cols-2">
              {filteredSounds.map(sound => {
                const settings = mix[sound.src] || {
                  active: false,
                  volume: 0.4,
                }

                return (
                  <div
                    key={sound.src}
                    className={`rounded-xl border p-3 transition ${
                      settings.active
                        ? 'border-amber-300/40 bg-amber-200/[0.09]'
                        : 'border-white/10 bg-black/15'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={settings.active}
                      onClick={() => toggleSound(sound.src)}
                      className="mb-3 flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-xl">
                          {sound.icon}
                        </span>

                        <span className="text-sm font-semibold">
                          {sound.label}
                        </span>
                      </span>

                      <span
                        className={`rounded-full px-2 py-1 text-[11px] ${
                          settings.active
                            ? 'bg-amber-300 text-[#251c28]'
                            : 'bg-white/10 text-white/55'
                        }`}
                      >
                        {settings.active ? 'Actif' : 'Inactif'}
                      </span>
                    </button>

                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={settings.volume}
                        onChange={e =>
                          setSoundVolume(
                            sound.src,
                            Number(e.target.value)
                          )
                        }
                        aria-label={`Volume ${sound.label}`}
                        className="min-w-0 flex-1 accent-amber-300"
                      />

                      <span className="w-9 text-right text-xs text-white/55">
                        {Math.round(settings.volume * 100)}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <p className="text-xs leading-relaxed text-white/45">
            Les ambiances continuent pendant la navigation interne
            sur le site. Tu peux fermer cette fenêtre sans les arrêter.
            Tes volumes sont conservés pour ta prochaine visite.
          </p>
        </div>
      </section>
    </div>
  )
}
