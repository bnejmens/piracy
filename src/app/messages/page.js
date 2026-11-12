// src/app/messages/page.js
'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function MessagesPage() {
  const router = useRouter()

  // Auth & profil
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const [myChars, setMyChars] = useState([])

  // Données
  const [contacts, setContacts] = useState([])
  const [convos, setConvos] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])

  // UI / états
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [screen, setScreen] = useState('conversations')
  const [search, setSearch] = useState('')
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [caps, setCaps] = useState(false)
  const inputRef = useRef(null)

  // Perso “parlant”
  const [currentSpeakerId, setCurrentSpeakerId] = useState(null)

  // Index auxiliaires
  const [lastMsgByConv, setLastMsgByConv] = useState({})
  const [participantsByConv, setParticipantsByConv] = useState({})
  const [charCache, setCharCache] = useState({})

  // Modales
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [newConvTitle, setNewConvTitle] = useState('')
  const [newConvTargets, setNewConvTargets] = useState([])

  const [contactModal, setContactModal] = useState({
    open: false, contact: null, convs: [], loading: false
  })

  // Utils
  const endRef = useRef(null)
  const scrollToBottom = () =>
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  const short = (s, n = 48) => (s?.length > n ? s.slice(0, n) + '…' : s || '')

  /* ==================== BOOT ==================== */
  useEffect(() => {
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/auth'); return }
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
          .eq('is_archived', false)
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

  /* Perso parlant par défaut */
  useEffect(() => {
    if (!currentSpeakerId && myChars?.length) {
      setCurrentSpeakerId(myChars.find(ch => ch.id === me?.active_character_id)?.id || myChars[0].id)
    }
  }, [myChars, currentSpeakerId])

  /* ==================== LOADERS ==================== */
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

    // Derniers messages
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

    // Participants des groupes
    const { data: parts, error: e3 } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, character_id')
      .in('conversation_id', ids)
    if (e3) throw e3

    const pByConv = {}
    for (const row of parts || []) {
      if (!pByConv[row.conversation_id]) pByConv[row.conversation_id] = []
      pByConv[row.conversation_id].push({ user_id: row.user_id, character_id: row.character_id })
    }
    setParticipantsByConv(pByConv)
  }

  // Précharger les persos manquants pour les DMs c:a_b
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
  }, [convos, contacts, myChars, charCache])

  /* ==================== OPENERS / SEND ==================== */
  const openConversation = async (conv) => {
    setActiveConv(conv)
    setScreen('chat')
    setKeyboardOpen(false)
    setMessages([])
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

  const ensureMyMembership = async (conversationId, myCharId) => {
    if (!session?.user?.id || !conversationId || !myCharId) {
      throw new Error('Sélectionne un personnage actif pour envoyer un message.')
    }
    // La clé primaire Supabase est (conversation_id, user_id, character_id).
    const { data: existing, error: lookupError } = await supabase
      .from('conversation_participants')
      .select('character_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', session.user.id)
      .eq('character_id', myCharId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (existing) return

    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('created_by')
      .eq('id', conversationId)
      .single()
    if (convError) throw convError
    const { error: insertError } = await supabase
      .from('conversation_participants')
      .insert({
        conversation_id: conversationId,
        user_id: session.user.id,
        role: conv.created_by === session.user.id ? 'owner' : 'member',
        character_id: myCharId,
      })
    if (insertError) throw insertError
  }

  const sendMessage = async () => {
    if (!input.trim() || !session || !activeConv || sending) return
    setSending(true)
    try {
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
      alert(e?.message || String(e))
    } finally {
      setSending(false)
    }
  }

  /* ==================== INDEXES / HELPERS ==================== */
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

  const myCharIdSet = useMemo(
    () => new Set(myChars.map(ch => String(ch.id))),
    [myChars]
  )

  const displayContacts = useMemo(() => {
    const usersWithChar = new Set(contacts.filter(c => c.is_character).map(c => c.user_id))
    return contacts.filter(c => c.is_character || !usersWithChar.has(c.user_id))
  }, [contacts])

  const infoForConv = (conv) => {
    if (!conv) return { label: '' }
    if (conv.is_group) return { label: conv.title || 'Groupe' }
    const dk = conv.direct_key || ''
    if (dk.startsWith('c:')) {
      const [a, b] = dk.slice(2).split('_').map(String)
      const other = myCharIdSet.has(a) && !myCharIdSet.has(b) ? b
        : myCharIdSet.has(b) && !myCharIdSet.has(a) ? a
        : a
      const ch = charsById.get(other)
      return { label: ch?.name || 'Personnage' }
    }
    const [ua, ub] = dk.split('_')
    const myUid = session?.user?.id
    const otherUid = myUid === ua ? ub : ua
    const c = contactsByUser.get(otherUid)
    const label = c?.name || (me && me.user_id === otherUid
      ? (me.pseudo?.trim() || me.email?.split('@')[0] || 'Moi')
      : 'Joueur')
    return { label }
  }

  
const isMine = (m) => {
  // Identifiant du personnage actuellement sélectionné
  const activeCharacterId = currentSpeakerId
    ? String(currentSpeakerId)
    : null

  // Identifiant du personnage ayant envoyé le message
  const messageCharacterId = m.sender_character_id
    ? String(m.sender_character_id)
    : null

  // Les bulles sont attribuées aux personnages,
  // indépendamment du compte utilisateur.
  if (activeCharacterId && messageCharacterId) {
    return activeCharacterId === messageCharacterId
  }

  // Si l'identifiant du personnage est absent,
  // ne pas attribuer automatiquement le message
  // au personnage actuel.
  return false
}


  /* ==================== MODALES: NOUVELLE CONVERSATION ==================== */
  const openNewConv = () => {
    setNewConvTitle('')
    setNewConvTargets([])
    setSearch('')
    setScreen('compose')
  }

  const toggleTarget = (charId) => {
    setNewConvTargets(prev =>
      prev.includes(charId)
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    )
  }


const createConversation = async () => {
  const title = newConvTitle.trim()

  if (!newConvTargets.length) {
    alert('Sélectionne au moins un personnage.')
    return
  }

  if (newConvTargets.length > 1 && !title) {
    alert('Ajoute un titre à la conversation de groupe.')
    return
  }

  if (!currentSpeakerId) {
    alert('Sélectionne un personnage actif.')
    return
  }

  try {
    // La création et les invitations sont gérées
    // ensemble par Supabase, avec les bons user_id
    // et character_id.
    const { data: conversationId, error } =
      await supabase.rpc('create_message_conversation', {
        p_sender_character_id: currentSpeakerId,
        p_target_character_ids: newConvTargets,
        p_title: title || null,
      })

    if (error) throw error

    setNewConvOpen(false)
    setNewConvTargets([])
    setNewConvTitle('')

    await loadConversations()

    // Ouvrir immédiatement la conversation créée.
    await openConversation({
      id: conversationId,
      title: title || 'Conversation',
      is_group: true,
      created_by: session.user.id,
    })

  } catch (e) {
    console.error('Création conversation :', e)
    alert(e?.message || 'Impossible de créer la conversation.')
  }
}

 
  /* ==================== MODALE CONTACT: CONVERSATIONS ==================== */
  const openContactConvs = async (contact) => {
    setContactModal({ open: true, contact, convs: [], loading: true })
    try {
      let q = supabase
        .from('conversation_participants')
        .select(`
          conversation_id,
          conversations!inner (
            id, is_group, direct_key, title, last_message_at
          )
        `)

      if (contact.is_character) q = q.eq('character_id', contact.id)
      else q = q.eq('user_id', contact.user_id)

      const { data, error } = await q
      if (error) throw error

      const convs = (data || []).map(r => r.conversations).filter(Boolean)
      setContactModal(prev => ({ ...prev, convs, loading: false }))
    } catch (e) {
      setContactModal(prev => ({ ...prev, loading: false }))
      alert(e.message || String(e))
    }
  }

  const closeContactModal = () => {
    setContactModal({ open: false, contact: null, convs: [], loading: false })
  }

  /* ==================== TÉLÉPHONE ==================== */
  const pressKey = (key) => {
    if (key === 'shift') { setCaps(v => !v); return }
    if (key === 'backspace') { setInput(v => v.slice(0, -1)); return }
    if (key === 'enter') { setInput(v => v + '\n'); return }
    setInput(v => v + (key === 'space' ? ' ' : caps ? key.toUpperCase() : key))
    if (caps) setCaps(false)
  }
  const Avatar = ({ name, src, size = 'h-11 w-11' }) => (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-white/10 ring-1 ring-white/20 grid place-items-center text-white/80 font-semibold`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (name?.[0] || '?').toUpperCase()}
    </div>
  )
  const navButton = (label, target) => (
    <button type="button" onClick={() => { setScreen(target); setKeyboardOpen(false) }}
      className={`flex-1 py-3 text-xs sm:text-sm transition ${screen === target ? 'text-amber-300' : 'text-white/60 hover:text-white'}`}>
      {label}
    </button>
  )
  if (loading) return <main className="min-h-svh bg-slate-950 p-6 text-white">Chargement…</main>
  if (error) return <main className="min-h-svh bg-slate-950 p-6 text-rose-300">Erreur : {error}</main>

  const activeInfo = activeConv ? infoForConv(activeConv) : null
  const filteredContacts = displayContacts.filter(c => c.is_character && c.user_id !== session?.user?.id && c.name?.toLowerCase().includes(search.toLowerCase()))
  const filteredConvos = convos.filter(c => (c.title || infoForConv(c).label).toLowerCase().includes(search.toLowerCase()))

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-slate-950 px-0 py-0 text-white sm:px-4 sm:py-6">
      <div className="absolute inset-0 bg-cover bg-center opacity-45" style={{ backgroundImage: "url('/images/msg-bg.webp')" }} />
      <div className="absolute inset-0 bg-slate-950/35" />
      <section className="relative z-10 flex h-[100dvh] w-full max-w-[490px] min-h-0 flex-col overflow-hidden border border-white/15 bg-slate-950/90 shadow-[0_20px_90px_rgba(0,0,0,.65)] backdrop-blur-xl sm:h-[min(850px,94dvh)] sm:rounded-[32px] sm:border-[5px] sm:border-slate-700">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3">
          {screen === 'chat' ? (
            <button type="button" aria-label="Retour aux conversations" onClick={() => { setScreen('conversations'); setKeyboardOpen(false) }} className="rounded-full p-2 hover:bg-white/10">←</button>
          ) : <span className="text-lg text-amber-300">✦</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{screen === 'chat' ? (activeInfo?.label || activeConv?.title || 'Discussion') : screen === 'compose' ? 'Nouveau message' : screen === 'contacts' ? 'Contacts' : 'Messages'}</h1>
            <p className="truncate text-[11px] text-white/50">{screen === 'chat' ? 'Conversation' : (myChars.find(c => c.id === currentSpeakerId)?.name || 'Téléphone RPG')}</p>
          </div>
          <button type="button" onClick={() => router.push('/dashboard')} className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/80 hover:bg-white/10">Dashboard</button>
        </header>

        {(screen === 'conversations' || screen === 'contacts' || screen === 'compose') && (
          <div className="shrink-0 px-4 pt-4 pb-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm outline-none placeholder:text-white/40 focus:border-amber-300/50" />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {screen === 'conversations' && (
            <div className="p-3 space-y-1">
              <button type="button" onClick={openNewConv} className="mb-3 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-200">+ Écrire un message</button>
              {filteredConvos.map(c => {
                const info = infoForConv(c)
                const last = lastMsgByConv[c.id]
                const person = [...charsById.values()].find(ch => ch.name === info.label)
                return <button key={c.id} type="button" onClick={() => openConversation(c)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/10">
                  <Avatar name={info.label} src={person?.avatar_url} />
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{c.title?.trim() || info.label || 'Conversation'}</div><div className="truncate text-xs text-white/50">{last ? short(last.content, 58) : 'Aucun message'}</div></div>
                  <span className="shrink-0 text-[10px] text-white/40">{last?.created_at ? new Date(last.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}</span>
                </button>
              })}
              {!filteredConvos.length && <p className="p-5 text-center text-sm text-white/50">Aucune conversation trouvée.</p>}
            </div>
          )}

          {screen === 'contacts' && <div className="p-3 space-y-1">
            {filteredContacts.map(c => <button type="button" key={c.id} onClick={() => { setNewConvTargets([c.id]); setNewConvTitle(''); setScreen('compose') }} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/10"><Avatar name={c.name} src={c.avatar_url} /><span className="min-w-0 flex-1 truncate text-sm">{c.name}</span><span className="text-amber-300">Écrire ›</span></button>)}
            {!filteredContacts.length && <p className="p-5 text-center text-sm text-white/50">Aucun contact.</p>}
          </div>}

          {screen === 'compose' && <div className="space-y-4 p-4">
            <p className="text-xs text-white/60">Sélectionne un ou plusieurs personnages. Plusieurs destinataires créent une conversation de groupe.</p>
            <div className="space-y-1">{filteredContacts.map(c => <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-white/10"><input type="checkbox" checked={newConvTargets.includes(c.id)} onChange={() => toggleTarget(c.id)} className="accent-amber-300" /><Avatar name={c.name} src={c.avatar_url} size="h-9 w-9" /><span className="text-sm">{c.name}</span></label>)}</div>
            <input value={newConvTitle} onChange={e => setNewConvTitle(e.target.value)} placeholder={newConvTargets.length > 1 ? 'Nom du groupe (obligatoire)' : 'Titre de la conversation (facultatif)'} className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm outline-none" />
            <button type="button" disabled={!newConvTargets.length} onClick={createConversation} className="w-full rounded-xl bg-amber-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40">Créer la conversation</button>
          </div>}

          {screen === 'chat' && <div className="flex min-h-full flex-col justify-end gap-3 p-4">
            {!messages.length && <p className="py-8 text-center text-sm text-white/50">Début de la conversation</p>}
            {messages.map(m => {
              const mine = isMine(m)
              const sender = m.sender_character_id ? charsById.get(String(m.sender_character_id)) : contactsByUser.get(m.sender_id)
              return <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                {!mine && <Avatar name={sender?.name} src={sender?.avatar_url} size="h-8 w-8" />}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow ${mine ? 'rounded-br-sm bg-sky-600/90 text-white' : 'rounded-bl-sm bg-amber-200 text-slate-950'}`}>
                  {sender?.name && <div className={`mb-1 text-[10px] font-semibold ${mine ? 'text-sky-100' : 'text-amber-900'}`}>{sender.name}</div>}
                  <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                  <div className={`mt-1 text-right text-[10px] ${mine ? 'text-white/60' : 'text-slate-700/60'}`}>{new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            })}
            <div ref={endRef} />
          </div>}
        </div>

        {screen === 'chat' && <div className="shrink-0 border-t border-white/10 bg-slate-900/95 px-3 pt-2 pb-2">
          {myChars.length > 0 && <div className="mb-2 flex items-center gap-2 text-xs text-white/60"><span>Envoyer en tant que</span><select value={currentSpeakerId || ''} onChange={e => setCurrentSpeakerId(e.target.value)} className="min-w-0 max-w-[65%] rounded-lg bg-slate-800 px-2 py-1 text-white">{myChars.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}</select></div>}
          <form onSubmit={e => { e.preventDefault(); sendMessage() }} className="flex items-end gap-2">
            <textarea ref={inputRef} rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendMessage() } }} placeholder="Écrire un message…" className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm outline-none placeholder:text-white/40" />
            <button type="button" onClick={() => setKeyboardOpen(v => !v)} aria-label="Afficher ou masquer le clavier visuel" className="rounded-xl border border-white/15 px-3 py-3 text-sm hover:bg-white/10">⌨</button>
            <button type="submit" disabled={sending || !input.trim()} className="rounded-xl bg-amber-300 px-3 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">➤</button>
          </form>
          {keyboardOpen && <div className="mt-3 space-y-1.5 select-none" onMouseDown={e => e.preventDefault()}>
            {['1234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn'].map((row, i) => <div key={i} className="flex justify-center gap-1">{Array.from(row).map(k => <button key={k} type="button" onClick={() => pressKey(k)} className="h-10 min-w-0 flex-1 rounded-md bg-slate-700 text-sm font-medium active:bg-amber-400 active:text-slate-950">{caps ? k.toUpperCase() : k}</button>)}</div>)}
            <div className="flex gap-1"><button type="button" onClick={() => pressKey('.')} className="rounded-md bg-slate-700 px-2 py-2 text-xs">.</button><button type="button" onClick={() => pressKey(',')} className="rounded-md bg-slate-700 px-2 py-2 text-xs">,</button><button type="button" onClick={() => pressKey('shift')} className="rounded-md bg-slate-700 px-3 py-2 text-xs">⇧</button><button type="button" onClick={() => pressKey('space')} className="flex-1 rounded-md bg-slate-700 py-2 text-xs">Espace</button><button type="button" onClick={() => pressKey('backspace')} className="rounded-md bg-slate-700 px-3 py-2 text-xs">⌫</button><button type="button" onClick={() => pressKey('enter')} className="rounded-md bg-slate-700 px-3 py-2 text-xs">↵</button></div>
          </div>}
        </div>}

        <nav aria-label="Navigation messagerie" className="flex shrink-0 border-t border-white/10 bg-black/40">
          {navButton('Conversations', 'conversations')}
          {navButton('Contacts', 'contacts')}
          {navButton('Nouveau +', 'compose')}
          <button type="button" onClick={() => router.push('/dashboard')} className="flex-1 py-3 text-xs text-white/60 hover:text-white sm:text-sm">Accueil</button>
        </nav>
      </section>
    </main>
  )
}
