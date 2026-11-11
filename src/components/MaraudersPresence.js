'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const ONLINE_WINDOW_MS = 5 * 60 * 1000
const REFRESH_MS = 30000
const MAX_MARKERS = 18
const DECOY_COUNT = 5
const DECOY_NAMES = [
  'Kaur Nutti', 'Fronk Leboeuf', 'Serj', 'Herschel Aurora', 'Paul Filly',
  'Cypress Newts', 'Heather Locket', 'Vernice Stinkwood', 'Alice Quilt',
  'Alex Locks', 'Carol Rabbot', 'Jasper Fluke', 'Nick Quasi Sans Tête',
  'Pivey', 'Le Baron Sanglant', 'Frances Drake', 'Dipsy', 'Fora Nose',
  'Robin Laurel', 'Pierce Habbot', 'Allie Pattil', 'Tino Pantal',
  'Alder Pincushion', 'Archibald Gerble', 'Twiggly Sprinkly', 'Luzie Sunbutt',
]

// Tirage local, indépendant de Supabase. Un seul tirage à chaque montage du dashboard.
function pickDecoys() {
  const available = [...DECOY_NAMES]
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[available[i], available[j]] = [available[j], available[i]]
  }
  return available.slice(0, DECOY_COUNT).map((name, index) => ({
    user_id: `decoy-${index}`,
    name,
    decoy: true,
    leaving: false,
  }))
}

function hashId(value) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// Une vraie empreinte stylisée : semelle, talon et petites marques des orteils.
function ShoePrint({ side }) {
  return (
    <g className={`marauder-print marauder-print-${side}`}>
      <path d="M-6.4 -7.3 C-9 -3.7 -8.9 1 -7.4 4.1 C-5.7 7.9 -5 12.4 -1 13.2 C3.7 13.9 6.7 10.7 7 6.6 C7.3 2.9 8.8 -1.8 6.1 -6.7 C3.9 -10.6 -3.5 -11.7 -6.4 -7.3 Z" />
      <ellipse cx="-0.1" cy="12" rx="4.9" ry="3.4" />
      <circle cx="-6.1" cy="-13.3" r="2.7" />
      <circle cx="-1.4" cy="-15.4" r="3.1" />
      <circle cx="3.8" cy="-14.2" r="2.7" />
      <circle cx="8.2" cy="-11.2" r="2.1" />
    </g>
  )
}

function Footprints({ walking }) {
  return (
    <svg className={`marauder-footprints ${walking ? 'is-walking' : ''}`}
      viewBox="0 0 70 66" width="64" height="60" aria-hidden="true">
      <g transform="translate(23 41) rotate(-18)"><ShoePrint side="left" /></g>
      <g transform="translate(46 24) rotate(15)"><ShoePrint side="right" /></g>
    </svg>
  )
}

function randomPoint() {
  return { x: 8 + Math.random() * 84, y: 13 + Math.random() * 72 }
}

function FootprintWalker({ player }) {
  const [pos, setPos] = useState(randomPoint)
  const posRef = useRef(pos)
  const [heading, setHeading] = useState(0)
  const [moving, setMoving] = useState(false)
  const [duration, setDuration] = useState(10000)

  useEffect(() => {
    let cancelled = false
    let timer

    function walk() {
      if (cancelled) return
      const from = posRef.current
      let to = randomPoint()
      // Parcours plus longs à travers l'ensemble de l'écran, pas juste des bandes latérales.
      for (let i = 0; i < 24 && Math.hypot(to.x - from.x, to.y - from.y) < 28; i++) {
        to = randomPoint()
      }
      const dx = to.x - from.x
      const dy = to.y - from.y
      const distance = Math.hypot(dx, dy)
      // Vitesse régulière, lente et perceptible ; trajet souvent de 9 à 18 secondes.
      const travelTime = clamp(Math.round(distance * 230), 9000, 18000)
      setHeading(Math.atan2(dy, dx) * 180 / Math.PI + 90)
      setDuration(travelTime)
      setMoving(true)
      posRef.current = to
      setPos(to)
      timer = window.setTimeout(() => {
        if (cancelled) return
        setMoving(false)
        timer = window.setTimeout(walk, 700 + Math.random() * 2500)
      }, travelTime)
    }

    timer = window.setTimeout(walk, 900 + Math.random() * 800)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [player.user_id])

  return (
    <div
      className={`marauder-walker ${player.decoy ? 'marauder-decoy' : ''} ${player.leaving ? 'marauder-leaving' : ''}`}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        transitionDuration: `${duration}ms, ${duration}ms, 1200ms`,
      }}
      title={player.decoy ? player.name : `${player.name} — en ligne`}
    >
      <div className="marauder-steps" style={{ transform: `rotate(${heading}deg)` }}>
        <Footprints walking={moving} />
      </div>
      <span className="marauder-name">{player.name}</span>
    </div>
  )
}

export default function MaraudersPresence() {
  const [players, setPlayers] = useState([])
  const [decoys, setDecoys] = useState([])
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setDecoys(pickDecoys())
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setReducedMotion(mq.matches)
    onMotion()
    mq.addEventListener?.('change', onMotion)
    return () => {
      mq.removeEventListener?.('change', onMotion)
    }
  }, [])

  useEffect(() => {
    let active = true
    let requestSerial = 0
    const timers = new Set()

    async function refresh() {
      if (document.visibilityState !== 'visible') return
      const serial = ++requestSerial
      const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
      const { data: profiles, error } = await supabase.from('profiles')
        .select('user_id, last_seen_at')
        .gte('last_seen_at', since)
        .order('last_seen_at', { ascending: false })
        .limit(200)

      if (error || !active || serial !== requestSerial) {
        if (error) console.warn('[Carte du Maraudeur] Présences :', error.message)
        return
      }

      const ids = (profiles || []).map(p => p.user_id).filter(Boolean)
      const names = {}
      if (ids.length) {
        const { data: characters, error: charsError } = await supabase.from('characters')
          .select('id, user_id, name, is_active')
          .in('user_id', ids)
          .eq('is_active', true)
        if (charsError) console.warn('[Carte du Maraudeur] Personnages :', charsError.message)
        for (const ch of characters || []) {
          if (!names[ch.user_id]) names[ch.user_id] = ch.name
        }
      }
      if (!active || serial !== requestSerial) return

      const incoming = ids.filter(id => names[id]).slice(0, MAX_MARKERS)
        .map(id => ({ user_id: id, name: names[id], leaving: false }))
      const incomingIds = new Set(incoming.map(p => p.user_id))
      setPlayers(old => [
        ...incoming,
        ...old.filter(p => !incomingIds.has(p.user_id)).map(p => ({ ...p, leaving: true })),
      ])
      const timer = window.setTimeout(() => {
        timers.delete(timer)
        if (active) setPlayers(old => old.filter(p => !p.leaving))
      }, 1300)
      timers.add(timer)
    }

    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [])

  return (
    <div className={`marauder-layer ${reducedMotion ? 'reduce-motion' : ''}`} aria-label="Personnages en ligne" role="group">
      {[...players, ...decoys].map(p => reducedMotion
        ? <div key={p.user_id} className={`marauder-static ${p.decoy ? 'marauder-decoy' : ''}`}><span aria-hidden="true">♟</span> {p.name}</div>
        : <FootprintWalker key={p.user_id} player={p} />)}
      <style jsx global>{`
        .marauder-layer { position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
        .marauder-walker { position:absolute; display:flex; flex-direction:column; align-items:center; gap:0;
          transform:translate(-50%,-50%); opacity:1; will-change:left,top;
          transition-property:left,top,opacity; transition-timing-function:linear,linear,ease; }
        .marauder-walker.marauder-leaving { opacity:0; }
        .marauder-steps { width:64px; height:60px; transition:transform 500ms ease-in-out;
          filter:drop-shadow(0 0 3px rgba(255,215,151,.9)) drop-shadow(0 0 8px rgba(241,177,96,.4)); }
        .marauder-footprints { display:block; width:64px; height:60px; overflow:visible; }
        .marauder-print { fill:#f3dbac; stroke:#78512d; stroke-width:.45; opacity:.95; transform-box:fill-box;
          transform-origin:center; }
        .marauder-footprints.is-walking .marauder-print-left {
          animation:marauder-stamp-left .72s ease-in-out infinite alternate; }
        .marauder-footprints.is-walking .marauder-print-right {
          animation:marauder-stamp-right .72s ease-in-out infinite alternate; }
        .marauder-decoy .marauder-steps {
          filter:drop-shadow(0 0 3px rgba(121,174,206,.65)) drop-shadow(0 0 8px rgba(102,153,188,.25));
        }
        .marauder-decoy .marauder-print { fill:#a8bccb; stroke:#40566c; opacity:.78; }
        .marauder-decoy .marauder-name { color:#bdcddd; background:rgba(10,17,26,.44); }
        .marauder-static.marauder-decoy { color:#a8bccb; }
        .marauder-name { color:#f4dfb4; font:italic 14px/1.3 Georgia,serif; letter-spacing:.035em;
          white-space:nowrap; text-shadow:0 1px 4px #120b06,0 0 9px #100c07;
          padding:3px 7px; border-radius:4px; background:rgba(10,8,6,.42); }
        .reduce-motion { display:flex; flex-wrap:wrap; align-content:flex-end; align-items:flex-end;
          gap:8px; padding:12px 16px 110px; }
        .marauder-static { color:#f4dfb4; font:italic 12px Georgia,serif; text-shadow:0 1px 4px #120b06; }
        @keyframes marauder-stamp-left { 0% { opacity:.35; transform:translateY(3px) scale(.92) }
          100% { opacity:1; transform:translateY(-3px) scale(1.06) } }
        @keyframes marauder-stamp-right { 0% { opacity:1; transform:translateY(-3px) scale(1.06) }
          100% { opacity:.35; transform:translateY(3px) scale(.92) } }
        @media (max-width:640px) { .marauder-footprints { width:46px; height:44px; }
          .marauder-steps { width:46px; height:44px; } .marauder-name { font-size:11px; } }
        @media (prefers-reduced-motion: reduce) {
          .marauder-walker, .marauder-print { animation:none !important; transition:none !important; }
        }
      `}</style>
    </div>
  )
}
