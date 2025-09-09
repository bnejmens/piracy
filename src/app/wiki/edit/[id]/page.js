// src/app/wiki/edit/[id]/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

/* -------------------- Utils / taxonomie (identiques à /wiki & /wiki/create) -------------------- */
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

/* -------------------- Raretés + image -------------------- */
const RARITY={commun:{label:'Commune',ring:'ring-gray-300/50',text:'text-gray-200'},rare:{label:'Rare',ring:'ring-sky-300/60',text:'text-sky-200'},epique:{label:'Épique',ring:'ring-violet-300/70',text:'text-violet-200'},legendaire:{label:'Légendaire',ring:'ring-amber-300/80',text:'text-amber-200'}}
function srcForDisplay(url){ if(!url) return '/images/card-bg.png'; try{const u=new URL(url); const isSupabase=u.hostname.endsWith('.supabase.co'); return isSupabase?url:`/api/img?u=${encodeURIComponent(url)}`}catch{return `/api/img?u=${encodeURIComponent(url)}`}}

function Field({label,children}){return(<div className="space-y-2"><div className="text-sm text-white/80">{label}</div>{children}</div>)}

/* ======================================================================= */

export default function EditCardPage(){
  const router = useRouter()
  const params = useParams()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id

  // Session / profil
  const [userId,setUserId]=useState(null)
  const [isAdmin,setIsAdmin]=useState(false)
  useEffect(()=>{let ignore=false;(async()=>{
    const {data:{session}}=await supabase.auth.getSession()
    if(!session){ router.replace('/auth'); return }
    if(!ignore){ setUserId(session.user.id) }
    const { data: me } = await supabase.from('profiles').select('is_admin').eq('user_id', session.user.id).maybeSingle()
    if(!ignore){ setIsAdmin(!!me?.is_admin) }
  })(); return ()=>{ignore=true}},[router])

  // Charger la carte à éditer
  const [ownerId,setOwnerId]=useState(null)
  const [title,setTitle]=useState('')
  const [description,setDescription]=useState('')
  const [rarity,setRarity]=useState('commun')
  const [imageUrl,setImageUrl]=useState('')

  const [pendingCats,setPendingCats]=useState({c1:null,c2:null,c3:null}) // libellés de la carte pour présélection

  const [loading,setLoading]=useState(true)
  useEffect(()=>{let ignore=false;(async()=>{
    if(!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('cards')
      .select('id, owner_id, title, description, category, subcategory, sub_subcategory, rarity, image_url')
      .eq('id', id)
      .maybeSingle()
    if (!ignore){
      if(error || !data){ alert(error?.message || 'Carte introuvable'); router.back(); return }
      setOwnerId(data.owner_id||null)
      setTitle(data.title||'')
      setDescription(data.description||'')
      setRarity(data.rarity||'commun')
      setImageUrl(data.image_url||'')
      setPendingCats({ c1: data.category||null, c2: data.subcategory||null, c3: data.sub_subcategory||null })
      setLoading(false)
    }
  })(); return ()=>{ignore=true}},[id, router])

  // Arbre (seed + cartes) — même logique que /wiki & /wiki/create
  const [tree,setTree]=useState([])
  const [catsLoading,setCatsLoading]=useState(true)
  async function reloadTree(){
    setCatsLoading(true)
    const { data: cards } = await supabase
      .from('cards')
      .select('category, subcategory, sub_subcategory')
      .limit(10000)
    setTree(buildTreeFromCardsMerged(cards||[]))
    setCatsLoading(false)
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

  // Initialiser sélections dès que l’arbre ET la carte sont chargés
  useEffect(()=>{
    if(catsLoading || loading || !roots.length) return
    // 1) L1
    let l1Id = roots[0].id
    if(pendingCats.c1){
      const s1 = slugify(pendingCats.c1)
      const m = roots.find(r=>r.slug===s1 || norm(r.label)===norm(pendingCats.c1))
      if(m) l1Id = m.id
    }
    setL1(l1Id)
    // 2) L2
    const n1 = findById(tree, l1Id)
    let l2Id = n1?.children?.[0]?.id || null
    if(pendingCats.c2){
      const s2 = slugify(pendingCats.c2)
      const m2 = (n1?.children||[]).find(n=>n.slug===s2 || norm(n.label)===norm(pendingCats.c2))
      if(m2) l2Id = m2.id
    }
    setL2(l2Id)
    // 3) L3
    let l3Id = ''
    if(l2Id && pendingCats.c3){
      const n2 = findById(tree, l2Id)
      const s3 = slugify(pendingCats.c3)
      const m3 = (n2?.children||[]).find(n=>n.slug===s3 || norm(n.label)===norm(pendingCats.c3))
      if(m3) l3Id = m3.id
    }
    setL3(l3Id)
  },[catsLoading,loading,roots,tree,pendingCats])

  // Droits d’édition selon RLS (owner OU admin)
  const canEdit = !!userId && (isAdmin || (ownerId && ownerId === userId))

  const currentCatColor = l1Node?.color || '#60a5fa'
  const rarityDef = RARITY[rarity] || RARITY.commun
  const showLevel3 = (l3List?.length || 0) > 0

  // Sauvegarde (texte only — pas de *_id)
  const save = async () => {
    if(!id) return
    if(!canEdit){ alert("Vous n'avez pas les droits pour modifier cette carte."); return }
    const catNode=findById(tree,l1), subNode=l2?findById(tree,l2):null, sub2Node=l3?findById(tree,l3):null
    const upd = {
      title: (title||'').trim(),
      description: (description||'').trim(),
      category: catNode?.label || 'Divers',
      subcategory: subNode?.label || null,
      sub_subcategory: sub2Node?.label || null,
      rarity,
      image_url: (imageUrl||'').trim() || null,
    }
    const { error } = await supabase.from('cards').update(upd).eq('id', id)
    if(error){ alert(error.message || 'Échec de la sauvegarde'); return }
    // Retour à /wiki ou simple toast
    router.push('/wiki')
  }

  /* -------------------- UI -------------------- */
  const CategoryPills = () => (
    <div className="space-y-3">
      <div className="text-white/80 text-sm">Catégories</div>
      <div className="flex flex-wrap gap-2">
        {roots.map(c=>(
          <button key={c.id} onClick={()=>{ if(!canEdit) return; setL1(c.id); setL2(c.children?.[0]?.id||null); setL3('') }}
            className={`px-3 py-1.5 rounded-full border transition ${l1===c.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'} ${!canEdit?'opacity-60 cursor-not-allowed':''}`}
            style={{boxShadow:`inset 0 0 0 1px ${l1===c.id?(c.color||currentCatColor):'transparent'}`}}>
            <span className="inline-flex items-center gap-2 text-white/90">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{background:c.color||currentCatColor}} />
              {c.label}
            </span>
          </button>
        ))}
      </div>

      <div className="text-white/80 text-sm mt-4">Sous-catégories</div>
      <div className="flex flex-wrap gap-2">
        {l2List.map(s=>(
          <button key={s.id} onClick={()=>{ if(!canEdit) return; setL2(s.id); setL3('') }}
            className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l2===s.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'} ${!canEdit?'opacity-60 cursor-not-allowed':''}`}>
            <span className="text-white/85">{s.label}</span>
          </button>
        ))}
      </div>

      {showLevel3 && (
        <>
          <div className="text-white/80 text-sm mt-4">Sous-sous-catégories (optionnel)</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=> canEdit && setL3('')}
              className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l3===''?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'} ${!canEdit?'opacity-60 cursor-not-allowed':''}`}>
              Aucune
            </button>
            {l3List.map(s3=>(
              <button key={s3.id} onClick={()=> canEdit && setL3(s3.id)}
                className={`px-2.5 py-1.5 rounded-full border text-sm transition ${l3===s3.id?'bg-white/15 border-white/30':'bg-white/5 border-white/15 hover:bg-white/10'} ${!canEdit?'opacity-60 cursor-not-allowed':''}`}>
                {s3.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  if(loading) return <div className="p-6 text-slate-200">Chargement…</div>

  return (
    <main className="fixed inset-0 overflow-auto bg-slate-950">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/lore-bg.webp" alt="" fill priority className="object-cover opacity-60" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/40 via-slate-900/25 to-slate-950/50" />

      <div className="relative z-10 max-w-6xl mx-auto p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-white text-2xl font-semibold">Modifier la carte</h1>
          <div className="flex items-center gap-4">
            <button onClick={()=>router.back()} className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white">Retour</button>
            <button onClick={save} disabled={!canEdit} className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50">Enregistrer</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* gauche */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 space-y-6">
            <CategoryPills />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Titre">
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre de la carte" disabled={!canEdit} />
              </Field>

              <Field label="Rareté">
                <select className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={rarity} onChange={e=>setRarity(e.target.value)} disabled={!canEdit}>
                  <option value="commun" className="text-slate-900">Commun</option>
                  <option value="rare" className="text-slate-900">Rare</option>
                  <option value="epique" className="text-slate-900">Épique</option>
                  <option value="legendaire" className="text-slate-900">Légendaire</option>
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea className="w-full min-h-28 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                    value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (Markdown ou texte)" disabled={!canEdit} />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Image (URL)">
                  <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                    value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..." disabled={!canEdit} />
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
    </main>
  )
}
