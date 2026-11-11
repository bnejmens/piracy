'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

// Active sur toutes les pages : un joueur qui lit un RP reste considéré présent.
export default function PresenceHeartbeat() {
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    let userId = null
    let lastPing = 0

    async function heartbeat(force = false) {
      if (cancelled || document.visibilityState !== 'visible' || !userId) return
      const now = Date.now()
      if (!force && now - lastPing < 45000) return
      lastPing = now
      const { error } = await supabase.from('profiles')
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq('user_id', userId)
      if (error) console.warn('[Présence] Mise à jour impossible :', error.message)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userId = session?.user?.id || null
      if (userId) void heartbeat(true)
    })

    // getSession complète l'écoute d'authentification en cas de session déjà chargée.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      userId = data.session?.user?.id || null
      if (userId) void heartbeat(true)
    })

    const interval = window.setInterval(() => void heartbeat(), 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') void heartbeat(true) }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      subscription.unsubscribe()
    }
  }, [])

  // Le changement de route réaffirme la présence, sans multiplier les timers.
  useEffect(() => {
    if (document.visibilityState !== 'visible') return
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user?.id
      if (id) void supabase.from('profiles')
        .update({ last_seen_at: new Date().toISOString() }).eq('user_id', id)
    })
  }, [pathname])

  return null
}
