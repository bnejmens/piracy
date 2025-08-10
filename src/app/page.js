// src/app/auth/page.js
'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

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
    <main className="relative min-h-screen overflow-hidden">
     {/* BACKGROUND */}
<div className="absolute inset-0 -z-10">
  <Image
    src="/images/apasonia-bg.webp"
    alt=""
    fill
    priority
    className="object-cover"
  />
</div>

      {/* GRADIENT/VOILE POUR LE CONTRASTE */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-900/40 to-slate-950/70" />

      {/* CONTENU AU PREMIER PLAN */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl shadow-[0_20px_80px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
          {/* Lueur haute */}
          <div className="pointer-events-none h-1 rounded-t-2xl bg-cyan-300/60" />

          <div className="p-6 sm:p-8 text-slate-100">
            <h1 className="text-2xl font-semibold tracking-wide mb-2">
                ⭒   GLEESON   ⭒
            </h1>
            <p className="text-slate-200/80 mb-6">
              Where the line between tech and magic begins
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
      </div>
    </main>
  )
}
