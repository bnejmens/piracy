'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { CATS } from '../../page'

const RARITY = [
  { key:'commun',     label:'Commune' },
  { key:'rare',       label:'Rare' },
  { key:'epique',     label:'Épique' },
  { key:'legendaire', label:'Légendaire' },
]

// Helper proxy d’images
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

export default function EditCardPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id

  const [session, setSession] = useState(null)
  const [ownerId, setOwnerId] = useState(null)

  const [cat, setCat] = useState(CATS[0].key)
  const [sub, setSub] = useState(CATS[0].subs[0].key)

  const [form, setForm] = useState({
    title: '', description: '', rarity:'commun', image_url:''
  })
  const [preview, setPreview] = useState('')

  useEffect(() => {
    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setSession(session)
      await loadCard()
    }
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadCard = async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('id, owner_id, title, description, category, subcategory, rarity, image_url')
      .eq('id', id).maybeSingle()
    if (error || !data) { alert('Carte introuvable'); router.push('/wiki'); return }
    setOwnerId(data.owner_id)
    setCat(data.category)
    setSub(data.subcategory)
    setForm({
      title: data.title||'',
      description: data.description||'',
      rarity: data.rarity||'commun',
      image_url: data.image_url||'',
    })
    setPreview(data.image_url || '')
  }

  const canEdit = ownerId && session && ownerId === session.user.id

  const uploadImage = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Fichier trop volumineux (max 5 Mo).'); return }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('cards').upload(path, file, {
      upsert: false, cacheControl: '31536000'
    })
    if (upErr) { alert(upErr.message); return }
    const { data } = supabase.storage.from('cards').getPublicUrl(path)
    const url = data?.publicUrl
    if (url) { setForm(f=>({ ...f, image_url:url })); setPreview(url) }
  }

  const save = async () => {
    if (!canEdit) { alert("Tu n'as pas les droits."); return }
    const upd = {
      title: form.title.trim(),
      description: form.description.trim(),
      category: cat,
      subcategory: sub,
      rarity: form.rarity,
      image_url: form.image_url.trim() || null,
    }
    const { error } = await supabase.from('cards').update(upd).eq('id', id)
    if (error) { alert(error.message); return }
    router.push('/wiki')
  }

  const deleteImageFromUrl = async (url) => {
    try {
      const marker = '/cards/'
      const idx = url.indexOf(marker)
      if (idx === -1) return
      const key = url.slice(idx + marker.length)
      await supabase.storage.from('cards').remove([key])
    } catch { /* ignore best-effort */ }
  }

  const remove = async () => {
    if (!canEdit) { alert("Tu n'as pas les droits."); return }
    if (!confirm('Supprimer cette carte ?')) return

    const existing = form.image_url
    const { error } = await supabase.from('cards').delete().eq('id', id)
    if (error) { alert(error.message); return }

    if (existing) { await deleteImageFromUrl(existing) }
    router.push('/wiki')
  }

  if (!session) return null

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BG */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/lore-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/20 via-slate-900/15 to-slate-950/35" />

      <div className="relative z-10 max-w-4xl mx-auto p-6">
        <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-white text-lg font-semibold">Modifier la carte</h1>
            <div className="flex gap-2">
              <button onClick={()=>history.back()} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 text-white hover:bg-white/15">Retour</button>
              {canEdit && (
                <button onClick={remove} className="rounded-md bg-rose-500/20 border border-rose-300/40 px-3 py-1.5 text-rose-100 hover:bg-rose-500/30">Supprimer</button>
              )}
            </div>
          </div>

          {!canEdit && <div className="mb-3 text-amber-200 text-sm">Seule la/le propriétaire peut modifier.</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Form */}
            <div className="space-y-3">
              <Field label="Titre">
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.title} onChange={e=>setForm(f=>({...f, title:e.target.value}))} disabled={!canEdit}/>
              </Field>

              <Field label="Catégorie">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={cat} onChange={e=>{ const v=e.target.value; setCat(v); setSub(CATS.find(x=>x.key===v)?.subs[0]?.key||'') }} disabled={!canEdit}>
                  {CATS.map(c=><option key={c.key} value={c.key} className="text-slate-900">{c.label}</option>)}
                </select>
              </Field>

              <Field label="Sous-catégorie">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={sub} onChange={e=>setSub(e.target.value)} disabled={!canEdit}>
                  {CATS.find(c=>c.key===cat)?.subs.map(s=>(
                    <option key={s.key} value={s.key} className="text-slate-900">{s.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Rareté">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.rarity} onChange={e=>setForm(f=>({...f, rarity:e.target.value}))} disabled={!canEdit}>
                  {RARITY.map(r=><option key={r.key} value={r.key} className="text-slate-900">{r.label}</option>)}
                </select>
              </Field>

              <Field label="Description">
                <textarea rows={6} className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))} disabled={!canEdit}/>
              </Field>

              <Field label="Image (URL ou Upload)">
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none mb-2"
                  placeholder="https://…"
                  value={form.image_url}
                  onChange={e=>{ const v=e.target.value; setForm(f=>({...f, image_url:v})); setPreview(v) }}
                  disabled={!canEdit}
                />
                <input type="file" accept="image/*"
                  onChange={e=>uploadImage(e.target.files?.[0]||null)}
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white" disabled={!canEdit}/>
                <p className="text-white/60 text-xs mt-1">Max 5 Mo. Utilise idéalement du WebP ≤ 1200 px.</p>
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>history.back()} className="rounded-lg border border-white/20 bg-white/10 text-white px-3 py-2 hover:bg-white/15">Annuler</button>
                {canEdit && (
                  <button onClick={save} className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200">Enregistrer</button>
                )}
              </div>
            </div>

            {/* Aperçu */}
            <div className="relative rounded-xl overflow-hidden ring-2 ring-white/20 min-h-[320px]">
              <Image src={srcForDisplay(preview)} alt="" fill className="object-cover" />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-white/80 text-sm mb-1">{label}</div>
      {children}
    </label>
  )
}
