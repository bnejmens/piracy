// src/app/members/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function MembersPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // On affiche des PERSONNAGES (tous), pas les profils actifs
  const [items, setItems] = useState([]) // [{ id, user_id, name, genre, avatar_url, bio, ownerName }]
  const [filter, setFilter] = useState('tous') // 'tous' | 'féminin' | 'masculin'
  const [modalChar, setModalChar] = useState(null)

  const PAGE_SIZE = 16
  const [page, setPage] = useState(1)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setSession(session)

      try {
        // 1) Tous les personnages (RLS: select allowed to authenticated)
        const { data: chars, error: e1 } = await supabase
          .from('characters')
          .select('id, user_id, name, genre, avatar_url, bio, created_at')
          .order('created_at', { ascending: false })
        if (e1) throw e1

        // 2) Profils pour récupérer un nom/email du propriétaire
        const { data: profs, error: e2 } = await supabase
          .from('profiles')
          .select('user_id, pseudo, email')
        if (e2) throw e2

        const byUser = Object.fromEntries(
          (profs || []).map(p => [p.user_id, p])
        )

        const list = (chars || []).map(c => {
          const owner = byUser[c.user_id]
          const ownerName = owner?.pseudo?.trim() || owner?.email?.split('@')[0] || 'Joueur'
          return { ...c, ownerName }
        })

        setItems(list)
        setLoading(false)
      } catch (err) {
        setError(err.message || 'Erreur inconnue')
        setLoading(false)
      }
    })()
  }, [router])

  const filtered = useMemo(() => {
    const f = filter === 'tous' ? items : items.filter(m => m.genre === filter)
    setPage(1)
    return f
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, items])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const avatarNode = (m, size = 136) => (
    <div
      key={m.id}
      onClick={() => setModalChar(m)}
      title={`${m.name} — ${m.ownerName}`}
      style={{ width: size, height: size }}
      className="group cursor-pointer rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,.35)] hover:ring-amber-300/50 transition"
    >
      {m.avatar_url ? (
        <img src={m.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-3xl">
          {m.name?.[0]?.toUpperCase() || '?'}
        </div>
      )}
    </div>
  )

  if (loading) return <p className="p-8 text-white">Chargement…</p>
  if (error)   return <p className="p-8 text-red-400">Erreur : {error}</p>

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BACKGROUND (tu peux mettre un members-bg plus tard) */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/dashboard-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Retour */}
      <button
        onClick={() => router.push('/dashboard')}
        className="fixed left-[24px] top-[24px] z-40 rounded-full border border-white/30 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white text-sm hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80"
      >
        ← Tableau de bord
      </button>

      {/* Carte centrale */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-6xl rounded-2xl border border-white/15 bg-white/10 backdrop-blur-x2 ring-1 ring-white/10 p-6 sm:p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,.45)]">
          {/* Header + filtres */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-xl font-semibold">Personnages</h1>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => setFilter('tous')}
                className={`rounded-full px-3 py-1.5 text-sm border
                ${filter === 'tous' ? 'bg-white/20 border-white/40' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
              >
                Tous
              </button>
              <button
                onClick={() => setFilter('féminin')}
                className={`rounded-full px-3 py-1.5 text-sm border
                ${filter === 'féminin' ? 'bg-amber-300/20 border-amber-300/60 text-amber-100' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
              >
                Féminin
              </button>
              <button
                onClick={() => setFilter('masculin')}
                className={`rounded-full px-3 py-1.5 text-sm border
                ${filter === 'masculin' ? 'bg-cyan-300/20 border-cyan-300/60 text-cyan-100' : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
              >
                Masculin
              </button>
            </div>
          </div>

          {/* Grille 4 x 4 */}
          <div className="grid grid-cols-4 grid-rows-4 gap-6 place-items-center">
            {pageItems.map(m => avatarNode(m))}
            {Array.from({ length: Math.max(0, PAGE_SIZE - pageItems.length) }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="rounded-full w-[136px] h-[136px] border border-white/10 ring-2 ring-white/10 bg-white/5 opacity-30"
              />
            ))}
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="rounded-full px-3 py-1.5 border border-white/20 bg-white/10 hover:bg-white/15"
                disabled={page === 1}
              >
                ← Précédent
              </button>
              <span className="text-white/80">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="rounded-full px-3 py-1.5 border border-white/20 bg-white/10 hover:bg-white/15"
                disabled={page === totalPages}
              >
                Suivant →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL détails personnage */}
      {modalChar && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setModalChar(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-white/10 backdrop-blur-x2 p-6 sm:p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-4">
              <div className="relative w-[96px] h-[96px] rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5">
                {modalChar.avatar_url ? (
                  <img src={modalChar.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-2xl">
                    {modalChar.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">{modalChar.name}</h3>
                <p className="text-xs text-white/60">
                  {modalChar.genre || 'Genre non renseigné'} • Joueur : {modalChar.ownerName}
                </p>
              </div>
            </div>

            <div className="mt-4 text-white/90 whitespace-pre-wrap">
              {modalChar.bio || <span className="text-white/50">Aucune bio.</span>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setModalChar(null)}
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 hover:bg-white/15"
              >
                Fermer
              </button>
              <button
                onClick={() => router.push(`/messages?to=${encodeURIComponent(modalChar.user_id)}`)}
                className="rounded-lg bg-violet-300 text-slate-900 font-medium px-4 py-2 hover:bg-violet-200"
              >
                Écrire en MP
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
