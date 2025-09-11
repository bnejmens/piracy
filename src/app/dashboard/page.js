// src/app/dashboard/page.js
'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/navigation'
import useCharacterSubscriptions from '@/hooks/useCharacterSubscriptions'
import { RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import NotificationsWidget from '@/components/NotificationsWidget'

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

export default function DashboardPage() {
  const router = useRouter()

  // state
  const [profile, setProfile] = useState(null)
  const [character, setCharacter] = useState(null)
  const [myChars, setMyChars] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [hasNewRP, setHasNewRP] = useState(false)
  const [hasNewNotif, setHasNewNotif] = useState(false)

  // responsive geometry
  const [radius, setRadius] = useState(180)
  const [iconSize, setIconSize] = useState(110)
  const [centerSize, setCenterSize] = useState(180)

 // Pseudo joueur (profil)
 const [pseudoInput, setPseudoInput] = useState('');
 const [savingPseudo, setSavingPseudo] = useState(false);

 async function savePseudo() {
   if (!profile?.user_id) return;
   const v = (pseudoInput || '').trim();
   if (v.length < 2) { alert("Ton pseudo doit faire au moins 2 caractères."); return; }
   setSavingPseudo(true);
   const { error } = await supabase
     .from('profiles')
     .update({ pseudo: v })
     .eq('user_id', profile.user_id);
   setSavingPseudo(false);
   if (error) { alert(error.message); return; }
   setProfile(p => ({ ...(p||{}), pseudo: v }));
   alert('Pseudo mis à jour ✓');
 }

  // hook de souscriptions temps réel
  useCharacterSubscriptions(character?.id, {
    onNewMessage: () => setHasNewMessage(true),
    onNewRP: () => setHasNewRP(true)
  })

  const actions = useMemo(() => ([
    { key:'messages', label:'Messages', href:'/messages', icon:'/images/msg-icon.png',    ring:'ring-amber-300/80',  glow:'bg-amber-300/30'  },
    { key:'rp',       label:'RP',       href:'/rp',       icon:'/images/rp-icon.png',     ring:'ring-cyan-300/80',   glow:'bg-cyan-300/30'   },
    { key:'profile',  label:'Profil',   href:'/profile',  icon:'/images/profile-icon.png',ring:'ring-sky-300/80',    glow:'bg-sky-300/30'    },
    { key:'lore',     label:'Lore',     href:'/wiki',     icon:'/images/lore-icon.png',   ring:'ring-violet-300/80', glow:'bg-violet-300/30' },
    { key:'members',  label:'Membres',  href:'/members',  icon:'/images/member-icon.png', ring:'ring-fuchsia-300/80',glow:'bg-fuchsia-300/30'},
{ key:'randomvava', label:'Random Vava', href:'/randomvava', icon:'/images/avatar-icon.png', ring:'ring-emerald-300/80', glow:'bg-emerald-300/30' },
{ key:'offrecords', label:'OffRecords', href:'/offrecords', icon:'/images/radio-icon.png', ring:'ring-rose-300/80', glow:'bg-rose-300/30' },

  ]), [])

  const positioned = useMemo(() => {
    const N = actions.length
    return actions.map((a, i) => {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2
      return { ...a, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })
  }, [actions, radius])

  // responsive resize
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const base = Math.min(w, h)
      setCenterSize(Math.round(clamp(base * 0.34, 180,180)))
      setRadius(Math.round(clamp(base * 0.33, 140, 260)))
      setIconSize(Math.round(clamp(base * 0.10, 90, 120)))
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // changement du personnage actif
  const setActiveCharacter = async (charId) => {
    if (!profile?.user_id || !charId) return

    // reset tous les persos à inactif
    await supabase
      .from('characters')
      .update({ is_active: false })
      .eq('user_id', profile.user_id)

    // active le perso choisi
    const { error } = await supabase
      .from('characters')
      .update({ is_active: true })
      .eq('id', charId)

    if (error) { alert(error.message); return }

    // recharge le perso actif
    const { data: ch } = await supabase
      .from('characters').select('*').eq('id', charId).maybeSingle()

    setCharacter(ch || null)
setCharacter(ch || null)

// 🔹 recharge la liste pour mettre à jour les ticks
const { data: chars } = await supabase
  .from('characters')
  .select('id, name, avatar_url, is_active')
  .eq('user_id', profile.user_id)
  .order('created_at', { ascending: true })
setMyChars(chars || [])

setPickerOpen(false)

    setPickerOpen(false)
  }

  // chargement initial
  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }

      const { data: prof, error: e1 } = await supabase
        .from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      if (e1) { setError(e1.message); setLoading(false); return }
      setProfile(prof)

      const { data: chars } = await supabase
        .from('characters')
        .select('id, name, avatar_url, is_active')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true })
      setMyChars(chars || [])

      // récupère le perso actif
      const { data: activeChar } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()

      if (activeChar) setCharacter(activeChar)

      setLoading(false)
    }
    run()
  }, [router])

  // affichage
  const displayName =
    character?.name?.trim()
    || profile?.pseudo?.trim()
    || profile?.email?.split('@')[0]
    || 'Joueur'

  const displayGenre  = character?.gender || profile?.gender || null
  const displayAvatar = character?.avatar_url || profile?.avatar_url || null
  const nameClass =
    displayGenre === 'féminin'
      ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400'
      : displayGenre === 'masculin'
        ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400'
        : 'text-white'

  return (
    <main className="fixed inset-0 overflow-hidden">

      {/* Nom + bouton changement perso */}
      <div className="absolute top-6 left-8 z-40">
        <span className={`text-xl md:text-2xl font-semibold tracking-wide drop-shadow ${nameClass}`} style={{ textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>
          {displayName}
        </span>
        {!!myChars.length && (
          <button
            onClick={() => setPickerOpen(true)}
            className="ml-3 align-middle rounded-full border border-white/30 bg-white/15 backdrop-blur-md px-2 py-1 text-[12px] text-white/90 hover:bg-white/20"
            title="Changer de personnage"
          >
            Changer
          </button>
        )}
      </div>

      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/dashboard-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

    {/* Logout + Notifications (empilés en haut à droite) */}
<div className="absolute top-6 right-8 z-40 flex flex-col items-end gap-2">
  <button
    onClick={async () => { await supabase.auth.signOut(); router.push('/auth') }}
    className="rounded-full border border-white/25 bg-white/25 backdrop-blur-md px-3 py-1.5 text-white/90 text-md hover:bg-white/20 focus:outline-none"
  >
    Se déconnecter
  </button>

  {/* Bouton Notifications – s'affiche juste en dessous */}
  <NotificationsWidget />
</div>

      {/* Content */}
      {loading ? (
        <div className="absolute inset-0 grid place-items-center text-white/80">Chargement…</div>
      ) : error ? (
        <div className="absolute inset-0 grid place-items-center text-rose-200">Erreur : {error}</div>
      ) : !profile ? (
        <div className="absolute inset-0 grid place-items-center text-rose-200">Profil introuvable</div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative">
            {/* Avatar central */}
            <div className="group relative w-[min(60vw,340px)] h-[min(60vw,345px)] rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_20px_80px_rgba(0,0,0,.45)] mx-auto">
              {displayAvatar
                ? <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                : <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-6xl">
                    {(displayName||'?')[0]?.toUpperCase()||'?'}
                  </div>
              }
              <div className="pointer-events-none absolute -inset-3 rounded-full blur-2xl bg-sky-300/20 opacity-0 group-hover:opacity-80 transition duration-300" />
              <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-amber-300/45" />
            </div>

            {/* Choix personnage */}
{pickerOpen && (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
    <div className="w-[min(94vw,720px)] rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-5 text-white shadow-2xl">

      {/* Pseudo joueur */}
      <div className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3">
        <label className="text-sm text-white/90">Ton pseudo de joueur</label>
        <div className="mt-2 flex gap-2">
          <input
            value={pseudoInput}
            onChange={(e)=>setPseudoInput(e.target.value)}
            onKeyDown={(e)=>{ if (e.key==='Enter') savePseudo() }}
            placeholder="Ex: BlackBeard"
            className="flex-1 rounded-md bg-white/10 border border-white/20 px-3 py-2 outline-none placeholder-white/60"
          />
          <button
            onClick={savePseudo}
            disabled={savingPseudo}
            className="rounded-md border border-white/20 bg-emerald-300 text-slate-900 px-3 py-2 hover:bg-emerald-200 disabled:opacity-60"
          >
            {savingPseudo ? '…' : 'Enregistrer'}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-white/60">Met à jour le pseudo du compte.</p>
      </div>

      <div className="my-3 h-px bg-white/10" aria-hidden />

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Choisir le personnage actif</h3>
        <button
          onClick={()=>setPickerOpen(false)}
          className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15"
        >
          Fermer
        </button>
      </div>

      {/* Grille des personnages */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {myChars.map(ch => (
          <button key={ch.id} onClick={()=>setActiveCharacter(ch.id)}
            className={`group relative rounded-xl p-3 border transition text-left
              ${ch.is_active ? 'bg-white/15 border-white/35' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
            title={ch.name}
          >
            <div className="w-20 h-20 mx-auto rounded-full overflow-hidden ring-2 ring-white/20 bg-white/5">
              {ch.avatar_url
                ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
                : <div className="grid place-items-center w-full h-full text-white/70 text-xl">
                    {(ch.name?.[0]||'?').toUpperCase()}
                  </div>}
            </div>
            <div className="mt-2 text-center text-sm truncate">{ch.name}</div>
            {ch.is_active && (
              <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-100">
                Actif ✓
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  </div>
)}


            {/* Anneau d’actions avec notifications */}
            <div className="pointer-events-none absolute inset-0">
              {positioned.map(a => {
                const showNotif = (a.key === 'messages' && hasNewMessage) || (a.key === 'rp' && hasNewRP)
                return (
                  <button
                    key={a.key}
                    onClick={() => {
                      router.push(a.href)
                      if (a.key === 'messages') setHasNewMessage(false)
                      if (a.key === 'rp') setHasNewRP(false)
                    }}
                    className="pointer-events-auto group absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                    style={{ left:`calc(50% + ${a.x}px)`, top:`calc(50% + ${a.y}px)`, width:iconSize, height:iconSize }}
                    aria-label={a.label}
                  >
                    <div className="relative w-full h-full rounded-full border border-white/45 bg-white/6 backdrop-blur-sm p-2 transition">
                      <span className={`pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:${a.ring} transition`} />
                      <span className={`pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl ${a.glow} transition`} />
                      <Image src={a.icon} alt="" fill sizes="140px" className="object-contain drop-shadow" />
                      {showNotif && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></span>
                      )}
                    </div>
                    <span className="absolute left-1/2 top-[calc(100%+6px)] -translate-x-1/2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
                      {a.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
