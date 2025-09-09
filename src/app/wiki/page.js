// src/app/wiki/page.js
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

/* -------------------- Utils -------------------- */
function norm(s) {
  return (s || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
function slugify(s) {
  const n = norm(s)
  return n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'
}
function colorFromString(s) {
  const base = ['#0ea5e9','#f59e0b','#8b5cf6','#10b981','#ef4444','#22d3ee','#a3e635','#f472b6']
  let h = 0; for (let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i))>>>0
  return base[h % base.length]
}

/* -------------------- Raretés (styles) -------------------- */
const RARITY = {
  commun:     { label: 'Commune',    ring: 'ring-gray-300/50',   text: 'text-gray-200'   },
  rare:       { label: 'Rare',       ring: 'ring-sky-300/60',    text: 'text-sky-200'    },
  epique:     { label: 'Épique',     ring: 'ring-violet-300/70', text: 'text-violet-200' },
  legendaire: { label: 'Légendaire', ring: 'ring-amber-300/80',  text: 'text-amber-200'  },
}
const rarityWeight = { commun:1, rare:2, epique:3, legendaire:4 }

/* -------------------- Proxy image -------------------- */
function srcForDisplay(url) {
  if (!url) return '/images/card-bg.png'
  try {
    const u = new URL(url)
    const isSupabase = u.hostname.endsWith('.supabase.co')
    return isSupabase ? url : `/api/img?u=${encodeURIComponent(url)}`
  } catch {
    return `/api/img?u=${encodeURIComponent(url)}`
  }
}

/* -------------------- Static fallback si 0 carte -------------------- */
function staticToTree() {
  const STATIC = [
    { key:'univers', label:'Univers', color:'#0ea5e9', subs:[
      { key:'faune', label:'Faune' }, { key:'flore', label:'Flore' }, { key:'historique', label:'Historique' }
    ]},
    { key:'personnages', label:'Personnages', color:'#f59e0b', subs:[
      { key:'pnj', label:'PNJ' }, { key:'creatures', label:'Créatures' }, { key:'groupes', label:'Groupes' }
    ]},
    { key:'magie', label:'Magie', color:'#8b5cf6', subs:[
      { key:'sorts', label:'Sorts' }, { key:'potions', label:'Potions' }, { key:'objets', label:'Objets magiques' }
    ]},
  ]
  const gen = (prefix, items) => items.map((x,i)=>({
    id:`${prefix}-${x.key}-${i}`, parent_id:null, label:x.label, slug:x.key, color:x.color, order_index:i, is_active:true,
    children:(x.subs||[]).map((s,j)=>({
      id:`${prefix}-${x.key}-${s.key}-${j}`, parent_id:`${prefix}-${x.key}-${i}`, label:s.label, slug:s.key,
      color:x.color, order_index:j, is_active:true, children:[]
    }))
  }))
  return gen('static', STATIC)
}

/* -------------------- Tree helpers (depuis les cartes) -------------------- */
function findById(tree, id) {
  if (!id) return null
  const st = [...tree]
  while (st.length) {
    const n = st.pop()
    if (n.id === id) return n
    if (n.children?.length) st.push(...n.children)
  }
  return null
}

function buildTreeFromCards(cards) {
  const cats = new Map()
  for (const c of (cards||[])) {
    const c1 = (c.category || '').trim() || 'Divers'
    const c2 = (c.subcategory || '').trim()
    const c3 = (c.sub_subcategory || '').trim()
    const s1 = slugify(c1)
    const s2 = slugify(c2)
    const s3 = slugify(c3)

    if (!cats.has(s1)) {
      const color =
        (['univers','personnages','magie'].includes(s1))
          ? (s1==='univers' ? '#0ea5e9' : s1==='personnages' ? '#f59e0b' : '#8b5cf6')
          : colorFromString(s1)
      cats.set(s1, { id:`cat-${s1}`, parent_id:null, label:c1, slug:s1, color, order_index:0, is_active:true, children:[], _subs:new Map() })
    }
    if (s2) {
      const top = cats.get(s1)
      if (!top._subs.has(s2)) {
        top._subs.set(s2, { id:`cat-${s1}-${s2}`, parent_id:top.id, label:c2, slug:s2, color:top.color, order_index:0, is_active:true, children:[], _subs:new Map() })
      }
      if (s3) {
        const sub = top._subs.get(s2)
        if (!sub._subs.has(s3)) {
          sub._subs.set(s3, { id:`cat-${s1}-${s2}-${s3}`, parent_id:sub.id, label:c3, slug:s3, color:top.color, order_index:0, is_active:true, children:[] })
        }
      }
    }
  }
  const roots = []
  for (const top of cats.values()) {
    top.children = Array.from(top._subs.values())
    for (const s of top.children) s.children = Array.from(s._subs.values())
    delete top._subs
    roots.push(top)
  }
  if (!roots.length) return staticToTree()
  const sortRec = (arr) => { arr.sort((a,b)=>norm(a.label).localeCompare(norm(b.label))); arr.forEach(x=>sortRec(x.children)) }
  sortRec(roots)
  return roots
}

// --- helper: construit un arbre à partir de wiki_categories (rows) ---
function buildTreeFromCategoriesRows(rows) {
  const byId = new Map((rows || []).map(n => [n.id, { ...n, children: [] }]))
  const roots = []
  for (const n of byId.values()) {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id).children.push(n)
    } else {
      roots.push(n)
    }
  }
  const sortRec = (arr) => {
    arr.sort((a,b)=>(a.order_index ?? 0) - (b.order_index ?? 0))
    arr.forEach(x => sortRec(x.children))
  }
  sortRec(roots)
  return roots
}

// --- seed canonique toujours visible (même sans carte) ---
function seedTree() {
  return [
    {
      id: 'seed-univers', slug: 'univers', label: 'Univers', color: '#0ea5e9',
      children: [
        { id:'seed-univers-faune', slug:'faune', label:'Faune et flore', color:'#0ea5e9', children:[] },
        { id:'seed-univers-flore', slug:'flore', label:'navires', color:'#0ea5e9', children:[] },
        { id:'seed-univers-historique', slug:'historique', label:'Historique', color:'#0ea5e9', children:[] },
      ]
    },
    {
      id: 'seed-personnages', slug: 'personnages', label: 'Personnages', color: '#f59e0b',
      children: [
        { id:'seed-personnages-pnj', slug:'pnj', label:'PNJ', color:'#f59e0b', children:[] },
        { id:'seed-personnages-pnj', slug:'scenario', label:'scenario', color:'#f59e0b', children:[] },
        { id:'seed-personnages-groupes', slug:'groupes', label:'"équipages et groupes', color:'#f59e0b', children:[] },
      ]
    },
    {
      id: 'magie', slug: 'magie', label: 'Jouabilité', color: '#8b5cf6',
      children: [
        { id:'seed-magie-sorts', slug:'sorts', label:'Règles et Must Do', color:'#8b5cf6', children:[] },
        { id:'seed-magie-potions', slug:'potions', label:'Intrigue', color:'#8b5cf6', children:[] },
        { id:'seed-magie-objets', slug:'objets', label:'Lieux', color:'#8b5cf6', children:[] },
      ]
    },
  ]
}

// --- construit l'arbre = seed (toujours visible) + catégories découvertes dans cards ---
function buildTreeFromCardsMerged(cards) {
  // 1) index à partir du seed
  const roots = seedTree()
  const bySlugL1 = new Map()
  const bySlugL2 = new Map() // clé `${l1Slug}::${l2Slug}` -> node

  for (const r of roots) {
    bySlugL1.set(r.slug, r)
    for (const s of (r.children||[])) bySlugL2.set(`${r.slug}::${s.slug}`, s)
  }

  // 2) injecte ce qu'on découvre dans cards
  for (const c of (cards||[])) {
    const c1Label = (c.category||'').trim() || 'Divers'
    const c2Label = (c.subcategory||'').trim()
    const c3Label = (c.sub_subcategory||'').trim()
    const c1 = slugify(c1Label)
    const c2 = c2Label ? slugify(c2Label) : ''
    const c3 = c3Label ? slugify(c3Label) : ''

    // L1
    if (!bySlugL1.has(c1)) {
      const color = (['univers','personnages','magie'].includes(c1))
        ? (c1==='univers' ? '#0ea5e9' : c1==='personnages' ? '#f59e0b' : '#8b5cf6')
        : colorFromString(c1)
      const node = { id:`cat-${c1}`, slug:c1, label:c1Label, color, children:[] }
      roots.push(node)
      bySlugL1.set(c1, node)
    }
    const nodeL1 = bySlugL1.get(c1)

    // L2
    if (c2) {
      const keyL2 = `${c1}::${c2}`
      if (!bySlugL2.has(keyL2)) {
        const node = { id:`cat-${c1}-${c2}`, slug:c2, label:c2Label, color: nodeL1.color, children:[] }
        nodeL1.children.push(node)
        bySlugL2.set(keyL2, node)
      }
      const nodeL2 = bySlugL2.get(keyL2)

      // L3
      if (c3) {
        if (!(nodeL2.children||[]).some(n => n.slug === c3)) {
          nodeL2.children.push({ id:`cat-${c1}-${c2}-${c3}`, slug:c3, label:c3Label, color: nodeL1.color, children:[] })
        }
      }
    }
  }

  // 3) tri alpha
  const sortRec = (arr) => {
    arr.sort((a,b)=> norm(a.label).localeCompare(norm(b.label)))
    arr.forEach(x => sortRec(x.children||[]))
  }
  sortRec(roots)
  return roots
}

/* -------------------- Page -------------------- */
export default function WikiPage() {
  // Session / profil
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const isAdmin = !!me?.is_admin

  // Données
  const [cards, setCards] = useState([])
  const [collectedSet, setCollectedSet] = useState(new Set())

  // Arbre catégories (uniquement depuis les cartes)
  const [tree, setTree] = useState([])

  // UI / filtres
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('newest')
  const [dimUncollected, setDimUncollected] = useState(false)

  // Sélections (ids)
  const roots = tree
  const [l1, setL1] = useState(null)
  const l1Node = useMemo(() => findById(tree, l1), [tree, l1])
  const l2List = l1Node?.children || []
  const [l2, setL2] = useState(null)
  const l2Node = useMemo(() => findById(tree, l2), [tree, l2])
  const [l3, setL3] = useState('')

  // Pagination
  const PAGE_SIZE = 16
  const [page, setPage] = useState(1)

  // Confetti
  const [confetti, setConfetti] = useState([])
  const confettiTimer = useRef(null)

  /* --------- Boot: session → profil → cartes → taxonomie --------- */
 /* --------- Boot: session → profil → cartes → taxonomie --------- */
useEffect(() => {
  let ignore = false
  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (ignore) return
      setSession(session || null)

      if (session?.user?.id) {
        const { data: meRow } = await supabase
          .from('profiles')
          .select('id,is_admin,pseudo,role')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (!ignore) setMe(meRow || null)
      } else {
        setMe(null)
      }

      const { data: cardsRows, error: cardsErr } = await supabase
        .from('cards')
        .select('id, owner_id, title, description, category, subcategory, sub_subcategory, rarity, image_url, created_at')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (cardsErr) console.error(cardsErr)
      if (!ignore) setCards(cardsRows || [])

      if (session?.user?.id) {
        const { data: coll } = await supabase
          .from('card_collects')
          .select('card_id')
          .eq('user_id', session.user.id)
        if (!ignore) setCollectedSet(new Set((coll || []).map(x => x.card_id)))
      } else {
        setCollectedSet(new Set())
      }

      // 👉 Arbre depuis seed + cartes (PAS de wiki_categories)
      const built = buildTreeFromCardsMerged(cardsRows || [])
      if (!ignore) setTree(built)

    } finally {
      if (!ignore) setLoading(false)
    }
  })()
  return () => { ignore = true }
}, [])


  // Sélections par défaut
  useEffect(() => {
    if (!tree?.length) return
    setL1(prev => prev || tree[0].id || null)
  }, [tree])
  useEffect(() => { setL2(l1Node?.children?.[0]?.id || null); setL3('') }, [l1])
  useEffect(() => { setL3('') }, [l2])

  /* --------- Filtres/tri --------- */
const currentCatColor = useMemo(() => l1Node?.color || '#60a5fa', [l1Node])

const filteredAll = useMemo(() => {
  const n = norm
  const matchNode = (cardValue, node) => {
    if (!node) return true
    const v = slugify(cardValue)
    return v === node.slug
  }

  // ---- 1. Filtrer selon la navigation ----
  let list = (cards || []).filter((c) => {
    if (l1 && !matchNode(c.category, l1Node)) return false
    if (l2) {
      const node = l2Node || (l1Node?.children || []).find(x => x.id === l2)
      if (!matchNode(c.subcategory, node)) return false
    }
    if (l3) {
      const node = (l2Node?.children || []).find(x => x.id === l3)
      if (!matchNode(c.sub_subcategory, node)) return false
    }
    return true
  })

  // ---- 2. Helpers pour détecter les "fausses cartes" (dossiers/placeholder) ----
  const isBackImage = (url) => {
    if (!url) return true
    return /card[-_ ]?back|\/backs?\/|placeholder|default/i.test(url)
  }

  const plainText = (html) => (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const breadcrumbOf = (c) => {
    const parts = [c.category, c.subcategory, c.sub_subcategory]
      .map(x => (typeof x === 'string' ? x : x?.title || x?.name || ''))
      .filter(Boolean)
    return parts.join(' / ').trim()
  }

  const isPseudoFolderCard = (c) => {
    const title = (c.title || '').trim().toLowerCase()
    const breadcrumb = breadcrumbOf(c).toLowerCase()
    const noRealImage = isBackImage(c.image_url)
    const noContent = !(c.content_raw?.trim()) && !plainText(c.content_html)
    const titleIsPath = breadcrumb && title === breadcrumb
    return noRealImage && (noContent || titleIsPath)
  }

  // ---- 3. Exclure les fausses cartes ----
  list = list.filter(c => !isPseudoFolderCard(c))

  // ---- 4. Recherche texte ----
  const q = n(search)
  if (q) list = list.filter(c =>
    n(c.title).includes(q) ||
    n(c.description).includes(q)
  )

  // ---- 5. Tri ----
  if (sortKey === 'title') {
    list.sort((a, b) => ('' + (a.title || '')).localeCompare('' + (b.title || '')))
  } else if (sortKey === 'rarity_desc') {
    list.sort((a, b) => (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0))
  } else if (sortKey === 'rarity_asc') {
    list.sort((a, b) => (rarityWeight[a.rarity] || 0) - (rarityWeight[b.rarity] || 0))
  } else {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  return list
}, [cards, l1, l1Node, l2, l2Node, l3, search, sortKey])

const pageCount = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE))
const pageStart = (page - 1) * PAGE_SIZE
const filtered = filteredAll.slice(pageStart, pageStart + PAGE_SIZE)

useEffect(() => { setPage(1) }, [l1, l2, l3, search, sortKey])

const isCollected = (id) => collectedSet.has(id)




  /* --------- Collect & confetti --------- */
  const doConfetti = () => {
    const parts = Array.from({length:60}, (_,i)=>({
      id: i+'-'+Date.now(), x: Math.random()*100, y: 0,
      dx: -0.5 + Math.random(), dy: 1 + Math.random()*1.2, life: 0
    }))
    setConfetti(parts)
    const start = Date.now()
    if (confettiTimer.current) clearInterval(confettiTimer.current)
    confettiTimer.current = setInterval(() => {
      const t = (Date.now()-start)/1100
      setConfetti(prev => prev.map(p => ({ ...p, x:p.x+p.dx*2, y:p.y+p.dy*3, life:t })))
      if (t>=1) { clearInterval(confettiTimer.current); confettiTimer.current=null; setConfetti([]) }
    }, 16)
  }

  const toggleCollect = async (card) => {
    if (!session) return
    const firstTime = !isCollected(card.id)
    if (firstTime) {
      const { error } = await supabase
        .from('card_collects')
        .upsert([{ user_id: session.user.id, card_id: card.id }], { onConflict: 'card_id,user_id' })
      if (!error) { setCollectedSet(s=>new Set(s).add(card.id)); doConfetti() }
    } else {
      const { error } = await supabase
        .from('card_collects').delete()
        .eq('user_id', session.user.id).eq('card_id', card.id)
      if (!error) { setCollectedSet(s=>{const n=new Set(s); n.delete(card.id); return n}) }
    }
  }

  const canEditOrDelete = (card) => isAdmin || card.owner_id === session?.user?.id
  const onDelete = async (card) => {
    if (!canEditOrDelete(card)) return
    if (!confirm(`Supprimer la carte « ${card.title} » ?`)) return
    const { error } = await supabase.from('cards').delete().eq('id', card.id)
    if (!error) {
      setViewing(null)
      const { data: cardsRows } = await supabase
        .from('cards')
        .select('id, owner_id, title, description, category, subcategory, sub_subcategory, rarity, image_url, created_at')
        .order('created_at', { ascending: false }).limit(5000)
      setCards(cardsRows || [])
      setTree(buildTreeFromCards(cardsRows || []))
    } else {
      alert(error.message || 'Suppression impossible')
    }
  }

  /* --------- Render --------- */
  if (loading) return <div className="p-6 text-slate-900">Chargement…</div>

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* Bouton retour */}
      <button
        onClick={() => { window.location.href = '/dashboard' }}
        className="fixed left-60 bottom-[20px] z-50 rounded-full border border-white/25 bg-white/20 backdrop-blur-md px-3.5 py-1.5 text-white/90 text-md hover:bg-white/60"
      >
        ← Tableau de bord
      </button>

      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/lore-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/20 via-slate-900/15 to-slate-950/35" />

      {/* Confetti */}
      {Boolean(confetti.length) && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {confetti.map(p=>(
            <div key={p.id} className="absolute w-2 h-2 rounded-[2px]"
              style={{ left:`${p.x}%`, top:`${p.y}%`,
                background:`hsl(${(p.id.length*53)%360} 80% 70%)`,
                opacity: 1-Math.min(1,p.life), transform:`rotate(${p.life*540}deg)` }}/>
          ))}
        </div>
      )}

      <div className="relative z-10 h-full grid gap-6 p-6 grid-cols-[30%_1fr] xl:grid-cols-[28%_1fr] lg:grid-cols-1">
        {/* ---- Colonne gauche ---- */}
        <section className="rounded-2xl border border-white/15 bg-black/30 backdrop-blur-md overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium flex items-center justify-between">
            <span>Wiki / Lore</span>
            <Link href="/wiki/create" className="rounded-lg bg-amber-300 text-slate-900 text-xs font-medium px-2.5 py-1 hover:bg-amber-200">+ Créer</Link>
          </header>

          <div className="p-3 overflow-y-auto space-y-4">
            <div className="rounded-lg border border-white/15 bg-white/5 p-2">
              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Rechercher un titre…"
                className="w-full rounded-md bg-white/10 border border-white/15 px-3 py-2 text-white outline-none"
              />
            </div>

            <div className="rounded-lg border border-white/15 bg-white/5 p-2">
              <label className="text-white/80 text-sm mr-2">Trier par</label>
              <select
                value={sortKey}
                onChange={e=>setSortKey(e.target.value)}
                className="rounded-md bg-white/10 border border-white/15 px-2 py-1.5 text-white outline-none"
              >
                <option value="newest" className="text-slate-900">Plus récent</option>
                <option value="title" className="text-slate-900">Titre (A→Z)</option>
                <option value="rarity_desc" className="text-slate-900">Rareté (haut→bas)</option>
                <option value="rarity_asc" className="text-slate-900">Rareté (bas→haut)</option>
              </select>
            </div>

            {/* Catégories dynamiques (depuis les cartes) */}
            {roots.map(group=>(
              <div key={group.id} className="space-y-2">
                <button
                  onClick={() => { setL1(group.id); setL2(group.children?.[0]?.id || null) }}
                  className={`w-full text-left rounded-lg px-3 py-2 border transition ${l1===group.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
                  style={{ boxShadow:`inset 0 0 0 1px ${l1===group.id?(group.color||'#ffffff66'):'transparent'}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: group.color || '#999' }} />
                    <span className="text-white/90">{group.label}</span>
                  </div>
                </button>

                {l1===group.id && (
                  <div className="pl-5 space-y-1">
                    {(group.children||[]).map(s=>(
                      <button key={s.id} onClick={() => { setL1(group.id); setL2(s.id) }}
                        className={`w-full text-left rounded-md px-2 py-1 border text-sm transition ${l2===s.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}>
                        <span className="text-white/80">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Niveau 3 (optionnel) */}
                {l1===group.id && l2 && (findById(tree, l2)?.children?.length > 0) && (
                  <div className="pl-8 mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => setL3('')}
                      className={`px-2.5 py-1.5 rounded-full border text-xs transition ${l3==='' ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
                    >
                      Aucune
                    </button>
                    {(findById(tree, l2)?.children || []).map(s3 => (
                      <button
                        key={s3.id}
                        onClick={() => setL3(s3.id)}
                        className={`px-2.5 py-1.5 rounded-full border text-xs transition ${l3===s3.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
                      >
                        {s3.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="mt-2 p-3 rounded-lg border border-white/15 bg-white/5">
              <label className="flex items-center gap-2 text-white/80 text-sm">
                <input type="checkbox" checked={dimUncollected} onChange={e=>setDimUncollected(e.target.checked)} />
                Griser les cartes non collectées
              </label>
            </div>
          </div>
        </section>

        {/* ---- Grille ---- */}
        <section className="rounded-2xl border border-black/30 bg-white/10 backdrop-blur-xxs overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">
              {l1Node?.label || 'Catégorie'} — {l2List.find(x=>x.id===l2)?.label || 'Sous-catégorie'}
            </div>
            <div className="text-white/60 text-sm">
              {filteredAll.length} carte(s){filteredAll.length>PAGE_SIZE ? ` • page ${page}/${pageCount}`:''}
            </div>
          </header>

          <div className="p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(card => {
              const r = RARITY[card.rarity] || RARITY.commun
              const collected = isCollected(card.id)
              return (
                <button
                  key={card.id}
                  onClick={() => setViewing(card)}
                  className={`group relative aspect-[4/5] rounded-xl overflow-hidden ring-2 ${r.ring}`}
                  style={{ borderColor: currentCatColor }}
                  title={card.title}
                >
                  <Image src={srcForDisplay(card.image_url)} alt="" fill className={`object-cover ${(!collected && dimUncollected) ? 'opacity-40 grayscale' : ''}`} />
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-white text-sm font-medium truncate">{card.title}</div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${r.text} ${r.ring}`}>{r.label}</span>
                    </div>
                  </div>
                  {!collected && (
                    <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white">
                      Non collectée
                    </div>
                  )}
                </button>
              )
            })}
            {!filtered.length && <div className="text-white/60 text-sm">Aucune carte dans cette sélection.</div>}
          </div>

          {pageCount>1 && (
            <div className="px-4 pb-4 flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page<=1}
                className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 disabled:opacity-50">Précédent</button>
              <div className="text-white/70 text-sm">Page {page} / {pageCount}</div>
              <button onClick={() => setPage(p => Math.min(pageCount, p+1))} disabled={page>=pageCount}
                className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 disabled:opacity-50">Suivant</button>
            </div>
          )}
        </section>
      </div>

      {/* ---- Modale ---- */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: currentCatColor }} />
                <h3 className="text-white text-lg font-semibold">{viewing.title}</h3>
                <span className="text-xs text-white/70">• {new Date(viewing.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                {(isAdmin || viewing.owner_id === session?.user?.id) && (
                  <>
                    <Link href={`/wiki/edit/${viewing.id}`} className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-white/90 text-sm hover:bg-white/20">Éditer</Link>
                    <button onClick={() => onDelete(viewing)} className="rounded-md border border-red-300/40 bg-red-500/20 px-2 py-1 text-red-100 text-sm hover:bg-red-500/30">Supprimer</button>
                  </>
                )}
                <button onClick={() => setViewing(null)} className="rounded-md border border-white/25 bg-white/10 px-2 py-1 text-white/90 text-sm hover:bg-white/20">Fermer</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden ring-2" style={{ borderColor: currentCatColor }}>
                <Image src={srcForDisplay(viewing.image_url)} alt="" fill className="object-cover" />
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2"><span className="text-white/70 text-sm">Catégorie :</span><span className="text-white/90 text-sm">{viewing.category || '—'}</span></div>
                <div className="flex items-center gap-2"><span className="text-white/70 text-sm">Sous-catégorie :</span><span className="text-white/90 text-sm">{viewing.subcategory || '—'}</span></div>
                <div className="flex items-center gap-2"><span className="text-white/70 text-sm">Niveau 3 :</span><span className="text-white/90 text-sm">{viewing.sub_subcategory || '—'}</span></div>

                <div className="pt-2 text-white/90 whitespace-pre-wrap text-sm leading-relaxed">
                  {viewing.description || '—'}
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => toggleCollect(viewing)}
                    className={`rounded-md px-3 py-1.5 border text-sm ${
                      isCollected(viewing.id)
                        ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/30'
                        : 'bg-white/10 border-white/20 text-white/90 hover:bg-white/20'
                    }`}
                  >
                    {isCollected(viewing.id) ? 'Retirer de ma collection' : 'Ajouter à ma collection'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </main>
  )
}
