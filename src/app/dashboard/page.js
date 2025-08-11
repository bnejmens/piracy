// src/app/dashboard/page.js
'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/navigation'

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

export default function DashboardPage() {
  const router = useRouter()

  // state
  const [profile, setProfile] = useState(null)
  const [character, setCharacter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // responsive geometry
  const [radius, setRadius] = useState(220)
  const [iconSize, setIconSize] = useState(120)

  // hooks MUST come before any conditional returns
  const actions = useMemo(() => ([
    { key:'messages', label:'Messages', href:'/messages', icon:'/images/msg-icon.png',    ring:'ring-amber-300/80',  glow:'bg-amber-300/25'  },
    { key:'rp',       label:'RP',       href:'/rp',       icon:'/images/rp-icon.png',     ring:'ring-cyan-300/80',   glow:'bg-cyan-300/25'   },
    { key:'lore',     label:'Lore',     href:'/wiki',     icon:'/images/lore-icon.png',   ring:'ring-violet-300/80', glow:'bg-violet-300/25' },
    { key:'members',  label:'Membres',  href:'/members',  icon:'/images/member-icon.png', ring:'ring-fuchsia-300/80',glow:'bg-fuchsia-300/25'},
    { key:'profile',  label:'Profil',   href:'/profile',  icon:'/images/profile-icon.png',ring:'ring-sky-300/80',    glow:'bg-sky-300/25'    },
  ]), [])

  const positioned = useMemo(() => {
    const N = actions.length
    return actions.map((a, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2 // start at top, clockwise
      return { ...a, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })
  }, [actions, radius])

  // effects
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const min = Math.min(w, h)
      setRadius(Math.round(clamp(min * 1.6, 150, 320)))
      setIconSize(Math.round(clamp(min * 0.14, 100, 180)))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      const { data: prof, error: e1 } = await supabase
        .from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      if (e1) { setError(e1.message); setLoading(false); return }
      setProfile(prof)
      if (prof?.active_character_id) {
        const { data: ch } = await supabase
          .from('characters').select('*').eq('id', prof.active_character_id).maybeSingle()
        setCharacter(ch || null)
      }
      setLoading(false)
    }
    run()
  }, [router])

  // display data (safe defaults so hooks order never changes)
  const displayName =
    character?.name?.trim()
    || profile?.pseudo?.trim()
    || profile?.email?.split('@')[0]
    || 'Joueur'

  const displayGenre  = character?.genre || profile?.genre || null
  const displayAvatar = character?.avatar_url || profile?.avatar_url || null
  const nameClass =
    displayGenre === 'féminin'
      ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400'
      : displayGenre === 'masculin'
        ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400'
        : 'text-white'

  return (
    <main className="fixed inset-0 overflow-hidden">

{/* Nom en haut à gauche */}
<div className="absolute top-6 left-8 z-40">
  <span
    className={`text-xl md:text-2xl font-semibold tracking-wide drop-shadow ${nameClass}`}
    style={{ textShadow: '0 1px 10px rgba(0,0,0,.5)' }}
  >
    {displayName}
  </span>
</div>

      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/dashboard-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Logout */}
      <button
        onClick={async () => { await supabase.auth.signOut(); router.push('/auth') }}
        className="absolute top-6 right-8 z-40
           rounded-full border border-white/25 bg-white/25 backdrop-blur-md
           px-3 py-1.5 text-white/90 text-sm
           hover:bg-white/20 focus:outline-none"
      >
        Se déconnecter
      </button>

      {/* Content states */}
      {loading ? (
        <div className="absolute inset-0 grid place-items-center text-white/80">Chargement…</div>
      ) : error ? (
        <div className="absolute inset-0 grid place-items-center text-rose-200">Erreur : {error}</div>
      ) : !profile ? (
        <div className="absolute inset-0 grid place-items-center text-rose-200">Profil introuvable</div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative">
            {/* Avatar */}
            <div className="group relative w-[min(64vw,360px)] h-[min(64vw,360px)] rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_20px_80px_rgba(0,0,0,.45)] mx-auto">
              {displayAvatar
                ? <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                : <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-6xl">
                    {(displayName||'?')[0]?.toUpperCase()||'?'}
                  </div>
              }
              <div className="pointer-events-none absolute -inset-3 rounded-full blur-2xl bg-sky-300/20 opacity-0 group-hover:opacity-80 transition duration-300" />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-amber-300/45" />
            </div>

               {/* Circular action ring */}
            <div className="pointer-events-none absolute inset-0">
              {positioned.map(a => (
                <button
                  key={a.key}
                  onClick={() => router.push(a.href)}
                  className="pointer-events-auto group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                  style={{ left:`calc(50% + ${a.x}px)`, top:`calc(45% + ${a.y}px)`, width:iconSize, height:iconSize }}
                  aria-label={a.label}
                >
                  <div className="relative w-full h-full rounded-full border border-white/45 bg-white/6 backdrop-blur-sm p-2 transition">
                    <span className={`pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:${a.ring} transition`} />
                    <span className={`pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl ${a.glow} transition`} />
                    <Image src={a.icon} alt="" fill sizes="140px" className="object-contain drop-shadow" />
                  </div>
                  <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                    {a.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
