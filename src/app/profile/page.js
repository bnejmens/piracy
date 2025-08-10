// src/app/profile/page.js
'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ProfilePage() {
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Profil (pour active_character_id)
  const [profile, setProfile] = useState(null)

  // Personnages de l’utilisateur
  const [characters, setCharacters] = useState([])
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  // Form nouveau perso
  const [newName, setNewName] = useState('')
  const [newGenre, setNewGenre] = useState('masculin')
  const [newBio, setNewBio] = useState('')

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const fetchAll = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/auth'); return }
    setSession(session)

    const { data: prof, error: e1 } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()
    if (e1) { setError(e1.message); setLoading(false); return }
    setProfile(prof)

    const { data: chars, error: e2 } = await supabase
      .from('characters')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
    if (e2) { setError(e2.message); setLoading(false); return }
    setCharacters(chars || [])

    setLoading(false)
  }

  useEffect(() => { (async () => { await fetchAll() })() }, [router])

  const createCharacter = async () => {
    if (!session) return
    const name = newName.trim()
    if (name.length < 2) { alert('Nom trop court'); return }

    setSaving(true)
    const { data: ch, error } = await supabase
      .from('characters')
      .insert({
        user_id: session.user.id,
        name,
        genre: newGenre,
        bio: newBio || null
      })
      .select('*')
      .single()
    setSaving(false)

    if (error) { alert(error.message); return }
    setCharacters(prev => [...prev, ch])
    setNewName(''); setNewBio(''); setNewGenre('masculin')
    flash('Personnage créé ✅')
  }

  const setActive = async (charId) => {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ active_character_id: charId })
      .eq('user_id', profile.user_id)
    setSaving(false)
    if (error) { alert(error.message); return }
    setProfile(p => ({ ...p, active_character_id: charId }))
    flash('Personnage activé ✅')
  }

  const uploadCharAvatar = async (charId, file) => {
    if (!file) return
    setSaving(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `characters/${charId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { alert('Upload: ' + upErr.message); setSaving(false); return }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = pub?.publicUrl
    if (!publicUrl) { alert('URL publique manquante'); setSaving(false); return }

    const { error: e2 } = await supabase
      .from('characters')
      .update({ avatar_url: publicUrl })
      .eq('id', charId)
    setSaving(false)
    if (e2) { alert(e2.message); return }

    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, avatar_url: publicUrl } : c))
    flash('Avatar mis à jour ✅')
  }

  const saveCharBio = async (charId, bio) => {
    setSaving(true)
    const { error } = await supabase
      .from('characters')
      .update({ bio })
      .eq('id', charId)
    setSaving(false)
    if (error) { alert(error.message); return }
    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, bio } : c))
    flash('Bio enregistrée ✅')
  }

  if (loading) return <p className="p-8 text-white">Chargement…</p>
  if (error)   return <p className="p-8 text-red-400">Erreur : {error}</p>

  const isActive = (id) => profile?.active_character_id === id

  return (
    <main className="fixed inset-0 overflow-hidden">
      {/* BACKGROUND */}
      <div className="absolute inset-0 -z-20">
        <Image src="/images/profil-bg.webp" alt="" fill priority className="object-cover" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/30 via-slate-900/25 to-slate-950/60" />

      {/* Retour + Toast */}
      <button
        onClick={() => router.push('/dashboard')}
        className="fixed left-[24px] top-[24px] z-40 rounded-full border border-white/30 bg-white/15 backdrop-blur-md px-3 py-1.5 text-white text-sm hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80"
      >
        ← Tableau de bord
      </button>
      {toast && (
        <div className="fixed top-[24px] right-[24px] z-40 rounded-lg border border-white/20 bg-white/10 backdrop-blur-md px-3 py-2 text-white text-sm shadow">
          {toast}
        </div>
      )}

      {/* Carte principale */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-5xl rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl ring-1 ring-white/10 p-6 sm:p-8 text-white shadow-[0_20px_80px_rgba(0,0,0,.45)] space-y-8">

          {/* Bloc: Créer un personnage */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Créer un personnage</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                placeholder="Nom du personnage"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-300/50"
              />
              <select
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-300/50"
              >
                <option value="masculin">Masculin</option>
                <option value="féminin">Féminin</option>
              </select>
              <button
                onClick={createCharacter}
                disabled={saving || newName.trim().length < 2}
                className="rounded-lg bg-cyan-300 text-slate-900 font-medium px-4 py-2 hover:bg-cyan-200 disabled:opacity-50"
              >
                + Ajouter
              </button>
            </div>
            <textarea
              placeholder="Bio du personnage (optionnel)…"
              value={newBio}
              onChange={(e) => setNewBio(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-300/50"
            />
          </section>

          {/* Bloc: Mes personnages */}
          <section>
            <h2 className="text-lg font-semibold mb-3">Mes personnages</h2>

            {characters.length === 0 && (
              <p className="text-white/70">Aucun personnage pour l’instant.</p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {characters.map(c => (
                <div key={c.id} className={`rounded-xl border p-4 backdrop-blur-md
                  ${isActive(c.id)
                    ? 'border-amber-300/60 bg-amber-300/10'
                    : 'border-white/15 bg-white/10'}`}>
                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/20 border border-white/10 bg-white/5 shrink-0">
                      {c.avatar_url
                        ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        : <div className="grid place-items-center w-full h-full text-white/85 text-2xl">{(c.name || '?')[0]?.toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {c.name} {isActive(c.id) && <span className="text-xs text-amber-200 ml-1">(actif)</span>}
                      </div>
                      <div className="text-xs text-white/70">{c.genre || '—'}</div>
                    </div>

                    <div className="ml-auto">
                      {!isActive(c.id) && (
                        <button
                          onClick={() => setActive(c.id)}
                          className="rounded-lg bg-amber-300 text-slate-900 text-sm font-medium px-3 py-1.5 hover:bg-amber-200"
                        >
                          Activer
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Édition bio + avatar */}
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <textarea
                      defaultValue={c.bio || ''}
                      onBlur={(e) => saveCharBio(c.id, e.target.value)}
                      placeholder="Bio du personnage… (clique et modifie, sauvegarde au blur)"
                      rows={3}
                      className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-300/50"
                    />
                    <label className="block">
                      <span className="text-sm">Avatar</span>
                      <input
                        type="file"
                        accept="image/*,image/gif"
                        onChange={(e) => uploadCharAvatar(c.id, e.target.files?.[0])}
                        className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-2 file:text-white hover:file:bg-white/15"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
