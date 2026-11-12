
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const BANNERS = {
  poudlard: '/images/rp/zone-hogwarts.png',
  'godrics-hollow': '/images/rp/zone-godrics-hollow.png',
  londres: '/images/rp/zone-london.png',
  'ministere-magie': '/images/rp/zone-ministry.png',
}

const TAGLINES = {
  poudlard: 'Études, rencontres et recherche magique',
  'godrics-hollow': 'La grande cité des sorciers',
  londres: 'À la frontière des deux mondes',
  'ministere-magie': 'Institutions, justice et pouvoir',
}

const linkStyle =
  'rounded-lg px-3 py-2 text-sm text-amber-50/90 transition hover:bg-white/10'

export default function RPPage() {
  const router = useRouter()

  const [userId, setUserId] = useState(null)
  const [zones, setZones] = useState([])
  const [locations, setLocations] = useState([])
  const [topics, setTopics] = useState([])
  const [myTopicIds, setMyTopicIds] = useState([])

  const [selectedZone, setSelectedZone] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)

  const [view, setView] = useState('zones')
  const [openMenu, setOpenMenu] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (id) => {
    const [z, l, t, p] = await Promise.all([
      supabase
        .from('rp_zones')
        .select('id,name,slug,description,image_url,display_order')
        .eq('is_active', true)
        .order('display_order'),

      supabase
        .from('rp_locations')
        .select('id,zone_id,name,slug,description,display_order')
        .eq('is_active', true)
        .order('display_order'),

      supabase
        .from('rp_topics')
        .select('id,title,author_id,created_at,location_id')
        .order('created_at', { ascending: false })
        .limit(500),

      supabase
        .from('rp_posts')
        .select('topic_id')
        .eq('author_id', id)
        .limit(5000),
    ])

    const failure = [z, l, t, p].find(x => x.error)

    if (failure) {
      setError(failure.error.message)
      return
    }

    setZones(z.data || [])
    setLocations(l.data || [])
    setTopics(t.data || [])

    setMyTopicIds([
      ...new Set((p.data || []).map(x => x.topic_id)),
    ])
  }, [])

  useEffect(() => {
    let alive = true

    async function boot() {
      const { data: { session } } =
        await supabase.auth.getSession()

      if (!alive) return

      if (!session) {
        router.replace('/auth')
        return
      }

      setUserId(session.user.id)
      await load(session.user.id)

      if (alive) setLoading(false)
    }

    void boot()

    return () => {
      alive = false
    }
  }, [router, load])

  const zone = zones.find(x => x.id === selectedZone)
  const location = locations.find(x => x.id === selectedLocation)

  const zoneLocations = locations.filter(
    x => x.zone_id === selectedZone
  )

  const myIds = useMemo(
    () => new Set(myTopicIds),
    [myTopicIds]
  )

  const visibleTopics = useMemo(() => {
    if (view === 'mine') {
      return topics.filter(
        t => myIds.has(t.id) || t.author_id === userId
      )
    }

    if (view === 'unclassified') {
      return topics.filter(t => !t.location_id)
    }

    if (view === 'location') {
      return topics.filter(
        t => t.location_id === selectedLocation
      )
    }

    return []
  }, [
    topics,
    myIds,
    userId,
    view,
    selectedLocation,
  ])

  function home() {
    setSelectedZone(null)
    setSelectedLocation(null)
    setView('zones')
    setOpenMenu(null)
  }

  function chooseZone(id) {
    setSelectedZone(id)
    setSelectedLocation(null)
    setView('zone')
    setOpenMenu(null)
  }

  function chooseLocation(id) {
    setSelectedLocation(id)
    setView('location')
    setOpenMenu(null)
  }

  function special(which) {
    setView(which)
    setSelectedLocation(null)
    setOpenMenu(null)
  }

  function openTopic(id) {
    router.push(
      `/rp/scene?topic=${encodeURIComponent(id)}`
    )
  }

  async function createTopic(event) {
    event.preventDefault()

    if (
      !userId ||
      !selectedLocation ||
      !newTitle.trim() ||
      saving
    ) return

    setSaving(true)

    const { data, error: createError } =
      await supabase
        .from('rp_topics')
        .insert({
          title: newTitle.trim(),
          author_id: userId,
          location_id: selectedLocation,
        })
        .select('id')
        .single()

    setSaving(false)

    if (createError) {
      setError(createError.message)
      return
    }

    setCreating(false)
    setNewTitle('')
    openTopic(data.id)
  }

  const heading =
    view === 'zones' ? 'Zones de jeu'
      : view === 'zone' ? zone?.name
      : view === 'location' ? location?.name
      : view === 'mine' ? 'Mes RP'
      : 'RP non classés'

  const introduction =
    view === 'zones'
      ? 'Choisissez votre destination dans le monde magique.'
      : view === 'zone'
      ? zone?.description
      : view === 'location'
      ? location?.description
      : view === 'mine'
      ? 'Les scènes que vous avez créées ou auxquelles vous avez participé.'
      : 'Les scènes plus anciennes, en attente de classement dans une zone.'

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#12101a] text-[#f6e8d3]">

      {/* Fond général */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(93,67,113,.32),transparent_60%),linear-gradient(135deg,#191323,#0e1017)]" />

      {/* Navigation supérieure */}
      <header className="relative z-30 border-b border-amber-200/20 bg-[#17111f]/95 backdrop-blur-xl">

        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-3 md:gap-4 md:px-8">

          <button
            onClick={home}
            className="mr-auto font-serif text-xl text-amber-100 hover:text-amber-300"
          >
            Le Monde Magique
          </button>

          <button
            onClick={home}
            className={linkStyle}
          >
            Zones
          </button>

          {/* Menu Mes RP */}
          <div className="relative">

            <button
              onClick={() =>
                setOpenMenu(
                  openMenu === 'mesrp' ? null : 'mesrp'
                )
              }
              className={linkStyle}
              aria-expanded={openMenu === 'mesrp'}
            >
              Mes RP ▾
            </button>

            {openMenu === 'mesrp' && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-56 rounded-xl border border-amber-200/25 bg-[#261c30] p-2 shadow-2xl">

                <button
                  onClick={() => special('mine')}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  Mes participations
                </button>

                <button
                  onClick={() => special('unclassified')}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  RP non classés
                </button>

              </div>
            )}
          </div>

          {/* Création */}
          <button
            onClick={() => {
              if (!selectedLocation) {
                setOpenMenu(null)
                setError(
                  'Choisis d’abord un lieu pour créer un RP.'
                )
                return
              }

              setCreating(true)
            }}
            className="rounded-lg border border-amber-300/50 bg-amber-300/15 px-3 py-2 text-sm text-amber-100 hover:bg-amber-300/25"
          >
            + Nouveau RP
          </button>

          <button
            onClick={() => router.push('/dashboard')}
            className={linkStyle}
          >
            Tableau de bord
          </button>

        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-[1480px] px-4 pb-16 pt-9 md:px-8">

        {/* Retour */}
        {view !== 'zones' && (
          <button
            onClick={
              view === 'location'
                ? () => chooseZone(selectedZone)
                : home
            }
            className="mb-4 text-sm text-amber-200/80 hover:text-amber-200"
          >
            ← {view === 'location'
              ? 'Retour aux lieux'
              : 'Retour aux zones'}
          </button>
        )}

        {/* En-tête de section */}
        <div className="mb-9 text-center">

          <div className="text-xs uppercase tracking-[.3em] text-amber-200/70">
            Le monde des sorciers
          </div>

          <h1 className="mt-3 font-serif text-4xl text-[#ffe3b6] md:text-6xl">
            {heading}
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-amber-50/70">
            {introduction}
          </p>

          <div className="mx-auto mt-6 h-px w-52 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

        </div>

        {/* Erreurs */}
        {error && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-rose-300/30 bg-rose-900/20 p-3 text-sm text-rose-100">
            <span>{error}</span>
            <button onClick={() => setError('')}>
              Fermer
            </button>
          </div>
        )}

        {loading && (
          <p className="py-20 text-center text-amber-100/60">
            Chargement…
          </p>
        )}

        {/* Les quatre grandes zones */}
        {!loading && view === 'zones' && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-7">

            {zones.map(z => {
              const image =
                z.image_url || BANNERS[z.slug]

              return (
                <button
                  key={z.id}
                  onClick={() => chooseZone(z.id)}
                  className="group relative aspect-video overflow-hidden rounded-2xl border border-amber-100/20 bg-white/5 text-left shadow-2xl transition duration-500 hover:-translate-y-1 hover:border-amber-300/80 hover:shadow-[0_12px_45px_rgba(240,182,89,.20)] focus-visible:outline-2 focus-visible:outline-amber-300"
                >

                  {image && (
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="(max-width:768px) 100vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}

                  {/* Dégradé pour lisibilité */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">

                    <div className="mb-2 text-xs tracking-[.2em] text-amber-100/80">
                      {locations.filter(
                        l => l.zone_id === z.id
                      ).length} LIEUX
                    </div>

                    <h2 className="font-serif text-3xl text-amber-50 md:text-4xl">
                      {z.name}
                    </h2>

                    <p className="mt-1 text-sm text-white/75">
                      {TAGLINES[z.slug] || z.description}
                    </p>

                    <div className="mt-3 text-sm text-amber-200 transition-transform group-hover:translate-x-1">
                      Explorer →
                    </div>

                  </div>
                </button>
              )
            })}

          </div>
        )}

        {/* Liste des lieux */}
        {!loading && view === 'zone' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

            {zoneLocations.map(l => (
              <button
                key={l.id}
                onClick={() => chooseLocation(l.id)}
                className="group rounded-2xl border border-amber-200/20 bg-white/5 p-6 text-left transition hover:border-amber-300/65 hover:bg-white/10"
              >

                <span className="mb-4 block h-px w-12 bg-amber-300/60" />

                <h2 className="font-serif text-2xl text-amber-100">
                  {l.name}
                </h2>

                <p className="mt-2 min-h-12 text-sm text-amber-50/65">
                  {l.description}
                </p>

                <div className="mt-5 flex justify-between text-sm text-amber-200/80">
                  <span>
                    {topics.filter(
                      t => t.location_id === l.id
                    ).length} RP
                  </span>

                  <span className="transition group-hover:translate-x-1">
                    Entrer →
                  </span>
                </div>

              </button>
            ))}

          </div>
        )}

        {/* Sujets RP */}
        {!loading &&
          ['location', 'mine', 'unclassified'].includes(view) && (

          <section className="mx-auto max-w-4xl space-y-3">

            {view === 'location' && (
              <div className="mb-5 flex justify-end">
                <button
                  onClick={() => setCreating(true)}
                  className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-200"
                >
                  + Créer un RP ici
                </button>
              </div>
            )}

            {visibleTopics.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-amber-50/70">
                Aucun RP dans cette rubrique pour le moment.
              </div>
            )}

            {visibleTopics.map(t => (
              <button
                key={t.id}
                onClick={() => openTopic(t.id)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-amber-100/15 bg-white/5 px-5 py-4 text-left transition hover:border-amber-200/50 hover:bg-white/10"
              >

                <div>
                  <div className="font-serif text-xl text-amber-50">
                    {t.title}
                  </div>

                  <div className="mt-1 text-xs text-amber-100/50">
                    Créé le {new Date(
                      t.created_at
                    ).toLocaleDateString('fr-FR')}
                  </div>
                </div>

                <span className="text-amber-300">
                  Ouvrir →
                </span>

              </button>
            ))}

          </section>
        )}

      </div>

      {/* Fenêtre de création */}
      {creating && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          onClick={() => setCreating(false)}
        >

          <form
            onSubmit={createTopic}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-amber-200/30 bg-[#211927] p-6 shadow-2xl"
          >

            <h2 className="font-serif text-2xl text-amber-100">
              Nouveau RP
            </h2>

            <p className="mb-5 mt-2 text-sm text-white/60">
              {location?.name ||
                'Choisis un lieu avant de commencer.'}
            </p>

            <label
              className="block text-sm text-amber-50/80"
              htmlFor="new-rp-title"
            >
              Titre du sujet
            </label>

            <input
              id="new-rp-title"
              autoFocus
              maxLength={150}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="mt-2 w-full rounded-lg border border-amber-100/20 bg-white/10 p-3 text-white outline-none focus:border-amber-300"
              placeholder="Le titre de votre scène…"
            />

            <div className="mt-6 flex justify-end gap-3">

              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-lg px-4 py-2 hover:bg-white/10"
              >
                Annuler
              </button>

              <button
                disabled={
                  saving ||
                  !newTitle.trim() ||
                  !selectedLocation
                }
                type="submit"
                className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-40"
              >
                {saving ? 'Création…' : 'Créer'}
              </button>

            </div>

          </form>
        </div>
      )}

    </main>
  )
}
