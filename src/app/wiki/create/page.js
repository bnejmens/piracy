// src/app/wiki/create/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

/* -------------------- Utils / taxonomie (identiques à /wiki) -------------------- */
function norm(s){return (s||'').toString().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function slugify(s){const n=norm(s);return n.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'x'}
function colorFromString(s){const base=['#0ea5e9','#f59e0b','#8b5cf6','#10b981','#ef4444','#22d3ee','#a3e635','#f472b6'];let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return base[h%base.length]}

// seed toujours visible (même sans cartes)
function seedTree(){
  return [
    { id:'cat-univers', slug:'univers', label:'Univers', color:'#0ea5e9', children:[
      { id:'cat-univers-fauneetflore', slug:'faune-et-flore', label:'Faune et Flore', color:'#0ea5e9', children:[] },
      { id:'cat-univers-navires', slug:'navires', label:'Navires', color:'#0ea5e9', children:[] },
      { id:'cat-univers-historique', slug:'historique', label:'Historique', color:'#0ea5e9', children:[] },
    ]},
    { id:'cat-personnages', slug:'personnages', label:'Personnages', color:'#f59e0b', children:[
      { id:'cat-personnages-pnj', slug:'pnj', label:'PNJ', color:'#f59e0b', children:[] },
      { id:'cat-personnages-scenarii', slug:'scenarii', label:'Scenarii', color:'#f59e0b', children:[] },
      { id:'cat-personnages-groupes', slug:'equipages-et-groupes', label:'Equipages et Groupes', color:'#f59e0b', children:[] },
    ]},
    { id:'cat-jouabilite', slug:'jouabilite', label:'Jouabilité', color:'#8b5cf6', children:[
      { id:'cat-jouabilite-regles', slug:'regles-et-must-do', label:'Règles et Must Do', color:'#8b5cf6', children:[] },
      { id:'cat-jouabilite-lieux', slug:'lieux', label:'Lieux', color:'#8b5cf6', children:[] },
      { id:'cat-jouabilité-intrigues', slug:'intrigues', label:'Intrigues', color:'#8b5cf6', children:[] },
    ]},
  ]
}

function buildTreeFromCardsMerged(cards){
  const roots = seedTree()
  const byL1 = new Map(), byL2 = new Map()
  for(const r of roots){ byL1.set(r.slug, r); for(const s of r.children||[]) byL2.set(`${r.slug}::${s.slug}`, s) }

  for(const c of (cards||[])){
    const c1Label=(c.category||'').trim()||'Divers', c1=slugify(c1Label)
    const c2Label=(c.subcategory||'').trim(),       c2=c2Label?slugify(c2Label):''
    const c3Label=(c.sub_subcategory||'').trim(),   c3=c3Label?slugify(c3Label):''

    if(!byL1.has(c1)){
      const color=(['univers','personnages','magie'].includes(c1))?(c1==='univers'?'#0ea5e9':c1==='personnages'?'#f59e0b':'#8b5cf6'):colorFromString(c1)
      const node={ id:`cat-${c1}`, slug:c1, label:c1Label, color, children:[] }
      roots.push(node); byL1.set(c1,node)
    }
    const n1=byL1.get(c1)

    if(c2){
      const key=`${c1}::${c2}`
      if(!byL2.has(key)){
        const node={ id:`cat-${c1}-${c2}`, slug:c2, label:c2Label, color:n1.color, children:[] }
        n1.children.push(node); byL2.set(key,node)
      }
      const n2=byL2.get(key)
      if(c3 && !(n2.children||[]).some(n=>n.slug===c3)){
        n2.children.push({ id:`cat-${c1}-${c2}-${c3}`, slug:c3, label:c3Label, color:n1.color, children:[] })
      }
    }
  }
  const sortRec=arr=>{arr.sort((a,b)=>norm(a.label).localeCompare(norm(b.label))); arr.forEach(x=>sortRec(x.children||[]))}
  sortRec(roots)
  return roots
}

function findById(tree, id){
  if(!id) return null
  const st=[...tree]
  while(st.length){ const n=st.pop(); if(n.id===id) return n; if(n.children?.length) st.push(...n.children) }
  return null
}

/* -------------------- Rareté + image -------------------- */
const RARITY={commun:{label:'Commune',ring:'ring-gray-300/50',text:'text-gray-200'},rare:{label:'Rare',ring:'ring-sky-300/60',text:'text-sky-200'},epique:{label:'Épique',ring:'ring-violet-300/70',text:'text-violet-200'},legendaire:{label:'Légendaire',ring:'ring-amber-300/80',text:'text-amber-200'}}
function srcForDisplay(url){ if(!url) return '/images/card-bg.png'; try{const u=new URL(url); const isSupabase=u.hostname.endsWith('.supabase.co'); return isSupabase?url:`/api/img?u=${encodeURIComponent(url)}`}catch{return `/api/img?u=${encodeURIComponent(url)}`}}

function Field({label,children}){return(<div className="space-y-2"><div className="text-sm text-white/80">{label}</div>{children}</div>)}

/* ======================================================================= */

export default function CreateCardPage(){
  const router=useRouter()

  // Session
  const [userId,setUserId]=useState(null)
  useEffect(()=>{let ignore=false; (async()=>{
    const {data:{session}}=await supabase.auth.getSession()
    if(!ignore){ setUserId(session?.user?.id||null); if(!session) router.replace('/auth') }
  })(); return ()=>{ignore=true}},[router])

  // Arbre (seed + cartes) — même logique que /wiki
  const [tree,setTree]=useState([])
  const [loadingCats,setLoadingCats]=useState(true)

  async function reloadTree(){
    setLoadingCats(true)
    const { data: cards } = await supabase
      .from('cards')
      .select('category, subcategory, sub_subcategory')
      .limit(10000)
    setTree(buildTreeFromCardsMerged(cards||[]))
    setLoadingCats(false)
  }

  useEffect(()=>{ reloadTree() },[])

  // Sélections
  const roots=tree
  const [l1,setL1]=useState(null)
  const l1Node=useMemo(()=>findById(tree,l1),[tree,l1])
  const l2List=l1Node?.children||[]
  const [l2,setL2]=useState(null)
  const l2Node=useMemo(()=>findById(tree,l2),[tree,l2])
  const l3List=l2Node?.children||[]
  const [l3,setL3]=useState('')

  useEffect(()=>{ if(!loadingCats && roots?.length && !l1) setL1(roots[0].id) },[loadingCats,roots,l1])
  useEffect(()=>{ setL2(l1Node?.children?.[0]?.id||null); setL3('') },[l1])
  useEffect(()=>{ setL3('') },[l2])

  // Form carte
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [rarity,setRarity]=useState('commun')
  const [imageUrl,setImageUrl]=useState('')

  const rarityDef=RARITY[rarity]||RARITY.commun
  const currentCatColor=l1Node?.color||'#60a5fa'

  /* ---------- Création “cat/sub/sub2” = on crée une CARTE stub tout de suite ---------- */
  const [newLabel,setNewLabel]=useState('')
  const [newLevel,setNewLevel]=useState(null) // 'l1' | 'l2' | 'l3' | null

  const createStubCard = async (level) => {
    if(!userId){ alert('Session requise'); return }
    const label=(newLabel||'').trim()
    if(!label){ setNewLevel(null); return }

    // Déterminer la cible (cat/sub/sub2) en texte
    let cat = l1Node?.label || 'Divers'
    let sub = l2Node?.label || ''
    let sub2 = (l3 && findById(tree,l3)?.label) || ''

    if(level==='l1'){ cat=label; sub=''; sub2='' }
    if(level==='l2'){ if(!l1Node){ alert('Choisis d’abord une catégorie'); return } sub=label; sub2='' }
    if(level==='l3'){ if(!l2Node){ alert('Choisis d’abord une sous-catégorie'); return } sub2=label }

    const payload = {
      owner_id: userId,
      title: `📁 ${cat}${sub?` / ${sub}`:''}${sub2?` / ${sub2}`:''}`,
      description: 'Entrée de catégorie (carte générique). Vous pouvez éditer ou ajouter de vraies cartes ensuite.',
      category: cat, subcategory: sub || null, sub_subcategory: sub2 || null,
      rarity: 'commun',
      image_url: null,
    }

    const { error } = await supabase.from('cards').insert(payload)
    if(error){ alert(error.message||'Échec création'); return }

    setNewLabel(''); setNewLevel(null)
    await reloadTree()

    // Re-sélectionne la nouvelle branche
    const s1 = slugify(cat), s2 = sub?slugify(sub):'', s3 = sub2?slugify(sub2):''
    const l1Id = `cat-${s1}`
    const l2Id = s2 ? `cat-${s1}-${s2}` : null
    const l3Id = s3 ? `cat-${s1}-${s2}-${s3}` : ''
    setL1(l1Id); if(l2Id) setL2(l2Id); setL3(l3Id)
  }

  /* ---------- Soumission carte normale ---------- */
  const submit = async () => {
    if(!userId){ alert('Session requise'); return }
    const catNode=findById(tree,l1), subNode=l2?findById(tree,l2):null, sub2Node=l3?findById(tree,l3):null

    const safeTitle = (title||'').trim() || `Nouvelle carte`
    const safeDesc  = (description||'').trim() || `Carte créée par l’utilisateur.`
    const payload = {
      owner_id: userId,
      title: safeTitle,
      description: safeDesc,
      category: catNode?.label || 'Divers',
      subcategory: subNode?.label || null,
      sub_subcategory: sub2Node?.label || null,
      rarity,
      image_url: (imageUrl||'').trim() || null,
    }
    const { error } = await supabase.from('cards').insert(payload)
    if(error){ alert(error.message||'Échec de la création'); return }
    router.push('/wiki')
  }

  /* ---------- UI ---------- */
  const CategoryPills = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-white/80 text-sm">Catégories</div>
        <button onClick={()=>setNewLevel('l1')} className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white">+ Nouvelle</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {roots.map(c=>(
          <button key={c.id} onClick={()=>setL1(c.id)}
            className={`px-3 py-1.5 rounded-full border transition ${l1===c.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'}`}
            style={{boxShadow:`inset 0 0 0 1px ${l1===c.id?(c.color||currentCatColor):'transparent'}`}}>
            <span className="inline-flex items-center gap-2 text-white/90">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:c.color||currentCatColor}} />
              {c.label}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-white/80 text-sm">Sous-catégories</div>
        <button onClick={()=>l1 && setNewLevel('l2')} disabled={!l1}
          className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white disabled:opacity-50">+ Nouvelle</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {l2List.map(s=>(
          <button key={s.id} onClick={()=>{setL2(s.id); setL3('')}}
            className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l2===s.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'}`}>
            <span className="text-white/85">{s.label}</span>
          </button>
        ))}
      </div>

      {(l2List?.length||0)>0 && (
        <>
          <div className="flex items-center justify-between mt-4">
            <div className="text-white/80 text-sm">Sous-sous-catégories (optionnel)</div>
            <button onClick={()=>l2 && setNewLevel('l3')} disabled={!l2}
              className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white disabled:opacity-50">+ Nouvelle</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=>setL3('')}
              className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l3===''?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'}`}>
              Aucune
            </button>
            {l3List.map(s3=>(
              <button key={s3.id} onClick={()=>setL3(s3.id)}
                className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l3===s3.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'}`}>
                {s3.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  return (
    <main className="fixed inset-0 overflow-auto bg-slate-950">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/lore-bg.webp" alt="" fill priority className="object-cover opacity-60" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/40 via-slate-900/25 to-slate-950/50" />

      <div className="relative z-10 max-w-6xl mx-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-white text-2xl font-semibold">Créer une carte</h1>
          <div className="flex gap-3">
            <button onClick={()=>router.back()} className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white">Retour</button>
            <button onClick={submit} disabled={!userId} className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50">Créer</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* gauche */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 space-y-6">
            {loadingCats ? (
              <div className="text-white/70 text-sm">Chargement des catégories…</div>
            ) : (
              <CategoryPills />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Titre">
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                       value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre de la carte" />
              </Field>

              <Field label="Rareté">
                <select className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                        value={rarity} onChange={e=>setRarity(e.target.value)}>
                  <option value="commun" className="text-slate-900">Commun</option>
                  <option value="rare" className="text-slate-900">Rare</option>
                  <option value="epique" className="text-slate-900">Épique</option>
                  <option value="legendaire" className="text-slate-900">Légendaire</option>
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea className="w-full min-h-28 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                            value={description} onChange={e=>setDescription(e.target.value)}
                            placeholder="Description (Markdown ou texte)" />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Image (URL)">
                  <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                         value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..." />
                </Field>
              </div>
            </div>
          </section>

          {/* droite : preview */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5">
            <div className="text-white/80 text-sm mb-3">Aperçu</div>
            <div className={`relative aspect-[4/5] rounded-xl overflow-hidden ring-2 ${rarityDef.ring}`}
                 style={{ borderColor: currentCatColor }} title={title || 'Aperçu'}>
              <Image src={srcForDisplay(imageUrl)} alt="" fill className="object-cover" />
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-white font-medium truncate">{title || 'Titre de la carte'}</div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${rarityDef.text} ${rarityDef.ring}`}>
                    {RARITY[rarity]?.label || 'Commune'}
                  </span>
                </div>
                <div className="mt-1 text-white/80 text-xs line-clamp-2">
                  {description || 'Votre description apparaîtra ici.'}
                </div>
              </div>
              <div className="absolute top-2 left-2 inline-flex items-center gap-2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: currentCatColor }} />
                {l1Node?.label || 'Catégorie'}{l2Node?` • ${l2Node.label}`:''}{l3?` • ${(findById(tree,l3)?.label||'')}`:''}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Modale "nouvelle catégorie/sous-cat/sous-sous-cat" → crée une CARTE stub dans cards */}
      {newLevel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={()=>{setNewLevel(null); setNewLabel('')}} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5">
            <h3 className="text-white text-lg font-semibold mb-4">
              {newLevel==='l1'?'Nouvelle catégorie':newLevel==='l2'?'Nouvelle sous-catégorie':'Nouvelle sous-sous-catégorie'}
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/80 mb-1">Libellé</div>
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                       value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="ex: Bestiaire des Ombres" />
                <small className="text-white/60">Slug prévisionnel : {slugify(newLabel)}</small>
              </div>
            </div>
            <div className="mt-5 flex gap-3 justify-end">
              <button onClick={()=>{setNewLevel(null); setNewLabel('')}}
                      className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white">Annuler</button>
              <button onClick={()=>createStubCard(newLevel)} disabled={!newLabel.trim()}
                      className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50">Créer</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
