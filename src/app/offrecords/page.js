'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import SiteTopbar from '@/components/SiteTopbar'
import { supabase } from '@/lib/supabaseClient'
import YouTubePlaylistPlayer, { parseYouTubeId } from '@/components/offrecords/YouTubePlaylistPlayer'

const TABS = [
  { id: 'discover', label: 'Découvrir' },
  { id: 'mine', label: 'Mes playlists' },
  { id: 'favorites', label: 'Favoris' },
]

function coverSrc(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    return url.hostname.endsWith('.supabase.co') ? url.href : `/api/img?u=${encodeURIComponent(url.href)}`
  } catch {
    return ''
  }
}

function createSlug(title) {
  const base = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || 'playlist'
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

const blankForm = () => ({
  title: '', description: '', cover_url: '', character_id: '', is_public: true,
})

function Cover({ url, name, size = 'h-16 w-16' }) {
  const src = coverSrc(url)
  return (
    <span className={`relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-xl border border-amber-200/20 bg-gradient-to-br from-[#463651] to-[#1d162a] text-2xl text-amber-200/70`}>
      <span aria-hidden="true">♫</span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt={name ? `Couverture : ${name}` : ''} referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.display = 'none' }} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  )
}

function CharacterAvatar({ character }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200/30 bg-[#46344f] text-xs font-semibold text-amber-100">
      {character?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={character.avatar_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        (character?.name?.[0] || '?').toUpperCase()
      )}
    </span>
  )
}

export default function OffRecordsPage() {
  const [session, setSession] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [favoriteIds, setFavoriteIds] = useState([])
  const [myCharacters, setMyCharacters] = useState([])
  const [tab, setTab] = useState('discover')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [editorMode, setEditorMode] = useState(null) // create | edit
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)
  const [trackUrl, setTrackUrl] = useState('')
  const [trackTitle, setTrackTitle] = useState('')
  const [savingTrack, setSavingTrack] = useState(false)

  const loadPlaylists = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('off_playlists')
      .select('id,title,slug,description,cover_url,character_id,is_public,owner_id,created_at')
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    const all = data || []
    const ids = [...new Set(all.map(p => p.character_id).filter(Boolean))]
    const owners = [...new Set(all.map(p => p.owner_id).filter(Boolean))]
    const [charsResult, ownersResult] = await Promise.all([
      ids.length
        ? supabase.from('characters').select('id,name,avatar_url').in('id', ids)
        : Promise.resolve({ data: [] }),
      owners.length
        ? supabase.from('profiles').select('user_id,pseudo').in('user_id', owners)
        : Promise.resolve({ data: [] }),
    ])
    const charById = new Map((charsResult.data || []).map(c => [c.id, c]))
    const ownersById = new Map((ownersResult.data || []).map(p => [p.user_id, p.pseudo]))

    setPlaylists(all.map(p => ({
      ...p,
      character: charById.get(p.character_id) || null,
      creatorName: charById.get(p.character_id)?.name || ownersById.get(p.owner_id) || 'Joueur',
    })))
    setLoading(false)
  }, [])

  const loadFavorites = useCallback(async (uid) => {
    if (!uid) { setFavoriteIds([]); return }
    const { data, error } = await supabase.from('off_playlist_favorites')
      .select('playlist_id').eq('user_id', uid)
    if (!error) setFavoriteIds((data || []).map(row => row.playlist_id))
  }, [])

  const loadMyCharacters = useCallback(async (uid) => {
    if (!uid) return
    const { data } = await supabase.from('characters')
      .select('id,name,avatar_url,is_active')
      .eq('user_id', uid)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    setMyCharacters(data || [])
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      const sess = data?.session || null
      setSession(sess)
      if (sess) {
        await Promise.all([loadPlaylists(), loadFavorites(sess.user.id), loadMyCharacters(sess.user.id)])
      } else {
        setLoading(false)
      }
    })
    const reloadCharacters = () => {
      supabase.auth.getSession().then(({ data }) => {
        if (data?.session?.user?.id) loadMyCharacters(data.session.user.id)
      })
    }
    window.addEventListener('piracy:active-character-changed', reloadCharacters)
    return () => {
      mounted = false
      window.removeEventListener('piracy:active-character-changed', reloadCharacters)
    }
  }, [loadFavorites, loadMyCharacters, loadPlaylists])

  const active = useMemo(() => playlists.find(p => p.id === selectedId) || null, [playlists, selectedId])
  const isOwner = !!(session && active && session.user.id === active.owner_id)
  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds])

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('fr')
    return playlists.filter(p => {
      if (tab === 'mine' && p.owner_id !== session?.user?.id) return false
      if (tab === 'favorites' && (!p.is_public || !favSet.has(p.id))) return false
      if (tab === 'discover' && !p.is_public) return false
      return !needle || [p.title, p.creatorName].some(v => String(v || '').toLocaleLowerCase('fr').includes(needle))
    })
  }, [playlists, tab, search, session?.user?.id, favSet])

  useEffect(() => {
    if (!playlists.length) { setSelectedId(null); return }
    if (selectedId && playlists.some(p => p.id === selectedId)) return
    const requested = new URLSearchParams(window.location.search).get('playlist')
    const first = playlists.find(p => p.id === requested) || playlists[0]
    setSelectedId(first?.id || null)
  }, [playlists, selectedId])

  useEffect(() => {
    if (!active?.id) { setTracks([]); return }
    let cancelled = false
    setLoadingTracks(true)
    setTracks([])
    supabase.from('off_tracks')
      .select('id,video_id,title,created_at')
      .eq('playlist_id', active.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setErrorMessage(error.message)
        setTracks(data || [])
        setLoadingTracks(false)
      })
    return () => { cancelled = true }
  }, [active?.id])

  const openPlaylist = (p) => {
    setSelectedId(p.id)
    setErrorMessage('')
    setEditorMode(null)
    window.history.replaceState(null, '', `/offrecords?playlist=${encodeURIComponent(p.id)}`)
  }

  const editPlaylist = (p) => {
    setForm({
      title: p.title || '',
      description: p.description || '',
      cover_url: p.cover_url || '',
      character_id: p.character_id || '',
      is_public: p.is_public,
    })
    setEditorMode('edit')
    setErrorMessage('')
  }

  const newPlaylist = () => {
    const current = myCharacters.find(c => c.is_active) || myCharacters[0]
    setForm({ ...blankForm(), character_id: current?.id || '' })
    setEditorMode('create')
    setErrorMessage('')
  }

  const savePlaylist = async e => {
    e.preventDefault()
    if (!session || saving || !form.title.trim()) return
    if (form.cover_url.trim() && !coverSrc(form.cover_url.trim())) {
      setErrorMessage('Indique un lien http:// ou https:// valide pour la couverture.')
      return
    }
    setSaving(true)
    setErrorMessage('')
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      cover_url: form.cover_url.trim() || null,
      character_id: form.character_id || null,
      is_public: form.is_public,
    }
    let result
    if (editorMode === 'create') {
      result = await supabase.from('off_playlists').insert({
        ...payload, slug: createSlug(payload.title), owner_id: session.user.id,
      }).select('id').single()
    } else {
      result = await supabase.from('off_playlists')
        .update(payload)
        .eq('id', active.id)
        .eq('owner_id', session.user.id)
        .select('id')
        .single()
    }
    setSaving(false)
    if (result.error) { setErrorMessage(result.error.message); return }
    setEditorMode(null)
    await loadPlaylists()
    if (result.data?.id) setSelectedId(result.data.id)
    setTab('mine')
  }

  const deletePlaylist = async () => {
    if (!active || !isOwner || !session) return
    if (!confirm(`Supprimer « ${active.title} » et tous ses morceaux ?\nLes RP associés perdront leur bande-son.`)) return
    const { error } = await supabase.from('off_playlists')
      .delete().eq('id', active.id).eq('owner_id', session.user.id)
    if (error) { setErrorMessage(error.message); return }
    setSelectedId(null)
    window.history.replaceState(null, '', '/offrecords')
    await Promise.all([loadPlaylists(), loadFavorites(session.user.id)])
  }

  const toggleFavorite = async p => {
    if (!session || !p.is_public || p.owner_id === session.user.id) return
    const exists = favSet.has(p.id)
    const { error } = exists
      ? await supabase.from('off_playlist_favorites').delete().eq('user_id', session.user.id).eq('playlist_id', p.id)
      : await supabase.from('off_playlist_favorites').insert({ user_id: session.user.id, playlist_id: p.id })
    if (error) { setErrorMessage(error.message); return }
    setFavoriteIds(ids => exists ? ids.filter(id => id !== p.id) : [...ids, p.id])
  }

  const refreshTracks = async playlistId => {
    const { data, error } = await supabase.from('off_tracks')
      .select('id,video_id,title,created_at')
      .eq('playlist_id', playlistId).order('created_at', { ascending: true })
    if (error) { setErrorMessage(error.message); return }
    if (active?.id === playlistId) setTracks(data || [])
  }

  const addTrack = async e => {
    e.preventDefault()
    if (!isOwner || !active || savingTrack) return
    const id = parseYouTubeId(trackUrl)
    if (!id) { setErrorMessage('Colle un lien YouTube valide vers une vidéo.'); return }
    setSavingTrack(true)
    setErrorMessage('')
    const { error } = await supabase.from('off_tracks')
      .insert({ playlist_id: active.id, video_id: id, title: trackTitle.trim() || null })
    setSavingTrack(false)
    if (error) { setErrorMessage(error.message); return }
    setTrackUrl('')
    setTrackTitle('')
    await refreshTracks(active.id)
  }

  const deleteTrack = async track => {
    if (!isOwner || !active) return
    if (!confirm('Retirer ce morceau de la playlist ?')) return
    const { error } = await supabase.from('off_tracks')
      .delete().eq('id', track.id).eq('playlist_id', active.id)
    if (error) { setErrorMessage(error.message); return }
    await refreshTracks(active.id)
  }

  return (
    <main className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-[#130e1b] text-amber-50">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <Image src="/images/radio-bg.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-65" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#120c1c]/80 via-[#1d1229]/70 to-[#100b17]/90" />
      </div>
      <SiteTopbar title="OffRecords" />

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1540px] flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 pt-3 sm:px-5 lg:gap-4 lg:px-7 lg:pb-5">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-xl text-amber-100 sm:text-2xl">Le jukebox de la communauté</h1>
            <p className="mt-1 text-xs text-white/55">Les playlists de vos personnages et les bandes-son de vos histoires.</p>
          </div>
          <button type="button" onClick={newPlaylist} disabled={!session} className="shrink-0 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-[#271c32] transition hover:bg-amber-200 disabled:opacity-40">
            + Créer une playlist
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-200/15 pb-3">
          {TABS.map(item => (
            <button
              type="button"
              key={item.id}
              onClick={() => { setTab(item.id); setSearch('') }}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`rounded-full border px-3.5 py-2 text-sm transition ${tab === item.id ? 'border-amber-300/45 bg-amber-200/15 text-amber-100' : 'border-white/15 bg-black/25 text-white/70 hover:bg-white/10'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {errorMessage && (
          <div role="alert" className="flex shrink-0 items-start justify-between gap-3 rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
            <span className="min-w-0 break-words">{errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage('')} aria-label="Masquer le message">×</button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(245px,340px)_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden">
          <aside className="flex min-h-[240px] min-w-0 flex-col rounded-2xl border border-white/15 bg-[#211827]/85 p-3 backdrop-blur-md sm:p-4 lg:min-h-0">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h2 className="font-serif text-lg text-amber-100">{TABS.find(t => t.id === tab)?.label}</h2>
              <span className="text-xs text-white/55">{visible.length} playlist{visible.length > 1 ? 's' : ''}</span>
            </div>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un titre ou un personnage…"
              aria-label="Rechercher une playlist"
              className="mb-3 w-full min-w-0 shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus:border-amber-200/45"
            />

            <div className="max-h-[42dvh] min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-none">
              {loading && <p className="p-3 text-sm text-white/55">Chargement des playlists…</p>}
              {!loading && visible.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPlaylist(p)}
                  className={`flex w-full min-w-0 items-center gap-3 rounded-xl border p-2 text-left transition ${active?.id === p.id ? 'border-amber-200/40 bg-amber-200/10' : 'border-white/10 bg-black/15 hover:border-amber-200/25 hover:bg-white/5'}`}
                >
                  <Cover url={p.cover_url} name={p.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{p.title}</span>
                    <span className="mt-1 block truncate text-xs text-white/55">{p.creatorName}</span>
                    <span className="mt-1 block text-[11px] text-amber-100/60">{p.is_public ? 'Publique' : 'Privée'}</span>
                  </span>
                </button>
              ))}
              {!loading && !visible.length && (
                <p className="rounded-xl border border-white/10 bg-black/15 p-4 text-sm leading-relaxed text-white/55">
                  {tab === 'favorites' ? 'Aucun favori pour le moment. Découvre les playlists des autres joueurs.' : tab === 'mine' ? 'Tu n’as pas encore de playlist. Tu peux en créer une ci-dessus.' : 'Aucune playlist trouvée.'}
                </p>
              )}
            </div>
          </aside>

          <section className="min-h-[320px] min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#211827]/90 p-3 backdrop-blur-md sm:p-5 lg:min-h-0">
            {!active ? (
              <div className="grid h-full min-h-72 place-items-center text-center">
                <div>
                  <p className="font-serif text-xl text-amber-100">Choisis une playlist</p>
                  <p className="mt-2 text-sm text-white/55">Découvre les musiques des personnages ou crée la tienne.</p>
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-4">
                <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row">
                  <Cover url={active.cover_url} name={active.title} size="h-28 w-28 sm:h-36 sm:w-36" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className="rounded-full border border-amber-300/25 bg-amber-200/10 px-2 py-1 text-[11px] text-amber-100">{active.is_public ? 'Publique' : 'Privée'}</span>
                      {isOwner && <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/55">Ta playlist</span>}
                    </div>
                    <h2 className="break-words font-serif text-2xl text-amber-100 sm:text-3xl">{active.title}</h2>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <CharacterAvatar character={active.character} />
                      <p className="min-w-0 truncate text-sm text-white/70">Par {active.creatorName}</p>
                    </div>
                    {active.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-white/65">{active.description}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {active.is_public && !isOwner && (
                    <button
                      type="button"
                      onClick={() => toggleFavorite(active)}
                      aria-pressed={favSet.has(active.id)}
                      className={`rounded-lg border px-3 py-2 text-sm transition ${favSet.has(active.id) ? 'border-amber-200/40 bg-amber-200/15 text-amber-100' : 'border-white/20 bg-white/5 text-white/80 hover:bg-white/10'}`}
                    >
                      {favSet.has(active.id) ? '★ Dans mes favoris' : '☆ Ajouter aux favoris'}
                    </button>
                  )}
                  {isOwner && (
                    <>
                      <button type="button" onClick={() => editPlaylist(active)} className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm hover:bg-white/15">Modifier la playlist</button>
                      <button type="button" onClick={deletePlaylist} className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200 hover:bg-rose-400/20">Supprimer</button>
                    </>
                  )}
                </div>

                {loadingTracks ? <p className="p-4 text-sm text-white/55">Chargement des morceaux…</p> : (
                  <YouTubePlaylistPlayer key={active.id} playlistId={active.id} tracks={tracks} />
                )}

                {isOwner && (
                  <div className="space-y-3 rounded-xl border border-amber-200/15 bg-black/25 p-3 sm:p-4">
                    <h3 className="font-serif text-lg text-amber-100">Ajouter un morceau</h3>
                    <form onSubmit={addTrack} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
                      <input
                        type="text"
                        value={trackUrl}
                        onChange={e => setTrackUrl(e.target.value)}
                        placeholder="Lien YouTube"
                        aria-label="Lien YouTube"
                        className="min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/45"
                      />
                      <input
                        type="text"
                        value={trackTitle}
                        onChange={e => setTrackTitle(e.target.value)}
                        placeholder="Titre (facultatif)"
                        aria-label="Titre du morceau"
                        maxLength={180}
                        className="min-w-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/45"
                      />
                      <button type="submit" disabled={savingTrack || !trackUrl.trim()} className="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-[#271b31] disabled:opacity-40">
                        {savingTrack ? 'Ajout…' : '+ Ajouter'}
                      </button>
                    </form>
                    <p className="text-xs text-white/45">Colle une URL de vidéo YouTube ou un code iframe YouTube. Les fichiers audio ne sont pas hébergés par Piracy.</p>
                    {!!tracks.length && (
                      <div className="max-h-44 space-y-1 overflow-y-auto">
                        {tracks.map((track, index) => (
                          <div key={track.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                            <span className="min-w-0 flex-1 truncate">{track.title || `Piste ${index + 1}`}</span>
                            <button type="button" onClick={() => deleteTrack(track)} className="shrink-0 rounded-md px-2 py-1 text-rose-200 hover:bg-rose-200/10">Retirer</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {editorMode && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-2 backdrop-blur-md sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setEditorMode(null) }}>
          <form onSubmit={savePlaylist} className="max-h-[92dvh] w-full max-w-xl space-y-4 overflow-y-auto overscroll-contain rounded-2xl border border-amber-200/25 bg-[#261a30] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl text-amber-100">{editorMode === 'create' ? 'Créer une playlist' : 'Modifier la playlist'}</h2>
                <p className="mt-1 text-xs text-white/55">Ton personnage, ton univers musical.</p>
              </div>
              <button type="button" disabled={saving} aria-label="Fermer" onClick={() => setEditorMode(null)} className="rounded-full border border-white/20 px-3 py-1 text-xl text-white/75">×</button>
            </div>
            <label className="block space-y-1 text-sm text-amber-100">
              <span>Titre *</span>
              <input required maxLength={160} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" />
            </label>
            <label className="block space-y-1 text-sm text-amber-100">
              <span>Personnage créateur</span>
              <select value={form.character_id} onChange={e => setForm(f => ({ ...f, character_id: e.target.value }))} className="w-full rounded-lg border border-white/15 bg-[#352740] px-3 py-2 text-white">
                <option value="">Compte joueur (sans personnage)</option>
                {myCharacters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm text-amber-100">
              <span>Image de couverture (URL)</span>
              <input type="url" value={form.cover_url} maxLength={2000} onChange={e => setForm(f => ({ ...f, cover_url: e.target.value }))} placeholder="https://i.pinimg.com/..." className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none placeholder:text-white/40" />
            </label>
            {!!form.cover_url && <Cover url={form.cover_url} name={form.title} size="h-24 w-24" />}
            <label className="block space-y-1 text-sm text-amber-100">
              <span>Description (facultative)</span>
              <textarea rows={3} maxLength={650} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none" />
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-amber-200/15 bg-white/5 p-3 text-sm">
              <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} className="mt-1 h-4 w-4 accent-amber-300" />
              <span>
                <strong className="block text-amber-100">Playlist publique</strong>
                <span className="mt-1 block text-xs leading-relaxed text-white/60">
                  Partagée dans Découvrir et utilisable comme bande-son de RP. Si tu la rends privée, les RP associés ne pourront plus la montrer.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setEditorMode(null)} disabled={saving} className="rounded-lg border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Annuler</button>
              <button type="submit" disabled={saving || !form.title.trim()} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-[#261a30] disabled:opacity-50">
                {saving ? 'Enregistrement…' : editorMode === 'create' ? 'Créer la playlist' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}
