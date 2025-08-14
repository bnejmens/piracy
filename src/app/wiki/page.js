'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '../../lib/supabaseClient'

/* -------------------- Catégories / sous-catégories -------------------- */
export const CATS = [
  { key: 'univers', label: 'Univers', color: '#60a5fa',
    subs: [{key:'faune',label:'Faune'},{key:'flore',label:'Flore'},{key:'historique',label:'Historique'}] },
  { key: 'personnages', label: 'Personnages', color: '#f59e0b',
    subs: [{key:'pnj',label:'PNJ'},{key:'creatures',label:'Créatures'},{ key:'galerie', label:'Galerie de Joueurs' },{key:'groupes',label:'Groupes'}] },
  { key: 'magie', label: 'Magie', color: '#a78bfa',
    subs: [{key:'sorts',label:'Sorts'},{key:'potions',label:'Potions'},{key:'objets',label:'Objets magiques'}] },
  { key: 'contes', label: 'Contes & Légendes', color: '#34d399',
    subs: [{key:'rumeurs',label:'Rumeurs'},{key:'histoires',label:'Histoires'}] },
]

/* -------------------- Raretés (styles) -------------------- */
const RARITY = {
  commun:     { label: 'Commune',    ring: 'ring-gray-300/50',   text: 'text-gray-200'   },
  rare:       { label: 'Rare',       ring: 'ring-sky-300/60',    text: 'text-sky-200'    },
  epique:     { label: 'Épique',     ring: 'ring-violet-300/70', text: 'text-violet-200' },
  legendaire: { label: 'Légendaire', ring: 'ring-amber-300/80',  text: 'text-amber-200'  },
}
const rarityKeys = Object.keys(RARITY)

/* -------------------- Helper proxy d’images -------------------- */
function srcForDisplay(url) {
  if (!url) return '/images/card-bg.png'
  try {
    const u = new URL(url)
    const isSupabase = u.hostname.endsWith('.supabase.co')
    // Supabase direct (optimisé par Next/Image), sinon proxy local
    return isSupabase ? url : `/api/img?u=${encodeURIComponent(url)}`
  } catch {
    return `/api/img?u=${encodeURIComponent(url)}`
  }
}

export default function WikiPage() {
  const [session, setSession] = useState(null)
  const [me, setMe] = useState(null)
  const isAdmin = !!me?.is_admin

  // Filtres
  const [cat, setCat] = useState(CATS[0].key)
  const [sub, setSub] = useState(CATS[0].subs[0].key)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('newest') // newest|title|rarity_desc|rarity_asc
  const [dimUncollected, setDimUncollected] = useState(true)

  // Données
  const [cards, setCards] = useState([])
  const [collectedSet, setCollectedSet] = useState(new Set())

  // UI
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState(null)

  // Pagination
  const PAGE_SIZE = 16
  const [page, setPage] = useState(1)

  // Confetti sobre
  const [confetti, setConfetti] = useState([])
  const confettiTimer = useRef(null)

  useEffect(() => {
    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.href = '/auth'; return }
      setSession(session)
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('user_id, pseudo, email, is_admin')
        .eq('user_id', session.user.id)
        .maybeSingle()
      setMe(myProfile || null)
      await Promise.all([loadCards(), loadCollection(session.user.id)])
      setLoading(false)
    }
    boot()
    return () => { if (confettiTimer.current) clearInterval(confettiTimer.current) }
  }, [])

  const loadCards = async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('id, owner_id, title, description, category, subcategory, rarity, image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (!error) setCards(data || [])
  }

  const loadCollection = async (uid) => {
    const { data } = await supabase
      .from('card_collects')
      .select('card_id')
      .eq('user_id', uid)
    setCollectedSet(new Set((data || []).map(x => x.card_id)))
  }

  const currentCatColor = useMemo(
    () => CATS.find(c => c.key === cat)?.color || '#60a5fa',
    [cat]
  )

  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = cards.filter(c => c.category === cat && c.subcategory === sub)
    if (q) list = list.filter(c => (c.title||'').toLowerCase().includes(q))
    const rw = { commun:1, rare:2, epique:3, legendaire:4 }
    if (sortKey === 'title') list.sort((a,b)=>(a.title||'').localeCompare(b.title||''))
    else if (sortKey === 'rarity_desc') list.sort((a,b)=>(rw[b.rarity]||0)-(rw[a.rarity]||0))
    else if (sortKey === 'rarity_asc') list.sort((a,b)=>(rw[a.rarity]||0)-(rw[b.rarity]||0))
    else list.sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
    return list
  }, [cards, cat, sub, search, sortKey])

  const pageCount = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE))
  const pageStart = (page - 1) * PAGE_SIZE
  const filtered = filteredAll.slice(pageStart, pageStart + PAGE_SIZE)
  useEffect(() => { setPage(1) }, [cat, sub, search, sortKey])

  const isCollected = (id) => collectedSet.has(id)

  const doConfetti = () => {
    const parts = Array.from({length:60}, (_,i)=>({
      id: i+'-'+Date.now(),
      x: Math.random()*100, y: 0,
      dx: -0.5 + Math.random(), dy: 1 + Math.random()*1.2,
      life: 0
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
        .from('card_collects')
        .delete()
        .eq('user_id', session.user.id).eq('card_id', card.id)
      if (!error) { setCollectedSet(s=>{const n=new Set(s); n.delete(card.id); return n}) }
    }
  }

  const canEditOrDelete = (card) => isAdmin || card.owner_id === session?.user?.id

  if (loading) return <div className="p-6 text-white">Chargement…</div>

  return (
    <main className="fixed inset-0 overflow-hidden">
{/* Bouton retour */}
<button
  onClick={() => window.location.href = '/dashboard'}
  className="fixed left-60 bottom-[20px] z-50 rounded-full border border-white/25 bg-white/20 backdrop-blur-md px-3 py-1.5 text-white/90 text-sm hover:bg-white/60"
>
  ← Tableau de bord
</button>

      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/lore-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/20 via-slate-900/15 to-slate-950/35" />

      {/* Confetti sobre */}
      {confetti.length>0 && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {confetti.map(p=>(
            <div key={p.id} className="absolute w-2 h-2 rounded-[2px]"
              style={{
                left:`${p.x}%`, top:`${p.y}%`,
                background:`hsl(${(p.id.length*53)%360} 80% 70%)`,
                opacity: 1-Math.min(1,p.life),
                transform:`rotate(${p.life*540}deg)`
              }}/>
          ))}
        </div>
      )}

      <div className="relative z-10 h-full grid gap-6 p-6 grid-cols-[30%_1fr] xl:grid-cols-[28%_1fr] lg:grid-cols-1">
        {/* ---- Colonne gauche : catégories & filtres ---- */}
        <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 text-white/90 font-medium flex items-center justify-between">
            <span>Wiki / Lore</span>
            <Link
              href="/wiki/create"
              className="rounded-lg bg-amber-300 text-slate-900 text-xs font-medium px-2.5 py-1 hover:bg-amber-200"
            >+ Créer</Link>
          </header>

          <div className="p-3 overflow-y-auto space-y-4">
            {/* Recherche */}
            <div className="rounded-lg border border-white/15 bg-white/5 p-2">
              <input
                value={search}
                onChange={e=>setSearch(e.target.value)}
                placeholder="Rechercher un titre…"
                className="w-full rounded-md bg-white/10 border border-white/15 px-3 py-2 text-white outline-none"
              />
            </div>

            {/* Tri */}
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

            {/* Catégories */}
            {CATS.map(group=>(
              <div key={group.key} className="space-y-2">
                <button
                  onClick={() => { setCat(group.key); setSub(group.subs[0]?.key) }}
                  className={`w-full text-left rounded-lg px-3 py-2 border transition ${cat===group.key ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
                  style={{ boxShadow:`inset 0 0 0 1px ${cat===group.key?group.color:'transparent'}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
                    <span className="text-white/90">{group.label}</span>
                  </div>
                </button>
                {cat===group.key && (
                  <div className="pl-5 space-y-1">
                    {group.subs.map(s=>(
                      <button key={s.key} onClick={()=>setSub(s.key)}
                        className={`w-full text-left rounded-md px-2 py-1 border text-sm transition ${sub===s.key ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}>
                        <span className="text-white/80">{s.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Griser */}
            <div className="mt-2 p-3 rounded-lg border border-white/15 bg-white/5">
              <label className="flex items-center gap-2 text-white/80 text-sm">
                <input type="checkbox" checked={dimUncollected} onChange={e=>setDimUncollected(e.target.checked)} />
                Griser les cartes non collectées
              </label>
            </div>
          </div>
        </section>

        {/* ---- Colonne droite : grille ---- */}
        <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md overflow-hidden flex flex-col">
          <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="text-white/90 font-medium">
              {CATS.find(c=>c.key===cat)?.label} — {CATS.find(c=>c.key===cat)?.subs.find(s=>s.key===sub)?.label}
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
                  {/* recto */}
                  <Image
                    src={srcForDisplay(card.image_url)}
                    alt=""
                    fill
                    className={`object-cover ${(!collected && dimUncollected) ? 'opacity-40 grayscale' : ''}`}
                  />

                  {/* bandeau bas */}
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
              <button
                onClick={() => setPage(p => Math.max(1, p-1))}
                disabled={page<=1}
                className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 disabled:opacity-50"
              >
                Précédent
              </button>
              <div className="text-white/70 text-sm">Page {page} / {pageCount}</div>
              <button
                onClick={() => setPage(p => Math.min(pageCount, p+1))}
                disabled={page>=pageCount}
                className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 disabled:opacity-50"
              >
                Suivant
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ---- Modale carte ---- */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-white/20 bg-gradient-to-br from-slate-900/80 to-slate-800/80 backdrop-blur-md p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: currentCatColor }} />
                <h3 className="text-white text-lg font-semibold">{viewing.title}</h3>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${RARITY[viewing.rarity]?.text} ${RARITY[viewing.rarity]?.ring}`}>
                  {RARITY[viewing.rarity]?.label || viewing.rarity}
                </span>
              </div>
              <div className="flex gap-2">
                {(isAdmin || viewing.owner_id === session?.user?.id) && (
                  <Link
                    href={`/wiki/edit/${viewing.id}`}
                    className="rounded-md border border-white/20 bg-white/10 text-white px-3 py-1.5 hover:bg-white/15"
                  >
                    Éditer
                  </Link>
                )}
                <button
                  onClick={() => toggleCollect(viewing)}
                  className={`rounded-md px-3 py-1.5 text-sm border ${isCollected(viewing.id) ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/30' : 'bg-white/10 border-white/20 text-white hover:bg-white/15'}`}
                >
                  {isCollected(viewing.id) ? 'Collectée ✓' : 'Collecter'}
                </button>
                <button
                  onClick={() => setViewing(null)}
                  className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 text-white hover:bg-white/15"
                >
                  Fermer
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden ring-2" style={{ borderColor: currentCatColor }}>
                <Image src={srcForDisplay(viewing.image_url)} alt="" fill className="object-cover" />
              </div>
              <div className="text-white/90 leading-relaxed whitespace-pre-line">
                {viewing.description || <span className="text-white/50">Aucune description.</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
