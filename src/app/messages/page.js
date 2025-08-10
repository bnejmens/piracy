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
  const [convos, setConvos] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [creatingConvWith, setCreatingConvWith] = useState(null)

  // Perso “parlant”
  const [currentSpeakerId, setCurrentSpeakerId] = useState(null)

  const [lastMsgByConv, setLastMsgByConv] = useState({})
  const [participantsByConv, setParticipantsByConv] = useState({}) // groupes uniquement

  // Cache local des persos référencés dans les direct_key (DM c:a_b)
  const [charCache, setCharCache] = useState({}) // { id: {id,name,avatar_url,user_id} }

  const endRef = useRef(null)
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  const short = (s, n = 32) => (s?.length > n ? s.slice(0, n) + '…' : s || '')

  // Boot
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
          .select('id, name, avatar_url, user_id')
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

  // Perso parlant par défaut
  useEffect(() => {
    if (!currentSpeakerId && myChars?.length) {
      setCurrentSpeakerId(myChars[0].id)
    }
  }, [myChars, currentSpeakerId])

  const loadConversations = async () => {
    const { data: convs, error } = await supabase
      .from('conversations')
      .select('id, is_group, direct_key, title, created_by, last_message_at, created_at')
      .order('last_message_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false, nullsFirst: true })
      .limit(50)
    if (error) throw error
    setConvos(convs || [])

    const ids = (convs || []).map(c => c.id)
    if (!ids.length) {
      setLastMsgByConv({})
      setParticipantsByConv({})
      return
    }

    // Dernier message par conv
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

    // Participants pour groupes (inutile pour DMs)
    const { data: parts, error: e3 } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', ids)
    if (e3) throw e3

    const pByConv = {}
    for (const row of parts || []) {
      if (!pByConv[row.conversation_id]) pByConv[row.conversation_id] = []
      pByConv[row.conversation_id].push({ user_id: row.user_id })
    }
    setParticipantsByConv(pByConv)
  }

  // === Préchargement des personnages référencés dans les direct_key (DM perso↔perso) ===
  useEffect(() => {
    const preload = async () => {
      try {
        const allCharIds = new Set()
        for (const c of convos) {
          if (!c.is_group && c.direct_key?.startsWith('c:')) {
            const [a, b] = c.direct_key.slice(2).split('_')
            if (a) allCharIds.add(a)
            if (b) allCharIds.add(b)
          }
        }
        if (!allCharIds.size) return

        // IDs déjà connus: v_contacts (persos) + mes persos + cache
        const known = new Set()
        for (const c of contacts) if (c.is_character) known.add(String(c.id))
        for (const ch of myChars) known.add(String(ch.id))
        for (const k of Object.keys(charCache)) known.add(String(k))

        const missing = Array.from(allCharIds).filter(id => !known.has(String(id)))
        if (!missing.length) return

        const { data, error } = await supabase
          .from('characters')
          .select('id, name, avatar_url, user_id')
          .in('id', missing)
        if (error) throw error

        if (data?.length) {
          setCharCache(prev => {
            const next = { ...prev }
            for (const ch of data) {
              next[String(ch.id)] = {
                id: ch.id,
                name: ch.name,
                avatar_url: ch.avatar_url || null,
                user_id: ch.user_id || null,
              }
            }
            return next
          })
        }
      } catch (e) {
        console.warn('preload chars error', e)
      }
    }
    preload()
  }, [convos, contacts, myChars])

  const openConversation = async (conv) => {
    setActiveConv(conv)
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, sender_character_id, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(500)
    if (!error) {
      setMessages(data || [])
      setTimeout(scrollToBottom, 0)
    }
  }

  // Index rapides
  const contactsByUser = useMemo(() => {
    const m = new Map()
    for (const c of contacts) {
      const cur = m.get(c.user_id)
      if (!cur || (c.is_character && !cur.is_character)) m.set(c.user_id, c)
    }
    return m
  }, [contacts])

  // Merge: v_contacts (persos) + mes persos + charCache
  const charsById = useMemo(() => {
    const m = new Map()
    for (const c of contacts) {
      if (c.is_character) m.set(String(c.id), { id: c.id, name: c.name, avatar_url: c.avatar_url, user_id: c.user_id })
    }
    for (const ch of myChars) {
      m.set(String(ch.id), { id: ch.id, name: ch.name, avatar_url: ch.avatar_url || null, user_id: ch.user_id })
    }
    for (const [k, v] of Object.entries(charCache)) {
      if (!m.has(k)) m.set(String(k), v)
    }
    return m
  }, [contacts, myChars, charCache])

  const myCharIdSet = useMemo(() => new Set(myChars.map(ch => String(ch.id))), [myChars])

  const displayContacts = useMemo(() => {
    const usersWithChar = new Set(contacts.filter(c => c.is_character).map(c => c.user_id))
    return contacts.filter(c => c.is_character || !usersWithChar.has(c.user_id))
  }, [contacts])

  // Info courte (entête colonne droite)
  const infoForConv = (conv) => {
    if (!conv || conv.is_group) return { label: conv?.title || 'Groupe', avatar: null }

    const dk = conv.direct_key || ''
    if (dk.startsWith('c:')) {
      const [a, b] = dk.slice(2).split('_').map(String)
      const other = myCharIdSet.has(a) && !myCharIdSet.has(b) ? b
                 : myCharIdSet.has(b) && !myCharIdSet.has(a) ? a
                 : a
      const ch = charsById.get(other)
      return { label: ch?.name || 'Personnage', avatar: ch?.avatar_url || null }
    }

    const [a, b] = dk.split('_')
    const myUid = session?.user?.id
    const otherUid = myUid === a ? b : a
    const c = contactsByUser.get(otherUid)
    const label = c?.name || (me && me.user_id === otherUid
      ? (me.pseudo?.trim() || me.email?.split('@')[0] || 'Moi')
      : 'Joueur')
    return { label, avatar: c?.avatar_url || null }
  }

  // === Liste complète des participants pour la colonne centrale ===
  const participantsInfo = (conv) => {
    const res = []
    const dk = conv.direct_key || ''

    // DMs: on lit uniquement direct_key
    if (!conv.is_group && dk) {
      if (dk.startsWith('c:')) {
        const [a, b] = dk.slice(2).split('_').map(String)
        const ids = [a, b].filter(Boolean)
        for (const id of ids) {
          const ch = charsById.get(id)
          if (ch) res.push({ label: ch.name, avatar: ch.avatar_url || null })
          else    res.push({ label: 'Personnage', avatar: null })
        }
        return res
      } else {
        const [ua, ub] = dk.split('_')
        const ids = [ua, ub].filter(Boolean)
        for (const uid of ids) {
          const c = contactsByUser.get(uid)
          const isMe = uid === session?.user?.id
          const myLabel  = me?.pseudo?.trim() || me?.email?.split('@')[0] || 'Moi'
          const myAvatar = contactsByUser.get(session?.user?.id)?.avatar_url || null
          res.push({
            label: c?.name || (isMe ? myLabel : 'Joueur'),
            avatar: c?.avatar_url || (isMe ? myAvatar : null),
          })
        }
        return res
      }
    }

    // Groupes: via conversation_participants
    const list = participantsByConv[conv.id] || []
    for (const p of list) {
      const c = contactsByUser.get(p.user_id)
      const isMe = p.user_id === session?.user?.id
      const myLabel  = me?.pseudo?.trim() || me?.email?.split('@')[0] || 'Moi'
      const myAvatar = contactsByUser.get(session?.user?.id)?.avatar_url || null
      res.push({
        label: c?.name || (isMe ? myLabel : 'Joueur'),
        avatar: c?.avatar_url || (isMe ? myAvatar : null),
      })
    }
    return res
  }

  // Garantit que l'utilisateur courant est bien participant de la conv (RLS friendly)
const ensureMyMembership = async (conversationId, myCharId = null) => {
  if (!session?.user?.id || !conversationId) return

  let role = 'member'
  try {
    const { data: conv } = await supabase
      .from('conversations')
      .select('created_by')
      .eq('id', conversationId)
      .maybeSingle()
    if (conv && conv.created_by === session.user.id) role = 'owner'
  } catch {}

  const { error: upErr } = await supabase
    .from('conversation_participants')
    .upsert([{
      conversation_id: conversationId,
      user_id: session.user.id,
      role,
      character_id: myCharId || null
    }], { onConflict: 'conversation_id,user_id' })

  if (upErr) {
    // non bloquant : juste log
    console.warn('ensureMyMembership upsert error:', upErr)
  }
}

  // Création/ensure d'une conversation directe
  const ensureDirectConversation = async (otherUserId, myCharId, otherCharId) => {
  if (!session) return null
  const myUid = session.user.id
  setCreatingConvWith(otherUserId)

  try {
    const hasChars = !!(myCharId && otherCharId)
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
    }

    // 🔐 RLS: je m’assure que MOI je suis inscrit
await ensureMyMembership(conv.id, hasChars ? myCharId : null)

// Best-effort: inscrire aussi l’autre
const rows = hasChars
  ? [{ conversation_id: conv.id, user_id: otherUserId, role: 'member', character_id: otherCharId }]
  : [{ conversation_id: conv.id, user_id: otherUserId, role: 'member', character_id: null }]

const { error: upOtherErr } = await supabase
  .from('conversation_participants')
  .upsert(rows, { onConflict: 'conversation_id,user_id' })

if (upOtherErr) {
  // pas bloquant pour l’envoi de message
  console.warn('upsert other participant error:', upOtherErr)
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
    // 🔐 s’assurer que je suis bien participant (sinon RLS peut bloquer)
await ensureMyMembership(activeConv.id, currentSpeakerId ?? null)

const payload = {
  conversation_id: activeConv.id,
  sender_id: session.user.id,
  sender_character_id: currentSpeakerId ?? null,
  content: input.trim(),
}

const { data, error } = await supabase
  .from('messages')
  .insert(payload)
  .select('id, conversation_id, sender_id, sender_character_id, content, created_at')
  .single()

if (error) {
  console.error('sendMessage error →', error)
  alert(`Envoi impossible: ${error.message || 'RLS/permission ?'}`)
  setSending(false)
  return
}

    setMessages(m => [...m, data])
    setInput('')

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeConv.id)

    await loadConversations()
    setTimeout(scrollToBottom, 0)
  } catch (e) {
    console.error('sendMessage fatal', e)
    alert(`Erreur envoi: ${e?.message || e}`)
  } finally {
    setSending(false)
  }
}

  const isMine = (m) => {
    const msgChar = m.sender_character_id ? String(m.sender_character_id) : null
    const curChar = currentSpeakerId ? String(currentSpeakerId) : null
    if (msgChar && curChar) return msgChar === curChar
    return m.sender_id === session?.user?.id
  }

  if (loading) return <p className="p-6">Chargement…</p>
  if (error) return <p className="p-6 text-red-500">Erreur : {error}</p>

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
              const myCharId = currentSpeakerId || myChars?.[0]?.id || null
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
              const parts = participantsInfo(c)
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-white/10 transition ${
                    activeConv?.id === c.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatars empilés */}
                    <div className="relative w-12 h-7">
                      {parts.slice(0, 3).map((p, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/20"
                          style={{ left: `${idx * 14}px` }}
                          title={p.label}
                        >
                          {p.avatar
                            ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                            : <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                                {(p.label?.[0] || '?').toUpperCase()}
                              </div>
                          }
                        </div>
                      ))}
                      {parts.length > 3 && (
                        <div
                          className="absolute top-0 left-[42px] w-7 h-7 rounded-full bg-white/20 text-[10px] grid place-items-center text-white ring-1 ring-white/20"
                          title={`+${parts.length - 3} autres`}
                        >
                          +{parts.length - 3}
                        </div>
                      )}
                    </div>

                    {/* Noms concaténés */}
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 text-sm truncate">
                        {c.is_group && c.title ? `${c.title} — ` : ''}
                        {parts.map(p => p.label).join(', ')}
                      </div>
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
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
            {activeConv
              ? <div className="text-white/90 font-medium">{infoForConv(activeConv).label}</div>
              : <div className="text-white/60">Sélectionnez une conversation</div>}

            {/* Sélecteur du personnage parlant */}
            {myChars.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-white/60 text-xs">Parler en tant que</span>
                <select
                  value={currentSpeakerId || ''}
                  onChange={(e) => setCurrentSpeakerId(e.target.value || null)}
                  className="text-sm rounded-md bg-white/10 border border-white/20 text-white px-2 py-1"
                >
                  {myChars.map(ch => (
                    <option key={ch.id} value={ch.id} className="text-slate-900">{ch.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeConv && messages.map(m => {
              const mine = isMine(m)
              const senderChar = m.sender_character_id ? charsById.get(String(m.sender_character_id)) : null
              const myChar = currentSpeakerId ? charsById.get(String(currentSpeakerId)) : null
              const fallbackContact = contactsByUser.get(m.sender_id)

              const leftAvatarUrl  = senderChar?.avatar_url ?? fallbackContact?.avatar_url ?? null
              const rightAvatarUrl = myChar?.avatar_url   ?? contactsByUser.get(session.user.id)?.avatar_url ?? null

              const leftInitial  = (senderChar?.name?.[0] ?? fallbackContact?.name?.[0] ?? '?').toUpperCase()
              const rightInitial = (myChar?.name?.[0]     ?? (me?.pseudo?.[0] || me?.email?.[0]) ?? '?').toUpperCase()

              return (
                <div key={m.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/15">
                      {leftAvatarUrl
                        ? <img src={leftAvatarUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70 text-xs">{leftInitial}</div>
                      }
                    </div>
                  )}
                  <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-snug shadow ${mine ? 'bg-sky-500/80 text-white' : 'bg-amber-300/90 text-slate-900'}`}>
                    {m.content}
                  </div>
                  {mine && (
                    <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/15">
                      {rightAvatarUrl
                        ? <img src={rightAvatarUrl} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70 text-xs">{rightInitial}</div>
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
