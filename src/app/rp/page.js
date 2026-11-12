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
  const [menuOpen, setMenuOpen] = useState(null)
  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftZoneId, setDraftZoneId] = useState('')
  const [draftLocationId, setDraftLocationId] = useState('')
  const [saving, setSaving] = useState(false)
const [inviteCharacters, setInviteCharacters] = useState([])
const [selectedInviteIds, setSelectedInviteIds] = useState([])
const [inviteSearch, setInviteSearch] = useState('')
const [inviteLoading, setInviteLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (uid) => {
    const [zonesR, locationsR, topicsR, postsR, profileR] = await Promise.all([
      supabase.from('rp_zones').select('id,name,slug,description,image_url,display_order').eq('is_active', true).order('display_order'),
      supabase
  .from('rp_locations')
  .select(
    'id,zone_id,name,slug,description,image_url,display_order'
  )
  .eq('is_active', true)
  .order('display_order'),
      supabase.from('rp_topics').select('id,title,author_id,created_by,created_at,location_id').order('created_at', { ascending: false }).limit(1000),
      supabase.from('rp_posts').select('topic_id,author_user_id').limit(10000),
      supabase.from('profiles').select('pseudo,avatar_url,active_character_id').eq('user_id', uid).maybeSingle(),
    ])
    const failed = [zonesR, locationsR, topicsR, postsR, profileR].find(r => r.error)
    if (failed) throw new Error(failed.error.message)

    
setZones(zonesR.data || [])
setLocations(locationsR.data || [])

// Ouvrir directement une sous-zone depuis le lecteur RP
const requestedLocationId = new URLSearchParams(
  window.location.search
).get('location')

if (
  requestedLocationId &&
  (locationsR.data || []).some(
    location => location.id === requestedLocationId
  )
) {
  setLocationId(requestedLocationId)
  setView('location')
} else {
  setLocationId(null)
  setView('zones')
}
    setTopics(topicsR.data || [])
    setPosts(postsR.data || [])
    setProfile(profileR.data || null)

    // Le personnage affiché doit appartenir au compte connecté.
    // Certaines interfaces enregistrent le choix avec is_active, d'autres
    // conservent le pointeur dans profiles.active_character_id.
    const { data: ownedCharacters, error: charsError } = await supabase
      .from('characters')
      .select('id,user_id,name,avatar_url,is_active')
      .eq('user_id', uid)
    if (charsError) throw new Error(charsError.message)

    const owned = ownedCharacters || []
    const pointer = owned.find(c => c.id === profileR.data?.active_character_id)
    const flagged = owned.filter(c => c.is_active === true)
    // Si un seul personnage est indiqué actif, c'est le choix effectif.
    // Sinon, on utilise le pointeur du profil s'il est valide.
    const current = flagged.length === 1
      ? flagged[0]
      : (pointer || flagged[0] || null)
    setCharacter(current)

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

  function goHome() { setView('zones'); setLocationId(null); setMenuOpen(null) }
  function showList(next) { setView(next); setLocationId(null); setMenuOpen(null) }
  function openLocation(id) { setLocationId(id); setView('location'); setMenuOpen(null) }
  function openTopic(id) { router.push(`/rp/scene?topic=${encodeURIComponent(id)}`) }


useEffect(() => {
  if (!creating || !userId) return

  let cancelled = false

  async function loadInviteCharacters() {
    setInviteLoading(true)

    const { data, error: charactersError } = await supabase
      .from('characters')
      .select('id,name,avatar_url,user_id')
      .neq('user_id', userId)
      .order('name')

    if (cancelled) return

    if (charactersError) {
      setError(charactersError.message)
    } else {
      setInviteCharacters(data || [])
    }

    setInviteLoading(false)
  }

  void loadInviteCharacters()

  return () => {
    cancelled = true
  }
}, [creating, userId])

function toggleInvite(characterId) {
  setSelectedInviteIds(current =>
    current.includes(characterId)
      ? current.filter(id => id !== characterId)
      : [...current, characterId]
  )
}

  function openCreate(id = null) {
    setMenuOpen(null)
    const loc = id ? locationById.get(id) : selectedLocation
    setDraftLocationId(loc?.id || '')
    setDraftZoneId(loc?.zone_id || '')
    setDraftTitle('')
    setError('')
setSelectedInviteIds([])
setInviteSearch('')
    setCreating(true)
  }

async function createTopic(e) {
  e.preventDefault()

  if (
    !userId ||
    !draftTitle.trim() ||
    !draftLocationId ||
    saving
  ) return

  setSaving(true)
  setError('')

  try {
    const { data: topicId, error: createError } =
      await supabase.rpc('create_rp_with_invitations', {
        p_title: draftTitle.trim(),
        p_location_id: draftLocationId,
        p_character_ids: selectedInviteIds,
      })

    if (createError) {
      throw createError
    }

    setCreating(false)
    setSelectedInviteIds([])
    setDraftTitle('')

    openTopic(topicId)

  } catch (err) {
    setError(
      err?.message || 'Impossible de créer le RP.'
    )
  } finally {
    setSaving(false)
  }
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
      

{/* Background RP : illustration sur tout l'écran */}
<div
  aria-hidden="true"
  className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
>
  <div
    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
    style={{
      backgroundImage: "url('/images/rp/rp-ambient-bg.png')",
      filter: 'blur(8px)',
      transform: 'scale(1.05)',
      opacity: 0.75,
    }}
  />
</div>

{/* Voile léger pour préserver la lisibilité */}
<div
  aria-hidden="true"
  className="pointer-events-none fixed inset-0 z-0 bg-[#100e17]/20"
/>



      <header className="relative z-30 border-b border-amber-200/20 bg-[#17111f]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1650px] flex-wrap items-center gap-2 px-4 py-3 md:px-8">
          <button onClick={goHome} className="mr-auto font-serif text-xl text-amber-100 hover:text-amber-300">
            Le Monde Magique
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen(x => x === 'rp' ? null : 'rp')} aria-expanded={menuOpen === 'rp'} className={navButton}>
              Mes RP ▾
            </button>
            {menuOpen === 'rp' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-amber-200/25 bg-[#271d31] p-2 shadow-2xl">
                <button onClick={() => showList('mine')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Mes participations</button>
                <button onClick={() => showList('others')} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Autres aventures</button>
              </div>
            )}
          </div>

          <button onClick={() => openCreate()} className="rounded-lg border border-amber-300/55 bg-amber-300/15 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-300/25">
            + Nouveau RP
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen(x => x === 'access' ? null : 'access')} aria-expanded={menuOpen === 'access'} className={navButton}>
              Accès rapides ▾
            </button>
            {menuOpen === 'access' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-amber-200/25 bg-[#271d31] p-2 shadow-2xl">
                <Link href="/messages" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">Messagerie</Link>
                <a href="/wiki" target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">Wiki & chronologie ↗</a>
                <Link href="/dashboard" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">Tableau de bord</Link>
              </div>
            )}
          </div>

          <div className="relative">
            <button onClick={() => setMenuOpen(x => x === 'character' ? null : 'character')} aria-expanded={menuOpen === 'character'}
              className="flex items-center gap-2 rounded-full border border-amber-200/25 bg-white/5 py-1.5 pl-1.5 pr-3 text-sm text-amber-100 transition hover:bg-white/10">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-300/40 bg-[#40344b]">
                {character?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={character.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : <span className="font-serif text-lg">{(character?.name || '?').charAt(0)}</span>}
              </span>
              <span className="max-w-[140px] truncate font-medium">{character?.name || 'Aucun personnage actif'}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {menuOpen === 'character' && (
              <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-amber-200/25 bg-[#271d31] p-4 shadow-2xl">
                <div className="text-xs uppercase tracking-widest text-amber-200/60">Personnage actif</div>
                <div className="mt-2 font-serif text-xl text-amber-100">{character?.name || 'Aucun personnage sélectionné'}</div>
                <div className="mt-1 text-xs text-white/55">Compte : {profile?.pseudo || 'Joueur'}</div>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-amber-200/15 pt-3 text-center">
                  <div><div className="font-serif text-xl text-amber-100">{myTopics.length}</div><div className="text-xs text-white/55">Mes RP</div></div>
                  <div><div className="font-serif text-xl text-amber-100">{topics.length}</div><div className="text-xs text-white/55">Tous les RP</div></div>
                </div>
                <button onClick={() => showList('mine')} className="mt-3 block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Mes participations</button>
                <Link href="/profile" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10">Voir mon profil</Link>
              </div>
            )}
          </div>
        </div>
      </header>

{/* Background de la sous-zone sélectionnée */}
{view === 'location' && selectedLocation?.image_url && (
  <div
    className="pointer-events-none absolute inset-x-0 top-[60px] bottom-0 z-0 overflow-hidden"
    aria-hidden="true"
  >
    <div
      className="absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url("${selectedLocation.image_url}")`,
      }}
    />

    {/* Dégradé pour conserver une bonne lisibilité */}
    <div className="absolute inset-0 bg-gradient-to-b from-[#110d19]/35 via-[#110d19]/70 to-[#100e17]/95" />

    {/* Léger voile supplémentaire */}
    <div className="absolute inset-0 bg-[#100e17]/15" />
  </div>
)}

      <div className="relative z-10 mx-auto max-w-[1580px] px-4 py-7 md:px-7">
        <div className="w-full">
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
                  {visibleTopics.length === 0 && <p className="rounded-xl border border-amber-200/15 bg-[#120f1c]/65 backdrop-blur-md p-7 text-center text-white/60">Aucun RP dans cette rubrique pour le moment.</p>}
                </div>
              </>
            )}
          </section>

        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => !saving && setCreating(false)}>
          <form onSubmit={createTopic} onClick={e => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-amber-200/30 bg-[#241b2d] p-6 shadow-2xl">
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

{/* Invitation des personnages */}
<div className="mt-5 border-t border-amber-200/20 pt-5">

  <div className="mb-3 flex items-center justify-between gap-3">
    <label className="text-sm font-semibold text-amber-100">
      Inviter des personnages
    </label>

    <span className="text-xs text-amber-200/65">
      {selectedInviteIds.length} sélectionné(s)
    </span>
  </div>

  <input
    type="search"
    value={inviteSearch}
    onChange={e => setInviteSearch(e.target.value)}
    placeholder="Rechercher un personnage…"
    className="mb-3 w-full rounded-lg border border-amber-200/25 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-amber-300"
  />

  <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-amber-200/15 bg-black/20 p-2">

    {inviteLoading && (
      <p className="p-4 text-center text-sm text-white/50">
        Chargement des personnages…
      </p>
    )}

    {!inviteLoading &&
      inviteCharacters
        .filter(c =>
          c.name.toLowerCase().includes(
            inviteSearch.toLowerCase().trim()
          )
        )
        .map(c => {
          const checked = selectedInviteIds.includes(c.id)

          return (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${
                checked
                  ? 'border-amber-300/50 bg-amber-300/10'
                  : 'border-transparent hover:bg-white/10'
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-200/25 bg-[#483650]">

                {c.avatar_url ? (
                  <img
                    src={c.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-serif text-lg">
                    {c.name.charAt(0)}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1 truncate text-sm text-amber-50">
                {c.name}
              </span>

              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleInvite(c.id)}
                className="h-4 w-4 accent-amber-400"
              />
            </label>
          )
        })}

    {!inviteLoading &&
      inviteCharacters.filter(c =>
        c.name.toLowerCase().includes(
          inviteSearch.toLowerCase().trim()
        )
      ).length === 0 && (
        <p className="p-4 text-center text-sm text-white/50">
          Aucun personnage trouvé.
        </p>
      )}
  </div>

  <p className="mt-2 text-xs leading-relaxed text-white/50">
    Les personnages sélectionnés recevront une invitation
    à rejoindre ce RP. Tu peux également créer une scène
    sans invitation.
  </p>
</div>

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
