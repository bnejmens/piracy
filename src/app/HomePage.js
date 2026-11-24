'use client'

import { useEffect, useState } from 'react'
import SiteTopbar from "@/components/SiteTopbar"
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      let alreadyConnected = false
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        if (active && session) {
          alreadyConnected = true
          router.replace('/dashboard')
        }
      } catch (error) {
        console.error('Session restore error:', error)
      } finally {
        if (active && !alreadyConnected) setCheckingSession(false)
      }
    }

    checkSession()
    return () => { active = false }
  }, [router])

  const upsertProfile = async (user) => {
    await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, email: user.email ?? '' },
        { onConflict: 'user_id' }
      )
  }

  const handleSignup = async () => {
    setErrorMsg('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return setErrorMsg(error.message)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await upsertProfile(user)
    router.push('/dashboard')
  }

  const handleLogin = async () => {
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return setErrorMsg(error.message)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await upsertProfile(user)
    router.push('/dashboard')
  }

  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <SiteTopbar title="Always" />
      {/* Fond servi directement par le navigateur, sans optimisation Next.js */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: 'url("/images/crimson-bg.png")' }}
      />
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-slate-950/60 via-slate-900/40 to-slate-950/70" />

      {/* CONTENU AU PREMIER PLAN */}
      <div className="relative z-20 flex flex-1 flex-col items-center justify-center gap-5 px-3 py-6 sm:p-4">
        <section aria-labelledby="always-intro" className="w-full max-w-md rounded-2xl border border-amber-200/20 bg-slate-950/75 p-4 text-slate-100 sm:p-6">
          <h2 id="always-intro" className="font-serif text-xl text-amber-100 sm:text-2xl">Forum RP Harry Potter francophone</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            En 2026, les technologies moldues bousculent le Secret magique. Crée ton personnage et écris à plusieurs dans un monde sorcier qui change, de Poudlard à Londres en passant par Godric’s Hollow.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            Always est un forum de jeu de rôle écrit pour une petite communauté. Projet de fans indépendant.
          </p>
        </section>
        {checkingSession ? (
          <p className="text-sm text-slate-100">Vérification de la connexion…</p>
        ) : (
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
          {/* Lueur haute */}
          <div className="pointer-events-none h-1 rounded-t-2xl bg-cyan-300/60" />

          <div className="p-4 text-slate-100 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-wide mb-2">
                ⭒   ALWAYS   ⭒
            </h1>
            <p className="text-slate-200/80 mb-6">
              After all this time?
            </p>

            {errorMsg && (
              <p className="mb-4 rounded-md bg-red-500/20 border border-red-500/40 px-3 py-2 text-red-100">
                {errorMsg}
              </p>
            )}

            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.fr"
              className="w-full mb-4 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-cyan-300/60"
            />

            <label className="block text-sm mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full mb-6 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-cyan-300/60"
            />

            <div className="flex gap-3">
              <button
                onClick={handleLogin}
                className="flex-1 rounded-lg bg-cyan-300 text-slate-900 font-medium py-2 hover:bg-cyan-200 transition"
              >
                Se connecter
              </button>
              <button
                onClick={handleSignup}
                className="flex-1 rounded-lg bg-slate-800/80 border border-white/15 py-2 hover:bg-slate-800 transition"
              >
                S’inscrire
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </main>
  )
}
