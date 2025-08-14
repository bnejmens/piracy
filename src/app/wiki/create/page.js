// src/app/wiki/create/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

function slugify(s) {
  return (s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
    .slice(0,80);
}

/* -------------------- Fallback statique si DB vide -------------------- */
const STATIC_CATS = [
  {
    key: 'univers', label: 'Univers', color: '#0ea5e9',
    subs: [
      { key:'faune', label:'Faune' },
      { key:'flore', label:'Flore' },
      { key:'historique', label:'Historique' },
    ]
  },
  {
    key: 'personnages', label: 'Personnages', color: '#f59e0b',
    subs: [
      { key:'pnj',       label:'PNJ' },
      { key:'creatures', label:'Créatures' },
      { key:'groupes',   label:'Groupes' },
      {
        key:'galerie', label:'Galerie de Joueurs',
        subs: [
          { key:'Joan',  label:'Joan' },
          { key:'Sunny',     label:'Sunny' },
          { key:'Lou', label:'Lou' },
        ]
      }
    ]
  },
  {
    key: 'magie', label: 'Magie', color: '#8b5cf6',
    subs: [
      { key:'sorts',   label:'Sorts' },
      { key:'potions', label:'Potions' },
      { key:'objets',  label:'Objets magiques' },
    ]
  },
]

/* -------------------- Helpers catégories dynamiques -------------------- */
function buildTree(list) {
  // transforme une liste plate wiki_categories → arbre
  const byId = new Map(list.map(n => [n.id, { ...n, children: [] }]))
  const roots = []
  for (const n of byId.values()) {
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id).children.push(n)
    else roots.push(n)
  }
  const sortRec = (arr) => { arr.sort((a,b)=>(a.order_index??0)-(b.order_index??0)); arr.forEach(x=>sortRec(x.children)) }
  sortRec(roots)
  return roots
}
function staticToTree() {
  // convertit STATIC_CATS → arbre compatible (ids synthétiques)
  const gen = (prefix, items) => items.map((x,i) => ({
    id: `${prefix}-${x.key}-${i}`,
    parent_id: null,
    label: x.label,
    slug: x.key,
    color: x.color,
    order_index: i,
    is_active: true,
    children: x.subs?.map((s,j) => ({
      id: `${prefix}-${x.key}-${s.key}-${j}`,
      parent_id: `${prefix}-${x.key}-${i}`,
      label: s.label,
      slug: s.key,
      color: x.color,
      order_index: j,
      is_active: true,
      children: s.subs?.map((s3,k) => ({
        id: `${prefix}-${x.key}-${s.key}-${s3.key}-${k}`,
        parent_id: `${prefix}-${x.key}-${s.key}-${j}`,
        label: s3.label,
        slug: s3.key,
        color: x.color,
        order_index: k,
        is_active: true,
        children: []
      })) || []
    })) || []
  }))
  return gen('static', STATIC_CATS)
}
function findById(tree, id) {
  const stack = [...tree]
  while (stack.length) {
    const n = stack.pop()
    if (n.id === id) return n
    if (n.children?.length) stack.push(...n.children)
  }
  return null
}

/* -------------------- Raretés (visuel preview) -------------------- */
const RARITY = {
  commun:     { label: 'Commune',    ring: 'ring-gray-300/50',   text: 'text-gray-200'   },
  rare:       { label: 'Rare',       ring: 'ring-sky-300/60',    text: 'text-sky-200'    },
  epique:     { label: 'Épique',     ring: 'ring-violet-300/70', text: 'text-violet-200' },
  legendaire: { label: 'Légendaire', ring: 'ring-amber-300/80',  text: 'text-amber-200'  },
}

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

/* -------------------- UI Field -------------------- */
function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-white/80">{label}</div>
      {children}
    </div>
  )
}

export default function CreateCardPage() {
  const router = useRouter()

  // Session
  const [userId, setUserId] = useState(null)
  useEffect(() => {
    let ignore = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!ignore) setUserId(session?.user?.id ?? null)
      if (!session) router.replace('/auth')
    })()
    return () => { ignore = true }
  }, [router])

  // Catégories dynamiques
  const [tree, setTree] = useState([])        // tableau de racines
  const [catsLoading, setCatsLoading] = useState(true)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      setCatsLoading(true)
      const { data, error } = await supabase
        .from('wiki_categories')
        .select('id,parent_id,label,slug,color,order_index,is_active')
        .order('order_index', { ascending: true })
      if (ignore) return
      if (error) {
        // fallback statique en cas d’erreur
        setTree(staticToTree())
        setCatsLoading(false)
        return
      }
      const onlyActive = (data || []).filter(x => x.is_active !== false)
      if (!onlyActive.length) {
        setTree(staticToTree())  // fallback si vide
      } else {
        setTree(buildTree(onlyActive))
      }
      setCatsLoading(false)
    })()
    return () => { ignore = true }
  }, [])

async function refreshCats() {
  const { data, error } = await supabase
    .from('wiki_categories')
    .select('id,parent_id,label,slug,color,order_index,is_active')
    .order('order_index', { ascending: true });
  if (error) { setTree(staticToTree()); return; }
  const onlyActive = (data||[]).filter(x => x.is_active !== false);
  setTree(onlyActive.length ? buildTree(onlyActive) : staticToTree());
}

async function createCategory(level) {
  if (!newLabel.trim()) return;
  const parent_id = level==='l1' ? null
                  : level==='l2' ? l1
                  : l2 || null;

  // ordre = fin de liste
  const parentNode = parent_id ? findById(tree, parent_id) : null;
  const order_index = parentNode ? (parentNode.children?.length || 0) : (roots?.length || 0);

  // couleur: hérite du parent si dispo
  const color = parentNode?.color || newColor;

  const baseSlug = slugify(newLabel);
  let slug = baseSlug;
  // tentative simple d’unicité globale
  for (let i=2;; i++) {
    const { data: exists } = await supabase
      .from('wiki_categories')
      .select('id').eq('slug', slug).limit(1);
    if (!exists?.length) break;
    slug = `${baseSlug}-${i}`;
    if (i>20) break;
  }

  const { error } = await supabase.from('wiki_categories').insert({
    parent_id, label: newLabel.trim(), slug, color, order_index
  });
  if (error) { alert(error.message); return; }

  resetNew();
  await refreshCats();
}

  // Sélections (ids)
  const roots = tree
  const firstRootId = roots?.[0]?.id || null
  const [l1, setL1] = useState(null)       // id niveau 1
  const l1Node = useMemo(() => findById(tree, l1), [tree, l1])
  const l2List = l1Node?.children || []
  const firstL2Id = l2List?.[0]?.id || null
  const [l2, setL2] = useState(null)       // id niveau 2
  const l2Node = useMemo(() => findById(tree, l2), [tree, l2])
  const l3List = l2Node?.children || []
  const [l3, setL3] = useState('')         // id niveau 3 (string vide = aucune)

const [showNew, setShowNew] = useState({ l1:false, l2:false, l3:false });
const [newLabel, setNewLabel] = useState('');
const [newColor, setNewColor] = useState('#8b5cf6'); // défaut
const resetNew = () => { setShowNew({l1:false,l2:false,l3:false}); setNewLabel(''); };


  // init selection après chargement
  useEffect(() => {
    if (catsLoading) return
    setL1(prev => prev || firstRootId)
  }, [catsLoading, firstRootId])
  useEffect(() => {
    // quand L1 change, on initialise L2 et on reset L3
    setL2(l1Node?.children?.[0]?.id || null)
    setL3('')
  }, [l1]) // eslint-disable-line
  useEffect(() => {
    // quand L2 change, reset L3
    setL3('')
  }, [l2])

  // Form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rarity, setRarity] = useState('commun')
  const [imageUrl, setImageUrl] = useState('')

  const rarityDef = RARITY[rarity] || RARITY.commun
  const currentCatColor = l1Node?.color || '#60a5fa'
  const showLevel3 = (l3List?.length || 0) > 0

  // UI: pills générées depuis l’arbre
  const CategoryPills = () => (
    <div className="space-y-3">
<div className="flex items-center justify-between">
  <div className="text-white/80 text-sm">Catégories</div>
  <button onClick={()=>setShowNew(s=>({...s,l1:true}))}
    className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white">
    + Nouvelle
  </button>
</div>
      <div className="flex flex-wrap gap-2">
        {roots.map(c => (
          <button
            key={c.id}
            onClick={() => { setL1(c.id) }}
            className={`px-3 py-1.5 rounded-full border transition
              ${l1===c.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
            style={{ boxShadow:`inset 0 0 0 1px ${l1===c.id?(c.color||currentCatColor):'transparent'}` }}
          >
            <span className="inline-flex items-center gap-2 text-white/90">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color || currentCatColor }} />
              {c.label}
            </span>
          </button>
        ))}
      </div>

<div className="flex items-center justify-between mt-4">
  <div className="text-white/80 text-sm">Sous-catégories</div>
  <button onClick={()=> l1 && setShowNew(s=>({...s,l2:true}))}
    disabled={!l1}
    className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white disabled:opacity-50">
    + Nouvelle
  </button>
</div>
      <div className="flex flex-wrap gap-2">
        {l2List.map(s => (
          <button
            key={s.id}
            onClick={() => { setL2(s.id); setL3('') }}
            className={`px-2.5 py-1.5 rounded-full border text-sm transition
              ${l2===s.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
          >
            <span className="text-white/85">{s.label}</span>
          </button>
        ))}
      </div>

      {showLevel3 && (
        <>
<div className="flex items-center justify-between mt-4">
  <div className="text-white/80 text-sm">Sous-sous-catégories (optionnel)</div>
  <button onClick={()=> l2 && setShowNew(s=>({...s,l3:true}))}
    disabled={!l2}
    className="text-xs px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white disabled:opacity-50">
    + Nouvelle
  </button>
</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setL3('')}
              className={`px-2.5 py-1.5 rounded-full border text-sm transition
                ${l3==='' ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
            >
              Aucune
            </button>
            {l3List.map(s3 => (
              <button
                key={s3.id}
                onClick={() => setL3(s3.id)}
                className={`px-2.5 py-1.5 rounded-full border text-sm transition
                  ${l3===s3.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}`}
              >
                {s3.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )


const submit = async () => {
  // Récupération sûre du userId
  let uid = userId;
  if (!uid) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) { console.error(authErr); return; }
    uid = user?.id || null;
  }
  if (!uid) return;

  // Résolution des noeuds L1/L2/L3 depuis l'arbre UI
  const catNode  = findById(tree, l1);
  const subNode  = l2 ? findById(tree, l2) : null;
  const sub2Node = l3 ? findById(tree, l3) : null;

  // On enregistre les keys (pas les node ids)
  const payload = {
    owner_id: uid,
    title: (title || '').trim(),
    description: (description || '').trim(),
    category: catNode?.slug || catNode?.key || null,
    subcategory: subNode?.slug || subNode?.key || null,
    sub_subcategory: sub2Node?.slug || sub2Node?.key || null,
    rarity,
    image_url: (imageUrl || '').trim() || null,
  };
  delete payload.category_id;
  delete payload.subcategory_id;
  delete payload.sub_subcategory_id;

  const { error } = await supabase.from('cards').insert(payload);
  if (error) {
    console.error(error);
    alert(error.message || 'Échec de la création');
    return;
  }
  router.push('/wiki');
};
const NewCatModal = ({ level }) => {
  const title = level==='l1' ? 'Nouvelle catégorie'
              : level==='l2' ? 'Nouvelle sous-catégorie'
              : 'Nouvelle sous-sous-catégorie';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={resetNew} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-slate-900 border border-white/15 p-5">
        <h3 className="text-white text-lg font-semibold mb-4">{title}</h3>
        <div className="space-y-3">
          <div>
            <div className="text-sm text-white/80 mb-1">Libellé</div>
            <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
              value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="ex: Bestiaire marin" />
          </div>
          {level==='l1' && (
            <div>
              <div className="text-sm text-white/80 mb-1">Couleur (niveau 1)</div>
              <input type="color" className="w-16 h-10 p-0 bg-transparent border border-white/20 rounded"
                value={newColor} onChange={e=>setNewColor(e.target.value)} />
            </div>
          )}
        </div>
        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={resetNew} className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white">
            Annuler
          </button>
          <button onClick={()=>createCategory(level)} disabled={!newLabel.trim()}
            className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50">
            Créer
          </button>
        </div>
      </div>
    </div>
  );
};


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
            <button
              onClick={() => router.back()}
              className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white"
            >
              Retour
            </button>
            <button
              onClick={submit}
              disabled={!userId || !title.trim()}
              className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50"
            >
              Créer
            </button>
          </div>
        </div>

        {/* Grille 2 colonnes : à gauche les contrôles, à droite la preview carte */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panneau gauche : form + pills */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 space-y-6">
            {catsLoading ? (
              <div className="text-white/70 text-sm">Chargement des catégories…</div>
            ) : (
              <CategoryPills />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Titre">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre de la carte"
                />
              </Field>

              <Field label="Rareté">
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={rarity} onChange={e=>setRarity(e.target.value)}
                >
                  <option value="commun" className="text-slate-900">Commun</option>
                  <option value="rare" className="text-slate-900">Rare</option>
                  <option value="epique" className="text-slate-900">Épique</option>
                  <option value="legendaire" className="text-slate-900">Légendaire</option>
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea
                    className="w-full min-h-28 rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                    value={description} onChange={e=>setDescription(e.target.value)}
                    placeholder="Description (Markdown ou texte)"
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Image (URL)">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                    value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..."
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Panneau droit : preview visuelle de la carte */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5">
            <div className="text-white/80 text-sm mb-3">Aperçu</div>
            <div
              className={`relative aspect-[4/5] rounded-xl overflow-hidden ring-2 ${rarityDef.ring}`}
              style={{ borderColor: currentCatColor }}
              title={title || 'Aperçu'}
            >
              <Image
                src={srcForDisplay(imageUrl)}
                alt=""
                fill
                className="object-cover"
              />
              {/* bandeau bas */}
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

              {/* pastille catégorie */}
              <div className="absolute top-2 left-2 inline-flex items-center gap-2 text-[11px] px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: currentCatColor }} />
                {l1Node?.label || 'Catégorie'}
                {l2Node ? ` • ${l2Node.label}` : ''}
                {l3 ? ` • ${(findById(tree, l3)?.label || '')}` : ''}
              </div>
            </div>
          </section>
        </div>
      </div>

{showNew.l1 && <NewCatModal level="l1" />}
{showNew.l2 && <NewCatModal level="l2" />}
{showNew.l3 && <NewCatModal level="l3" />}

    </main>
  )
}
