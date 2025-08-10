// src/app/messages/page.js
'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function MessagesPage() {
  const router = useRouter()

  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const [myChars, setMyChars] = useState([])

  const [contacts, setContacts] = useState([])
  const [convos, setConvos]   = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [creatingConvWith, setCreatingConvWith] = useState(null)

  const endRef = useRef(null)
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  const short = (s, n = 15) => (s?.length > n ? s.slice(0, n) + '…' : s || '')

  const [lastMsgByConv, setLastMsgByConv] = useState({})

  useEffect(() => {
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return router.push('/auth')
        setSession(session)

        const { data: myProfile, error: eMe } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (eMe) throw eMe
        setMe(myProfile)

        const { data: list, error: eC } = await supabase
          .from('v_contacts')
          .select('id, name, avatar_url, user_id, is_character')
          .order('name', { ascending: true })
        if (eC) throw eC
        setContacts(list || [])

        const { data: mineChars, error: eChars } = await supabase
          .from('characters')
          .select('id, name, avatar_url')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
        if (eChars) throw eChars
        setMyChars(mineChars || [])

        await loadConversations()
      } catch (e) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [router])

  const loadConversations = async () => {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('id, is_group, direct_key, title, created_by, last_message_at, created_at')
      .order('last_message_at', { ascending: false, nullsFirst: true })
      .order('created_at',      { ascending: false, nullsFirst: true })
      .limit(50)
    if (error) throw error
    setConvos(convs || [])

    const ids = (convs || []).map(c => c.id)
    if (!ids.length) {
      setLastMsgByConv({})
      return
    }

    const { data: msgs, error: e2 } = await supabase
      .from('messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', ids)
      .order('conversation_id', { ascending: true })
      .order('created_at', { ascending: false })
    if (e2) throw e2

    const map = {}
    for (const m of msgs) {
      if (!map[m.conversation_id]) map[m.conversation_id] = { content: m.content, created_at: m.created_at }
    }
    setLastMsgByConv(map)
  }

  const openConversation = async (conv) => {
    setActiveConv(conv)
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (!error) {
      setMessages(data || [])
      setTimeout(scrollToBottom, 0)
    }
  }

  const contactsByUser = useMemo(() => {
    const m = new Map()
    for (const c of contacts) {
      const cur = m.get(c.user_id)
      if (!cur || (c.is_character && !cur.is_character)) m.set(c.user_id, c)
    }
    return m
  }, [contacts])

  const charsById = useMemo(() => {
    const m = new Map()
    for (const c of contacts) {
      if (c.is_character) m.set(String(c.id), c) // normalisé en string
    }
    return m
  }, [contacts])

  const myCharIdSet = useMemo(() => {
    return new Set(myChars.map(ch => String(ch.id))) // normalisé en string
  }, [myChars])

  const displayContacts = useMemo(() => {
    const usersWithChar = new Set(contacts.filter(c => c.is_character).map(c => c.user_id))
    return contacts.filter(c => c.is_character || !usersWithChar.has(c.user_id))
  }, [contacts])

 const infoForConv = (conv) => {
  if (!conv || conv.is_group) {
    return { label: conv?.title || 'Groupe', avatar: null }
  }

  const dk = conv.direct_key || ''

  // --- Conversation entre personnages ---
  if (dk.startsWith('c:')) {
    const [a, b] = dk.slice(2).split('_').map(String) // IDs en string

    let otherCharId
    if (myCharIdSet.has(a) && !myCharIdSet.has(b)) {
      // Je suis "a", l'autre est "b"
      otherCharId = b
    } else if (myCharIdSet.has(b) && !myCharIdSet.has(a)) {
      // Je suis "b", l'autre est "a"
      otherCharId = a
    } else {
      // Aucun des deux n'est moi → prendre le premier par défaut
      otherCharId = a
    }

    const ch = charsById.get(otherCharId)
    return { label: ch?.name || 'Personnage', avatar: ch?.avatar_url || null }
  }

  // --- Conversation entre comptes ---
  const [a, b] = dk.split('_')
  const myUid = session?.user?.id
  const otherUid = myUid === a ? b : a
  const c = contactsByUser.get(otherUid)
  const label = c?.name || (me && me.user_id === otherUid
    ? (me.pseudo?.trim() || me.email?.split('@')[0] || 'Moi')
    : 'Joueur')
  return { label, avatar: c?.avatar_url || null }
}


  const ensureDirectConversation = async (otherUserId, myCharId, otherCharId) => {
    if (!session) return null
    const myUid = session.user.id
    setCreatingConvWith(otherUserId)

    try {
      const hasChars = myCharId && otherCharId
      const key = hasChars
        ? `c:${[myCharId, otherCharId].sort().join('_')}`
        : [myUid, otherUserId].sort().join('_')

      let { data: conv, error: eFind } = await supabase
        .from('conversations')
        .select('id, is_group, direct_key, title, last_message_at, created_by')
        .eq('is_group', false)
        .eq('direct_key', key)
        .maybeSingle()
      if (eFind && eFind.code !== 'PGRST116') throw eFind

      if (!conv) {
        const { data: created, error: eIns } = await supabase
          .from('conversations')
          .insert({ is_group: false, created_by: myUid, direct_key: key })
          .select('id, is_group, direct_key, title, last_message_at, created_by')
          .single()
        if (eIns) {
          if (eIns.code === '23505') {
            const { data: again, error: eAgain } = await supabase
              .from('conversations')
              .select('id, is_group, direct_key, title, last_message_at, created_by')
              .eq('is_group', false)
              .eq('direct_key', key)
              .maybeSingle()
            if (eAgain) throw eAgain
            conv = again
          } else {
            throw eIns
          }
        } else {
          conv = created
        }

        const uidSet = new Set([myUid, otherUserId])
        const rows = Array.from(uidSet).map(uid => ({
          conversation_id: conv.id,
          user_id: uid,
          role: uid === myUid ? 'owner' : 'member',
        }))

        const { error: ePart } = await supabase
          .from('conversation_participants')
          .insert(rows)
        if (ePart && ePart.code !== '23505') throw ePart
      }

      return conv
    } finally {
      setCreatingConvWith(null)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !session || !activeConv) return
    setSending(true)
    try {
      const payload = {
        conversation_id: activeConv.id,
        sender_id: session.user.id,
        content: input.trim(),
      }
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select('id, conversation_id, sender_id, content, created_at')
        .single()
      if (error) throw error
      setMessages(m => [...m, data])
      setInput('')

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', activeConv.id)

      await loadConversations()
      setTimeout(scrollToBottom, 0)
    } catch (e) {
      console.error('sendMessage error', e)
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="p-6">Chargement…</p>
  if (error)   return <p className="p-6 text-red-500">Erreur : {error}</p>

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/msg-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Bouton retour */}
      <button
        onClick={() => router.push('/dashboard')}
        className="fixed left-60 bottom-[90px] z-50 rounded-full border border-white/25 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white/90 text-sm hover:bg-white/20"
      >
        ← Tableau de bord
      </button>

      {/* GRID */}
      <div className="relative z-10 h-full grid gap-6 p-6 grid-cols-[420px_420px_minmax(0,1fr)] xl:grid-cols-[380px_380px_minmax(0,1fr)] lg:grid-cols-[340px_340px_minmax(0,1fr)] md:grid-cols-1">

        {/* COLONNE GAUCHE — CONTACTS */}
        <section className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium">Contacts</header>
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            {displayContacts.map(c => {
              const key  = c.is_character ? c.id : `fallback-${c.user_id}`
              const isMe = c.user_id === session?.user?.id
              const myCharId = myChars?.[0]?.id || null
              const otherCharId = c.is_character ? c.id : null

              return (
                <div key={key} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15">
                    {c.avatar_url
                      ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="grid place-items-center w-full h-full text-white/70">
                          {(c.name?.[0] || '?').toUpperCase()}
                        </div>
                    }
                  </div>
                  <div className="text-white/90 text-sm truncate">{c.name}</div>
                  {isMe && <span className="ml-2 rounded-md px-1.5 py-0.5 text-[10px] bg-white/10 border border-white/15 text-white/70">Moi</span>}
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const conv = await ensureDirectConversation(c.user_id, myCharId, otherCharId)
                          if (conv) await openConversation(conv)
                        } catch (e) { alert(e.message) }
                      }}
                      disabled={creatingConvWith === c.user_id}
                      className="rounded-lg bg-amber-300 text-slate-900 text-xs px-2.5 py-1 hover:bg-amber-200 disabled:opacity-60"
                    >Nouveau</button>
                    <button
                      onClick={async () => {
                        try {
                          const conv = await ensureDirectConversation(c.user_id, myCharId, otherCharId)
                          if (conv) await openConversation(conv)
                        } catch (e) { alert(e.message) }
                      }}
                      className="rounded-lg border border-white/20 bg-white/10 text-white text-xs px-2.5 py-1 hover:bg-white/15"
                    >Ouvrir</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* COLONNE CENTRALE — CONVERSATIONS */}
        <section className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium">Conversations</header>
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            {convos.map(c => {
              const info = infoForConv(c)
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-white/10 transition ${activeConv?.id === c.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15">
                      {info.avatar
                        ? <img src={info.avatar} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70">
                            {(info.label?.[0] || '?').toUpperCase()}
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 text-sm truncate">{info.label}</div>
                      <div className="text-white/50 text-xs truncate">
                        { lastMsgByConv[c.id]?.content
                            ? short(lastMsgByConv[c.id].content, 32)
                            : 'Aucun message pour le moment.' }
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
            {!convos.length && <div className="text-white/60 text-sm">Aucune conversation pour le moment.</div>}
          </div>
        </section>

        {/* COLONNE DROITE — MESSAGES */}
        <section className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            {activeConv
              ? <div className="text-white/90 font-medium">{infoForConv(activeConv).label}</div>
              : <div className="text-white/60">Sélectionnez une conversation</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeConv && messages.map(m => {
              const mine = m.sender_id === session.user.id
              return (
                <div key={m.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/15">
                      {contactsByUser.get(m.sender_id)?.avatar_url
                        ? <img src={contactsByUser.get(m.sender_id)?.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                            {(contactsByUser.get(m.sender_id)?.name?.[0] || '?').toUpperCase()}
                          </div>
                      }
                    </div>
                  )}
                  <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-snug shadow ${mine ? 'bg-sky-500/80 text-white' : 'bg-amber-300/90 text-slate-900'}`}>
                    {m.content}
                  </div>
                  {mine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/15">
                      {contactsByUser.get(m.sender_id)?.avatar_url
                        ? <img src={contactsByUser.get(m.sender_id)?.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                            {(contactsByUser.get(m.sender_id)?.name?.[0] || '?').toUpperCase()}
                          </div>
                      }
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={endRef} />
          </div>

          {activeConv && (
            <form onSubmit={(e) => { e.preventDefault(); sendMessage() }} className="p-3 border-t border-white/10 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Écrire un message…"
                className="flex-1 rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/60"
              />
              <button
                disabled={sending || !input.trim()}
                className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200 disabled:opacity-50"
              >
                Envoyer
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
