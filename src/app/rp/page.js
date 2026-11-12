'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const BANNERS = {
  poudlard: '/images/rp/zone-hogwarts.png',
  'godrics-hollow': '/images/rp/zone-godrics-hollow.png',
  londres: '/images/rp/zone-london.png',
  'ministere-magie': '/images/rp/zone-ministry.png',
}

const TAGLINES = {
  poudlard: 'Études, rencontres et recherches magiques',
  'godrics-hollow': 'La grande cité des sorciers',
  londres: 'À la frontière des deux mondes',
  'ministere-magie': 'Institutions, justice et pouvoir',
}

const navButton = 'rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10'

export default function RPPage() {
  const router = useRouter()
  const [userId, setUserId] = useState(null)
  const [profile, setProfile] = useState(null)
  const [character, setCharacter] = useState(null)
  const [zones, setZones] = useState([])
  const [locations, setLocations] = useState([])
  const [topics, setTopics] = useState([])
  const [posts, setPosts] = useState([])
  const [view, setView] = useState('zones') // zones | location | mine | others
  const [locationId, setLocationId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftZoneId, setDraftZoneId] = useState('')
  const [draftLocationId, setDraftLocationId] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (uid) => {
    const [zonesR, locationsR, topicsR, postsR, profileR] = await Promise.all([
      supabase.from('rp_zones').select('id,name,slug,description,image_url,display_order').eq('is_active', true).order('display_order'),
      supabase.from('rp_locations').select('id,zone_id,name,slug,description,display_order').eq('is_active', true).order('display_order'),
      supabase.from('rp_topics').select('id,title,author_id,created_by,created_at,location_id').order('created_at', { ascending: false }).limit(1000),
      supabase.from('rp_posts').select('topic_id,author_user_id').limit(10000),
      supabase.from('profiles').select('pseudo,avatar_url,active_character_id').eq('user_id', uid).maybeSingle(),
    ])
    const failed = [zonesR, locationsR, topicsR, postsR, profileR].find(r => r.error)
    if (failed) throw new Error(failed.error.message)

    setZones(zonesR.data || [])
    setLocations(locationsR.data || [])
    setTopics(topicsR.data || [])
    setPosts(postsR.data || [])
    setProfile(profileR.data || null)

    if (profileR.data?.active_character_id) {
      const charR = await supabase.from('characters')
        .select('id,name,avatar_url').eq('id', profileR.data.active_character_id).maybeSingle()
      if (charR.error) throw new Error(charR.error.message)
      setCharacter(charR.data || null)
    } else {
      setCharacter(null)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!alive) return
        if (!session) { router.replace('/auth'); return }
        setUserId(session.user.id)
        await reload(session.user.id)
      } catch (e) {
        if (alive) setError(e?.message || 'Chargement impossible.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [router, reload])

  const locationById = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const zoneById = useMemo(() => new Map(zones.map(z => [z.id, z])), [zones])
  const participantsByTopic = useMemo(() => {
    const m = new Map()
    for (const p of posts) {
      if (!p.topic_id || !p.author_user_id) continue
      if (!m.has(p.topic_id)) m.set(p.topic_id, new Set())
      m.get(p.topic_id).add(p.author_user_id)
    }
    for (const topic of topics) {
      const author = topic.author_id || topic.created_by
      if (author) {
        if (!m.has(topic.id)) m.set(topic.id, new Set())
        m.get(topic.id).add(author)
      }
    }
    return m
  }, [posts, topics])

  const myTopics = useMemo(() => topics.filter(t =>
    t.author_id === userId || t.created_by === userId || participantsByTopic.get(t.id)?.has(userId)
  ), [topics, participantsByTopic, userId])
  const mineIds = useMemo(() => new Set(myTopics.map(t => t.id)), [myTopics])
  const selectedLocation = locationById.get(locationId)
  const selectedZone = selectedLocation ? zoneById.get(selectedLocation.zone_id) : null

  const visibleTopics = useMemo(() => {
    if (view === 'mine') return myTopics
    if (view === 'others') return topics.filter(t => !mineIds.has(t.id))
    if (view === 'location') return topics.filter(t => t.location_id === locationId)
    return []
  }, [view, topics, myTopics, mineIds, locationId])

  function goHome() { setView('zones'); setLocationId(null); setMenuOpen(false) }
  function showList(next) { setView(next); setLocationId(null); setMenuOpen(false) }
  function openLocation(id) { setLocationId(id); setView('location'); setMenuOpen(false) }
  function openTopic(id) { router.push(`/rp/scene?topic=${encodeURIComponent(id)}`) }

  function openCreate(id = null) {
    const loc = id ? locationById.get(id) : selectedLocation
    setDraftLocationId(loc?.id || '')
    setDraftZoneId(loc?.zone_id || '')
    setDraftTitle('')
    setError('')
    setCreating(true)
  }

  async function createTopic(e) {
    e.preventDefault()
    if (!userId || !draftTitle.trim() || !draftLocationId || saving) return
    setSaving(true)
    const { data, error: createError } = await supabase.from('rp_topics').insert({
      title: draftTitle.trim(),
      author_id: userId,
      created_by: userId,
      location_id: draftLocationId,
    }).select('id').single()
    setSaving(false)
    if (createError) { setError(createError.message); return }
    setCreating(false)
    openTopic(data.id)
  }

  function placeLabel(topic) {
    const place = locationById.get(topic.location_id)
    const area = place ? zoneById.get(place.zone_id) : null
    return place && area ? `${area.name} · ${place.name}` : 'Lieu non renseigné (ancien RP)'
  }

  function topicCard(t) {
    const count = participantsByTopic.get(t.id)?.size || 0
    return (
      <button key={t.id} onClick={() => openTopic(t.id)}
        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/15 bg-white/[.055] px-5 py-4 text-left transition hover:border-amber-300/50 hover:bg-white/10">
        <div>
          <h3 className="font-serif text-xl text-amber-50">{t.title}</h3>
          <p className="mt-1 text-xs text-amber-100/65">{placeLabel(t)}</p>
          <p className="mt-1 text-xs text-white/45">{count} participant{count > 1 ? 's' : ''} · {new Date(t.created_at).toLocaleDateString('fr-FR')}</p>
        </div>
        <span className="text-sm text-amber-200">Lire le RP →</span>
      </button>
    )
  }

  const pageTitle = view === 'mine' ? 'Mes RP' : view === 'others' ? 'Autres aventures' : selectedLocation?.name

  return (
    <main className="relative min-h-screen bg-[#100e17] text-[#f7e8d0]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(89,62,105,.25),transparent_55%),linear-gradient(135deg,#1b1524,#0d0d15)]" />

      <header className="relative z-30 border-b border-amber-200/20 bg-[#17111f]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1650px] flex-wrap items-center gap-2 px-4 py-3 md:px-8">
          <button onClick={goHome} className="mr-auto font-serif text-xl text-amber-100 hover:text-amber-300">Le Monde Magique</button>

          <div className="relative">
            <button onClick={() => setMenuOpen(x => !x)} aria-expanded={menuOpen} className={navButton}>Mes RP ▾</button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-amber-200/25 bg-[#271d31] p-2 shadow-2xl">
                <button onClick={() => showList('mine')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Mes participations</button>
                <button onClick={() => showList('others')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Autres aventures</button>
              </div>
            )}
          </div>
          <button onClick={() => showList('others')} className={navButton}>Autres aventures</button>
          <button onClick={() => openCreate()} className="rounded-lg border border-amber-300/55 bg-amber-300/15 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/25">+ Nouveau RP</button>
          <a href="/wiki" target="_blank" rel="noopener noreferrer" className={navButton}>Wiki & chronologie ↗</a>
          <Link href="/messages" className={navButton}>Messagerie</Link>
          <Link href="/dashboard" className={navButton}>Tableau de bord</Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1580px] px-4 py-7 md:px-7">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_245px]">
          <section className="min-w-0">
            {view !== 'zones' && (
              <button onClick={goHome} className="mb-5 text-sm text-amber-200 hover:text-amber-100">← Toutes les zones</button>
            )}
            {error && <div className="mb-4 rounded-xl border border-rose-300/30 bg-rose-950/30 p-4 text-sm text-rose-100">{error}<button onClick={() => setError('')} className="ml-4 underline">Fermer</button></div>}
            {loading && <p className="py-24 text-center text-amber-100/60">Chargement…</p>}

            {!loading && view === 'zones' && (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {zones.map(z => {
                  const zoneLocations = locations.filter(l => l.zone_id === z.id)
                  const zoneTopics = topics.filter(t => zoneLocations.some(l => l.id === t.location_id))
                  const players = new Set(zoneTopics.flatMap(t => [...(participantsByTopic.get(t.id) || [])]))
                  const image = z.image_url || BANNERS[z.slug]
                  return (
                    <article key={z.id} className="group overflow-hidden rounded-2xl border border-amber-200/20 bg-[#211b29] shadow-[0_10px_35px_rgba(0,0,0,.3)] transition hover:border-amber-300/60">
                      <div className="relative aspect-[16/8] overflow-hidden">
                        {image && <Image src={image} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.04]" />}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#15111d] via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-5 right-5">
                          <h2 className="font-serif text-3xl text-amber-50 drop-shadow-lg">{z.name}</h2>
                          <p className="mt-1 text-xs text-white/85">{TAGLINES[z.slug] || z.description}</p>
                        </div>
                      </div>
                      <div className="px-5 pb-5 pt-2">
                        <p className="mb-3 text-xs uppercase tracking-[.13em] text-amber-200/65">{zoneTopics.length} RP · {players.size} participant{players.size > 1 ? 's' : ''}</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {zoneLocations.map(l => {
                            const count = topics.filter(t => t.location_id === l.id).length
                            return (
                              <button key={l.id} onClick={() => openLocation(l.id)}
                                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-amber-200/15 bg-white/[.055] px-3 py-2.5 text-left transition hover:border-amber-300/55 hover:bg-amber-200/10">
                                <span className="min-w-0 truncate text-sm text-amber-50">{l.name}</span>
                                <span className="shrink-0 text-xs text-amber-200/70">{count} RP →</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {!loading && view !== 'zones' && (
              <>
                <h1 className="mb-2 font-serif text-3xl text-amber-100 md:text-4xl">{pageTitle}</h1>
                <p className="mb-6 text-sm text-amber-100/65">
                  {view === 'mine' ? 'Les scènes que vous avez créées ou auxquelles vous avez participé.' :
                   view === 'others' ? 'Les scènes des autres joueurs auxquelles vous ne participez pas encore.' :
                   `${selectedZone?.name || ''} · ${selectedLocation?.description || ''}`}
                </p>
                {view === 'location' && <button onClick={() => openCreate(locationId)} className="mb-5 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-[#24191c] hover:bg-amber-200">+ Créer un RP ici</button>}
                <div className="space-y-3">
                  {visibleTopics.map(topicCard)}
                  {visibleTopics.length === 0 && <p className="rounded-xl border border-amber-200/15 bg-white/5 p-7 text-center text-white/60">Aucun RP dans cette rubrique pour le moment.</p>}
                </div>
              </>
            )}
          </section>

          <aside className="xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-2xl border border-amber-200/25 bg-[#221b2b]/85 p-5 text-center shadow-xl">
              <div className="text-[11px] uppercase tracking-[.2em] text-amber-200/60">Votre personnage actif</div>
              <div className="mx-auto mt-4 h-28 w-28 overflow-hidden rounded-full border-2 border-amber-300/45 bg-[#43364b] shadow-lg">
                {character?.avatar_url || profile?.avatar_url ? (
                  // Avatar utilisateur externe, sans configuration next/image supplémentaire.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={character?.avatar_url || profile?.avatar_url} alt="Avatar du personnage actif" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : <div className="grid h-full w-full place-items-center font-serif text-4xl text-amber-100/65">{(character?.name || profile?.pseudo || '?')[0]}</div>}
              </div>
              <h2 className="mt-3 font-serif text-xl text-amber-100">{character?.name || profile?.pseudo || 'Aucun personnage actif'}</h2>
              <p className="mt-1 text-xs text-white/55">{character ? 'Personnage sélectionné' : 'Sélectionnez un personnage depuis votre profil'}</p>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-amber-200/15 pt-4">
                <div><div className="text-2xl font-serif text-amber-100">{myTopics.length}</div><div className="text-xs text-white/55">Mes RP</div></div>
                <div><div className="text-2xl font-serif text-amber-100">{topics.length}</div><div className="text-xs text-white/55">Tous les RP</div></div>
              </div>
              <Link href="/profile" className="mt-4 block rounded-lg border border-amber-200/25 px-3 py-2 text-sm text-amber-100 hover:bg-white/10">Voir mon profil</Link>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200/15 bg-[#221b2b]/65 p-4">
              <h3 className="font-serif text-lg text-amber-100">Accès rapides</h3>
              <button onClick={() => showList('mine')} className="mt-3 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Mes participations →</button>
              <button onClick={() => showList('others')} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Autres aventures →</button>
              <a href="/wiki" target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">Consulter le wiki ↗</a>
            </div>
          </aside>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => !saving && setCreating(false)}>
          <form onSubmit={createTopic} onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-amber-200/30 bg-[#241b2d] p-6 shadow-2xl">
            <h2 className="font-serif text-2xl text-amber-100">Créer un nouveau RP</h2>
            <p className="mb-5 mt-2 text-sm text-white/60">Choisissez obligatoirement une zone et un lieu.</p>
            {error && <p className="mb-3 text-sm text-rose-300">{error}</p>}
            <label htmlFor="rp-zone" className="block text-sm">Zone</label>
            <select id="rp-zone" required value={draftZoneId} onChange={e => { setDraftZoneId(e.target.value); setDraftLocationId('') }} className="mt-2 w-full rounded-lg border border-amber-200/25 bg-[#32263d] p-3 text-white">
              <option value="">Choisir une zone…</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <label htmlFor="rp-place" className="mt-4 block text-sm">Lieu</label>
            <select id="rp-place" required value={draftLocationId} onChange={e => setDraftLocationId(e.target.value)} className="mt-2 w-full rounded-lg border border-amber-200/25 bg-[#32263d] p-3 text-white">
              <option value="">Choisir un lieu…</option>
              {locations.filter(l => l.zone_id === draftZoneId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label htmlFor="rp-title" className="mt-4 block text-sm">Titre</label>
            <input id="rp-title" required maxLength={150} value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Titre de votre scène…" className="mt-2 w-full rounded-lg border border-amber-200/25 bg-white/10 p-3 text-white outline-none focus:border-amber-300" />
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-4 py-2 hover:bg-white/10">Annuler</button>
              <button type="submit" disabled={saving || !draftTitle.trim() || !draftLocationId} className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-[#24191c] disabled:opacity-40">{saving ? 'Création…' : 'Créer le RP'}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
