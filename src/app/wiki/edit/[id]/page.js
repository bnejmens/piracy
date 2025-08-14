// src/app/wiki/edit/[id]/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

/* -------------------- Helpers catégories dynamiques -------------------- */
function buildTree(list) {
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
  // fallback minimal si la table est vide — ALIGNÉ avec /wiki/create et /wiki/page
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
            { key:'Sunny', label:'Sunny' },
            { key:'Lou',   label:'Lou' },
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
  ];
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
  }));
  return gen('static', STATIC_CATS);
}

// Helper: retrouver un noeud par id dans l'arbre
function findById(tree, id) {
  if (!id || !Array.isArray(tree)) return null;
  const stack = [...tree];
  while (stack.length) {
    const n = stack.pop();
    if (n?.id === id) return n;
    if (n?.children?.length) stack.push(...n.children);
  }
  return null;
}

// Normalisation simple (pour comparer slug/label)
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// Trouver un enfant par valeur (slug OU label)
function findChildByValue(list, value) {
  const v = norm(value);
  return (list || []).find(
    (n) => norm(n.slug) === v || norm(n.label) === v
  ) || null;
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

export default function EditCardPage() {
  const router = useRouter()
  const routeParams = useParams()
  const id = Array.isArray(routeParams?.id) ? routeParams.id[0] : routeParams?.id

  // Session / owner
  const [sessionUserId, setSessionUserId] = useState(null)
  const [ownerId, setOwnerId] = useState(null)

  // Form
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rarity, setRarity] = useState('commun')
  const [imageUrl, setImageUrl] = useState('')

  // Cat tree
  const [tree, setTree] = useState([])
  const [catsLoading, setCatsLoading] = useState(true)

  // Sélections (ids)
  const roots = tree
  const [l1, setL1] = useState(null) // id niveau 1
  const l1Node = useMemo(() => findById(tree, l1), [tree, l1])
  const l2List = l1Node?.children || []
  const [l2, setL2] = useState(null) // id niveau 2
  const l2Node = useMemo(() => findById(tree, l2), [tree, l2])
  const l3List = l2Node?.children || []
  const [l3, setL3] = useState('')   // id niveau 3 ('' = aucune)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Load session
  useEffect(() => {
    let ignore = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.replace('/auth')
      if (!ignore) setSessionUserId(session?.user?.id ?? null)
    })()
    return () => { ignore = true }
  }, [router])

  // Load categories
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
        setTree(staticToTree())
        setCatsLoading(false)
        return
      }
      const onlyActive = (data || []).filter(x => x.is_active !== false)
      setTree(onlyActive.length ? buildTree(onlyActive) : staticToTree())
      setCatsLoading(false)
    })()
    return () => { ignore = true }
  }, [])

 // Load card
useEffect(() => {
  let ignore = false
  if (!id) return
  ;(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('cards')
      .select('id, owner_id, title, description, category, subcategory, sub_subcategory, rarity, image_url, category_id, subcategory_id, sub_subcategory_id')
      .eq('id', id)
      .maybeSingle()

    if (!ignore) {
      if (error || !data) {
        setMsg(error?.message || 'Carte introuvable')
        setLoading(false)
        return
      }
      setOwnerId(data.owner_id ?? null)
      setTitle(data.title ?? '')
      setDescription(data.description ?? '')
      setRarity(data.rarity ?? 'commun')
      setImageUrl(data.image_url ?? '')

      // On stocke ce qu'il faut pour présélectionner plus tard (quand l'arbre sera prêt)
      setPendingLabels({
        l1: data.category || null,
        l2: data.subcategory || null,
        l3: data.sub_subcategory || null,
        l1Id: data.category_id || null,
        l2Id: data.subcategory_id || null,
        l3Id: data.sub_subcategory_id || null,
      })

      setLoading(false)
    }
  })()
  return () => { ignore = true }
}, [id])


  // Faire correspondre la carte aux catégories (IDs d'abord, sinon slug/label)
const [pendingLabels, setPendingLabels] = useState({
  l1: null, l2: null, l3: null,
  l1Id: null, l2Id: null, l3Id: null,
})

useEffect(() => {
  if (catsLoading || !tree.length) return;
  if (!pendingLabels.l1 && !pendingLabels.l2 && !pendingLabels.l1Id && !pendingLabels.l2Id) return;

  let l1Id = null, l2Id = null, l3Id = '';

  // 1) L1 par ID si présent et existant
  if (pendingLabels.l1Id) {
    const n1 = findById(tree, pendingLabels.l1Id);
    if (n1) l1Id = n1.id;
  }
  // Sinon L1 par slug/label
  if (!l1Id) {
    const matchL1 = (roots || []).find(
      r => norm(r.slug) === norm(pendingLabels.l1) || norm(r.label) === norm(pendingLabels.l1)
    ) || roots?.[0] || null;
    l1Id = matchL1?.id || null;
  }

  // 2) L2 : dans les enfants de L1
  if (l1Id) {
    const n1 = findById(tree, l1Id);

    // ID si présent et cohérent
    if (pendingLabels.l2Id) {
      const n2 = findById(tree, pendingLabels.l2Id);
      if (n2 && n2.parent_id === l1Id) l2Id = n2.id;
    }
    // Sinon slug/label
    if (!l2Id && pendingLabels.l2) {
      const matchL2 = findChildByValue(n1?.children || [], pendingLabels.l2);
      l2Id = matchL2?.id || null;
    }
  }

  // 3) L3 : dans les enfants de L2
  if (l2Id) {
    const n2 = findById(tree, l2Id);

    // ID si présent et cohérent
    if (pendingLabels.l3Id) {
      const n3 = findById(tree, pendingLabels.l3Id);
      if (n3 && n3.parent_id === l2Id) l3Id = n3.id;
    }
    // Sinon slug/label
    if (!l3Id && pendingLabels.l3) {
      const matchL3 = findChildByValue(n2?.children || [], pendingLabels.l3);
      l3Id = matchL3?.id || '';
    }
  }

  setL1(l1Id);
  setL2(l2Id || null);
  setL3(l3Id || '');

  // Reset pour ne pas re-matcher en boucle
  setPendingLabels({ l1:null, l2:null, l3:null, l1Id:null, l2Id:null, l3Id:null });
}, [catsLoading, tree, roots, pendingLabels]);


  const canEdit = !!sessionUserId && !!ownerId && sessionUserId === ownerId

  const currentCatColor = l1Node?.color || '#60a5fa'
  const rarityDef = RARITY[rarity] || RARITY.commun
  const showLevel3 = (l3List?.length || 0) > 0

  // Pills UI (dynamiques)
  const CategoryPills = () => (
    <div className="space-y-3">
      <div className="text-white/80 text-sm">Catégories</div>
      <div className="flex flex-wrap gap-2">
        {roots.map(c => (
          <button
            key={c.id}
            onClick={() => { if (!canEdit) return; setL1(c.id); setL2(c.children?.[0]?.id || null); setL3('') }}
            className={`px-3 py-1.5 rounded-full border transition
              ${l1===c.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}
              ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            style={{ boxShadow:`inset 0 0 0 1px ${l1===c.id?(c.color||currentCatColor):'transparent'}` }}
          >
            <span className="inline-flex items-center gap-2 text-white/90">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: c.color || currentCatColor }} />
              {c.label}
            </span>
          </button>
        ))}
      </div>

      <div className="text-white/80 text-sm mt-4">Sous-catégories</div>
      <div className="flex flex-wrap gap-2">
        {l2List.map(s => (
          <button
            key={s.id}
            onClick={() => { if (!canEdit) return; setL2(s.id); setL3('') }}
            className={`px-2.5 py-1.5 rounded-full border text-sm transition
              ${l2===s.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}
              ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span className="text-white/85">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Niveau 3 optionnel */}
      {showLevel3 && (
        <>
          <div className="text-white/80 text-sm mt-4">Sous-sous-catégories (optionnel)</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => canEdit && setL3('')}
              className={`px-2.5 py-1.5 rounded-full border text-sm transition
                ${l3==='' ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}
                ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              Aucune
            </button>
            {l3List.map(s3 => (
              <button
                key={s3.id}
                onClick={() => canEdit && setL3(s3.id)}
                className={`px-2.5 py-1.5 rounded-full border text-sm transition
                  ${l3===s3.id ? 'bg-white/15 border-white/30' : 'bg-white/5 border-white/15 hover:bg-white/10'}
                  ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {s3.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  // --- remplace intégralement ta fonction save par ceci ---
const save = async () => {
  if (!id) return;
  setSaving(true);
  setMsg('');

  // Récupération sûre du userId (si jamais pas encore en état)
  let userId = sessionUserId;
  if (!userId) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) { console.error(authErr); setSaving(false); return; }
    userId = user?.id || null;
  }
  if (!userId) { setSaving(false); return; }

  // Résolution des noeuds cat/sub/sub2 depuis l'arbre UI
  const catNode  = findById(tree, l1);
  const subNode  = l2 ? findById(tree, l2) : null;
  const sub2Node = l3 ? findById(tree, l3) : null;

  // ⚠️ On enregistre des slugs (ou libellés en fallback), pas des ids
  const upd = {
    title: (title || '').trim(),
    description: (description || '').trim(),
    category: catNode?.slug || catNode?.label || null,
    subcategory: subNode?.slug || subNode?.label || null,
    sub_subcategory: sub2Node?.slug || sub2Node?.label || null,
    rarity,
    image_url: (imageUrl || '').trim() || null,
  };

  // On n’essaie pas d’écrire les champs *_id ici (tu gères les filtres avec fallback côté liste)
  delete upd.category_id;
  delete upd.subcategory_id;
  delete upd.sub_subcategory_id;

  // ❗ Ne PAS rajouter .eq('owner_id', userId) — ça casserait le rôle admin.
  const { error } = await supabase
    .from('cards')
    .update(upd)
    .eq('id', id);

  if (error) {
    console.error(error);
    setMsg(error.message || 'Échec de la sauvegarde');
  } else {
    setMsg('Enregistré ✔');
    // Option: petit délai puis retour
    // setTimeout(() => router.back(), 600);
    setTimeout(() => setMsg(''), 1500);
  }
  setSaving(false);
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
          <h1 className="text-white text-2xl font-semibold">Modifier la carte</h1>
          <div className="flex items-center gap-4">
            {msg ? <div className="text-sm text-emerald-400">{msg}</div> : null}
            <button
              onClick={() => router.back()}
              className="rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 border border-white/20 text-white"
            >
              Retour
            </button>
            <button
              onClick={save}
              disabled={!canEdit || saving || !title.trim()}
              className="rounded-lg bg-emerald-500/90 hover:bg-emerald-500 px-4 py-2 text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>

        {/* Grille 2 colonnes : à gauche les contrôles, à droite la preview carte */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panneau gauche : form + pills */}
          <section className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-5 space-y-6">
            <CategoryPills />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Titre">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre de la carte"
                  disabled={!canEdit}
                />
              </Field>

              <Field label="Rareté">
                <select
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={rarity} onChange={e=>setRarity(e.target.value)} disabled={!canEdit}
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
                    disabled={!canEdit}
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field label="Image (URL)">
                  <input
                    className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                    value={imageUrl} onChange={e=>setImageUrl(e.target.value)} placeholder="https://..."
                    disabled={!canEdit}
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
    </main>
  )
}
