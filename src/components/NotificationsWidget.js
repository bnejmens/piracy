'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function NotificationsWidget() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [lastSeenAt, setLastSeenAt] = useState(null)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true); setErr('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    // 1) last_seen_at du joueur
    const { data: prof, error: e1 } = await supabase
      .from('profiles')
      .select('last_seen_at')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (e1) { setErr(e1.message || 'Erreur profils'); setLoading(false); return }

    const since = prof?.last_seen_at || '1970-01-01T00:00:00Z'
    setLastSeenAt(since)

    // 2) activités depuis last_seen_at
    const { data: acts, error: e2 } = await supabase
      .from('v_activity_stream')
      .select('*')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100)
    if (e2) { setErr(e2.message || 'Erreur activités'); setLoading(false); return }

    setItems(acts || [])
    setLoading(false)
  }

  useEffect(() => { if (open) load() }, [open])

  const markAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
    await load()
  }

  const line = (n) => {
    const date = new Date(n.created_at).toLocaleString()
    if (n.type === 'rp_post') {
      return (
        <div className="flex flex-col">
          <span><strong>{n.actor_name || 'Un personnage'}</strong> a posté dans <Link href={n.href} className="underline">{n.context_title}</Link></span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }
    if (n.type === 'message') {
      return (
        <div className="flex flex-col">
          <span><strong>{n.actor_name || 'Un personnage'}</strong> a écrit dans <Link href={n.href} className="underline">{n.context_title}</Link></span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }
    if (n.type === 'wiki_card') {
      return (
        <div className="flex flex-col">
          <span><strong>{n.actor_name || 'Un personnage'}</strong> a ajouté <strong>{n.context_title}</strong> dans le lore <Link href={n.href} className="underline">(ouvrir)</Link></span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }
    if (n.type === 'new_character') {
      return (
        <div className="flex flex-col">
          <span><strong>{n.actor_name}</strong> vient d’arriver à Gleeson — <Link href={n.href} className="underline">voir les membres</Link></span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }
    // fallback
    return (
      <div className="flex flex-col">
        <span>{n.context_title || n.type} — <Link href={n.href || '#'} className="underline">ouvrir</Link></span>
        <span className="text-xs opacity-70">{date}</span>
      </div>
    )
  }

  return (
    <>
      {/* BOUTON dans le dashboard */}
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-white hover:bg-white/15"
        aria-label="Ouvrir les notifications"
        title="Notifications"
      >
        🔔 Notifications
      </button>

      {/* MODALE */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={()=>setOpen(false)}>
          <div
            className="w-[min(96vw,820px)] rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-6 sm:p-8 text-white shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e)=>e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nouveautés depuis ta dernière visite</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  disabled={loading || (items?.length ?? 0) === 0}
                  className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 hover:bg-white/15 disabled:opacity-50"
                >
                  Tout marquer comme lu
                </button>
                <button
                  onClick={()=>setOpen(false)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 hover:bg-white/15"
                >
                  Fermer
                </button>
              </div>
            </div>

            {err && <div className="mb-3 text-red-300 text-sm">{err}</div>}

            {loading ? (
              <div className="text-white/70">Chargement…</div>
            ) : (items?.length ?? 0) === 0 ? (
              <div className="text-white/60">Aucune nouvelle notification.</div>
            ) : (
              <ul className="divide-y divide-white/10">
                {items.map(n => (
                  <li key={`${n.type}-${n.item_id}-${n.created_at}`} className="py-3">
                    {line(n)}
                  </li>
                ))}
              </ul>
            )}

            {lastSeenAt && (
              <div className="mt-4 text-xs text-white/50">
                Depuis : {new Date(lastSeenAt).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
