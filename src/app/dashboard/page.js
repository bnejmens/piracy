// src/app/dashboard/page.js
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/navigation'
import MagicFX from '../../components/MagicFX'

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState(null)
  const [character, setCharacter] = useState(null) // <-- perso actif
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ⇩⇩ ajuste ici la taille de l’avatar (en pixels) ⇩⇩
  const AVATAR_SIZE = 400

  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/auth')
        return
      }

      // Profil utilisateur
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (e1) {
        setError(e1.message)
        setLoading(false)
        return
      }

      setProfile(prof)

      // Si un personnage actif est défini, on le charge
      if (prof?.active_character_id) {
        const { data: ch, error: e2 } = await supabase
          .from('characters')
          .select('*')
          .eq('id', prof.active_character_id)
          .maybeSingle()
        if (!e2) setCharacter(ch || null)
      }

      setLoading(false)
    }
    run()
  }, [router])

  if (loading) return <p style={{ padding: '2rem' }}>Chargement…</p>
  if (error)   return <p style={{ padding: '2rem', color: 'red' }}>Erreur : {error}</p>
  if (!profile) return <p style={{ padding: '2rem', color: 'red' }}>Profil introuvable</p>

  // ---- Données d’affichage (perso actif > profil) ----
  const displayName =
    (character?.name?.trim())
    || (profile.pseudo?.trim())
    || (profile.email?.split('@')[0])
    || 'Joueur'

  const displayGenre = character?.genre || profile.genre || null
  const displayAvatar = character?.avatar_url || profile.avatar_url || null

  const pseudo = displayName
  const nameClass =
    displayGenre === 'féminin'
      ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-400'
      : displayGenre === 'masculin'
        ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400'
        : 'text-white'

  // Avatar central avec surbrillance CHAUDE au survol
  const AvatarCircle = () => {
    const Wrapper = ({ children }) => (
      <div
        style={{ width: 350, height: 350 }}
        className="group relative rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_20px_80px_rgba(0,0,0,.45)]"
      >
        {children}
        {/* Surbrillance douce (chaude) au hover */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,200,150,.14),transparent_2%)] mix-blend-screen opacity-0 group-hover:opacity-20 transition duration-150" />
        {/* Halo ambre au hover (extérieur) */}
        <div className="pointer-events-none absolute -inset-3 rounded-full blur-2xl bg-amber-300/20 opacity-0 group-hover:opacity-100 transition duration-300" />
        {/* Anneau fin ambre */}
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-amber-300/45" />
      </div>
    )

    if (displayAvatar) {
      return (
        <Wrapper>
          <img
            src={displayAvatar}
            alt="Avatar"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </Wrapper>
      )
    }

    const initial = (pseudo || '?')[0]?.toUpperCase() || '?'
    return (
      <Wrapper>
        <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-6xl">
          {initial}
        </div>
      </Wrapper>
    )
  }

  return (
    // Plein écran verrouillé (pas de scroll)
    <main className="fixed inset-0 overflow-hidden">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/dashboard-bg.webp"
          alt=""
          fill
          priority
          className="object-cover"
        />
      </div>
      {/* voile pour le contraste */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Bouton PROFIL — fixe, indépendant */}
      <button
        onClick={() => router.push('/profile')}
        className="group fixed left-[1420px] top-[700px] z-40 relative focus:outline-none"
        aria-label="Ouvrir le profil"
      >
        <div className="relative w-[140px] h-[140px] rounded-full border border-white/30 bg-white/15 backdrop-blur-md p-2 transition">
          <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-amber-300/80 transition" />
          <span className="pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl bg-amber-300/25 transition" />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-0 group-focus-visible:ring-2 group-focus-visible:ring-amber-300/90 transition" />
          <Image
            src="/images/profile-icon.png"
            alt=""
            fill
            sizes="84px"
            className="object-contain drop-shadow"
          />
        </div>
        <span className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition">
          Profil
        </span>
      </button>

      {/* Bouton MESSAGES — fixe, haut-droite */}
      <button
        onClick={() => router.push('/messages')}
        className="group fixed z-40 relative focus:outline-none"
        style={{ left: 1280, top: 100 }}
        aria-label="Ouvrir la messagerie"
      >
        <div className="relative w-[140px] h-[140px] rounded-full border border-white/30 bg-white/15 backdrop-blur-md p-2 transition">
          <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-amber-300/80 transition" />
          <span className="pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl bg-amber-300/25 transition" />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-0 group-focus-visible:ring-2 group-focus-visible:ring-amber-300/90 transition" />
          <Image
            src="/images/msg-icon.png"
            alt=""
            fill
            sizes="140px"
            className="object-contain drop-shadow"
          />
        </div>
        <span className="absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition">
          Messages
        </span>
      </button>

      {/* Bouton RP — fixe */}
      <button
        onClick={() => router.push('/rp')}
        className="group fixed z-40 relative focus:outline-none"
        style={{ right: 0, top: 100 }}  // <-- corrigé 'right'
        aria-label="Ouvrir l’interface RP"
      >
        <div className="relative w-[140px] h-[140px] rounded-full border border-white/30 bg-white/15 backdrop-blur-md p-2 transition">
          <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-cyan-300/80 transition" />
          <span className="pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl bg-cyan-300/25 transition" />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-0 group-focus-visible:ring-2 group-focus-visible:ring-cyan-300/90 transition" />
          <Image
            src="/images/rp-icon.png"
            alt=""
            fill
            sizes="140px"
            className="object-contain drop-shadow"
          />
        </div>
        <span className="absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 px-2 py-1 rounded-md bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition">
          RP
        </span>
      </button>

      {/* Bouton MEMBRES — fixe */}
      <button
        onClick={() => router.push('/members')}
        className="group fixed z-40 relative focus:outline-none"
        style={{ right: 130, top: 700 }}
        aria-label="Ouvrir les membres"
      >
        <div className="relative w-[140px] h-[140px] rounded-full border border-white/30 bg-white/15 backdrop-blur-md p-2 transition">
          <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-violet-300/80 transition" />
          <span className="pointer-events-none absolute -inset-2 rounded-full opacity-0 group-hover:opacity-100 blur-xl bg-violet-300/25 transition" />
          <span className="pointer-events-none absolute inset-0 rounded-full ring-0 group-focus-visible:ring-2 group-focus-visible:ring-violet-300/90 transition" />
          <Image
            src="/images/member-icon.png"
            alt=""
            fill
            sizes="120px"
            className="object-contain drop-shadow"
          />
        </div>
        <span className="absolute left-1/2 top-[calc(100%+8px)] -translate-x-1/2 px-2 py-1 rounded-md bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition">
          Membres
        </span>
      </button>

      {/* Bouton DÉCONNEXION — bas-gauche */}
      <button
        onClick={async () => {
          await supabase.auth.signOut()
          router.push('/auth')
        }}
        className="fixed left-[24px] bottom-[96px] z-40
             rounded-full border border-white/25 bg-white/15 backdrop-blur-md
             px-3 py-1.5 text-white/90 text-sm
             hover:bg-white/20 hover:text-white
             focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80
             shadow-[0_6px_30px_rgba(0,0,0,.25)]"
        aria-label="Se déconnecter"
      >
        Se déconnecter
      </button>

      {/* Avatar centré + pseudo */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center">
          <AvatarCircle />
          <div className="mt-6 text-center">
            <span
              className={`text-3xl font-semibold tracking-wide drop-shadow ${nameClass}`}
              style={{ textShadow: '0 1px 10px rgba(0,0,0,.5)' }}
            >
              {pseudo}
            </span>
          </div>
        </div>
      </div>
    </main>
  )
}
