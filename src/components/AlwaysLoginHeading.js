'use client'

import { useId, useState } from 'react'
import SoundTrigger from '@/components/audio/SoundTrigger'

export default function AlwaysLoginHeading({ centered = false }) {
  const [hovered, setHovered] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const descriptionId = useId()
  const visible = hovered || expanded

  function closeDescription() {
    setHovered(false)
    setExpanded(false)
  }

  return (
    <div className={centered ? 'mb-7 text-center' : 'mb-6'}>
      <div className={`relative flex items-center gap-2 ${centered ? 'justify-center' : ''}`}
        onPointerLeave={event => { if (event.pointerType === 'mouse') setHovered(false) }}
        onKeyDown={event => { if (event.key === 'Escape' && visible) closeDescription() }}>
        <h1 className={centered ? 'text-2xl font-semibold tracking-[0.18em] text-amber-100 sm:text-3xl' : 'text-2xl font-semibold tracking-wide'}>
          <button type="button" aria-expanded={visible} aria-controls={descriptionId}
            className="cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-200"
            onPointerEnter={event => { if (event.pointerType === 'mouse') setHovered(true) }}
            onClick={() => {
              setHovered(false)
              setExpanded(!visible)
            }}
            onBlur={() => setExpanded(false)}>
            ⭒ ALWAYS ⭒
          </button>
        </h1>
        <SoundTrigger onOpen={closeDescription} />
        <div id={descriptionId} hidden={!visible} className="absolute inset-x-0 top-full z-30 pt-1 text-left">
          <section className="max-h-[55dvh] overflow-y-auto rounded-xl border border-amber-200/30 bg-slate-950 p-4 text-sm leading-relaxed text-slate-200 shadow-2xl">
            <h2 className="font-serif text-lg text-amber-100">Le monde sorcier en 2026</h2>
            <p className="mt-2">Always est un forum RP Harry Potter francophone où les technologies moldues bousculent le Secret magique. De Poudlard à Londres en passant par Godric’s Hollow, crée ton personnage et écris son histoire à plusieurs.</p>
            <p className="mt-2">Mène des enquêtes interactives, partage tes indices et retrouve les personnages et les lieux dans le wiki. Les ambiances sonores accompagnent l’écriture et la lecture des scènes.</p>
            <p className="mt-3 text-xs text-slate-300">Projet indépendant.</p>
          </section>
        </div>
      </div>
      <p className={centered ? 'mt-3 text-sm italic text-slate-200/80' : 'mt-2 text-slate-200/80'}>After all this time?</p>
    </div>
  )
}
