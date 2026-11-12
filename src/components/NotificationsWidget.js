
'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

// Date de dernière lecture du flux d'activité
async function getLastSeen(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('last_seen_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  return data?.last_seen_at || '1970-01-01T00:00:00Z'
}

// Invitations en attente pour tous les personnages du compte
async function getPendingInvitations(userId) {
  const { data: invitations, error } = await supabase
    .from('rp_invitations')
    .select(
      'id,topic_id,invited_character_id,invited_by,created_at,status'
    )
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  if (!invitations?.length) return []

  const topicIds = [...new Set(invitations.map(i => i.topic_id))]
  const characterIds = [
    ...new Set(invitations.map(i => i.invited_character_id))
  ]

  const [topicsR, charactersR] = await Promise.all([
    supabase
      .from('rp_topics')
      .select('id,title,location_id')
      .in('id', topicIds),

    supabase
      .from('characters')
      .select('id,name,avatar_url')
      .in('id', characterIds),
  ])

  if (topicsR.error) throw topicsR.error
  if (charactersR.error) throw charactersR.error

  const topics = topicsR.data || []
  const characters = charactersR.data || []

  const locationIds = [
    ...new Set(topics.map(t => t.location_id).filter(Boolean))
  ]

  let locations = []
  let zones = []

  if (locationIds.length) {
    const { data, error: locError } = await supabase
      .from('rp_locations')
      .select('id,name,zone_id')
      .in('id', locationIds)

    if (locError) throw locError
    locations = data || []

    const zoneIds = [
      ...new Set(locations.map(l => l.zone_id).filter(Boolean))
    ]

    if (zoneIds.length) {
      const { data: zData, error: zoneError } = await supabase
        .from('rp_zones')
        .select('id,name')
        .in('id', zoneIds)

      if (zoneError) throw zoneError
      zones = zData || []
    }
  }

  const topicsMap = new Map(topics.map(t => [t.id, t]))
  const charactersMap = new Map(characters.map(c => [c.id, c]))
  const locationsMap = new Map(locations.map(l => [l.id, l]))
  const zonesMap = new Map(zones.map(z => [z.id, z]))

  return invitations.map(invitation => {
    const topic = topicsMap.get(invitation.topic_id)
    const character = charactersMap.get(
      invitation.invited_character_id
    )
    const location = locationsMap.get(topic?.location_id)
    const zone = zonesMap.get(location?.zone_id)

    return {
      ...invitation,
      topicTitle: topic?.title || 'RP sans titre',
      characterName: character?.name || 'Personnage invité',
      characterAvatar: character?.avatar_url || null,
      placeLabel: [zone?.name, location?.name]
        .filter(Boolean)
        .join(' · ') || 'Lieu non renseigné',
    }
  })
}

export default function NotificationsWidget() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  // Flux d'activité existant
  const [items, setItems] = useState([])
  const [lastSeenAt, setLastSeenAt] = useState(null)

  // Nouvelles invitations
  const [invitations, setInvitations] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [acceptedTopic, setAcceptedTopic] = useState(null)

  const [err, setErr] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Compteur : activités récentes + invitations en attente
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { data: { session } } =
        await supabase.auth.getSession()

      if (!session) {
        setUnreadCount(0)
        return
      }

      const since = await getLastSeen(session.user.id)
      setLastSeenAt(since)

      const [activityR, invitationsR] = await Promise.all([
        supabase
          .from('v_activity_stream')
          .select('item_id', { count: 'exact', head: true })
          .gt('created_at', since),

        supabase
          .from('rp_invitations')
          .select('id', { count: 'exact', head: true })
          .eq('invited_user_id', session.user.id)
          .eq('status', 'pending'),
      ])

      // Un éventuel problème sur un des deux flux
      // ne doit pas bloquer l'autre.
      setUnreadCount(
        (activityR.error ? 0 : activityR.count || 0) +
        (invitationsR.error ? 0 : invitationsR.count || 0)
      )
    } catch (error) {
      console.error('Compteur notifications :', error)
    }
  }, [])

  // Charger le contenu du panneau
  const load = useCallback(async () => {
    setLoading(true)
    setErr('')

    const { data: { session } } =
      await supabase.auth.getSession()

    if (!session) {
      setLoading(false)
      return
    }

    const errors = []
    let activitiesCount = 0
    let invitationsCount = 0

    try {
      const since = await getLastSeen(session.user.id)
      setLastSeenAt(since)

      const { data, error } = await supabase
        .from('v_activity_stream')
        .select('*')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      setItems(data || [])
      activitiesCount = data?.length || 0
   } catch (error) {
  // La vue d'activité n'existe pas encore dans cette base.
  // Ne pas empêcher le fonctionnement des invitations RP.
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.message?.includes('v_activity_stream')
  ) {
    setItems([])
  } else {
    errors.push('Activités : ' + error.message)
  }
}

    try {
      const pending = await getPendingInvitations(session.user.id)
      setInvitations(pending)
      invitationsCount = pending.length
    } catch (error) {
      errors.push('Invitations : ' + error.message)
    }

    setUnreadCount(activitiesCount + invitationsCount)

    if (errors.length) {
      setErr(errors.join(' | '))
    }

    setLoading(false)
  }, [])

  // Ouverture du panneau
  useEffect(() => {
    if (open) {
      void load()
    }
  }, [open, load])

  // Vérification périodique des nouveautés
  useEffect(() => {
    void fetchUnreadCount()

    const id = setInterval(() => {
      void fetchUnreadCount()
    }, 45000)

    return () => clearInterval(id)
  }, [fetchUnreadCount])

  // Accepter ou refuser une invitation
  const respondToInvitation = async (invitation, status) => {
    if (busyId) return

    setBusyId(invitation.id)
    setErr('')
    setAcceptedTopic(null)

    try {
      const { data: { session } } =
        await supabase.auth.getSession()

      if (!session) {
        throw new Error('Session expirée.')
      }

      const { data, error } = await supabase
        .from('rp_invitations')
        .update({ status })
        .eq('id', invitation.id)
        .eq('invited_user_id', session.user.id)
        .eq('status', 'pending')
        .select('id')

      if (error) throw error

      if (!data?.length) {
        throw new Error(
          "Cette invitation n'est plus en attente."
        )
      }

      setInvitations(current =>
        current.filter(i => i.id !== invitation.id)
      )

      setUnreadCount(current => Math.max(0, current - 1))

      if (status === 'accepted') {
        setAcceptedTopic({
          id: invitation.topic_id,
          title: invitation.topicTitle,
        })
      }
    } catch (error) {
      setErr(error.message || 'Impossible de répondre.')
    } finally {
      setBusyId(null)
    }
  }

  // Marquer le flux d'activité comme lu.
  // Les invitations en attente restent visibles.
  const markAllRead = async () => {
    setErr('')

    const { data: { session } } =
      await supabase.auth.getSession()

    if (!session) return

    const now = new Date().toISOString()

    const { error } = await supabase
      .from('profiles')
      .update({ last_seen_at: now })
      .eq('user_id', session.user.id)

    if (error) {
      setErr(error.message)
      return
    }

    setItems([])
    setLastSeenAt(now)
    setUnreadCount(invitations.length)
  }

  // Rendu des anciennes notifications
  const line = n => {
    const date = new Date(n.created_at).toLocaleString('fr-FR')

    if (n.type === 'rp_post') {
      return (
        <div className="flex flex-col">
          <span>
            <strong>{n.actor_name || 'Un personnage'}</strong>
            {' '}a posté dans{' '}
            <Link href={n.href || '/rp'} className="underline">
              {n.context_title}
            </Link>
          </span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }

    if (n.type === 'message') {
      return (
        <div className="flex flex-col">
          <span>
            <strong>{n.actor_name || 'Un personnage'}</strong>
            {' '}a écrit dans{' '}
            <Link href={n.href || '/messages'} className="underline">
              {n.context_title}
            </Link>
          </span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }

    if (n.type === 'wiki_card') {
      return (
        <div className="flex flex-col">
          <span>
            <strong>{n.actor_name || 'Un personnage'}</strong>
            {' '}a ajouté{' '}
            <strong>{n.context_title}</strong> dans le lore{' '}
            <Link href={n.href || '/wiki'} className="underline">
              (ouvrir)
            </Link>
          </span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }

    if (n.type === 'new_character') {
      return (
        <div className="flex flex-col">
          <span>
            <strong>{n.actor_name || 'Un personnage'}</strong>
            {' '}vient de rejoindre le monde magique —{' '}
            <Link href={n.href || '/members'} className="underline">
              voir les membres
            </Link>
          </span>
          <span className="text-xs opacity-70">{date}</span>
        </div>
      )
    }

    return (
      <div className="flex flex-col">
        <span>
          {n.context_title || n.type} —{' '}
          <Link href={n.href || '/dashboard'} className="underline">
            ouvrir
          </Link>
        </span>
        <span className="text-xs opacity-70">{date}</span>
      </div>
    )
  }

  const hasNew = unreadCount > 0
  const displayCount =
    unreadCount > 99 ? '99+' : String(unreadCount)

  return (
    <>
      {/* Bouton Notifications du dashboard */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative rounded-xl border px-3 py-2 text-white ${
          hasNew
            ? 'border-amber-300/50 bg-amber-400/20 ring-2 ring-amber-300/50'
            : 'border-white/20 bg-white/10 hover:bg-white/15'
        }`}
        aria-label={
          `Ouvrir les notifications${
            hasNew ? ` (${displayCount})` : ''
          }`
        }
      >
        🔔 Notifications

        {hasNew && (
          <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {displayCount}
          </span>
        )}
      </button>

      {/* Fenêtre des notifications */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-3 backdrop-blur-sm sm:p-5"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-amber-200/20 bg-[#1d1728]/95 text-amber-50 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* En-tête */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/15 p-4 sm:p-6">
              <h3 className="font-serif text-xl text-amber-100">
                Notifications
              </h3>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={loading || !items.length}
                  className="rounded-lg border border-amber-200/20 bg-white/10 px-3 py-2 text-xs hover:bg-white/15 disabled:opacity-40 sm:text-sm"
                >
                  Tout marquer comme lu
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-amber-200/20 bg-white/10 px-3 py-2 text-xs hover:bg-white/15 sm:text-sm"
                >
                  Fermer
                </button>
              </div>
            </div>

            {/* Contenu scrollable */}
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">

              {err && (
                <div className="rounded-lg border border-red-300/25 bg-red-950/30 p-3 text-sm text-red-200">
                  {err}
                </div>
              )}

              {loading ? (
                <p className="text-sm text-white/65">
                  Chargement des notifications…
                </p>
              ) : (
                <>
                  {/* Invitations RP */}
                  {invitations.length > 0 && (
                    <section>
                      <h4 className="mb-3 font-serif text-lg text-amber-200">
                        Invitations RP en attente
                        {' '}({invitations.length})
                      </h4>

                      <div className="space-y-3">
                        {invitations.map(invitation => (
                          <article
                            key={invitation.id}
                            className="rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-amber-200/30 bg-white/10">
                                {invitation.characterAvatar ? (
                                  <img
                                    src={invitation.characterAvatar}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="grid h-full w-full place-items-center font-serif text-xl">
                                    {invitation.characterName[0]}
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1">
                                <h5 className="font-serif text-lg text-amber-50">
                                  {invitation.topicTitle}
                                </h5>

                                <p className="mt-1 text-xs text-amber-200/75">
                                  {invitation.placeLabel}
                                </p>

                                <p className="mt-2 text-sm text-white/85">
                                  <strong>
                                    {invitation.characterName}
                                  </strong>
                                  {' '}est invité à rejoindre ce RP.
                                </p>

                                <p className="mt-1 text-xs text-white/45">
                                  {new Date(
                                    invitation.created_at
                                  ).toLocaleString('fr-FR')}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() =>
                                  respondToInvitation(
                                    invitation,
                                    'accepted'
                                  )
                                }
                                className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-[#241b22] hover:bg-amber-200 disabled:opacity-50"
                              >
                                {busyId === invitation.id
                                  ? 'Enregistrement…'
                                  : 'Accepter'}
                              </button>

                              <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() =>
                                  respondToInvitation(
                                    invitation,
                                    'declined'
                                  )
                                }
                                className="rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
                              >
                                Refuser
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Confirmation après acceptation */}
                  {acceptedTopic && (
                    <div className="rounded-xl border border-amber-200/30 bg-white/10 p-4">
                      <p className="text-sm text-amber-100">
                        Invitation acceptée !
                      </p>

                      <Link
                        href={`/rp/scene?topic=${encodeURIComponent(
                          acceptedTopic.id
                        )}`}
                        className="mt-2 inline-block text-sm font-semibold text-amber-300 underline"
                      >
                        Ouvrir « {acceptedTopic.title} » →
                      </Link>
                    </div>
                  )}

                  {/* Flux d'activité déjà existant */}
                  {items.length > 0 && (
                    <section>
                      <h4 className="mb-3 font-serif text-lg text-amber-200">
                        Dernières activités
                      </h4>

                      <ul className="divide-y divide-amber-200/10">
                        {items.map(n => (
                          <li
                            key={`${n.type}-${n.item_id}-${n.created_at}`}
                            className="py-3 text-sm"
                          >
                            {line(n)}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {!items.length &&
                    !invitations.length &&
                    !acceptedTopic &&
                    !err && (
                      <p className="py-10 text-center text-sm text-white/60">
                        Aucune nouvelle notification.
                      </p>
                    )}

                  {lastSeenAt && (
                    <p className="border-t border-white/10 pt-3 text-xs text-white/40">
                      Dernière lecture du flux d'activité :{' '}
                      {new Date(lastSeenAt).toLocaleString('fr-FR')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
