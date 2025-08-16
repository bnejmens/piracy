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
  const [unreadCount, setUnreadCount] = useState(0)

  // --- util: charge last_seen_at
  const getLastSeen = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('last_seen_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return data?.last_seen_at || '1970-01-01T00:00:00Z'
  }

  // --- util: compte les notifs > last_seen_at (sans charger la liste)
  const fetchUnreadCount = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUnreadCount(0); return }
    const since = await getLastSeen(session.user.id)
    setLastSeenAt(since)

    const { count, error } = await supabase
      .from('v_activity_stream')
      .select('item_id', { count: 'exact', head: true })
      .gt('created_at', since)

    if (error) { /* silencieux */ return }
    setUnreadCount(count || 0)
  }

  // --- charge la liste détaillée (quand on ouvre la modale)
  const load = async () => {
    setLoading(true); setErr('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    try {
      const since = await getLastSeen(session.user.id)
      setLastSeenAt(since)

      const { data: acts, error: e2 } = await supabase
        .from('v_activity_stream')
        .select('*')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100)
      if (e2) throw e2

      setItems(acts || [])
      setUnreadCount(acts?.length || 0) // synchro compteur
    } catch (e) {
      setErr(e.message || 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  // Ouvrir = charger
  useEffect(() => { if (open) load() }, [open])

  // Poll léger pour mettre à jour le compteur (sans ouvrir)
  useEffect(() => {
    fetchUnreadCount() // premier passage
    const id = setInterval(fetchUnreadCount, 45000) // ~45s
    return () => clearInterval(id)
  }, [])

  // Marquer tout comme lu
  const markAllRead = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await supabase
      .from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
    setUnreadCount(0)
    setItems([])
    setLastSeenAt(new Date().toISOString())
  }

  // Rendu d'une ligne
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
    return (
      <div className="flex flex-col">
        <span>{n.context_title || n.type} — <Link href={n.href || '#'} className="underline">ouvrir</Link></span>
        <span className="text-xs opacity-70">{date}</span>
      </div>
    )
  }

  // Styles du bouton selon unread
  const hasNew = unreadCount > 0
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <>
      {/* Bouton avec badge */}
      <button
        onClick={() => setOpen(true)}
        className={`relative rounded-xl border px-3 py-2 text-white
          ${hasNew
            ? 'bg-amber-400/20 border-amber-300/50 ring-2 ring-amber-300/50 animate-pulse'
            : 'bg-white/10 border-white/20 hover:bg-white/15'}`}
        aria-label={`Ouvrir les notifications${hasNew ? ` (${displayCount} nouvelles)` : ''}`}
        title="Notifications"
      >
        🔔 Notifications
        {hasNew && (
          <>
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold align-middle">
              {displayCount}
            </span>
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white"></span>
          </>
        )}
      </button>

      {/* Modale */}
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
