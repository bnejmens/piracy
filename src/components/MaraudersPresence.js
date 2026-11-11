'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const ONLINE_WINDOW_MS = 5 * 60 * 1000
const REFRESH_MS = 30000
const MAX_MARKERS = 18 // évite de saturer visuellement le dashboard

function hashId(value) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  return h >>> 0
}

// Zones latérales : préservent la navigation autour de l'avatar central.
function zoneFor(id, mobile) {
  const h = hashId(id)
  if (mobile) {
    return h % 2 === 0 ? { x0: 5, x1: 25, y0: 16, y1: 37 } : { x0: 75, x1: 94, y0: 48, y1: 69 }
  }
  return h % 2 === 0 ? { x0: 5, x1: 24, y0: 19, y1: 82 } : { x0: 76, x1: 94, y0: 22, y1: 63 }
}

function FootprintWalker({ player, mobile }) {
  const zone = zoneFor(player.user_id, mobile)
  const initial = useRef(null)
  if (!initial.current) {
    const h = hashId(player.user_id)
    initial.current = { x: zone.x0 + (h % 70) / 70 * (zone.x1 - zone.x0), y: zone.y0 + ((h >>> 7) % 70) / 70 * (zone.y1 - zone.y0) }
  }
  const [pos, setPos] = useState(initial.current)
  const posRef = useRef(initial.current)
  const [moving, setMoving] = useState(false)
  const [heading, setHeading] = useState(0)
  const timeout = useRef(null)

  useEffect(() => {
    let stopped = false
    const next = () => {
      if (stopped) return
      // Une pause naturelle, puis quelques petits pas dans une direction aléatoire.
      setMoving(false)
      timeout.current = window.setTimeout(() => {
        if (stopped) return
        const previous = posRef.current
        const nx = Math.max(zone.x0, Math.min(zone.x1, previous.x + (Math.random() - .5) * 9))
        const ny = Math.max(zone.y0, Math.min(zone.y1, previous.y + (Math.random() - .5) * 12))
        posRef.current = { x: nx, y: ny }
        setHeading(Math.atan2(ny - previous.y, nx - previous.x) * 180 / Math.PI + 90)
        setPos(posRef.current)
        setMoving(true)
        timeout.current = window.setTimeout(next, 3500 + Math.random() * 2200)
      }, 1300 + Math.random() * 4200)
    }
    next()
    return () => { stopped = true; window.clearTimeout(timeout.current) }
  }, [player.user_id, mobile, zone.x0, zone.x1, zone.y0, zone.y1])

  return (
    <div className={`marauder-walker ${player.leaving ? 'marauder-leaving' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, transitionDuration: moving ? '4200ms' : '0ms' }}
      title={`${player.name} — en ligne`}>
      <div className="marauder-steps" style={{ transform: `rotate(${heading}deg)` }}>
        <span className={`marauder-foot marauder-left ${moving ? 'is-moving' : ''}`} />
        <span className={`marauder-foot marauder-right ${moving ? 'is-moving' : ''}`} />
      </div>
      <span className="marauder-name">{player.name}</span>
    </div>
  )
}

export default function MaraudersPresence() {
  const [players, setPlayers] = useState([])
  const [mobile, setMobile] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const cleanupTimers = useRef([])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onResize = () => setMobile(window.innerWidth < 640)
    const onMotion = () => setReducedMotion(mq.matches)
    onResize(); onMotion()
    window.addEventListener('resize', onResize)
    mq.addEventListener?.('change', onMotion)
    return () => {
      window.removeEventListener('resize', onResize)
      mq.removeEventListener?.('change', onMotion)
    }
  }, [])

  useEffect(() => {
    let active = true
    async function refresh() {
      if (document.visibilityState !== 'visible') return
      const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
      const { data: profiles, error } = await supabase.from('profiles')
        .select('user_id, last_seen_at')
        .gte('last_seen_at', since)
        .order('last_seen_at', { ascending: false })
        .limit(200)
      if (error || !active) {
        if (error) console.warn('[Carte du Maraudeur] Lecture des présences :', error.message)
        return
      }
      const ids = (profiles || []).map(p => p.user_id).filter(Boolean)
      let names = {}
      if (ids.length) {
        const { data: characters, error: charsError } = await supabase.from('characters')
          .select('id, user_id, name, is_active')
          .in('user_id', ids)
          .eq('is_active', true)
        if (charsError) console.warn('[Carte du Maraudeur] Lecture des personnages :', charsError.message)
        for (const ch of characters || []) if (!names[ch.user_id]) names[ch.user_id] = ch.name
      }
      if (!active) return
      const incoming = ids.filter(id => names[id]).slice(0, MAX_MARKERS).map(id => ({ user_id: id, name: names[id], leaving: false }))
      const incomingIds = new Set(incoming.map(p => p.user_id))
      setPlayers(old => {
        const outgoing = old.filter(p => !incomingIds.has(p.user_id)).map(p => ({ ...p, leaving: true }))
        return [...incoming, ...outgoing]
      })
      const timer = window.setTimeout(() => {
        if (active) setPlayers(old => old.filter(p => !p.leaving))
      }, 1300)
      cleanupTimers.current.push(timer)
    }
    void refresh()
    const interval = window.setInterval(() => void refresh(), REFRESH_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      cleanupTimers.current.forEach(window.clearTimeout)
      cleanupTimers.current = []
    }
  }, [])

  return (
    <div className={`marauder-layer ${reducedMotion ? 'reduce-motion' : ''}`} aria-label="Personnages en ligne" role="group">
      {players.map(p => reducedMotion ? (
        <div key={p.user_id} className="marauder-static"><span className="marauder-static-symbol">⌁</span> {p.name}</div>
      ) : <FootprintWalker key={p.user_id} player={p} mobile={mobile} />)}
      <style jsx global>{`
        .marauder-layer { position:absolute; inset:0; z-index:2; pointer-events:none; overflow:hidden; }
        .marauder-walker { position:absolute; display:flex; flex-direction:column; align-items:center; gap:4px; opacity:1;
          transition-property:left,top,opacity; transition-timing-function:linear; animation:appear 1.5s ease both; }
        .marauder-walker.marauder-leaving { opacity:0; animation:none; transition:opacity 1.2s ease; }
        .marauder-steps { display:flex; align-items:center; gap:5px; height:28px; filter:drop-shadow(0 0 6px rgba(255,210,135,.4)); }
        .marauder-foot { display:block; width:7px; height:15px; border-radius:65% 35% 50% 40%; background:#e8c994;
          box-shadow:inset 0 0 2px #6e4c2a,0 0 6px rgba(246,209,151,.4); opacity:.65; }
        .marauder-left { transform:rotate(-22deg) translateY(-4px); }
        .marauder-right { transform:rotate(22deg) translateY(4px); }
        .marauder-left.is-moving { animation:stepLeft .8s ease-in-out infinite alternate; }
        .marauder-right.is-moving { animation:stepRight .8s ease-in-out infinite alternate; }
        .marauder-name { color:#f4dfb4; font:italic 12px/1.3 Georgia,serif; letter-spacing:.035em; white-space:nowrap;
          text-shadow:0 1px 4px #120b06,0 0 9px #100c07; padding:2px 6px; border-radius:4px; background:rgba(10,8,6,.27); }
        .reduce-motion { display:flex; flex-wrap:wrap; align-content:flex-end; align-items:flex-end; gap:8px; padding:12px 16px 110px; }
        .marauder-static { color:#f4dfb4; font:italic 12px Georgia,serif; text-shadow:0 1px 4px #120b06; }
        .marauder-static-symbol { color:#ddbf86; }
        @keyframes appear { from { opacity:0; } to { opacity:1; } }
        @keyframes stepLeft { to { transform:rotate(-22deg) translateY(5px); opacity:1 } }
        @keyframes stepRight { to { transform:rotate(22deg) translateY(-5px); opacity:1 } }
      `}</style>
    </div>
  )
}
