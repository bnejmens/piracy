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
      setCurrentSpeakerId(myChars[0].id)
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
    await supabase
      .from('conversation_participants')
      .upsert([{
        conversation_id: conversationId,
        user_id: session.user.id,
        role,
        character_id: myCharId || null,
      }], { onConflict: 'conversation_id,user_id' })
  }

  const sendMessage = async () => {
    if (!input.trim() || !session || !activeConv) return
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
    const msgChar = m.sender_character_id ? String(m.sender_character_id) : null
    const curChar = currentSpeakerId ? String(currentSpeakerId) : null
    if (msgChar && curChar) return msgChar === curChar
    return m.sender_id === session?.user?.id
  }

  /* ==================== MODALES: NOUVELLE CONVERSATION ==================== */
  const openNewConv = () => {
    setNewConvTitle('')
    setNewConvTargets([])
    setNewConvOpen(true)
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
    if (!title) { alert('Ajoute un titre.'); return }
    if (!newConvTargets.length) { alert('Sélectionne au moins un personnage.'); return }

    try {
      const { data: conv, error: e1 } = await supabase
        .from('conversations')
        .insert({ is_group: true, title, created_by: session.user.id })
        .select('id, is_group, title, created_by')
        .single()
      if (e1) throw e1

      const rows = []
      rows.push({
        conversation_id: conv.id,
        user_id: session.user.id,
        role: 'owner',
        character_id: currentSpeakerId || null,
      })
      for (const cid of newConvTargets) {
        const c = contacts.find(x => x.is_character && String(x.id) === String(cid))
        if (!c) continue
        rows.push({
          conversation_id: conv.id,
          user_id: c.user_id,
          role: 'member',
          character_id: c.id,
        })
      }

      const { error: e2 } = await supabase
        .from('conversation_participants')
        .insert(rows)
      if (e2) throw e2

      setNewConvOpen(false)
      await loadConversations()
    } catch (e) {
      alert(e.message || String(e))
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

  /* ==================== RENDER ==================== */
  if (loading) return <p className="p-6">Chargement…</p>
  if (error) return <p className="p-6 text-red-500">Erreur : {error}</p>

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/msg-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Bas-gauche : retour + (place pour Ambiance) */}
      <div className="fixed left-50 bottom-4 z-50 flex items-center gap-2">
        {/* Ici tu peux ajouter ton bouton Ambiance si besoin */}
        <button
          onClick={() => router.push('/dashboard')}
          className="rounded-full border border-white/25 bg-white/15 backdrop-blur-md px-3 py-2 text-white/90 text-md hover:bg-white/20"
        >
          ← Tableau de bord
        </button>
      </div>

      {/* GRID */}
      <div className="relative z-10 h-full grid gap-6 p-6 grid-cols-[450px_450px_minmax(0,7fr)] xl:grid-cols-[450px_450px_minmax(0,7fr)] lg:grid-cols-[340px_340px_minmax(0,1fr)] md:grid-cols-1">
        {/* COLONNE GAUCHE — Messagerie + Contacts */}
        <section className="rounded-2xl bg-black/50 backdrop-blur-sm border border-white/20 overflow-hidden flex flex-col">
          {/* Messagerie */}
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium flex items-center justify-between">
            <span>Messagerie</span>
            <button
              onClick={openNewConv}
              className="rounded-lg bg-amber-300 text-slate-900 text-xs font-medium px-2.5 py-1 hover:bg-amber-200"
            >
              + Nouveau
            </button>
          </header>

          {/* Contacts (liste simple → clique = modal convs) */}
          <div className="px-4 py-3 border-b border-white/10 text-white/80 text-sm">Contacts</div>
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            {displayContacts.map(c => {
              const key = c.is_character ? c.id : `u-${c.user_id}`
              return (
                <button
                  key={key}
                  onClick={() => openContactConvs(c)}
                  className="w-full flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-left hover:bg-white/10"
                  title={c.name}
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="grid place-items-center w-full h-full text-white/70">
                        {(c.name?.[0] || '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="text-white/90 text-sm truncate">{c.name}</div>
                </button>
              )
            })}
            {!displayContacts.length && (
              <div className="text-white/60 text-sm">Aucun contact.</div>
            )}
          </div>
        </section>

        {/* COLONNE CENTRALE — Conversations (par titre) */}
        <section className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium">Conversations</header>
          <div className="p-3 space-y-2 overflow-y-auto flex-1">
            {convos.map(c => {
              const last = lastMsgByConv[c.id]?.content
              return (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-left rounded-lg border px-3 py-2 hover:bg-white/10 transition ${
                    activeConv?.id === c.id
                      ? 'bg-white/10 border-white/30'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="text-white/90 text-sm truncate">
                    {c.title?.trim() || (c.is_group ? 'Sans titre' : infoForConv(c).label)}
                  </div>
                  <div className="text-white/50 text-xs truncate">
                    {last ? short(last, 48) : 'Aucun message pour le moment.'}
                  </div>
                </button>
              )
            })}
            {!convos.length && (
              <div className="text-white/60 text-sm">Aucune conversation.</div>
            )}
          </div>
        </section>

        {/* COLONNE DROITE — Messages */}
        <section className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
            {activeConv ? (
              <div className="text-white/90 font-medium">
                {infoForConv(activeConv).label || activeConv.title || 'Conversation'}
              </div>
            ) : (
              <div className="text-white/60">Sélectionnez une conversation</div>
            )}

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
                    <option key={ch.id} value={ch.id} className="text-slate-900">
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeConv && messages.map(m => {
              const mine = isMine(m)
              const senderChar = m.sender_character_id
                ? charsById.get(String(m.sender_character_id))
                : null
              const myChar = currentSpeakerId
                ? charsById.get(String(currentSpeakerId))
                : null
              const fallbackContact = contactsByUser.get(m.sender_id)

              const leftAvatarUrl = senderChar?.avatar_url ?? fallbackContact?.avatar_url ?? null
              const rightAvatarUrl = myChar?.avatar_url ?? contactsByUser.get(session.user.id)?.avatar_url ?? null

              const leftInitial = (senderChar?.name?.[0] ?? fallbackContact?.name?.[0] ?? '?').toUpperCase()
              const rightInitial = (myChar?.name?.[0] ?? (me?.pseudo?.[0] || me?.email?.[0]) ?? '?').toUpperCase()

              return (
                <div
  key={m.id}
  className={`flex gap-2 items-center ${mine ? 'justify-end' : 'justify-start'}`}
>


                  {!mine && (
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-1 ring-white/15">
                      {leftAvatarUrl ? (
                        <img src={leftAvatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="grid place-items-center w-full h-full text-white/70 text-lg">
                          {leftInitial}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`max-w-[70%] rounded-2xl px-3 py-2 text-base leading-snug shadow ${
                    mine ? 'bg-sky-500/80 text-white' : 'bg-amber-300/90 text-slate-900'
                  }`}>
                    {m.content}
                  </div>
                  {mine && (
                    <div className="w-12 h-12 rounded-full overflow-hidden ring-1 ring-white/15">
                      {rightAvatarUrl ? (
                        <img src={rightAvatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="grid place-items-center w-full h-full text-white/70 text-lg">
                          {rightInitial}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={endRef} />
          </div>

          {activeConv && (
            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage() }}
              className="p-3 border-t border-white/10 flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Écrire un message…"
                className="flex-1 rounded-lg bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/60"
              />
              <button
                disabled={!input.trim() || sending}
                className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200 disabled:opacity-50"
              >
                Envoyer
              </button>
            </form>
          )}
        </section>
      </div>

      {/* ===== MODALE: CRÉER UNE CONVERSATION ===== */}
      {newConvOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white text-lg font-semibold">Nouvelle conversation</h3>
              <button
                onClick={() => setNewConvOpen(false)}
                className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 text-white hover:bg-white/15"
              >
                Fermer
              </button>
            </div>

            <label className="block mb-3">
              <div className="text-white/80 text-sm mb-1">Titre</div>
              <input
                value={newConvTitle}
                onChange={(e) => setNewConvTitle(e.target.value)}
                className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                placeholder="Titre de la conversation"
              />
            </label>

            <div className="text-white/80 text-sm mb-1">Choisir les personnages (un ou plusieurs)</div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-white/15 bg-white/5 p-2 space-y-2">
              {contacts
                .filter(c => c.is_character)
                .map(ch => {
                  const checked = newConvTargets.includes(ch.id)
                  return (
                    <label key={ch.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/10 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTarget(ch.id)}
                      />
                      <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/20">
                        {ch.avatar_url ? (
                          <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                            {(ch.name?.[0] || '?').toUpperCase()}
                          </div>
                        )}
                      </div>
                      <span className="text-white/90 text-sm">{ch.name}</span>
                    </label>
                  )
                })}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setNewConvOpen(false)}
                className="rounded-lg border border-white/20 bg-white/10 text-white px-3 py-2 hover:bg-white/15"
              >
                Annuler
              </button>
              <button
                onClick={createConversation}
                className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODALE: CONVERSATIONS D’UN CONTACT ===== */}
      {contactModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-md p-4">
            {/* En-tête */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/20">
                  {contactModal.contact?.avatar_url ? (
                    <img
                      src={contactModal.contact.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                      {(contactModal.contact?.name?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                </div>
                <h3 className="text-white text-lg font-semibold">
                  Conversations avec {contactModal.contact?.name}
                </h3>
              </div>
              <button
                onClick={closeContactModal}
                className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 text-white hover:bg-white/15"
              >
                Fermer
              </button>
            </div>

            {/* Contenu */}
            {contactModal.loading ? (
              <div className="text-white/70">Chargement…</div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {contactModal.convs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      closeContactModal()
                      openConversation(c)
                    }}
                    className="w-full text-left rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-3 py-2"
                  >
                    <div className="text-white/90 text-sm truncate">
                      {c.title?.trim() || (c.is_group ? 'Sans titre' : 'Direct')}
                    </div>
                    <div className="text-white/50 text-xs">ID #{c.id}</div>
                  </button>
                ))}

                {!contactModal.convs.length && (
                  <div className="text-white/60 text-sm">
                    Aucune conversation trouvée pour ce contact.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
