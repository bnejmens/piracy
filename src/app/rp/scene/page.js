// src/app/rp/scene/page.js
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ColorPalette from '@/components/ColorPalette'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import DOMPurify from 'isomorphic-dompurify'
import { supabase } from '@/lib/supabaseClient'

 // Autoriser uniquement les iframes de Youtube/Vimeo (et durcir leurs attributs)
 const IFRAME_HOST_OK = /(^|\.)((youtube\.com)|(youtube-nocookie\.com)|(youtu\.be)|(player\.vimeo\.com))$/i;
 DOMPurify.addHook('uponSanitizeElement', (node, data) => {
   if (data.tagName === 'iframe') {
     const src = node.getAttribute('src') || '';
     let hostOk = false;
     try {
       const u = new URL(src, 'https://x');
       hostOk = IFRAME_HOST_OK.test(u.hostname);
     } catch {}
     if (!hostOk) {
       node.parentNode && node.parentNode.removeChild(node);
       return;
     }
     node.setAttribute('loading', 'lazy');
     node.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
     node.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
     node.setAttribute('frameborder', '0');
     node.setAttribute('allowfullscreen', '');
     // largeur responsive gérée en CSS; on n'impose pas width/height ici
   }
 });

/* ------------ Réglages “verre flou” ------------ */
const GLASS = {
  left:      { bg: 'rgba(0,0,0,0.4)',  blur: '2px'  },
  editor:    { bg: 'rgba(255,255,255,0.12)', blur: '10px' },
  right:     { bg: 'rgba(255,255,255,0.15)', blur: '80px' },
  cardMine:  { bg: 'rgba(255,255,255,0.12)', blur: '14px' },
  cardOther: { bg: 'rgba(255,255,255,0.10)', blur: '8px'  },
}
const frost = v => ({ backgroundColor: v.bg, backdropFilter: `blur(${v.blur})`, WebkitBackdropFilter: `blur(${v.blur})` })

/* -------------------- BBCode -> HTML -------------------- */
function bbcodeToHtml(src) {
  if (!src) return ''
  // 3.a) Capturer les iframes « bruts » collés par l’utilisateur (YouTube/Vimeo only)
  let s = src.replace(/<iframe([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/iframe>/gi,
   (_, pre, url, post) => {
     const attrs = `${pre} ${post}`.toLowerCase();
     const w = (attrs.match(/\bwidth=["']?(\d{2,4})["']?/)||[])[1];
     const h = (attrs.match(/\bheight=["']?(\d{2,4})["']?/)||[])[1];
     const opts = [
       w ? `width=${w}` : null,
       h ? `height=${h}` : null
     ].filter(Boolean).join(' ');
     if (/youtube|youtu\.be|youtube-nocookie/i.test(url)) return `[youtube ${opts}]${url}[/youtube]`.trim();
     if (/vimeo\.com/i.test(url)) return `[vimeo ${opts}]${url}[/vimeo]`.trim();
     return '';
   }
 );
  // 3.b) Échapper le reste normalement
  s = s.replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
 // Si un [youtube]/[vimeo] est entouré par [center], convertir en option align=center
 s = s.replace(/\[center\]\s*(\[youtube[^\]]*\][\s\S]*?\[\/youtube\])\s*\[\/center\]/gi,
   (_, inner) => inner.replace(/\[youtube(\s+[^\]]+)?\]/i, (m, opts='') => `[youtube align=center${opts||''}]`)
 );
 s = s.replace(/\[center\]\s*(\[vimeo[^\]]*\][\s\S]*?\[\/vimeo\])\s*\[\/center\]/gi,
   (_, inner) => inner.replace(/\[vimeo(\s+[^\]]+)?\]/i, (m, opts='') => `[vimeo align=center${opts||''}]`)
 );
  s = s.replace(/\[img\](https?:\/\/[^\]]+)\[\/img\]/gi, '<img src="$1" alt="" />')
  // 3.c) BBCode YouTube/Vimeo → iframe propre (nocookie pour YouTube)
  s = s.replace(/\[youtube(?:\s+([^\]]+))?\]([\s\S]*?)\[\/youtube\]/gi, (_, opts, raw) => {
    const url = String(raw).trim();
    // Essayer d’extraire l'ID si on nous donne une URL « watch », « youtu.be », etc.
    const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{6,})/);
    const id = m ? m[1] : null;
    const src = id ? `https://www.youtube-nocookie.com/embed/${id}` : url;
   // parse options: width=..., height=..., align=left|center|right
   const o = Object.fromEntries(String(opts||'').split(/\s+/).map(kv => kv.split('=').map(x=>x?.trim())).filter(x=>x[0]));
   const w = o.width && /^\d+$/.test(o.width) ? `${o.width}px` : null;
   const h = o.height && /^\d+$/.test(o.height) ? `${o.height}px` : null;
   const align = /^(left|center|right)$/.test(o.align||'') ? o.align : null;
   // 🔧 Inline styles fort priorité (comme pour Vimeo)
   const wrapStyles = [];
   if (w) wrapStyles.push(`width:${w}`);
   if (align === 'center') { wrapStyles.push('margin-left:auto','margin-right:auto'); }
   if (align === 'right')  { wrapStyles.push('margin-left:auto'); }
   const wrapStyle = wrapStyles.join(';');
   const dataAlign = align ? ` data-align="${align}"` : '';
   const dataFixed = (w || h) ? ` data-fixed="true"` : '';
   const iframeStyle = [h ? `height:${h}` : null].filter(Boolean).join(';');
   return `<div class="video-embed"${dataAlign}${dataFixed}${wrapStyle ? ` style="${wrapStyle}"` : ''}><iframe src="${src}" title="YouTube video player"${iframeStyle ? ` style="${iframeStyle}"` : ''}></iframe></div>`;
  });
  s = s.replace(/\[vimeo(?:\s+([^\]]+))?\]([\s\S]*?)\[\/vimeo\]/gi, (_, opts, raw) => {
    const url = String(raw).trim();
    // On accepte directement les URLs player.vimeo.com (sinon l’utilisateur colle l'URL de partage → à convertir côté UX si besoin)
    const o = Object.fromEntries(String(opts||'').split(/\s+/).map(kv => kv.split('=').map(x=>x?.trim())).filter(x=>x[0]));
   const w = o.width && /^\d+$/.test(o.width) ? `${o.width}px` : null;
   const h = o.height && /^\d+$/.test(o.height) ? `${o.height}px` : null;
   const align = /^(left|center|right)$/.test(o.align||'') ? o.align : null;
   // style inline prioritaire (évite les overrides de .prose)
  const wrapStyles = [];
  if (w) wrapStyles.push(`width:${w}`);
  if (align === 'center') { wrapStyles.push('margin-left:auto','margin-right:auto'); }
  if (align === 'right')  { wrapStyles.push('margin-left:auto'); }
  const wrapStyle = wrapStyles.join(';');
  const dataAlign = align ? ` data-align="${align}"` : '';
   const dataFixed = (w || h) ? ` data-fixed="true"` : '';
   const iframeStyle = [h ? `height:${h}` : null].filter(Boolean).join(';');
   return `<div class="video-embed"${dataAlign}${dataFixed}${wrapStyle ? ` style="${wrapStyle}"` : ''}><iframe src="${url}" title="Vimeo player"${iframeStyle ? ` style="${iframeStyle}"` : ''}></iframe></div>`;
  });
  s = s.replace(/\r?\n/g, '<br/>')
  return s
}
 const ALLOWED_TAGS = ['a','b','strong','i','em','u','s','blockquote','pre','code','span','div','ul','ol','li','br','hr','img','h2','p','iframe']
 const ALLOWED_ATTR = [
   'href','target','rel','style','src','alt','title','width','height',
   // iframe
   'allow','allowfullscreen','frameborder','referrerpolicy','loading'
 ];
/* --------------------------- Page RP --------------------------- */
export default function RPPage() {
  const router = useRouter()

  // session + profil
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)

  // identités
  const [myIdentities, setMyIdentities] = useState([])

  // Persos du compte
  const [myChars, setMyChars] = useState([])
  const [postAsCharId, setPostAsCharId] = useState(null)

  // Sujets & posts
  const [topics, setTopics] = useState([])
  const TOPICS_PER_PAGE = 10
  const [topicsPage, setTopicsPage] = useState(1)
  const [activeTopic, setActiveTopic] = useState(null)
  const [posts, setPosts] = useState([])
const [sceneMenuOpen, setSceneMenuOpen] = useState(false)
const [zonesMenuOpen, setZonesMenuOpen] = useState(false)
const [expandedZoneId, setExpandedZoneId] = useState(null)
const [sceneSearch, setSceneSearch] = useState('')
const [mobilePane, setMobilePane] = useState('read')
const [places, setPlaces] = useState([])
const [zones, setZones] = useState([])
const [participantsIndex, setParticipantsIndex] = useState({})

  // Nuancier
  const [showPalette, setShowPalette] = useState(false)

  // Éditeur
  const [raw, setRaw] = useState('')
  const textareaRef = useRef(null)
  const [isPreviewOpen, setPreviewOpen] = useState(false)

  // Edit/Delete post
  const [editingPostId, setEditingPostId] = useState(null)
  const [editingRaw, setEditingRaw] = useState('')

  const endRef = useRef(null)
  const scrollToEnd = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

// --- fiche "profil posteur" (perso si dispo, sinon profil user)
const [viewer, setViewer] = useState(null); // { type: 'char'|'user', data: {...} }

async function openPosterCard(authorId, authorCharacterId) {
  try {
    if (authorCharacterId) {
      // charger le PERSONNAGE complet (comme Members)
      const { data: ch, error: e1 } = await supabase
        .from('characters')
        .select(`
          id, user_id, name, gender, avatar_url, bio, created_at,
          age, occupation, traits,
          companion_name, companion_avatar_url,
          character_relationships:character_relationships!character_id (
            id, type, other_character_id,
            other:other_character_id ( id, name, avatar_url )
          )
        `)
        .eq('id', authorCharacterId)
        .maybeSingle();
      if (e1) throw e1;

      // nom du joueur
      let ownerName = 'Joueur';
      if (ch?.user_id) {
        const { data: owner } = await supabase
          .from('profiles')
          .select('pseudo, email')
          .eq('user_id', ch.user_id)
          .maybeSingle();
        ownerName = owner?.pseudo?.trim() || owner?.email?.split('@')[0] || ownerName;
      }

      setViewer({ type: 'char', data: { ...ch, ownerName } });
    } else {
      // pas de perso : simple profil utilisateur
      const { data: p, error: e2 } = await supabase
        .from('profiles')
        .select('user_id, pseudo, avatar_url, email')
        .eq('user_id', authorId)
        .maybeSingle();
      if (e2) throw e2;
      setViewer({ type: 'user', data: p });
    }
  } catch (err) {
    alert(err.message || 'Impossible de charger la fiche.');
  }
}

  // PREVIEW
  const htmlPreview = useMemo(() => {
    const html = bbcodeToHtml(raw)
 return DOMPurify.sanitize(html, {
   ALLOWED_TAGS, ALLOWED_ATTR,
   ADD_TAGS: ['iframe'],
   ADD_ATTR: ['allow','allowfullscreen','frameborder','referrerpolicy','loading']
 })
  }, [raw])

  // Source de vérité = me.active_character_id ; fallback = premier perso actif
  // Utiliser automatiquement le personnage actif du compte
useEffect(() => {
  if (!myChars.length) {
    setPostAsCharId(null)
    return
  }

  const currentCharacter = myChars.find(
    c => String(c.id) === String(me?.active_character_id)
  )

  setPostAsCharId(
    currentCharacter?.id || myChars[0].id
  )
}, [myChars, me?.active_character_id])
  // Boot
  useEffect(() => {
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setSession(session)

      const { data: myProfile } = await supabase
        .from('profiles').select('*').eq('user_id', session.user.id).maybeSingle()
      setMe(myProfile || null)

      const { data: ids } = await supabase
        .from('profiles')
        .select('user_id, pseudo, avatar_url, email, active_character_id')
        .eq('email', myProfile?.email ?? null)
        .order('created_at', { ascending: true })
      setMyIdentities(ids || [])

      // Mes personnages actifs
      const { data: chars } = await supabase
        .from('characters')
        .select('id, name, avatar_url, is_active')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      setMyChars(chars || [])
      setPostAsCharId(myProfile?.active_character_id || (chars?.[0]?.id ?? null))

      await loadTopics()
    }
    run()
  }, [router])

  /* ---------- DATA ---------- */


const loadTopics = async () => {
  const { data, error } = await supabase
    .from('rp_topics')
    .select('id,title,created_at,updated_at,author_id,created_by,location_id')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error(error)
    return
  }

  const list = data || []
  setTopics(list)

  const [zonesResult, placesResult] = await Promise.all([
    supabase.from('rp_zones').select('id,name'),
    supabase.from('rp_locations').select('id,zone_id,name,image_url'),
  ])

  if (!zonesResult.error) setZones(zonesResult.data || [])
  if (!placesResult.error) setPlaces(placesResult.data || [])

  if (list.length) {
    const { data: entries, error: postsError } = await supabase
      .from('rp_posts')
      .select('topic_id,author_character_id')
      .in('topic_id', list.map(t => t.id))
      .limit(10000)

    if (!postsError && entries) {
      const characterIds = [
        ...new Set(entries.map(p => p.author_character_id).filter(Boolean))
      ]

      const { data: characters } = characterIds.length
        ? await supabase
            .from('characters')
            .select('id,name,avatar_url')
            .in('id', characterIds)
        : { data: [] }

      const byId = new Map(
        (characters || []).map(c => [c.id, c])
      )

      const index = {}

      for (const post of entries) {
        const character = byId.get(post.author_character_id)
        if (!character) continue

        if (!index[post.topic_id]) {
          index[post.topic_id] = new Map()
        }

        index[post.topic_id].set(character.id, character)
      }

      setParticipantsIndex(
        Object.fromEntries(
          Object.entries(index).map(([id, map]) => [
            id,
            [...map.values()]
          ])
        )
      )
    }

    const requested = new URLSearchParams(
      window.location.search
    ).get('topic')

    const first = list.find(t => t.id === requested) || list[0]

    setActiveTopic(first)
    await loadPosts(first.id)
  }
}


  const loadPosts = async (topicId) => {
    const { data, error } = await supabase
      .from('rp_posts')
      .select('id, topic_id, author_id, author_character_id, content_raw, content_html, created_at')
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
      .insert({ title, author_id: session?.user?.id })
      .select('id, title, created_at, author_id')
      .single()
    if (error) { alert(error.message); return }
    setTopics(t => [data, ...t])
    setActiveTopic(data)
    await loadPosts(data.id)
  }

  const publishPost = async () => {
    const chosenCharId = postAsCharId
    if (!raw.trim() || !activeTopic || !chosenCharId || !session) {
      alert("Choisis un personnage et un sujet, puis écris un message.")
      return
    }

 const processedHtml = DOMPurify.sanitize(bbcodeToHtml(raw), {
   ALLOWED_TAGS, ALLOWED_ATTR,
   ADD_TAGS: ['iframe'],
   ADD_ATTR: ['allow','allowfullscreen','frameborder','referrerpolicy','loading']
 })
    const payload = {
      topic_id: activeTopic.id,
      author_id: session.user.id,
      author_user_id: session.user.id,
      author_character_id: chosenCharId,
      content_raw: raw,
      content_html: processedHtml,
    }

    const { data, error } = await supabase
      .from('rp_posts')
      .insert(payload)
      .select('id, topic_id, author_id, author_character_id, content_raw, content_html, created_at')
      .single()
    if (error) { alert(error.message); return }

    if (String(data.author_character_id) !== String(chosenCharId)) {
      console.warn('Mismatch author_character_id after insert', { chosenCharId, data })
    }

    setPosts(p => [...p, data])
    setRaw('')
    setPreviewOpen(false)
    setTimeout(scrollToEnd, 0)
  }

  /* ---------- EDIT / DELETE POST ---------- */
  const startEditPost = (p) => {
    setEditingPostId(p.id)
    setEditingRaw(p.content_raw || '')
  }
  const cancelEditPost = () => { setEditingPostId(null); setEditingRaw('') }
  const saveEditPost = async () => {
    if (!editingPostId || !editingRaw.trim()) return
 const processedHtml = DOMPurify.sanitize(bbcodeToHtml(editingRaw), {
   ALLOWED_TAGS, ALLOWED_ATTR,
   ADD_TAGS: ['iframe'],
   ADD_ATTR: ['allow','allowfullscreen','frameborder','referrerpolicy','loading']
 })
    const { data, error } = await supabase
      .from('rp_posts')
      .update({ content_raw: editingRaw, content_html: processedHtml })
      .eq('id', editingPostId)
      .select('id, topic_id, author_id, author_character_id, content_raw, content_html, created_at')
      .single()
    if (error) { alert(error.message); return }
    setPosts(ps => ps.map(p => p.id === editingPostId ? data : p))
    cancelEditPost()
  }
  const deletePost = async (postId) => {
    if (!confirm('Supprimer ce post ?')) return
    const { error } = await supabase.from('rp_posts').delete().eq('id', postId)
    if (error) { alert(error.message); return }
    setPosts(ps => ps.filter(p => p.id !== postId))
  }

  /* ---------- EDIT / DELETE TOPIC ---------- */
  const renameTopic = async (t) => {
    const next = prompt('Nouveau titre ?', t.title)
    if (!next || !next.trim()) return
    const { data, error } = await supabase
      .from('rp_topics')
      .update({ title: next.trim() })
      .eq('id', t.id)
      .select('id,title,created_at,updated_at,author_id,created_by,location_id')
      .single()
    if (error) { alert(error.message); return }
    setTopics(ts => ts.map(x => x.id === t.id ? data : x))
    if (activeTopic?.id === t.id) setActiveTopic(data)
  }
  const removeTopic = async (t) => {
    if (!confirm('Supprimer ce sujet et tous ses posts ?')) return
    const { error } = await supabase.from('rp_topics').delete().eq('id', t.id)
    if (error) { alert(error.message); return }
    setTopics(ts => ts.filter(x => x.id !== t.id))
    if (activeTopic?.id === t.id) { setActiveTopic(null); setPosts([]) }
  }

  /* ---------- OUTILS ---------- */
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

// ---------- NAVIGATION DES SCÈNES ----------

  const locationById = new Map(
    places.map(l => [l.id, l])
  )

  const zoneById = new Map(
    zones.map(z => [z.id, z])
  )

  const placeLabel = topic => {
    const location = locationById.get(topic?.location_id)
    const zone = zoneById.get(location?.zone_id)

    return (
      [zone?.name, location?.name]
        .filter(Boolean)
        .join(' · ') ||
      'Ancien RP · lieu non renseigné'
    )
  }

  const activeLocation = locationById.get(
    activeTopic?.location_id
  )

  const filteredScenes = topics.filter(topic => {
    const searchable = [
      topic.title,
      placeLabel(topic),
      ...(participantsIndex[topic.id] || [])
        .map(c => c.name),
    ]
      .join(' ')
      .toLocaleLowerCase('fr')

    return searchable.includes(
      sceneSearch.toLocaleLowerCase('fr').trim()
    )
  })

  const chooseScene = async topic => {
    setSceneMenuOpen(false)
    setActiveTopic(topic)
    setMobilePane('read')

    window.history.replaceState(
      null,
      '',
      `/rp/scene?topic=${encodeURIComponent(topic.id)}`
    )

    await loadPosts(topic.id)
  }

  /* ---------- RENDER ---------- */
  return (
    
<main className="fixed inset-0 flex flex-col overflow-hidden bg-[#110e19] text-[#f4e7d2]">

  {/* Ambiance commune à l'accueil RP */}
  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(114,81,126,.3),transparent_58%),linear-gradient(135deg,#1e1728,#100e17_70%)]" />

  {activeLocation?.image_url && (
    <div
      className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
      style={{
        backgroundImage: `url("${activeLocation.image_url}")`
      }}
    />
  )}

  {/* Barre de navigation */}
  <header className="relative z-40 shrink-0 border-b border-amber-200/20 bg-[#17111f]/95 px-3 py-3 shadow-lg backdrop-blur-xl sm:px-6">

    <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2">

      <button
        onClick={() => router.push('/rp')}
        className="mr-auto font-serif text-xl text-amber-100 hover:text-amber-300"
      >
        Le Monde Magique
      </button>

      <button
        onClick={() => {
  setSceneMenuOpen(v => !v)
  setZonesMenuOpen(false)
}}
        aria-expanded={sceneMenuOpen}
        className="rounded-lg border border-amber-300/35 bg-amber-200/10 px-3 py-2 text-sm text-amber-100 hover:bg-amber-200/20"
      >
        Tous les RP ▾
      </button>

      <nav className="flex flex-wrap gap-1 text-sm">

       
<div className="relative">
  <button
    type="button"
    onClick={() => {
      setZonesMenuOpen(v => !v)
      setSceneMenuOpen(false)
    }}
    aria-expanded={zonesMenuOpen}
    className="rounded-lg px-3 py-2 text-amber-50 hover:bg-white/10"
  >
    Zones RP ▾
  </button>
  
{zonesMenuOpen && (
  <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[75vh] overflow-y-auto rounded-xl border border-amber-200/25 bg-[#241b30] p-2 shadow-2xl sm:left-0 sm:right-auto">

    {/* Retour à l'accueil des quatre zones */}
    <button
      type="button"
      onClick={() => {
        setZonesMenuOpen(false)
        router.push('/rp')
      }}
      className="w-full rounded-lg border-b border-amber-200/15 px-3 py-3 text-left text-sm font-medium text-amber-200 hover:bg-white/10"
    >
      ← Toutes les zones
    </button>

    {/* Les quatre zones et leurs sous-zones */}
    {zones.map(zone => {
      const zonePlaces = places.filter(
        place => place.zone_id === zone.id
      )

      const isExpanded = expandedZoneId === zone.id

      return (
        <div
          key={zone.id}
          className="border-t border-amber-200/10"
        >
          <button
            type="button"
            onClick={() =>
              setExpandedZoneId(isExpanded ? null : zone.id)
            }
            aria-expanded={isExpanded}
            className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-sm font-semibold text-amber-100 hover:bg-white/10"
          >
            <span>{zone.name}</span>
            <span>{isExpanded ? '⌃' : '⌄'}</span>
          </button>

          {isExpanded && (
            <div className="mb-2 ml-3 border-l border-amber-300/25 pl-2">
              {zonePlaces.map(place => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    setZonesMenuOpen(false)
                    router.push(
                      `/rp?location=${encodeURIComponent(place.id)}`
                    )
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm text-amber-50/80 hover:bg-amber-200/10 hover:text-amber-100"
                >
                  <span>{place.name}</span>
                  <span className="text-amber-300/60">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )
    })}
  </div>
)}
</div>



        <button onClick={() => router.push('/messages')} className="rounded-lg px-3 py-2 hover:bg-white/10">
          Messagerie
        </button>

        <button onClick={() => router.push('/profile')} className="rounded-lg px-3 py-2 hover:bg-white/10">
          Profil
        </button>

        <a href="/wiki" target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-2 hover:bg-white/10">
          Wiki ↗
        </a>

        <button onClick={() => router.push('/dashboard')} className="rounded-lg px-3 py-2 hover:bg-white/10">
          Tableau de bord
        </button>

      </nav>
    </div>

    {/* Menu déroulant des scènes */}
    {sceneMenuOpen && (
      <div className="absolute left-2 right-2 top-full z-50 mt-2 max-h-[75vh] overflow-hidden rounded-2xl border border-amber-200/25 bg-[#241b30] shadow-2xl sm:left-auto sm:right-6 sm:w-[520px]">

        <div className="border-b border-amber-200/15 p-3">

          <div className="mb-2 flex items-center justify-between">
            <strong className="font-serif text-lg text-amber-100">
              Explorer les RP
            </strong>

            <button onClick={() => setSceneMenuOpen(false)} className="rounded-lg px-2 py-1 hover:bg-white/10">
              Fermer ×
            </button>
          </div>

          <input
            value={sceneSearch}
            onChange={e => setSceneSearch(e.target.value)}
            placeholder="Titre, lieu ou personnage…"
            className="w-full rounded-lg border border-amber-200/20 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-amber-300"
          />
        </div>

        <div className="max-h-[55vh] space-y-2 overflow-y-auto p-3">

          {filteredScenes.map(topic => (
            <div
              key={topic.id}
              className={`rounded-xl border p-3 ${
                topic.id === activeTopic?.id
                  ? 'border-amber-300/50 bg-amber-300/10'
                  : 'border-white/10 bg-white/5'
              }`}
            >

              <button
                onClick={() => chooseScene(topic)}
                className="w-full text-left"
              >
                <div className="font-serif text-base text-amber-50">
                  {topic.title}
                </div>

                <div className="mt-1 text-xs text-amber-200/75">
                  {placeLabel(topic)}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(participantsIndex[topic.id] || []).map(character => (
                    <span
                      key={character.id}
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-white/80"
                    >
                      {character.avatar_url ? (
                        <img
                          src={character.avatar_url}
                          alt=""
                          className="h-5 w-5 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-white/15">
                          {character.name[0]}
                        </span>
                      )}

                      {character.name}
                    </span>
                  ))}

                  {!(participantsIndex[topic.id] || []).length && (
                    <span className="text-xs text-white/45">
                      Aucun post publié
                    </span>
                  )}
                </div>
              </button>

              {(topic.author_id === session?.user?.id ||
                topic.created_by === session?.user?.id) && (
                <div className="mt-2 flex justify-end gap-2 border-t border-white/10 pt-2">
                  <button
                    onClick={() => renameTopic(topic)}
                    className="rounded px-2 py-1 text-xs hover:bg-white/10"
                  >
                    Renommer
                  </button>

                  <button
                    onClick={() => removeTopic(topic)}
                    className="rounded px-2 py-1 text-xs text-rose-200 hover:bg-rose-400/10"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}

          {!filteredScenes.length && (
            <p className="p-4 text-sm text-white/60">
              Aucun RP trouvé.
            </p>
          )}
        </div>

        <div className="border-t border-amber-200/15 p-3 text-right">
          <button
            onClick={() => router.push('/rp')}
            className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-[#231b22]"
          >
            + Nouveau RP dans une zone
          </button>
        </div>
      </div>
    )}
  </header>

  {/* Titre et localisation */}
  <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-amber-200/10 bg-[#15111d]/70 px-4 py-3 lg:px-6">
    <div className="min-w-0">

      <h1 className="truncate font-serif text-lg text-amber-100 sm:text-2xl">
        {activeTopic?.title || 'Lecture RP'}
      </h1>

      <p className="truncate text-xs text-amber-200/65">
        {placeLabel(activeTopic)}
      </p>
    </div>

    {/* Navigation téléphone */}
    <div className="flex shrink-0 gap-1 lg:hidden">

      <button
        onClick={() => setMobilePane('read')}
        className={`rounded-lg px-3 py-2 text-sm ${
          mobilePane === 'read'
            ? 'bg-amber-300 text-[#231b22]'
            : 'bg-white/10'
        }`}
      >
        Lire
      </button>

      <button
        onClick={() => setMobilePane('write')}
        className={`rounded-lg px-3 py-2 text-sm ${
          mobilePane === 'write'
            ? 'bg-amber-300 text-[#231b22]'
            : 'bg-white/10'
        }`}
      >
        Écrire
      </button>
    </div>
  </div>

  {/* Deux colonnes sur ordinateur, un panneau sur téléphone */}
  <div className="rp-scene-grid relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[minmax(320px,38%)_minmax(0,1fr)] lg:gap-5 lg:p-5">


        {/* -------- ÉDITEUR -------- */}
        <section
          className={`rp-editor isolate relative rounded-2xl border border-amber-200/20 overflow-hidden flex-col min-h-0 ${
  mobilePane === 'write' ? 'flex' : 'hidden'
} lg:flex`}
style={{
  background: 'rgba(28,20,39,0.91)',
  backdropFilter: 'blur(14px)',
}}
        >
          <header className="sticky top-0 z-10 px-4 py-3 border-b border-white/10 text-white/90 font-medium bg-[#32263f]/80 backdrop-blur-sm">
            {activeTopic ? activeTopic.title : 'Sélectionne un sujet pour écrire'}
          </header>

          <div className="p-4 space-y-3 overflow-y-auto min-h-0">
           
            <div className="relative z-20 rounded-lg border border-white/10 bg-white/10 backdrop-blur-md">
  <div className="p-2">
    <EditorToolbar
      onBold={() => insertAroundSelection('[b]','[/b]')}
      onItalic={() => insertAroundSelection('[i]','[/i]')}
      onUnderline={() => insertAroundSelection('[u]','[/u]')}
      onStrike={() => insertAroundSelection('[s]','[/s]')}
      onQuote={() => insertAroundSelection('[quote]','[/quote]')}
      onCode={() => insertAroundSelection('[code]','[/code]')}
      onUL={() => insertAroundSelection('[ul]','[/ul]','[li]…[/li]')}
      onOL={() => insertAroundSelection('[ol]','[/ol]','[li]…[/li]')}
      onCenter={() => insertAroundSelection('[center]','[/center]')}
      onLeft={() => insertAroundSelection('[left]','[/left]')}
      onRight={() => insertAroundSelection('[right]','[/right]')}
      onH2={() => insertAroundSelection('[h2]','[/h2]')}
      onHR={() => insertAroundSelection('[hr]','')}
      onSize={() => insertAroundSelection('[size=18]','[/size]')}
      onLink={() => insertAroundSelection('[url=https://]','[/url]','lien')}
      onImage={() => insertAroundSelection('[img]https://…[/img]','')}
      onPickColor={() => setShowPalette(v => !v)}
onYouTube={() => {
    const url = prompt('URL YouTube (watch / youtu.be / embed) ?')?.trim()
    if (!url) return
    const w = prompt('Largeur (px, optionnel)', '720')?.trim()
    const h = prompt('Hauteur (px, optionnel)', '405')?.trim()
    const al = (prompt('Alignement (left|center|right, optionnel)', 'center')||'').trim().toLowerCase()
    const opts = [
      w && /^\d+$/.test(w) ? `width=${w}` : null,
      h && /^\d+$/.test(h) ? `height=${h}` : null,
      /^(left|center|right)$/.test(al) ? `align=${al}` : null,
    ].filter(Boolean).join(' ')
    insertAroundSelection(`[youtube${opts ? ' ' + opts : ''}]`, `[/youtube]`, url)
  }}

onVimeo={() => {
  const url = prompt(
    'Adresse Vimeo (vimeo.com/12345 ou player.vimeo.com/video/12345) ?'
  )?.trim()

  if (!url) return

  const match = url.match(
    /vimeo\.com\/(?:video\/)?(\d+)/i
  )

  if (!match) {
    alert('Adresse Vimeo invalide.')
    return
  }

  insertAroundSelection(
    '[vimeo]',
    '[/vimeo]',
    `https://player.vimeo.com/video/${match[1]}`
  )
}}

    />
  </div>

  {showPalette && (
    <div className="px-2 pb-2">
      <ColorPalette
        columns={10}
        size={22}
        onPick={(hex) => {
          insertAroundSelection(`[color=${hex}]`, `[/color]`, 'texte')
          setShowPalette(false)
        }}
      />
    </div>
  )}
</div>

            <textarea
              ref={textareaRef}
              rows={8}
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="Écris ton post en BBCode…"
              className="w-full lg:min-h-[120px] rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/60"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                disabled={!raw.trim()}
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
<section
  className={`rp-posts isolate relative rounded-2xl border border-amber-200/20 overflow-hidden flex-col min-w-0 min-h-0 ${
    mobilePane === 'read' ? 'flex' : 'hidden'
  } lg:flex`}
  style={{
    background: 'rgba(30,23,40,0.90)',
    backdropFilter: 'blur(14px)',
  }}
>

          <header className="sticky top-0 z-10 px-4 py-3 border-b border-white/10 text-white/90 font-medium bg-white/10 bg-[#32263f]/80 backdrop-blur-sm">
            {activeTopic ? activeTopic.title : 'Posts'}
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
            {activeTopic && posts.map(p => {
              const mine = p.author_id === session?.user?.id
              return (
                <article key={p.id}
                         className="relative rounded-2xl border px-4 py-3"
                         style={frost(mine ? GLASS.cardMine : GLASS.cardOther)}>

                  {mine && editingPostId !== p.id && (
                    <div className="absolute right-3 top-3 flex gap-2">
                      <button
                        onClick={() => startEditPost(p)}
                        className="rounded-md border border-white/20 bg-white/10 text-white text-xs px-2 py-1 hover:bg-white/15"
                        title="Éditer le post"
                      >
                        Éditer
                      </button>
                      <button
                        onClick={() => deletePost(p.id)}
                        className="rounded-md bg-rose-500/20 border border-rose-300/40 text-rose-100 text-xs px-2 py-1 hover:bg-rose-500/30"
                        title="Supprimer le post"
                      >
                        Suppr.
                      </button>
                    </div>
                  )}

                  <PostHeader
  authorId={p.author_id}
  authorCharacterId={p.author_character_id}
  createdAt={p.created_at}
  onAvatarClick={() => openPosterCard(p.author_id, p.author_character_id)}
/>

                  {editingPostId === p.id ? (
                    <div className="space-y-2">
                      <textarea
                        className="w-full min-h-[140px] rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-amber-300/60"
                        value={editingRaw}
                        onChange={(e) => setEditingRaw(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={cancelEditPost}
                          className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 hover:bg-white/15"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={saveEditPost}
                          disabled={!editingRaw.trim()}
                          className="rounded-md bg-amber-300 text-slate-900 px-3 py-1.5 font-medium disabled:opacity-50"
                        >
                          Enregistrer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="rp-body prose prose-invert max-w-none prose-headings:mt-4 prose-p:my-2 prose-li:my-1 prose-img:rounded-lg prose-hr:border-white/20"
                      dangerouslySetInnerHTML={{ __html: p.content_html }}
                    />
                  )}
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

{viewer && (
  <ProfileModal viewer={viewer} onClose={() => setViewer(null)} />
)}

      {/* -------- MODALE PRÉVISUALISATION -------- */}
            {/* -------- MODALE PRÉVISUALISATION -------- */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-amber-200/20 bg-[#1c1427]/95 text-[#f4e7d2] shadow-2xl">
            <div className="flex items-center justify-between border-b border-amber-200/10 px-5 py-4">
              <h3 className="font-serif text-xl text-amber-100">
                Prévisualisation
              </h3>

              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-md border border-amber-200/20 bg-white/10 px-3 py-1.5 text-amber-50 hover:bg-white/15 transition-colors"
              >
                Fermer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                className="rp-preview prose prose-invert max-w-none prose-headings:mt-4 prose-p:my-2 prose-li:my-1 prose-hr:border-white/20"
                dangerouslySetInnerHTML={{ __html: htmlPreview }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 🔧 Ajustements ciblés tablette paysage (1024–1279px) */}


<style jsx global>{`
  .rp-posts .rp-body {
    color: #f3e8d7;
    line-height: 1.85;
    overflow-wrap: anywhere;
  }

  .rp-posts .rp-body a {
    color: #f4c978;
    text-decoration: underline;
  }

  .rp-posts .rp-body blockquote {
    border-left: 3px solid #d6ae70;
    padding-left: 1rem;
    color: #e2d3c5;
  }

  .rp-preview {
    color: #f4e7d2;
    line-height: 1.85;
    overflow-wrap: anywhere;
  }

  .rp-preview a {
    color: #f4c978;
    text-decoration: underline;
  }

  .rp-preview blockquote {
    border-left: 3px solid #d6ae70;
    padding-left: 1rem;
    color: #e2d3c5;
  }

  .rp-preview img,
  .rp-preview iframe {
    max-width: 100%;
    border-radius: 10px;
  }

  .rp-posts .rp-body img,
  .rp-posts .video-embed {
    max-width: 100%;
  }

  .rp-posts .video-embed iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 10px;
  }
`}</style>

    </main>
  )
}

/* ----------------- composants utilitaires ----------------- */

function TopicParticipants({ topicId }) {
  const [list, setList] = useState([])
  useEffect(() => {
    let ok = true
    const run = async () => {
      try {
        const { data: posts, error } = await supabase
          .from('rp_posts')
          .select('author_character_id, author_id')
          .eq('topic_id', topicId)
        if (error) throw error
        if (!posts?.length) { if (ok) setList([]); return }

        const charIds = Array.from(new Set(posts.map(p => p.author_character_id).filter(Boolean)))
        const authorsNeedingProfile = Array.from(new Set(
          posts.filter(p => !p.author_character_id).map(p => p.author_id).filter(Boolean)
        ))

        const charMap = new Map()
        if (charIds.length) {
          const { data: chars } = await supabase
            .from('characters').select('id, name, avatar_url').in('id', charIds)
          for (const c of (chars || [])) {
            charMap.set(String(c.id), { key: `char:${c.id}`, label: c.name, avatar: c.avatar_url || null })
          }
        }

        let profList = []
        if (authorsNeedingProfile.length) {
          const { data: profs } = await supabase
            .from('profiles').select('user_id, pseudo, email, avatar_url').in('user_id', authorsNeedingProfile)
          profList = (profs || []).map(p => ({
            key: `user:${p.user_id}`,
            label: p.pseudo?.trim() || p.email?.split('@')[0] || 'Profil',
            avatar: p.avatar_url || null,
          }))
        }

        const merged = []
        const seen = new Set()
        for (const p of posts) {
          if (p.author_character_id && charMap.has(String(p.author_character_id))) {
            const item = charMap.get(String(p.author_character_id))
            if (!seen.has(item.key)) { merged.push(item); seen.add(item.key) }
          } else {
            const userKey = `user:${p.author_id}`
            const prof = profList.find(x => x.key === userKey)
            if (prof && !seen.has(prof.key)) { merged.push(prof); seen.add(prof.key) }
          }
        }

        if (ok) setList(merged)
      } catch {
        if (ok) setList([])
      }
    }
    run()
    return () => { ok = false }
  }, [topicId])

  return (
    <div className="flex items-center gap-2">
      {list.map(x => (
        <div key={x.key} className="flex items-center gap-2 text-white/80 text-xs">
          <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/20 bg-white/10">
            {x.avatar
              ? <img src={x.avatar} alt="" className="w-full h-full object-cover" />
              : <div className="grid place-items-center w-full h-full text-white/70 text-[10px]">
                  {(x.label?.[0] || '?').toUpperCase()}
                </div>}
          </div>
          <span className="truncate max-w-[120px]">{x.label}</span>
        </div>
      ))}
    </div>
  )
}

function PostHeader({ authorId, authorCharacterId, createdAt, onAvatarClick }) {
  const [display, setDisplay] = useState(null)
  useEffect(() => {
    let ok = true
    const run = async () => {
      if (authorCharacterId) {
        const { data: ch } = await supabase
          .from('characters').select('name, avatar_url').eq('id', authorCharacterId).maybeSingle()
        if (ok && ch) { setDisplay({ name: ch.name, avatar_url: ch.avatar_url }); return }
      }
      const { data: p } = await supabase
        .from('profiles').select('pseudo, avatar_url, email').eq('user_id', authorId).maybeSingle()
      if (ok) {
        const name = p?.pseudo?.trim() || p?.email?.split('@')[0] || 'Auteur'
        setDisplay({ name, avatar_url: p?.avatar_url || null })
      }
    }
    run(); return () => { ok = false }
  }, [authorId, authorCharacterId])

  const name = display?.name || 'Auteur'
  const initial = (name[0] || '?').toUpperCase()

  return (
    <div className="flex items-center gap-3 mb-3">
      <button
        onClick={onAvatarClick}
        className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/25 bg-white/10 shadow-[0_8px_24px_rgba(0,0,0,.25)] focus:outline-none hover:ring-amber-300/60 transition"
        title="Voir la fiche"
      >
        {display?.avatar_url
          ? <img src={display.avatar_url} alt="" className="w-full h-full object-cover" />
          : <div className="grid place-items-center w-full h-full text-white/80 text-lg">{initial}</div>}
      </button>
      <div className="leading-tight">
        <div className="text-white text-lg font-semibold">{name}</div>
        <div className="text-white/60 text-xs">{new Date(createdAt).toLocaleString()}</div>
      </div>
    </div>
  )
}

function PostAsBadge({ characterId }) {
  const [ch, setCh] = useState(null)
  useEffect(() => {
    let ok = true
    const run = async () => {
      const { data } = await supabase
        .from('characters')
        .select('name, avatar_url')
        .eq('id', characterId)
        .maybeSingle()
      if (ok) setCh(data || null)
    }
    if (characterId) run()
    return () => { ok = false }
  }, [characterId])

  if (!ch) return null
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-2 py-1">
      <span className="inline-block w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/15">
        {ch.avatar_url
          ? <img src={ch.avatar_url} alt="" className="w-full h-full object-cover" />
          : <span className="grid place-items-center w-full h-full text-[10px] text-white/70">{(ch.name?.[0]||'?').toUpperCase()}</span>}
      </span>
      <span className="text-white/80 text-xs">{ch.name}</span>
    </span>
  )
}

function EditorToolbar({
  onBold,
  onItalic,
  onUnderline,
  onStrike,
  onQuote,
  onCode,
  onUL,
  onOL,
  onCenter,
  onLeft,
  onRight,
  onH2,
  onHR,
  onSize,
  onLink,
  onImage,
  onPickColor,
  onYouTube,
  onVimeo,
}) {
  const Btn = ({ children, onClick, title }) => (
    <button type="button" title={title} onClick={onClick}
      className="rounded-md bg-white/10 border border-white/15 text-white text-xs px-2 py-1 hover:bg-white/15">
      {children}
    </button>
  )
  const Sep = () => <span className="inline-block w-px h-4 bg-white/20 mx-1" />
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
      <Btn onClick={onCenter}>Ctr</Btn>
      <Btn onClick={onRight}>→</Btn>
      <Btn onClick={onH2}>H2</Btn>
      <Btn onClick={onHR}>HR</Btn>
      <Sep/>
      <Btn onClick={onSize}>Size</Btn>
      <Btn onClick={onLink}>Lien</Btn>
      <Btn onClick={onImage}>Img</Btn>
      <Btn onClick={onYouTube} title="Insérer une vidéo YouTube">YT</Btn>
      <Btn onClick={onPickColor}>Couleur</Btn>
<Btn onClick={onLeft}>←</Btn>
<Btn onClick={onVimeo} title="Insérer une vidéo Vimeo">
  Vimeo
</Btn>
    </div>
  )
}

function ProfileModal({ viewer, onClose }) {
  if (!viewer) return null
  const { type, data } = viewer
  const stop = (e) => e.stopPropagation()

  if (type === 'user') {
    const name = data?.pseudo?.trim() || data?.email?.split('@')[0] || 'Joueur'
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
        <div className="w-[min(96vw,720px)] rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-6 text-white" onClick={stop}>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden ring-1 ring-white/20 bg-white/10">
              {data?.avatar_url
                ? <img src={data.avatar_url} alt="" className="w-full h-full object-cover" />
                : <div className="grid place-items-center w-full h-full text-white/80 text-xl">{name[0]}</div>}
            </div>
            <div>
              <div className="text-xl font-semibold">{name}</div>
              <div className="text-white/60 text-sm">{data?.email}</div>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button onClick={onClose} className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 hover:bg-white/15">Fermer</button>
          </div>
        </div>
      </div>
    )
  }

  // type === 'char'
  const c = data || {}
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-[min(96vw,980px)] rounded-2xl border border-white/15 bg-slate-950/85 backdrop-blur-xl p-6 sm:p-8 text-white max-h-[90vh] overflow-y-auto" onClick={stop}>
        {/* Header identité */}
        <div className="flex items-center gap-5 pb-5 border-b border-white/10">
          <div className="relative w-[120px] h-[120px] rounded-2xl overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5">
            {c.avatar_url
              ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />
              : <div className="grid place-items-center w-full h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white/85 text-3xl">
                  {(c.name?.[0] || '?').toUpperCase()}
                </div>}
          </div>
          <div className="min-w-0">
            <h3 className="text-2xl sm:text-3xl font-semibold leading-tight truncate">{c.name}</h3>
            <p className="text-xs text-white/60">
              {c.gender || 'Genre non renseigné'} • Joueur : {c.ownerName || '—'}
            </p>
            <div className="mt-1 text-xs text-white/70 space-x-3">
              {c.age ? <span>Âge : {c.age}</span> : null}
              {c.occupation ? <span>Occupation : {c.occupation}</span> : null}
            </div>
          </div>
        </div>

        {/* Colonne traits + relations + bio */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Bipolar leftLabel="Introverti" rightLabel="Extraverti" value={c.traits?.intro_extro} />
              <Bipolar leftLabel="Égoïste" rightLabel="Altruiste" value={c.traits?.egoiste_altruiste} />
              <Bipolar leftLabel="Prudent" rightLabel="Téméraire" value={c.traits?.prudent_temer} />
              <Bipolar leftLabel="Réfléchi" rightLabel="Impulsif" value={c.traits?.reflechi_impulsif} />
              <Bipolar leftLabel="Obéissant" rightLabel="Rebelle" value={c.traits?.obeissant_rebelle} />
            </div>
            <div className="space-y-4">
              <Bipolar leftLabel="Méthodique" rightLabel="Chaotique" value={c.traits?.methodique_chaotique} />
              <Bipolar leftLabel="Idéaliste" rightLabel="Cynique" value={c.traits?.idealiste_cynique} />
              <Bipolar leftLabel="Résilient" rightLabel="Vulnérable" value={c.traits?.resil_vulnerable} />
              <Bipolar leftLabel="Loyal" rightLabel="Opportuniste" value={c.traits?.loyal_opportuniste} />
              <Bipolar leftLabel="Créatif" rightLabel="Pragmatique" value={c.traits?.creatif_pragmatique} />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-semibold mb-2">Relations</h4>
            <RelationsList relations={c.character_relationships} />
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 text-sm font-semibold text-white/80">Description</div>
          {c.bio ? (
            <p className="whitespace-pre-wrap text-white/90">{c.bio}</p>
          ) : (
            <div className="text-white/60 text-sm">Aucune bio.</div>
          )}
        </section>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 hover:bg-white/15">Fermer</button>
        </div>
      </div>
    </div>
  )
}

function RelationsList({ relations }) {
  if (!relations || relations.length === 0) {
    return <p className="text-white/60 text-sm">Aucune relation connue.</p>;
  }
  return (
    <ul className="space-y-2">
      {relations.map((rel) => (
        <li key={rel.id} className="flex items-center gap-2 text-sm">
          {rel.other?.avatar_url ? (
            <img src={rel.other.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-white/10 grid place-items-center text-[10px]">?</div>
          )}
          <span className="truncate">{rel.other?.name || rel.other_character_id}</span>
          <span className="text-white/50">·</span>
          <span className="text-white/70">{relationLabel(rel.type)}</span>
        </li>
      ))}
    </ul>
  );
}

function Bipolar({ leftLabel, rightLabel, value=5 }) {
  const v = Math.max(0, Math.min(10, Number(value ?? 5)));
  const pct = (v / 10) * 100;
  const gradient = `linear-gradient(90deg, #6ea8ff 0%, #6ea8ff ${pct}%, #f6d24a ${pct}%, #f6d24a 100%)`;
  return (
    <div className="space-y-2 select-none">
      <div className="flex justify-between text-white/70 text-sm">
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
      <div className="relative h-4 rounded-full border border-white/10 bg-white/5">
        <div className="absolute inset-0 rounded-full" style={{ background: gradient }} />
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${pct}% - 6px)` }}>
          <div className="w-3 h-3 rounded-full bg-white shadow" />
        </div>
      </div>
    </div>
  );
}

function relationLabel(type) {
  const map = {
    love_interest: "Love interest",
    ami: "Ami",
    ennemi: "Ennemi",
    indifferent: "Indifférent",
    nemesis: "Némésis",
    inconnu: "Inconnu",
  };
  return map[type] || type;
}

