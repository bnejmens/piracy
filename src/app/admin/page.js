'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

function cx(...c){return c.filter(Boolean).join(' ')}
const fmt = d => d ? new Date(d).toLocaleString() : ''

export default function AdminHub() {
  // --- auth + profil admin
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const isAdmin = !!me?.is_admin

  useEffect(() => {
    let ok = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!ok) return
      setSession(session || null)
      if (!session) return
      const { data } = await supabase
        .from('profiles')
        .select('user_id, pseudo, is_admin, avatar_url')
        .eq('user_id', session.user.id)
        .single()
      setMe(data || null)
    })()
    return () => { ok = false }
  }, [])

  // --- onglets
  const TABS = [
    { key:'cards',   label:'Cartes (Wiki)' },
    { key:'topics',  label:'Sujets RP' },
    { key:'convos',  label:'Conversations' },
    { key:'chars',   label:'Personnages' },     // ⬅️ nouveau
    { key:'users',   label:'Utilisateurs' },
  ]
  const [tab, setTab] = useState('cards')
  const [q, setQ] = useState('')

  // -------------------- CARTES (Wiki) --------------------
  const [statusTab, setStatusTab] = useState('pending') // pending|published|rejected|all
  const [cards, setCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(false)

  async function loadCards() {
    setLoadingCards(true)
    let query = supabase
      .from('cards')
      .select('id, title, category, subcategory, sub_subcategory, image_url, rarity, status, submitted_by, submitted_at, reviewed_by, reviewed_at')
      .order('submitted_at', { ascending:true })
    if (statusTab !== 'all') query = query.eq('status', statusTab)
    const { data, error } = await query
    if (error) console.error(error)
    setCards(data || [])
    setLoadingCards(false)
  }
  useEffect(() => { if (isAdmin && tab==='cards') loadCards() }, [isAdmin, tab, statusTab])

  const cardsFiltered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return cards
    return cards.filter(c =>
      (c.title||'').toLowerCase().includes(s) ||
      (c.category||'').toLowerCase().includes(s) ||
      (c.subcategory||'').toLowerCase().includes(s) ||
      (c.sub_subcategory||'').toLowerCase().includes(s) ||
      (c.submitted_by||'').toLowerCase().includes(s)
    )
  }, [cards, q])

  async function cardSetStatus(id, status) {
    const { error } = await supabase.from('cards').update({ status }).eq('id', id)
    if (error) return alert(error.message)
    setCards(xs => xs.filter(x => x.id !== id))
  }

  // -------------------- SUJETS RP --------------------
  const [topics, setTopics] = useState([])
  const [loadingTopics, setLoadingTopics] = useState(false)
  async function loadTopics() {
    setLoadingTopics(true)
    const { data, error } = await supabase
      .from('rp_topics')
      .select('id, title, created_by, author_id, created_at, updated_at')
      .order('created_at', { ascending:false })
    if (error) console.error(error)
    setTopics(data || [])
    setLoadingTopics(false)
  }
  useEffect(() => { if (isAdmin && tab==='topics') loadTopics() }, [isAdmin, tab])

  async function deleteTopic(id) {
    if (!confirm('Supprimer ce sujet RP ? (irréversible)')) return
    const { error } = await supabase.from('rp_topics').delete().eq('id', id)
    if (error) return alert(error.message)
    setTopics(xs => xs.filter(x => x.id !== id))
  }

  // -------------------- CONVERSATIONS --------------------
  const [convos, setConvos] = useState([])
  const [loadingConvos, setLoadingConvos] = useState(false)
  async function loadConvos() {
    setLoadingConvos(true)
    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, is_group, created_by, created_at, last_message_at')
      .order('created_at', { ascending:false })
    if (error) console.error(error)
    setConvos(data || [])
    setLoadingConvos(false)
  }
  useEffect(() => { if (isAdmin && tab==='convos') loadConvos() }, [isAdmin, tab])

  async function deleteConvo(id) {
    if (!confirm('Supprimer cette conversation ? (irréversible)')) return
    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) return alert(error.message)
    setConvos(xs => xs.filter(x => x.id !== id))
  }

  // -------------------- PERSONNAGES (nouveau) --------------------
  const [chars, setChars] = useState([])
  const [loadingChars, setLoadingChars] = useState(false)
  const [showOnlyArchived, setShowOnlyArchived] = useState(false)

  async function loadChars() {
    setLoadingChars(true)
    let query = supabase
      .from('characters')
      .select('id, name, user_id, avatar_url, gender, is_active, is_archived, created_at')
      .order('created_at', { ascending:false })
    if (showOnlyArchived) query = query.eq('is_archived', true)
    const { data, error } = await query
    if (error) console.error(error)
    setChars(data || [])
    setLoadingChars(false)
  }
  useEffect(() => { if (isAdmin && tab==='chars') loadChars() }, [isAdmin, tab, showOnlyArchived])

  async function toggleArchiveCharacter(id, val) {
    // On archive => on désactive, on restaure => on réactive
    const patch = val ? { is_archived:true,  is_active:false } : { is_archived:false, is_active:true }
    const { error } = await supabase.from('characters').update(patch).eq('id', id)
    if (error) return alert(error.message)
    setChars(xs => xs.map(c => c.id===id ? {...c, ...patch} : c))
  }

  // -------------------- UTILISATEURS --------------------
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  async function loadUsers() {
    setLoadingUsers(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, pseudo, avatar_url, is_admin, is_archived')
      .order('pseudo', { ascending:true })
    if (error) console.error(error)
    setUsers(data || [])
    setLoadingUsers(false)
  }
  useEffect(() => { if (isAdmin && tab==='users') loadUsers() }, [isAdmin, tab])

  async function toggleArchive(user_id, val) {
    const { error } = await supabase.from('profiles').update({ is_archived: val }).eq('user_id', user_id)
    if (error) return alert(error.message)
    setUsers(xs => xs.map(u => u.user_id===user_id ? {...u, is_archived:val} : u))
  }
  async function toggleAdmin(user_id, val) {
    const { error } = await supabase.from('profiles').update({ is_admin: val }).eq('user_id', user_id)
    if (error) return alert(error.message)
    setUsers(xs => xs.map(u => u.user_id===user_id ? {...u, is_admin:val} : u))
  }

  // -------------------- UI --------------------
  if (!session) {
    return (
      <main className="min-h-screen text-white">
        <Bg />
        <div className="max-w-6xl mx-auto p-6">
          <Topbar />
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-6">
            Connecte-toi pour accéder au tableau d’administration.
          </div>
        </div>
      </main>
    )
  }
  if (!isAdmin) {
    return (
      <main className="min-h-screen text-white">
        <Bg />
        <div className="max-w-6xl mx-auto p-6">
          <Topbar />
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-6">
            Accès réservé aux administrateurs.
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen text-white">
      <Bg />
      <div className="max-w-6xl mx-auto p-6">
        <Topbar />

        {/* Onglets + recherche */}
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map(t => (
            <button key={t.key}
              onClick={()=>setTab(t.key)}
              className={cx(
                'px-3 py-1.5 rounded-md border',
                tab===t.key ? 'bg-white text-slate-900 border-white' : 'bg-white/10 border-white/20 hover:bg-white/15'
              )}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <input
              value={q} onChange={e=>setQ(e.target.value)}
              placeholder="Rechercher…"
              className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 outline-none placeholder-white/60"
            />
            <button onClick={()=>{
              if(tab==='cards') loadCards()
              if(tab==='topics') loadTopics()
              if(tab==='convos') loadConvos()
              if(tab==='chars')  loadChars()
              if(tab==='users')  loadUsers()
            }} className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 hover:bg-white/15">
              Rafraîchir
            </button>
          </div>
        </div>

        {/* Panneau principal */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-xl p-4">
          {tab === 'cards' && (
            <section>
              <div className="mb-3 flex items-center gap-2">
                {['pending','published','rejected','all'].map(s => (
                  <button key={s}
                    onClick={()=>setStatusTab(s)}
                    className={cx(
                      'px-3 py-1.5 rounded-md border capitalize',
                      statusTab===s ? 'bg-amber-300 text-slate-900 border-amber-400' : 'bg-white/10 border-white/20 hover:bg-white/15'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {loadingCards ? <p className="text-white/70">Chargement…</p> : (
                <ul className="space-y-3">
                  {cardsFiltered.map(c => (
                    <li key={c.id} className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image_url || '/images/card-bg.png'} alt="" className="w-14 h-20 object-cover rounded-md ring-1 ring-white/20" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.title || '(Sans titre)'}</div>
                        <div className="text-xs text-white/70 truncate">
                          {c.category || 'Divers'}{c.subcategory ? ` / ${c.subcategory}` : ''}{c.sub_subcategory ? ` / ${c.sub_subcategory}` : ''}
                        </div>
                        <div className="text-[11px] text-white/50">Envoyée le {fmt(c.submitted_at)} • auteur: {c.submitted_by}</div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/wiki/edit/${c.id}`} className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm hover:bg-white/15">Éditer</Link>
                        {c.status!=='published' && (
                          <button onClick={()=>cardSetStatus(c.id,'published')} className="rounded-md bg-emerald-400 text-slate-900 px-2 py-1.5 text-sm hover:bg-emerald-300">Publier</button>
                        )}
                        {c.status!=='rejected' && (
                          <button onClick={()=>cardSetStatus(c.id,'rejected')} className="rounded-md bg-rose-400 text-slate-900 px-2 py-1.5 text-sm hover:bg-rose-300">Refuser</button>
                        )}
                      </div>
                    </li>
                  ))}
                  {!loadingCards && cardsFiltered.length===0 && (
                    <li className="text-white/60">Aucune carte.</li>
                  )}
                </ul>
              )}
            </section>
          )}

          {tab === 'topics' && (
            <section>
              {loadingTopics ? <p className="text-white/70">Chargement…</p> : (
                <ul className="space-y-3">
                  {topics
                    .filter(t => (t.title||'').toLowerCase().includes(q.toLowerCase()))
                    .map(t => (
                    <li key={t.id} className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{t.title}</div>
                        <div className="text-xs text-white/60">Créé le {fmt(t.created_at)} • author: {t.author_id}</div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/rp?open=${t.id}`} className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm hover:bg-white/15">Ouvrir</Link>
                        <button onClick={()=>deleteTopic(t.id)} className="rounded-md bg-rose-400 text-slate-900 px-2 py-1.5 text-sm hover:bg-rose-300">Supprimer</button>
                      </div>
                    </li>
                  ))}
                  {!loadingTopics && topics.length===0 && (
                    <li className="text-white/60">Aucun sujet.</li>
                  )}
                </ul>
              )}
            </section>
          )}

          {tab === 'convos' && (
            <section>
              {loadingConvos ? <p className="text-white/70">Chargement…</p> : (
                <ul className="space-y-3">
                  {convos
                    .filter(c => (c.title||'').toLowerCase().includes(q.toLowerCase()))
                    .map(c => (
                    <li key={c.id} className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.title || '(Sans titre)'}</div>
                        <div className="text-xs text-white/60">
                          {c.is_group ? 'Groupe' : 'Direct'} • Créée le {fmt(c.created_at)} {c.last_message_at ? `• Dernier msg ${fmt(c.last_message_at)}` : ''}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/messages?open=${c.id}`} className="rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm hover:bg-white/15">Ouvrir</Link>
                        <button onClick={()=>deleteConvo(c.id)} className="rounded-md bg-rose-400 text-slate-900 px-2 py-1.5 text-sm hover:bg-rose-300">Supprimer</button>
                      </div>
                    </li>
                  ))}
                  {!loadingConvos && convos.length===0 && (
                    <li className="text-white/60">Aucune conversation.</li>
                  )}
                </ul>
              )}
            </section>
          )}

          {tab === 'chars' && (
            <section>
              <div className="mb-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={showOnlyArchived} onChange={e=>setShowOnlyArchived(e.target.checked)} />
                  Afficher uniquement les archivés
                </label>
              </div>
              {loadingChars ? <p className="text-white/70">Chargement…</p> : (
                <ul className="space-y-3">
                  {chars
                    .filter(c =>
                      (c.name||'').toLowerCase().includes(q.toLowerCase()) ||
                      (c.user_id||'').includes(q)
                    )
                    .map(c => (
                    <li key={c.id} className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.avatar_url || '/images/profile-icon.png'} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/20" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{c.name || '(sans nom)'} {c.gender ? <span className="text-xs text-white/60 ml-2">• {c.gender}</span> : null}</div>
                        <div className="text-xs text-white/60 truncate">{c.user_id}</div>
                        <div className="text-[11px] text-white/50 mt-1">
                          {c.is_archived ? 'Archivé' : 'Actif'} {c.is_active ? '• visible' : '• masqué'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs opacity-80">Archivé</label>
                        <input type="checkbox" checked={!!c.is_archived} onChange={e=>toggleArchiveCharacter(c.id, e.target.checked)} />
                      </div>
                    </li>
                  ))}
                  {!loadingChars && chars.length===0 && (
                    <li className="text-white/60">Aucun personnage.</li>
                  )}
                </ul>
              )}
            </section>
          )}

          {tab === 'users' && (
            <section>
              {loadingUsers ? <p className="text-white/70">Chargement…</p> : (
                <ul className="space-y-3">
                  {users
                    .filter(u => (u.pseudo||'').toLowerCase().includes(q.toLowerCase()) || (u.user_id||'').includes(q))
                    .map(u => (
                    <li key={u.user_id} className="rounded-xl border border-white/15 bg-white/5 p-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.avatar_url || '/images/profile-icon.png'} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/20" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{u.pseudo || '(sans pseudo)'}</div>
                        <div className="text-xs text-white/60 truncate">{u.user_id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs opacity-80">Admin</label>
                        <input type="checkbox" checked={!!u.is_admin} onChange={e=>toggleAdmin(u.user_id, e.target.checked)} />
                        <label className="text-xs opacity-80 ml-3">Archivé</label>
                        <input type="checkbox" checked={!!u.is_archived} onChange={e=>toggleArchive(u.user_id, e.target.checked)} />
                      </div>
                    </li>
                  ))}
                  {!loadingUsers && users.length===0 && (
                    <li className="text-white/60">Aucun utilisateur.</li>
                  )}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

function Topbar() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-xl sm:text-2xl font-semibold">Tableau d’administration</h1>
      <Link href="/dashboard" className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 hover:bg-white/15">
        ← Retour
      </Link>
    </div>
  )
}

function Bg() {
  return (
    <>
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/rp-bg.webp)" }}
      />
      <div className="fixed inset-0 -z-10 bg-black/40 backdrop-blur-sm" />
    </>
  )
}
