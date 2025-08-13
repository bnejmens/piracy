// src/hooks/useCharacterSubscriptions.js
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Hook de souscription temps réel par personnage actif.
 * Signature attendue côté appelant :
 * useCharacterSubscriptions(activeCharId, {
 *   onNewMessage?: () => void,
 *   onNewRP?: () => void,
 * })
 *
 * - Réabonne automatiquement quand activeCharId change
 * - Nettoie proprement les anciens canaux
 */
export default function useCharacterSubscriptions(activeCharId, options = {}) {
  const { onNewMessage, onNewRP } = options
  const channelsRef = useRef([])

  // Helpers DB
  const checkIfMessageConcernsChar = async (message, charId) => {
    if (!charId || !message?.conversation_id) return false
    const { data } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', message.conversation_id)
      .eq('character_id', charId)
      .maybeSingle()
    return !!data
  }

  const checkIfRPConcernsChar = async (post, charId) => {
    if (!charId || !post?.topic_id) return false
    // Selon ton schéma, adapte si nécessaire (topic_id vs post_id)
    const { data } = await supabase
      .from('rp_participants')
      .select('topic_id')
      .eq('topic_id', post.topic_id)
      .eq('character_id', charId)
      .maybeSingle()
    return !!data
  }

  useEffect(() => {
    // cleanup ancien abonnement
    for (const ch of channelsRef.current) {
      try { supabase.removeChannel(ch) } catch {}
    }
    channelsRef.current = []

    if (!activeCharId) return

    // Messages
    const chMsg = supabase
      .channel(`msg-char-${activeCharId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_character_id=neq.${activeCharId}` },
        async (payload) => {
          const ok = await checkIfMessageConcernsChar(payload.new, activeCharId)
          if (ok && typeof onNewMessage === 'function') onNewMessage()
        }
      )
      .subscribe()

    // RP posts
    const chRP = supabase
      .channel(`rp-char-${activeCharId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rp_posts' },
        async (payload) => {
          const ok = await checkIfRPConcernsChar(payload.new, activeCharId)
          if (ok && typeof onNewRP === 'function') onNewRP()
        }
      )
      .subscribe()

    channelsRef.current = [chMsg, chRP]

    return () => {
      for (const ch of channelsRef.current) {
        try { supabase.removeChannel(ch) } catch {}
      }
      channelsRef.current = []
    }
  }, [activeCharId, onNewMessage, onNewRP])
}
