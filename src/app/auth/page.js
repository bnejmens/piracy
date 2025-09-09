// src/app/auth/page.js
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';

export default function AuthPage() {
  const router = useRouter();

  // Bascule d'affichage
  const [isSignup, setIsSignup] = useState(false);

  // Connexion
  const [identifier, setIdentifier] = useState(''); // pseudo OU email
  const [loginPassword, setLoginPassword] = useState('');

  // Inscription
  const [pseudo, setPseudo] = useState('');
  const [email, setEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  // UI
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // -------- helpers --------
  const resolveEmailFromIdentifier = async (input) => {
    let emailLike = input?.trim().toLowerCase();
    if (!emailLike) throw new Error('Identifiant requis');
    if (emailLike.includes('@')) return emailLike;

    // 1) Essai RPC (si créée côté DB)
    const { data: foundEmail, error: rpcErr } = await supabase
      .rpc('email_for_pseudo', { p_pseudo: emailLike });
    if (!rpcErr && foundEmail) return String(foundEmail).toLowerCase();

    // 2) Fallback SELECT si RPC absente
    const { data: prof, error: selErr } = await supabase
      .from('profiles')
      .select('email')
      .eq('pseudo', emailLike)
      .maybeSingle();
    if (selErr || !prof?.email) throw new Error('Identifiants invalides');
    return String(prof.email).toLowerCase();
  };

  const upsertMyProfile = async (user, p) => {
    if (!user) return;
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, email: user.email ?? '', ...(p ? { pseudo: p } : {}) },
        { onConflict: 'user_id' }
      );
    if (profileErr) throw profileErr;
  };

  // -------- actions --------
  const handleLogin = async () => {
    try {
      setErrorMsg('');
      setLoading(true);

      if (!identifier?.trim()) throw new Error('Identifiant requis');
      if (!loginPassword) throw new Error('Mot de passe requis');

      const emailToUse = await resolveEmailFromIdentifier(identifier);

      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: loginPassword,
      });
      if (error) throw error;

      // Filet : crée/maj profil si manquant
      const { data: { user } } = await supabase.auth.getUser();
      await upsertMyProfile(user);

      router.push('/dashboard');
    } catch (e) {
      console.error('Login error:', e);
      setErrorMsg(e.message || 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    try {
      setErrorMsg('');
      setLoading(true);

      // Validation côté client
      const p = (pseudo || '').trim();
      const em = (email || '').trim().toLowerCase();

      if (p.length < 3) throw new Error('Pseudo trop court (min 3 caractères)');
      if (!em.includes('@')) throw new Error('Email invalide');
      if (signupPassword.length < 8) throw new Error('Mot de passe trop court (min 8)');

      // Inscription Auth (le trigger DB lira "pseudo")
      const { error: signErr } = await supabase.auth.signUp({
        email: em,
        password: signupPassword,
        options: {
          data: { pseudo: p, username: p }, // compat + trigger
          // emailRedirectTo: 'https://ton-domaine.xyz/auth/callback'
        },
      });
      if (signErr) throw signErr;

      // Upsert profil de sûreté (si le trigger est désactivé/différé)
      const { data: { user } } = await supabase.auth.getUser();
      await upsertMyProfile(user, p);

      // Redirection après succès (ou direct /dashboard si tu ne valides pas l’email)
      router.push('/verification-email');
    } catch (e) {
      console.error('Signup error:', e);
      setErrorMsg(e.message || 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/crimson-bg.webp"
          alt=""
          fill
          priority
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/60 via-slate-900/40 to-slate-950/70" />

      {/* Carte */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl ring-1 ring-white/10 shadow-[0_20px_80px_rgba(0,0,0,.45)]">
          <div className="pointer-events-none h-1 rounded-t-2xl bg-cyan-300/60" />
          <div className="p-6 sm:p-8 text-slate-100">
            <div className="flex justify-center gap-2 mb-6">
              <button
                onClick={() => setIsSignup(false)}
                className={`rounded-full px-3 py-1.5 text-sm border ${!isSignup ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
              >
                Connexion
              </button>
              <button
                onClick={() => setIsSignup(true)}
                className={`rounded-full px-3 py-1.5 text-sm border ${isSignup ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
              >
                Inscription
              </button>
            </div>

            {errorMsg && (
              <p className="mb-4 rounded-md bg-red-500/20 border border-red-500/40 px-3 py-2 text-red-100">
                {errorMsg}
              </p>
            )}

            {!isSignup ? (
              // ===== Connexion =====
              <>
                <label className="block text-sm mb-1">Identifiant (pseudo ou email)</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="ex: Moonlight ou vous@mail.fr"
                  className="w-full mb-4 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-cyan-300/60"
                />

                <label className="block text-sm mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full mb-6 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-cyan-300/60"
                />

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="w-full rounded-lg bg-cyan-300 text-slate-900 font-medium py-2 hover:bg-cyan-200 disabled:opacity-50"
                >
                  Se connecter
                </button>
              </>
            ) : (
              // ===== Inscription =====
              <>
                <label className="block text-sm mb-1">Pseudo</label>
                <input
                  type="text"
                  value={pseudo}
                  onChange={e => setPseudo(e.target.value)}
                  placeholder="ex: Moonlight"
                  className="w-full mb-4 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/50"
                />

                <label className="block text-sm mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="vous@mail.fr"
                  className="w-full mb-4 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/50"
                />

                <label className="block text-sm mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={signupPassword}
                  onChange={e => setSignupPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full mb-6 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-slate-100 placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/50"
                />

                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className="w-full rounded-lg bg-amber-300 text-slate-900 font-medium py-2 hover:bg-amber-200 disabled:opacity-50"
                >
                  S’inscrire
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
