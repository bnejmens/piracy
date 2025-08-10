// src/app/rp/page.js
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { sanitize } from 'isomorphic-dompurify'
import { supabase } from '../../lib/supabaseClient'

/* ------------ Réglages “verre flou” ------------ */
const GLASS = {
  left:   { bg: 'rgba(255,255,255,0.08)', blur: '2px'  },
  editor: { bg: 'rgba(255,255,255,0.12)', blur: '10px' },
  right:  { bg: 'rgba(255,255,255,0.15)', blur: '14px' },
  cardMine:  { bg: 'rgba(255,255,255,0.12)', blur: '14px' },
  cardOther: { bg: 'rgba(255,255,255,0.10)', blur: '8px'  },
}
const frost = v => ({ backgroundColor: v.bg, backdropFilter: `blur(${v.blur})`, WebkitBackdropFilter: `blur(${v.blur})` })

/* -------------------- BBCode -> HTML -------------------- */
function bbcodeToHtml(src) {
  if (!src) return ''
  let s = src.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, '<strong>$1</strong>')
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, '<em>$1</em>')
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, '<u>$1</u>')
  s = s.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, '<s>$1</s>')
  s = s.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, '<h2>$1</h2>')
  s = s.replace(/\[hr\]/gi, '<hr/>')
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<blockquote>$1</blockquote>')
  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, '<pre><code>$1</code></pre>')
  s = s.replace(/\[color=([#a-z0-9]+)\]([\s\S]*?)\[\/color\]/gi, '<span style="color:$1">$2</span>')
  s = s.replace(/\[size=(\d{1,2})\]([\s\S]*?)\[\/size\]/gi, (_, n, inner) => `<span style="font-size:${Math.max(10,Math.min(+n,48))}px">${inner}</span>`)
  s = s.replace(/\[center\]([\s\S]*?)\[\/center\]/gi, '<div style="text-align:center">$1</div>')
  s = s.replace(/\[left\]([\s\S]*?)\[\/left\]/gi,   '<div style="text-align:left">$1</div>')
  s = s.replace(/\[right\]([\s\S]*?)\[\/right\]/gi, '<div style="text-align:right">$1</div>')
  s = s.replace(/\[ul\]([\s\S]*?)\[\/ul\]/gi, (_, body) => `<ul>${body.replace(/\[li\]([\s\S]*?)\[\/li\]/gi,'<li>$1</li>')}</ul>`)
  s = s.replace(/\[ol\]([\s\S]*?)\[\/ol\]/gi, (_, body) => `<ol>${body.replace(/\[li\]([\s\S]*?)\[\/li\]/gi,'<li>$1</li>')}</ol>`)
  s = s.replace(/\[url=(https?:\/\/[^\]]+)\]([\s\S]*?)\[\/url\]/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
  s = s.replace(/\[img\](https?:\/\/[^\]]+)\[\/img\]/gi, '<img src="$1" alt="" />')
  s = s.replace(/\r?\n/g, '<br/>')
  return s
}

const ALLOWED_TAGS = ['a','b','strong','i','em','u','s','blockquote','pre','code','span','div','ul','ol','li','br','hr','img','h2','p']
const ALLOWED_ATTR = ['href','target','rel','style','src','alt','title','width','height']

/* --------------------------- Page RP --------------------------- */
export default function RPPage() {
  const router = useRouter()

  // session + profil
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)

  // identités "comptes" partageant l'email (on garde si besoin plus tard)
  const [myIdentities, setMyIdentities] = useState([])

  // 🆕 personnages actifs du compte
  const [myChars, setMyChars] = useState([])
  const [postAsCharId, setPostAsCharId] = useState(null) // ← personnage sélectionné pour poster

  // sujets & posts
  const [topics, setTopics] = useState([])
  const [topicsPage, setTopicsPage] = useState(1)
  const TOPICS_PER_PAGE = 10

  const [activeTopic, setActiveTopic] = useState(null)
  const [posts, setPosts] = useState([])

  // éditeur
  const [raw, setRaw] = useState('')
  const textareaRef = useRef(null)
  const [isPreviewOpen, setPreviewOpen] = useState(false)

  const endRef = useRef(null)
  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  // PREVIEW
  const htmlPreview = useMemo(() => {
    const html = bbcodeToHtml(raw)
    return sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
  }, [raw])

  // boot
  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setSession(session)

      const { data: myProfile } = await supabase
        .from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      setMe(myProfile || null)

      const { data: ids } = await supabase
        .from('profiles').select('user_id, pseudo, avatar_url, email, active_character_id')
        .eq('email', myProfile?.email ?? null)
        .order('created_at', { ascending: true })
      setMyIdentities(ids || [])

      // 🆕 charger mes personnages actifs
      const { data: chars } = await supabase
        .from('characters')
        .select('id, name, avatar_url, is_active')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      setMyChars(chars || [])

      // Sélection par défaut : profil.active_character_id sinon 1er perso actif
      setPostAsCharId(myProfile?.active_character_id || (chars?.[0]?.id ?? null))

      await loadTopics()
    }
    run()
  }, [router])

  const loadTopics = async () => {
    const { data, error } = await supabase
      .from('rp_topics')
      .select('id, title, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) { console.error(error); return }
    setTopics(data || [])
    if (!activeTopic && (data?.length||0) > 0) {
      const first = data[0]
      setActiveTopic(first)
      await loadPosts(first.id)
    }
  }

  const loadPosts = async (topicId) => {
    const { data, error } = await supabase
      .from('rp_posts')
      .select('id, topic_id, author_id, author_character_id, content_html, created_at')
      .eq('topic_id', topicId)
      .order('created_at', { ascending: true })
      .limit(300)
    if (error) { console.error(error); return }
    setPosts(data || [])
    setTimeout(scrollToEnd, 0)
  }

  const createTopic = async () => {
    const title = prompt('Titre du nouveau sujet ?')
    if (!title) return
    const { data, error } = await supabase
      .from('rp_topics')
      .insert({ title })
      .select('id, title, created_at')
      .single()
    if (error) { alert(error.message); return }
    setTopics(t => [data, ...t])
    setActiveTopic(data)
    await loadPosts(data.id)
  }

  // 🔐 (optionnel) policy côté DB à prévoir :
  // WITH CHECK: author_user_id = auth.uid() AND author_character_id IN (SELECT id FROM characters WHERE user_id = auth.uid())

  const publishPost = async () => {
    if (!raw.trim() || !activeTopic || !postAsCharId || !session) return

    const processedHtml = sanitize(bbcodeToHtml(raw), { ALLOWED_TAGS, ALLOWED_ATTR })

    const payload = {
      topic_id: activeTopic.id,
      author_id: session.user.id,             // profil propriétaire du post (ton compte)
      author_user_id: session.user.id,        // auteur technique (audit)
      author_character_id: postAsCharId,      // 🆕 personnage sélectionné
      content_raw: raw,
      content_html: processedHtml,
    }

    const { data, error } = await supabase
      .from('rp_posts')
      .insert(payload)
      .select('id, topic_id, author_id, author_character_id, content_html, created_at')
      .single()

    if (error) { console.error(error); alert(error.message); return }

    setPosts(p => [...p, data])
    setRaw('')
    setPreviewOpen(false)
    setTimeout(scrollToEnd, 0)
  }

  // utils
  const pageCount = Math.max(1, Math.ceil(topics.length / TOPICS_PER_PAGE))
  const pageStart = (topicsPage - 1) * TOPICS_PER_PAGE
  const visibleTopics = topics.slice(pageStart, pageStart + TOPICS_PER_PAGE)

  const insertAroundSelection = (before, after, payload='') => {
    const ta = textareaRef.current
    if (!ta) { setRaw(r => r + before + payload + after); return }
    const start = ta.selectionStart ?? raw.length
    const end   = ta.selectionEnd   ?? raw.length
    const pre   = raw.slice(0, start)
    const mid   = raw.slice(start, end) || payload
    const post  = raw.slice(end)
    const next  = `${pre}${before}${mid}${after}${post}`
    setRaw(next)
    const pos = (pre + before + mid).length
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(pos, pos) })
  }

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/rp-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/20 via-slate-900/15 to-slate-950/35" />

      {/* ← Tableau de bord */}
      <button
        onClick={() => router.push('/dashboard')}
        className="fixed left-10 bottom-[96px] z-50 rounded-full border border-white/25 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white/90 text-sm hover:bg-white/20"
      >
        ← Tableau de bord
      </button>

      {/* GRID */}
      <div className="relative z-10 h-full grid gap-6 p-6
                      grid-cols-[420px_420px_minmax(0,1fr)]
                      xl:grid-cols-[380px_380px_minmax(0,1fr)]
                      lg:grid-cols-1">

        {/* -------- SUJETS -------- */}
        <section className="rounded-2xl border border-white/15 overflow-hidden flex flex-col"
                 style={frost(GLASS.left)}>
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium flex items-center justify-between">
            <span>Sujets en cours</span>
            <button onClick={createTopic}
                    className="rounded-lg bg-amber-300 text-slate-900 text-xs font-medium px-2.5 py-1 hover:bg-amber-200">
              + Nouveau sujet
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {visibleTopics.map(t => (
              <button
                key={t.id}
                onClick={async () => { setActiveTopic(t); await loadPosts(t.id) }}
                className={`w-full text-left rounded-lg px-3 py-2 border transition
                           ${activeTopic?.id===t.id ? 'bg-white/12 border-white/30' : 'bg-white/6 border-white/12 hover:bg-white/10'}`}
              >
                <div className="text-white/90 text-sm truncate mb-2">{t.title}</div>
                <TopicParticipants topicId={t.id} />
              </button>
            ))}
            {!visibleTopics.length && <div className="text-white/60 text-sm">Aucun sujet.</div>}
          </div>

          <footer className="px-3 py-2 border-t border-white/10 flex items-center justify-between text-white/80 text-sm">
            <button disabled={topicsPage<=1}
                    onClick={()=>setTopicsPage(p=>Math.max(1,p-1))}
                    className="px-2 py-1 rounded border border-white/15 bg-white/10 disabled:opacity-50">Préc.</button>
            <span>Page {topicsPage} / {pageCount}</span>
            <button disabled={topicsPage>=pageCount}
                    onClick={()=>setTopicsPage(p=>Math.min(pageCount,p+1))}
                    className="px-2 py-1 rounded border border-white/15 bg-white/10 disabled:opacity-50">Suiv.</button>
          </footer>
        </section>

        {/* -------- ÉDITEUR -------- */}
        <section className="rounded-2xl border border-white/15 overflow-hidden flex flex-col"
                 style={frost(GLASS.editor)}>
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium">
            {activeTopic ? activeTopic.title : 'Sélectionne un sujet pour écrire'}
          </header>

          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-white/80 text-sm">Poster en tant que</span>
              <select
                value={postAsCharId || ''}
                onChange={e => setPostAsCharId(e.target.value)}
                className="rounded-lg bg-white/10 border border-white/15 px-3 py-1.5 text-white outline-none"
              >
                {myChars.map(ch => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </div>

            <EditorToolbar
              onBold={() => insertAroundSelection('[b]','[/b]')}
              onItalic={() => insertAroundSelection('[i]','[/i]')}
              onUnderline={() => insertAroundSelection('[u]','[/u]')}
              onStrike={() => insertAroundSelection('[s]','[/s]')}
              onQuote={() => insertAroundSelection('[quote]','[/quote]')}
              onCode={() => insertAroundSelection('[code]','[/code]')}
              onUL={() => insertAroundSelection('[ul]\n[li]','[/li]\n[/ul]')}
              onOL={() => insertAroundSelection('[ol]\n[li]','[/li]\n[/ol]')}
              onCenter={() => insertAroundSelection('[center]','[/center]')}
              onRight={() => insertAroundSelection('[right]','[/right]')}
              onH2={() => insertAroundSelection('[h2]','[/h2]')}
              onHR={() => insertAroundSelection('[hr]','')}
              onSize={() => insertAroundSelection('[size=18]','[/size]')}
              onLink={() => {
                const url = prompt('URL http(s) ?')
                if (url && /^https?:\/\//i.test(url)) insertAroundSelection(`[url=${url}]`,`[/url]`,'lien')
              }}
              onImage={() => {
                const url = prompt('URL de l’image http(s) ?')
                if (url && /^https?:\/\//i.test(url)) insertAroundSelection('[img]','[/img]', url)
              }}
              onPickColor={(hex) => insertAroundSelection(`[color=${hex}]`,`[/color]`)}
            />

            <textarea
              ref={textareaRef}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Ton post (BBCode + HTML whitelisté)…"
              className="w-full min-h-[180px] rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/60"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreviewOpen(true)}
                disabled={!activeTopic || !raw.trim()}
                className="rounded-lg border border-white/20 bg-white/10 text-white px-3 py-2 hover:bg-white/15 disabled:opacity-50"
              >
                Prévisualiser
              </button>
              <button
                onClick={publishPost}
                disabled={!activeTopic || !raw.trim() || !postAsCharId}
                className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200 disabled:opacity-50"
              >
                Publier
              </button>
            </div>
          </div>
        </section>

        {/* -------- POSTS -------- */}
        <section className="rounded-2xl border border-white/15 overflow-hidden flex flex-col min-w-0"
                 style={frost(GLASS.right)}>
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium">
            {activeTopic ? activeTopic.title : 'Posts'}
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {activeTopic && posts.map(p => {
              const mine = p.author_id === session?.user?.id
              return (
                <article key={p.id}
                         className="rounded-2xl border px-4 py-3"
                         style={frost(mine ? GLASS.cardMine : GLASS.cardOther)}>
                  <PostHeader
                    authorId={p.author_id}
                    authorCharacterId={p.author_character_id}  // 🆕
                    createdAt={p.created_at}
                  />
                  <div
                    className="prose prose-invert max-w-none prose-headings:mt-4 prose-p:my-2 prose-li:my-1 prose-img:rounded-lg prose-hr:border-white/20 prose-a:text-amber-300"
                    dangerouslySetInnerHTML={{ __html: p.content_html }}
                  />
                </article>
              )
            })}
            {activeTopic && !posts.length && (
              <div className="text-white/60 text-sm">Pas encore de posts.</div>
            )}
            <div ref={endRef} />
          </div>
        </section>
      </div>

      {/* -------- MODALE PRÉVISUALISATION -------- */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-300 p-4 bg-white/90 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-gray-800 font-semibold">Prévisualisation</h3>
              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-md bg-gray-100 border border-gray-300 px-3 py-1.5 text-gray-800 hover:bg-gray-200 transition-colors"
              >
                Fermer
              </button>
            </div>
            <div
              className="prose max-w-none prose-headings:mt-4 prose-p:my-2 prose-li:my-1 prose-hr:border-gray-300 prose-a:text-blue-700"
              dangerouslySetInnerHTML={{ __html: htmlPreview }}
            />
          </div>
        </div>
      )}
    </main>
  )
}

/* ----------------- composants utilitaires ----------------- */

function TopicParticipants({ topicId }) {
  const [list, setList] = useState([])
  const DEBUG = false // passe à true 1 minute si besoin de logs

  useEffect(() => {
    let ok = true
    const run = async () => {
      try {
        const { data: posts, error } = await supabase
          .from('rp_posts')
          .select('author_character_id, author_id')
          .eq('topic_id', topicId)

        if (error) throw error
        if (DEBUG) console.log('[TP] posts=', posts)

        if (!posts?.length) { if (ok) setList([]); return }

        // Distinct ids
        const charIds = Array.from(new Set(posts.map(p => p.author_character_id).filter(Boolean)))
        const authorIdsAll = Array.from(new Set(posts.map(p => p.author_id).filter(Boolean)))

        // 1) Characters (pour tous les author_character_id)
        let charMap = new Map()
        if (charIds.length) {
          const { data: chars, error: eChars } = await supabase
            .from('characters')
            .select('id, name, avatar_url')
            .in('id', charIds)
          if (eChars) throw eChars
          if (DEBUG) console.log('[TP] chars=', chars)
          for (const c of (chars || [])) {
            charMap.set(String(c.id), {
              key: `char:${c.id}`,
              label: c.name,
              avatar: c.avatar_url || null,
            })
          }
        }

        // 2) Profils fallback
        //    - auteurs sans personnage
        //    - auteurs dont le personnage n’a pas été résolu (RLS, id manquant)
        const authorsNeedingProfile = Array.from(new Set(
          posts
            .filter(p => !p.author_character_id || !charMap.has(String(p.author_character_id)))
            .map(p => p.author_id)
            .filter(Boolean)
        ))

        let profList = []
        if (authorsNeedingProfile.length) {
          const { data: profs, error: eProfs } = await supabase
            .from('profiles')
            .select('user_id, pseudo, email, avatar_url')
            .in('user_id', authorsNeedingProfile)
          if (eProfs) throw eProfs
          if (DEBUG) console.log('[TP] profs=', profs)
          profList = (profs || []).map(p => ({
            key: `user:${p.user_id}`,
            label: p.pseudo?.trim() || p.email?.split('@')[0] || 'Profil',
            avatar: p.avatar_url || null,
          }))
        }

        // 3) Fusion : on parcourt les posts dans l’ordre pour conserver une priorité naturelle
        const merged = []
        const seen = new Set()
        for (const p of posts) {
          const cid = p.author_character_id ? String(p.author_character_id) : null
          if (cid && charMap.has(cid)) {
            const item = charMap.get(cid)
            if (!seen.has(item.key)) {
              seen.add(item.key)
              merged.push(item)
              if (merged.length >= 10) break
            }
            continue
          }
          // Pas de perso résolu → on ajoute le profil correspondant si présent
          const profileKey = `user:${p.author_id}`
          const profItem = profList.find(x => x.key === profileKey)
          if (profItem && !seen.has(profItem.key)) {
            seen.add(profItem.key)
            merged.push(profItem)
            if (merged.length >= 10) break
          }
        }

        if (DEBUG) console.log('[TP] merged=', merged)
        if (ok) setList(merged)
      } catch (e) {
        console.warn('TopicParticipants error', e)
        if (ok) setList([])
      }
    }
    if (topicId) run()
    return () => { ok = false }
  }, [topicId])

  if (!list.length) return null

  return (
    <div className="flex items-center gap-2">
      {list.map(p => (
        <div
          key={p.key}
          className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/20 bg-white/10"
          title={p.label}
        >
          {p.avatar
            ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
            : <div className="grid place-items-center w-full h-full text-white/70 text-xs">
                {(p.label?.[0] || '?').toUpperCase()}
              </div>}
        </div>
      ))}
    </div>
  )
}

function PostHeader({ authorId, authorCharacterId, createdAt }) {
  const [display, setDisplay] = useState(null)

  useEffect(() => {
    let ok = true
    const run = async () => {
      // 1) Essayer d’afficher le personnage si présent
      if (authorCharacterId) {
        const { data: ch } = await supabase
          .from('characters')
          .select('name, avatar_url')
          .eq('id', authorCharacterId)
          .maybeSingle()
        if (ok && ch) {
          setDisplay({ name: ch.name, avatar_url: ch.avatar_url })
          return
        }
      }
      // 2) Fallback sur le profil
      const { data: p } = await supabase
        .from('profiles')
        .select('pseudo, avatar_url, email')
        .eq('user_id', authorId)
        .maybeSingle()
      if (ok) {
        const name = p?.pseudo?.trim() || p?.email?.split('@')[0] || 'Auteur'
        setDisplay({ name, avatar_url: p?.avatar_url || null })
      }
    }
    run()
    return () => { ok = false }
  }, [authorId, authorCharacterId])

  const name = display?.name || 'Auteur'
  const initial = (name[0] || '?').toUpperCase()

  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-white/25 bg-white/10 shadow-[0_6px_24px_rgba(0,0,0,.25)]">
        {display?.avatar_url
          ? <img src={display.avatar_url} alt="" className="w-full h-full object-cover" />
          : <div className="grid place-items-center w-full h-full text-white/80 text-lg">{initial}</div>}
      </div>
      <div className="leading-tight">
        <div className="text-white text-lg font-semibold">{name}</div>
        <div className="text-white/60 text-xs">{new Date(createdAt).toLocaleString()}</div>
      </div>
    </div>
  )
}

function EditorToolbar({
  onBold, onItalic, onUnderline, onStrike,
  onQuote, onCode, onUL, onOL, onCenter, onRight, onH2, onHR, onSize,
  onLink, onImage, onPickColor
}) {
  const Btn = ({ children, onClick, title }) => (
    <button type="button" title={title} onClick={onClick}
      className="rounded-md bg-white/10 border border-white/15 text-white text-xs px-2 py-1 hover:bg-white/15">
      {children}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Btn onClick={onBold}>B</Btn>
      <Btn onClick={onItalic}><i>I</i></Btn>
      <Btn onClick={onUnderline}><u>U</u></Btn>
      <Btn onClick={onStrike}><s>S</s></Btn>
      <Sep/>
      <Btn onClick={onQuote}>Quote</Btn>
      <Btn onClick={onCode}>Code</Btn>
      <Sep/>
      <Btn onClick={onUL}>UL</Btn>
      <Btn onClick={onOL}>OL</Btn>
      <Sep/>
      <Btn onClick={onCenter}>C</Btn>
      <Btn onClick={onRight}>R</Btn>
      <Sep/>
      <Btn onClick={onH2}>H2</Btn>
      <Btn onClick={onHR}>HR</Btn>
      <Btn onClick={onSize}>Size</Btn>
      <Sep/>
      <Btn onClick={onLink}>Lien</Btn>
      <Btn onClick={onImage}>Image</Btn>
      <label className="ml-1 inline-flex items-center gap-2 rounded-md bg-white/10 border border-white/15 px-2 py-1 text-white">
        Couleur
        <input
          type="color"
          onChange={(e) => onPickColor(e.target.value)}
          className="h-6 w-6 p-0 bg-transparent border-0 cursor-pointer"
          title="Choisir une couleur"
        />
      </label>
    </div>
  )
}
const Sep = () => <span className="mx-1 h-6 w-px bg-white/15 inline-block" />
