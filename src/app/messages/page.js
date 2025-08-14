// src/app/messages/page.js (responsive tablet + mobile)
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

const PAGE_SIZE = 12
const MSG_BATCH = 50

// Couleur stable par personnage (UUID → HSL)
function colorForCharacter(id) {
  if (!id) return 'bg-white/10';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `bg-[hsl(${h}deg_70%_45%)]`;
}

function textOn(colorClass) {
  if (colorClass.startsWith('bg-[')) return 'text-white';
  return 'text-white';
}

export default function MessagesPage() {
  const router = useRouter()

  // Auth / profil / perso actif
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const [myChars, setMyChars] = useState([])
  const [currentSpeakerId, setCurrentSpeakerId] = useState(null)

  // Données
  const [allCharacters, setAllCharacters] = useState([])
  const [convos, setConvos] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])

  // UI
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Sections repliables (gauche)
  const [openContacts, setOpenContacts] = useState(true)
  const [openConvos, setOpenConvos] = useState(true)

  // Pagination
  const [contactPage, setContactPage] = useState(0)
  const [convoPage, setConvoPage] = useState(0)

  // Nouveau sujet
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [newConvTitle, setNewConvTitle] = useState('')

  // Composer
  const [composerActive, setComposerActive] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const fileRef = useRef(null)

  // Messages: lazy load older
  const [oldestLoadedAt, setOldestLoadedAt] = useState(null)
  const [hasMoreOld, setHasMoreOld] = useState(false)
  const scrollRef = useRef(null)
  const endRef = useRef(null)

  // Drawer (mobile/tablette)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Emojis légers
  const EMOJIS = ['😀','😂','🥲','😍','😎','🤔','🙌','🔥','✨','👍','👏','🎉','🧙‍♂️','🧪','🗺️','🦄','🐉']

  // BOOT
  useEffect(() => {
    const run = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/auth'); return }
        setSession(session)

        const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
        setMe(prof || null)

        const { data: mineChars } = await supabase
          .from('characters')
          .select('id, name, avatar_url, user_id, is_active')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: true })
        setMyChars(mineChars || [])

        const { data: charsAll } = await supabase
          .from('characters')
          .select('id, user_id, name, avatar_url')
          .order('name', { ascending: true })
        setAllCharacters(charsAll || [])

        await loadConversations()
      } catch (e) {
        setError(e.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [router])

  // Perso actif par défaut
  useEffect(() => {
    if (!currentSpeakerId && myChars?.length) setCurrentSpeakerId(myChars[0].id)
  }, [myChars, currentSpeakerId])

  const short = (s, n = 64) => (s?.length > n ? s.slice(0, n) + '…' : s || '')
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })

  const loadConversations = async () => {
    const { data, error } = await supabase
      .from('conversations')
      .select('id, is_group, title, created_by, last_message_at, created_at')
      .order('last_message_at', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false, nullsFirst: true })
      .limit(200)
    if (error) throw error
    setConvos(data || [])
  }

  const openConversation = async (conv) => {
    setActiveConv(conv)
    setMessages([])
    setOldestLoadedAt(null)
    setHasMoreOld(false)
    await loadRecentMessages(conv.id)
    setTimeout(() => {
      scrollToBottom()
      setSidebarOpen(false) // auto-fermer la sidebar en mobile
    }, 0)
  }

  const loadRecentMessages = async (conversationId) => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, sender_character_id, content, created_at, sender:sender_character_id ( id, name, avatar_url )')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MSG_BATCH)
    if (error) return

    const list = (data || []).slice().reverse()
    setMessages(list)
    if (list.length) {
      setOldestLoadedAt(list[0].created_at)
      setHasMoreOld((data || []).length === MSG_BATCH)
    } else {
      setOldestLoadedAt(null)
      setHasMoreOld(false)
    }
  }

  const loadOlder = async () => {
    if (!activeConv || !oldestLoadedAt) return
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, sender_character_id, content, created_at, sender:sender_character_id ( id, name, avatar_url )')
      .eq('conversation_id', activeConv.id)
      .lt('created_at', oldestLoadedAt)
      .order('created_at', { ascending: false })
      .limit(MSG_BATCH)
    if (error) return

    const older = (data || []).slice().reverse()
    if (older.length) {
      setMessages(prev => [...older, ...prev])
      setOldestLoadedAt(older[0].created_at)
      setHasMoreOld((data || []).length === MSG_BATCH)
      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 10
      }, 0)
    } else {
      setHasMoreOld(false)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !session || !activeConv) return
    setSending(true)
    try {
      const payload = {
        conversation_id: activeConv.id,
        sender_id: session.user.id,
        sender_character_id: currentSpeakerId ?? null,
        content: input.trim(),
      }
      const { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select('id, conversation_id, sender_id, sender_character_id, content, created_at, sender:sender_character_id ( id, name, avatar_url )')
        .single()
      if (error) throw error

      setMessages(m => [...m, data])
      setInput('')
      setComposerActive(false)
      setTimeout(scrollToBottom, 0)
      await loadConversations()
    } catch (e) {
      alert(e?.message || String(e))
    } finally {
      setSending(false)
    }
  }

  const onPickFile = () => fileRef.current?.click()
  const uploadAndSendImage = async (file) => {
    if (!file || !session || !activeConv) return
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const path = `${session.user.id}/${activeConv.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: false })
      if (upErr) { alert('Upload échoué (bucket "attachments" existe ?)'); return }

      const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path)
      const url = pub?.publicUrl
      if (!url) { alert('URL publique introuvable'); return }

      const content = `![image](${url})`
      const { error: insErr } = await supabase.from('messages').insert({
        conversation_id: activeConv.id,
        sender_id: session.user.id,
        sender_character_id: currentSpeakerId ?? null,
        content
      })
      if (insErr) { alert(insErr.message); return }
      await loadRecentMessages(activeConv.id)
      setTimeout(scrollToBottom, 0)
    } catch (e) {
      alert(e.message || String(e))
    }
  }

  const createConversation = async () => {
    const title = newConvTitle.trim()
    if (!title) { alert('Ajoute un titre.'); return }
    const { data, error } = await supabase
      .from('conversations')
      .insert({ is_group: true, title, created_by: session.user.id })
      .select('id, is_group, title, created_by, last_message_at, created_at')
      .single()
    if (error) { alert(error.message); return }
    setNewConvOpen(false)
    setNewConvTitle('')
    setConvoPage(0)
    await loadConversations()
    await openConversation(data)
  }

  const pagedContacts = useMemo(() => {
    const start = contactPage * PAGE_SIZE
    return (allCharacters || []).slice(start, start + PAGE_SIZE)
  }, [allCharacters, contactPage])

  const contactsPageCount = Math.ceil((allCharacters?.length || 0) / PAGE_SIZE)

  const pagedConvos = useMemo(() => {
    const start = convoPage * PAGE_SIZE
    return (convos || []).slice(start, start + PAGE_SIZE)
  }, [convos, convoPage])

  const convosPageCount = Math.ceil((convos?.length || 0) / PAGE_SIZE)

  if (loading) return <p className="p-6">Chargement…</p>
  if (error) return <p className="p-6 text-red-500">Erreur : {error}</p>

  const activeCharName = myChars?.find(c => String(c.id) === String(currentSpeakerId))?.name
    || myChars?.[0]?.name || me?.pseudo || 'Moi'

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/msg-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Layout : grille desktop, pile mobile */}
      <div className="relative z-10 h-full grid gap-4 sm:gap-6 p-3 sm:p-6 grid-cols-1 md:grid-cols-[360px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* COLONNE GAUCHE (desktop/tablette ≥ md) */}
        <aside className="hidden md:flex rounded-2xl bg-black/45 backdrop-blur-md border border-white/15 overflow-hidden flex-col">
          {/* En-tête */}
          <div className="px-4 py-3 border-b border-white/10 text-white/80 flex items-center justify-between">
            <div className="font-medium">
              téléphone de <span className="text-amber-300">{activeCharName}</span>
            </div>
            {myChars.length > 1 && (
              <select
                value={currentSpeakerId || ''}
                onChange={e => setCurrentSpeakerId(e.target.value || null)}
                className="rounded-md bg-white/20 border border-white/30 text-black/70 text-sm px-2 py-1"
                title="Parler en tant que…"
              >
                {myChars.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </select>
            )}
          </div>

          {/* Boutons Nouveau + Retour */}
          <div className="px-4 py-3 flex gap-2">
            <button
              onClick={() => setNewConvOpen(true)}
              className="flex-1 rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200"
            >
              Start New ✉
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 rounded-lg bg-white/10 border border-white/20 text-white/80 font-medium px-3 py-2 hover:bg-white/15"
            >
              Dashboard ↩︎
            </button>
          </div>

          {/* Conversations */}
          <div>
            <button
              onClick={() => setOpenConvos(o => !o)}
              className="w-full px-4 py-3 text-left text-white/90 font-medium hover:bg-white/5 flex items-center justify-between"
            >
              <span>Conversations</span>
              <span className="text-white/60 text-sm">{openConvos ? '▼' : '▲'}</span>
            </button>

            {openConvos && (
              <div className="p-3 space-y-2">
                {pagedConvos.map(c => (
                  <button
                    key={c.id}
                    onClick={() => openConversation(c)}
                    className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                      activeConv?.id === c.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-white/90 text-sm truncate">{c.title?.trim() || 'Sujet sans titre'}</div>
                    <div className="text-white/50 text-xs truncate">
                      {c.last_message_at ? new Date(c.last_message_at).toLocaleString() : 'Aucun message'}
                    </div>
                  </button>
                ))}
                {!pagedConvos.length && <div className="text-white/60 text-sm">Aucune conversation.</div>}

                {convosPageCount > 1 && (
                  <div className="pt-2 flex items-center justify-between text-white/70 text-sm">
                    <button
                      className="px-2 py-1 rounded bg-white/10 border border-white/15 disabled:opacity-50"
                      onClick={() => setConvoPage(p => Math.max(0, p - 1))}
                      disabled={convoPage === 0}
                    >
                      ← Préc.
                    </button>
                    <div>Page {convoPage + 1} / {convosPageCount}</div>
                    <button
                      className="px-2 py-1 rounded bg-white/10 border border-white/15 disabled:opacity-50"
                      onClick={() => setConvoPage(p => Math.min(convosPageCount - 1, p + 1))}
                      disabled={convoPage >= convosPageCount - 1}
                    >
                      Suiv. →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Carnet de contact */}
          <div className="border-b border-white/10">
            <button
              onClick={() => setOpenContacts(o => !o)}
              className="w-full px-4 py-3 text-left text-white/90 font-medium hover:bg-white/5 flex items-center justify-between"
            >
              <span>Carnet de contact</span>
              <span className="text-white/60 text-sm">{openContacts ? '▼' : '▲'}</span>
            </button>

            {openContacts && (
              <div className="p-3 space-y-2">
                {pagedContacts.map(ch => (
                  <div key={ch.id} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15">
                      {ch.avatar_url
                        ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="grid place-items-center w-full h-full text-white/70">{(ch.name?.[0] || '?').toUpperCase()}</div>}
                    </div>
                    <div className="text-white/90 text-sm truncate">{ch.name}</div>
                  </div>
                ))}
                {!pagedContacts.length && <div className="text-white/60 text-sm">Aucun personnage.</div>}

                {contactsPageCount > 1 && (
                  <div className="pt-2 flex items-center justify-between text-white/70 text-sm">
                    <button
                      className="px-2 py-1 rounded bg-white/10 border border-white/15 disabled:opacity-50"
                      onClick={() => setContactPage(p => Math.max(0, p - 1))}
                      disabled={contactPage === 0}
                    >
                      ← Préc.
                    </button>
                    <div>Page {contactPage + 1} / {contactsPageCount}</div>
                    <button
                      className="px-2 py-1 rounded bg-white/10 border border-white/15 disabled:opacity-50"
                      onClick={() => setContactPage(p => Math.min(contactsPageCount - 1, p + 1))}
                      disabled={contactPage >= contactsPageCount - 1}
                    >
                      Suiv. →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* COLONNE PRINCIPALE — Effet téléphone */}
        <section className="flex items-center justify-center">
          {/* Toolbar mobile/tablette (visible < md) */}
          <div className="md:hidden mb-3 w-full flex items-center justify-between gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-xl bg-white/10 border border-white/20 text-white/90 px-3 py-2"
            >
              ☰ Menu
            </button>
            <div className="text-white/80 text-sm truncate">téléphone de <span className="text-amber-300">{activeCharName}</span></div>
            <button
              onClick={() => setNewConvOpen(true)}
              className="rounded-xl bg-amber-300 text-slate-900 font-medium px-3 py-2"
            >
              + Nouveau
            </button>
          </div>

          {/* Téléphone */}
          <div className="rounded-[24px] bg-black/40 backdrop-blur-md border border-white/15 overflow-hidden w-full sm:w-[min(92vw,560px)] h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] flex flex-col">
            {/* En-tête conv */}
            <div className="px-3 sm:px-4 py-3 border-b border-white/10 flex items-center gap-3">
              <button
                className="md:hidden rounded-lg bg-white/10 border border-white/20 px-3 py-2"
                onClick={() => setSidebarOpen(true)}
                title="Ouvrir le menu"
              >
                ☰
              </button>
              {myChars.length > 1 && (
                <select
                  value={currentSpeakerId || ''}
                  onChange={e => setCurrentSpeakerId(e.target.value || null)}
                  className="md:hidden rounded-md bg-white/20 border border-white/30 text-black/70 text-sm px-2 py-1"
                  title="Parler en tant que…"
                >
                  {myChars.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </select>
              )}
              <div className="text-white/90 font-medium truncate flex-1">
                {activeConv ? (activeConv.title?.trim() || 'Sujet sans titre') : 'Sélectionnez une conversation'}
              </div>
            </div>

            {/* Corps : messages + barre écrire + clavier */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Zone scroll messages */}
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3"
              >
                {activeConv && hasMoreOld && (
                  <div className="flex justify-center">
                    <button
                      onClick={loadOlder}
                      className="text-white/80 text-sm px-3 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/15"
                    >
                      Charger les messages plus anciens
                    </button>
                  </div>
                )}

                {activeConv && messages.map(m => {
                  const mine = String(m.sender_character_id) === String(currentSpeakerId);
                  return (
                    <Bubble key={m.id} mine={mine} message={m} />
                  );
                })}

                <div ref={endRef} />
              </div>

              {/* Barre “écrire…” */}
              {activeConv && (
                <div className="border-t border-white/10 bg-white/5 shrink-0 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
                  {!composerActive ? (
                    <button
                      onClick={() => setComposerActive(true)}
                      className="w-full text-left px-3 sm:px-4 py-3 text-white/70 flex items-center gap-2"
                    >
                      <span className="inline-block w-2 h-5 bg-white/70 animate-pulse" />
                      <span className="opacity-80">écrire…</span>
                    </button>
                  ) : (
                    <div className="px-2 sm:px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => setShowEmoji(s => !s)}
                        className="rounded-lg bg-white/10 border border-white/20 px-2 py-2 text-xl"
                        title="Émojis"
                      >
                        😊
                      </button>

                      <input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                        placeholder="Tape ton message…"
                        className="flex-1 rounded-lg bg-white/10 border border-white/20 text-white/90 px-3 py-2 placeholder-white/40 focus:outline-none"
                        disabled={sending}
                        autoFocus
                      />

                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => uploadAndSendImage(e.target.files?.[0])} />
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="rounded-lg bg-white/10 border border-white/20 px-3 py-2"
                        title="Joindre une image"
                      >
                        📎
                      </button>

                      <button
                        onClick={sendMessage}
                        disabled={!input.trim() || sending}
                        className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 disabled:opacity-50"
                      >
                        Envoyer
                      </button>
                    </div>
                  )}

                  {/* Mini picker emoji */}
                  {composerActive && showEmoji && (
                    <div className="px-3 pb-2">
                      <div className="rounded-xl bg-black/50 border border-white/20 p-2 grid grid-cols-6 sm:grid-cols-9 gap-1 text-2xl">
                        {EMOJIS.map(e => (
                          <button
                            key={e}
                            onClick={() => { setInput(v => (v || '') + e); setShowEmoji(false) }}
                            className="rounded-md hover:bg-white/10"
                            title={e}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clavier factice — Masqué sur petits écrans */}
              <div className="basis-[28%] sm:basis-[32%] shrink-0 overflow-hidden border-t border-white/10 bg-white/5 hidden sm:block">
                <FakeAzertyKeyboard />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* DRAWER MOBILE/TABLETTE */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(92vw,360px)] bg-slate-950/90 border-r border-white/15 p-3 flex flex-col">
            <div className="flex items-center justify-between mb-3 text-white/80">
              <div className="font-medium">téléphone de <span className="text-amber-300">{activeCharName}</span></div>
              <button onClick={() => setSidebarOpen(false)} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5">Fermer</button>
            </div>

            {/* Actions rapides */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => setNewConvOpen(true)} className="flex-1 rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2">Start New ✉</button>
              <button onClick={() => { setSidebarOpen(false); router.push('/dashboard') }} className="flex-1 rounded-lg bg-white/10 border border-white/20 text-white/80 font-medium px-3 py-2">dashboard ↩︎</button>
            </div>

            {/* Bloc Conversations */}
            <div className="flex-1 overflow-y-auto">
              <button onClick={() => setOpenConvos(o => !o)} className="w-full px-3 py-2 text-left text-white/90 font-medium hover:bg-white/5 flex items-center justify-between">
                <span>Conversations</span>
                <span className="text-white/60 text-sm">{openConvos ? '▼' : '▲'}</span>
              </button>
              {openConvos && (
                <div className="p-2 space-y-2">
                  {pagedConvos.map(c => (
                    <button key={c.id} onClick={() => openConversation(c)} className={`w-full text-left rounded-lg border px-3 py-2 transition ${activeConv?.id === c.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <div className="text-white/90 text-sm truncate">{c.title?.trim() || 'Sujet sans titre'}</div>
                      <div className="text-white/50 text-xs truncate">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : 'Aucun message'}</div>
                    </button>
                  ))}
                  {!pagedConvos.length && <div className="text-white/60 text-sm">Aucune conversation.</div>}
                </div>
              )}

              {/* Bloc Contacts */}
              <div className="border-t border-white/10 mt-2">
                <button onClick={() => setOpenContacts(o => !o)} className="w-full px-3 py-2 text-left text-white/90 font-medium hover:bg-white/5 flex items-center justify-between">
                  <span>Carnet de contact</span>
                  <span className="text-white/60 text-sm">{openContacts ? '▼' : '▲'}</span>
                </button>
                {openContacts && (
                  <div className="p-2 space-y-2">
                    {pagedContacts.map(ch => (
                      <div key={ch.id} className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 ring-1 ring-white/15">
                          {ch.avatar_url
                            ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <div className="grid place-items-center w-full h-full text-white/70">{(ch.name?.[0] || '?').toUpperCase()}</div>}
                        </div>
                        <div className="text-white/90 text-sm truncate">{ch.name}</div>
                      </div>
                    ))}
                    {!pagedContacts.length && <div className="text-white/60 text-sm">Aucun personnage.</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODALE — Nouvelle conversation */}
      {newConvOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setNewConvOpen(false)}>
          <div className="w-[min(96vw,640px)] rounded-2xl border border-white/15 bg-slate-950/90 p-5 text-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Nouvelle conversation</h3>
              <button onClick={() => setNewConvOpen(false)} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 hover:bg-white/15">Fermer</button>
            </div>

            <label className="text-sm block mb-1">Titre</label>
            <input
              value={newConvTitle}
              onChange={e => setNewConvTitle(e.target.value)}
              placeholder="Ex: Plan du prochain RP"
              className="w-full mb-4 rounded-lg bg-white/10 border border-white/20 px-3 py-2 placeholder-white/40 focus:outline-none"
            />

            <div className="mt-2 flex justify-end">
              <button onClick={createConversation} className="rounded-lg bg-amber-300 text-slate-900 font-medium px-4 py-2 hover:bg-amber-200">Créer</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/* ===== Composants UI ===== */

function Bubble({ mine, message }) {
  const othersColor = colorForCharacter(message.sender_character_id);
  const bubbleClass = mine ? 'bg-amber-300/90 text-slate-900 border border-amber-300/60'
                           : `${othersColor} text-white border border-white/20`;

  const name = message?.sender?.name || 'Anonyme';
  const avatar = message?.sender?.avatar_url || '/images/profile-icon.png';

  const isImage = /^\!\[.*\]\((https?:\/\/.+)\)$/.test(message.content?.trim() || '');
  const imgUrl = isImage ? (/(\(https?:\/\/.+\))/.exec(message.content.trim())?.[1] || null) : null;
  const cleanUrl = imgUrl ? imgUrl.slice(1, -1) : null;

  return (
    <div className={`mb-3 flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <img
          src={`${avatar}?v=${message.sender?.id || ''}`}
          alt={name}
          className="size-7 sm:size-8 rounded-full border border-white/10 object-cover"
        />
      )}

      <div className="max-w-[85%] sm:max-w-[80%] md:max-w-[75%]">
        <div className={`mb-1 text-[10px] sm:text-xs ${mine ? 'text-white/60 text-right' : 'text-white/60'}`}>
          {name}
        </div>

        <div className={`rounded-2xl px-3 py-2 leading-snug shadow ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'} ${bubbleClass}`}>
          {isImage && cleanUrl ? (
            <img src={cleanUrl} alt="" className="max-h-[240px] sm:max-h-[320px] rounded-lg object-contain" />
          ) : (
            <span className="break-words text-sm sm:text-base">{message.content}</span>
          )}
        </div>
      </div>

      {mine && (
        <img
          src={`${avatar}?v=${message.sender?.id || ''}`}
          alt={name}
          className="size-7 sm:size-8 rounded-full border border-white/10 object-cover"
        />
      )}
    </div>
  );
}

function FakeAzertyKeyboard() {
  const row = (keys) => (
    <div className="flex gap-1 w-full">
      {keys.map((k, i) => (
        <div key={i} className="flex-1 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/70 text-sm">
          {k}
        </div>
      ))}
    </div>
  )
  const rows = [
    ['²','&','é','"','\'','(','-','è','_','ç','à',')','='],
    ['AZERTYUIOP'],
    ['QSDFGHJKLM'],
    ['<WXCVBN,;:!']
  ]
  return (
    <div className="h-full p-3 flex flex-col gap-2">
      {row(rows[0])}
      <div className="flex gap-1">
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Tab</div>
        <div className="flex-1 grid grid-cols-10 gap-1">
          {'AZERTYUIOP'.split('').map((k,i) => (
            <div key={i} className="grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/70 text-sm">{k}</div>
          ))}
        </div>
      </div>
      <div className="flex gap-1">
        <div className="w-20 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Caps</div>
        <div className="flex-1 grid grid-cols-10 gap-1">
          {'QSDFGHJKLM'.split('').map((k,i) => (
            <div key={i} className="grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/70 text-sm">{k}</div>
          ))}
        </div>
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Enter</div>
      </div>
      <div className="flex gap-1">
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Shift</div>
        <div className="flex-1 grid grid-cols-9 gap-1">
          {'<WXCVBN,;'.split('').map((k,i) => (
            <div key={i} className="grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/70 text-sm">{k}</div>
          ))}
        </div>
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Shift</div>
      </div>
      <div className="flex gap-1">
        <div className="w-24 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Ctrl</div>
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Win</div>
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Alt</div>
        <div className="flex-1 h-10 rounded-lg bg-white/10 border border-white/15" />
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">AltGr</div>
        <div className="w-16 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Fn</div>
        <div className="w-24 grid place-items-center h-10 rounded-lg bg-white/10 border border-white/15 text-white/60">Ctrl</div>
      </div>
    </div>
  )
}
