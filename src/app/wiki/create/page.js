'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { CATS } from '../page'

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

export default function CreateCardPage() {
  const router = useRouter()
  const [session, setSession] = useState(null)

  const [cat, setCat] = useState(CATS[0].key)
  const [sub, setSub] = useState(CATS[0].subs[0].key)

  const [form, setForm] = useState({
    title: '',
    description: '',
    rarity: 'commun',
    image_url: '',
  })
  const [preview, setPreview] = useState('')

  useEffect(() => {
    const boot = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/auth'); return }
      setSession(session)
    }
    boot()
  }, [router])

  const uploadImage = async (file) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Fichier trop volumineux (max 5 Mo). Merci de compresser ou réduire la taille.')
      return
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error: upErr } = await supabase.storage.from('cards').upload(path, file, {
      upsert: false, cacheControl: '31536000',
    })
    if (upErr) { alert(upErr.message); return }
    const { data } = supabase.storage.from('cards').getPublicUrl(path)
    const url = data?.publicUrl
    if (url) { setForm(f => ({ ...f, image_url: url })); setPreview(url) }
  }

  const submit = async () => {
    if (!form.title.trim()) { alert('Titre requis'); return }
    const payload = {
      owner_id: session.user.id,
      title: form.title.trim(),
      description: form.description.trim(),
      category: cat,
      subcategory: sub,
      rarity: form.rarity,
      image_url: form.image_url.trim() || null,
    }
    const { error } = await supabase.from('cards').insert(payload)
    if (error) { alert(error.message); return }
    router.push('/wiki')
  }

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
            <h1 className="text-white text-lg font-semibold">Créer une carte</h1>
            <button onClick={()=>history.back()} className="rounded-md bg-white/10 border border-white/20 px-3 py-1.5 text-white hover:bg-white/15">Retour</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Formulaire */}
            <div className="space-y-3">
              <Field label="Titre">
                <input className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.title} onChange={e=>setForm(f=>({...f, title:e.target.value}))} />
              </Field>

              <Field label="Catégorie">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={cat} onChange={e=>{ const v=e.target.value; setCat(v); setSub(CATS.find(x=>x.key===v)?.subs[0]?.key||'') }}>
                  {CATS.map(c=><option key={c.key} value={c.key} className="text-slate-900">{c.label}</option>)}
                </select>
              </Field>

              <Field label="Sous-catégorie">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={sub} onChange={e=>setSub(e.target.value)}>
                  {CATS.find(c=>c.key===cat)?.subs.map(s=>(
                    <option key={s.key} value={s.key} className="text-slate-900">{s.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Rareté">
                <select className="rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.rarity} onChange={e=>setForm(f=>({...f, rarity:e.target.value}))}>
                  {RARITY.map(r=><option key={r.key} value={r.key} className="text-slate-900">{r.label}</option>)}
                </select>
              </Field>

              <Field label="Description">
                <textarea rows={6} className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none"
                  value={form.description} onChange={e=>setForm(f=>({...f, description:e.target.value}))}/>
              </Field>

              <Field label="Image (URL ou Upload)">
                <input
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white outline-none mb-2"
                  placeholder="https://…"
                  value={form.image_url}
                  onChange={e=>{ const v=e.target.value; setForm(f=>({...f, image_url:v})); setPreview(v) }}
                />
                <input type="file" accept="image/*"
                  onChange={e=>uploadImage(e.target.files?.[0]||null)}
                  className="w-full rounded-lg bg-white/10 border border-white/20 px-3 py-2 text-white"/>
                <p className="text-white/60 text-xs mt-1">Max 5 Mo. Idéalement WebP ≤ 1200 px.</p>
              </Field>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>history.back()} className="rounded-lg border border-white/20 bg-white/10 text-white px-3 py-2 hover:bg-white/15">Annuler</button>
                <button onClick={submit} className="rounded-lg bg-amber-300 text-slate-900 font-medium px-3 py-2 hover:bg-amber-200">Créer</button>
              </div>
            </div>

            {/* Aperçu (passe par le proxy pour les URLs externes) */}
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
